import { createClient } from "npm:@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Minimal raw IMAP client (Dovecot-compatible) — keeps CPU usage low so we
// stay within Supabase Edge Function limits. Supports UID SEARCH/FETCH/STORE
// and parses just enough headers + text body to link replies to SAC tickets.
class ImapClient {
  private conn!: Deno.TlsConn;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private buffer = "";
  private tag = 0;

  async connect(host: string, port: number) {
    this.conn = await Deno.connectTls({ hostname: host, port });
    await this.readUntil(/\r\n/); // greeting
  }
  private async readChunk(): Promise<void> {
    const buf = new Uint8Array(64 * 1024);
    const n = await this.conn.read(buf);
    if (n === null) throw new Error("Conexão IMAP encerrada");
    this.buffer += this.decoder.decode(buf.subarray(0, n));
  }
  private async readUntil(re: RegExp): Promise<string> {
    while (!re.test(this.buffer)) await this.readChunk();
    const m = this.buffer.match(re)!;
    const idx = (m.index ?? 0) + m[0].length;
    const out = this.buffer.slice(0, idx);
    this.buffer = this.buffer.slice(idx);
    return out;
  }
  private async write(s: string) {
    await this.conn.write(this.encoder.encode(s));
  }
  // Reads response until we see "<tag> OK|NO|BAD". Handles literals {N}.
  private async readResponse(tag: string): Promise<string> {
    let out = "";
    const endRe = new RegExp(`^${tag} (OK|NO|BAD)[^\r\n]*\r\n`, "m");
    while (true) {
      // pull more data
      if (!/\r\n/.test(this.buffer)) await this.readChunk();
      // handle literal {N} in the current buffered content
      const litMatch = this.buffer.match(/\{(\d+)\}\r\n/);
      if (litMatch) {
        const litStart = (litMatch.index ?? 0) + litMatch[0].length;
        const litLen = parseInt(litMatch[1], 10);
        while (this.buffer.length < litStart + litLen) await this.readChunk();
        // keep accumulating
      }
      const m = this.buffer.match(endRe);
      if (m) {
        const end = (m.index ?? 0) + m[0].length;
        out += this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end);
        return out;
      }
      // not yet done — pull more
      if (!this.buffer.includes("\r\n")) await this.readChunk();
      else {
        // drain known lines that aren't the tag terminator yet
        const newlineIdx = this.buffer.lastIndexOf("\r\n");
        out += this.buffer.slice(0, newlineIdx + 2);
        this.buffer = this.buffer.slice(newlineIdx + 2);
        await this.readChunk();
      }
    }
  }
  async cmd(command: string): Promise<string> {
    this.tag++;
    const tag = `A${this.tag.toString().padStart(4, "0")}`;
    await this.write(`${tag} ${command}\r\n`);
    const resp = await this.readResponse(tag);
    if (!new RegExp(`^${tag} OK`, "m").test(resp)) {
      throw new Error(`IMAP cmd failed: ${command.split(" ")[0]} → ${resp.split("\r\n").pop()}`);
    }
    return resp;
  }
  async login(user: string, pass: string) {
    const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await this.cmd(`LOGIN "${esc(user)}" "${esc(pass)}"`);
  }
  async select(mailbox = "INBOX") { await this.cmd(`SELECT ${mailbox}`); }
  async searchUnseenUids(): Promise<number[]> {
    const r = await this.cmd("UID SEARCH UNSEEN");
    const line = r.split("\r\n").find((l) => l.startsWith("* SEARCH")) ?? "";
    return line.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean).map(Number).filter((n) => !isNaN(n));
  }
  async fetchMessage(uid: number): Promise<{ headers: Record<string, string>; body: string }> {
    // Fetch full raw message (capped) so we can parse multipart MIME and pick
    // the right body part (text/plain preferred) with correct charset/encoding.
    const resp = await this.cmd(`UID FETCH ${uid} (BODY.PEEK[]<0.200000>)`);
    const litMatch = resp.match(/\{(\d+)\}\r\n/);
    if (!litMatch) return { headers: {}, body: "" };
    const start = (litMatch.index ?? 0) + litMatch[0].length;
    const len = parseInt(litMatch[1], 10);
    const raw = resp.slice(start, start + len);
    const sepMatch = raw.match(/\r?\n\r?\n/);
    const sepIdx = sepMatch?.index ?? -1;
    const headerText = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw;
    const bodyRaw = sepIdx >= 0 ? raw.slice(sepIdx + sepMatch![0].length) : "";
    const headers = parseHeaders(headerText);
    return { headers, body: bodyRaw };
  }
  async markSeen(uid: number) { await this.cmd(`UID STORE ${uid} +FLAGS (\\Seen)`); }
  async logout() { try { await this.cmd("LOGOUT"); } catch { /* ignore */ } try { this.conn.close(); } catch { /* ignore */ } }
}

// Decode RFC 2047 MIME encoded-words ("=?utf-8?B?...?=" / "=?utf-8?Q?...?=")
function decodeMimeHeader(s: string): string {
  if (!s) return "";
  return s.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset, enc, data) => {
    try {
      let bytes: Uint8Array;
      if (enc.toUpperCase() === "B") {
        const bin = atob(data);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        const decoded = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
        bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
      }
      return new TextDecoder(charset || "utf-8").decode(bytes);
    } catch { return _m; }
  });
}

function extractEmail(header: string): string {
  const m = header.match(/<([^>]+)>/) || header.match(/([^\s<>,]+@[^\s<>,]+)/);
  return m ? m[1] : header.trim();
}

// Decode quoted-printable in body
function decodeQP(s: string): string {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripHtml(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const unfolded = headerText.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim().toLowerCase();
    const v = line.slice(idx + 1).trim();
    headers[k] = headers[k] ? headers[k] + "\n" + v : v;
  }
  return headers;
}

function parseContentType(ct: string): { type: string; params: Record<string, string> } {
  const parts = ct.split(";").map((s) => s.trim());
  const type = (parts.shift() ?? "").toLowerCase();
  const params: Record<string, string> = {};
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    params[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return { type, params };
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try { return new TextDecoder(charset || "utf-8").decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

function decodePart(body: string, encoding: string, charset: string): string {
  const enc = (encoding || "7bit").toLowerCase();
  if (enc === "base64") {
    try {
      const clean = body.replace(/\s+/g, "");
      const bin = atob(clean);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return decodeBytes(bytes, charset);
    } catch { return body; }
  }
  if (enc === "quoted-printable") {
    const decoded = body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i) & 0xff;
    return decodeBytes(bytes, charset);
  }
  return body;
}

function splitHeaderAndBody(rawPart: string): { headers: Record<string, string>; body: string } | null {
  const normalized = rawPart.replace(/^\r?\n/, "");
  const sep = normalized.match(/\r?\n\r?\n/);
  if (!sep || sep.index === undefined) return null;
  return {
    headers: parseHeaders(normalized.slice(0, sep.index)),
    body: normalized.slice(sep.index + sep[0].length),
  };
}

function cleanMimeBoundaryTail(body: string): string {
  return body.replace(/\r?\n--[^\r\n-]+--?\s*$/g, "").trimEnd();
}

// Walk MIME tree and pick the best text part (prefer text/plain, fall back to text/html).
function extractTextFromMime(rawBody: string, contentType: string): string {
  const { type, params } = parseContentType(contentType || "text/plain");
  if (type.startsWith("multipart/")) {
    const boundary = params.boundary;
    if (!boundary) return rawBody;
    const marker = "--" + boundary;
    // Drop preamble (before first boundary). Keep the rest; the closing
    // boundary ("--boundary--") is filtered per-segment below. Using
    // slice(1) instead of slice(1,-1) survives truncated messages that
    // lack the closing marker.
    const rawSegments = rawBody.split(marker).slice(1);
    const segments = rawSegments.filter((s) => !/^--\s*/.test(s));
    let htmlFallback = "";
    for (const seg of segments) {
      const parsed = splitHeaderAndBody(seg);
      if (!parsed) continue;
      const partHeaders = parsed.headers;
      const partBody = cleanMimeBoundaryTail(parsed.body);
      const partCT = partHeaders["content-type"] ?? "text/plain";
      const partEnc = partHeaders["content-transfer-encoding"] ?? "";
      const { type: subType, params: subParams } = parseContentType(partCT);
      if (subType.startsWith("multipart/")) {
        const sub = extractTextFromMime(partBody, partCT);
        if (sub.trim()) return sub;
        continue;
      }
      if (subType === "text/plain") {
        const dec = decodePart(partBody, partEnc, subParams.charset ?? "utf-8");
        if (dec.trim()) return dec;
      } else if (subType === "text/html" && !htmlFallback) {
        const dec = decodePart(partBody, partEnc, subParams.charset ?? "utf-8");
        htmlFallback = stripHtml(dec);
      }
    }
    if (htmlFallback) return htmlFallback;
    // Last-resort fallback: strip HTML off the raw body so we never
    // return an empty string for a message that clearly has content.
    return stripHtml(rawBody);
  }
  return rawBody;
}

function extractReadableText(headers: Record<string, string>, body: string): string {
  const ct = headers["content-type"] ?? "text/plain; charset=utf-8";
  const cte = headers["content-transfer-encoding"] ?? "";
  const { type: topType, params: topParams } = parseContentType(ct);
  if (topType.startsWith("multipart/")) {
    return extractTextFromMime(body, ct);
  }
  if (topType === "text/html") {
    return stripHtml(decodePart(body, cte, topParams.charset ?? "utf-8"));
  }
  return decodePart(body, cte, topParams.charset ?? "utf-8");
}

function extractReplyText(headers: Record<string, string>, body: string): string {
  const text = extractReadableText(headers, body);
  return stripQuotedReply(text).slice(0, 20_000).trim();
}

function findProtocol(...values: string[]): string | null {
  for (const value of values) {
    const match = value.match(/SAC\d{8}-[A-Z0-9]+/i);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

// Remove quoted reply / signature blocks so we keep only the new message.
function stripQuotedReply(text: string): string {
  // Require a preceding newline so a message that BEGINS with a quoted
  // block (top-quoted or empty reply) doesn't collapse to nothing.
  const markers: RegExp[] = [
    /\n\s*Em\s[\s\S]{0,400}?escreveu\s*:?/i,                     // pt-BR Gmail
    /\n\s*On\s[\s\S]{0,400}?wrote\s*:?/i,                        // en Gmail
    /\n\s*Le\s[\s\S]{0,400}?a écrit\s*:?/i,                      // fr
    /\n\s*-{2,}\s*Mensagem (original|encaminhada)\s*-{2,}/i,
    /\n\s*-{2,}\s*Original Message\s*-{2,}/i,
    /\n\s*_{5,}\s*(\n|$)/,                                       // Outlook divider
    /\n\s*(De|From)\s*:\s*.+\n\s*(Enviad[ao]|Sent|Para|To)\s*:/i, // header block
    /\n\s*Protocolo\s+SAC\d{8}-[A-Z0-9]+/i,                      // our own footer
  ];
  let cut = text.length;
  for (const re of markers) {
    const m = text.match(re);
    if (m && (m.index ?? -1) >= 0) {
      const start = m.index! + 1; // skip the leading \n, keep content before
      if (start < cut) cut = start;
    }
  }
  // Also trim trailing block of consecutive ">" quoted lines.
  const sliced = text.slice(0, cut);
  const quotedTail = sliced.match(/\n(\s*>.*(\n|$))+\s*$/);
  const finalCut = quotedTail ? sliced.slice(0, quotedTail.index!) : sliced;
  const cleaned = finalCut.replace(/[\s\n]+$/, "").trim();
  // Fallback: if aggressive stripping nuked everything, keep the original.
  return cleaned || text.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronSecret = Deno.env.get("IMAP_CRON_SECRET") ?? "";
  const providedCron = req.headers.get("x-cron-secret") ?? "";
  const isCron = !!(cronSecret && providedCron && providedCron === cronSecret);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminCheck = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: roles } = await adminCheck
      .from("user_roles").select("role").eq("user_id", user.id);
    const allowed = ["admin", "desenvolvedor", "gerencia", "qualidade"];
    if (!(roles ?? []).some((r: { role: string }) => allowed.includes(r.role))) {
      return new Response(JSON.stringify({ error: "Apenas administradores" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const host = Deno.env.get("IMAP_HOST") ?? "";
  const port = Number(Deno.env.get("IMAP_PORT") ?? "993");
  const user = Deno.env.get("IMAP_USER") ?? "";
  const pass = Deno.env.get("IMAP_PASSWORD") ?? "";
  if (!host || !user || !pass) {
    return new Response(JSON.stringify({ error: "Credenciais IMAP ausentes" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const imap = new ImapClient();
  let processed = 0, linked = 0, unlinked = 0, skipped = 0, failed = 0, repaired = 0;
  const errors: string[] = [];

  try {
    await imap.connect(host, port);
    await imap.login(user, pass);
    await imap.select("INBOX");
    const uids = await imap.searchUnseenUids();
    const { data: repairRows } = await admin
      .from("email_communications")
      .select("id, raw_payload, body, sac_request_id")
      .eq("direction", "inbound")
      .or("body.eq.(sem conteúdo),sac_request_id.is.null")
      .order("created_at", { ascending: false })
      .limit(25);

    const repairByUid = new Map<number, { id: string; body: string; sac_request_id: string | null }>();
    for (const row of repairRows ?? []) {
      const uid = Number((row.raw_payload as { uid?: unknown } | null)?.uid);
      if (Number.isFinite(uid)) {
        repairByUid.set(uid, {
          id: row.id as string,
          body: row.body as string,
          sac_request_id: (row.sac_request_id as string | null) ?? null,
        });
      }
    }

    const batch = Array.from(new Set([...uids, ...repairByUid.keys()])).slice(0, 35);

    for (const uid of batch) {
      processed++;
      try {
        const { headers, body } = await imap.fetchMessage(uid);
        const subject = decodeMimeHeader(headers["subject"] ?? "");
        const from = extractEmail(decodeMimeHeader(headers["from"] ?? ""));
        const to = extractEmail(decodeMimeHeader(headers["to"] ?? "")) || user;
        const messageId = (headers["message-id"] ?? "").replace(/[<>]/g, "").trim() || null;

        const htmlBody = extractReadableText(headers, body); // For inbound, let's keep the raw-ish HTML if possible, or readable text
        const text = stripQuotedReply(htmlBody).slice(0, 20_000).trim();
        const protocol = findProtocol(subject, fullText, body);
        let sacRequestId: string | null = null;
        if (protocol) {
          const { data: sac } = await admin
            .from("sac_requests").select("id").eq("protocol", protocol).maybeSingle();
          sacRequestId = sac?.id ?? null;
        }

        const repairCandidate = repairByUid.get(uid);
        if (repairCandidate) {
          const patch: Record<string, unknown> = {
            raw_payload: { source: "imap-locaweb", uid, messageId, date: headers["date"] ?? null, repaired_at: new Date().toISOString() },
          };
          if (text && repairCandidate.body === "(sem conteúdo)") patch.body = text;
          if (sacRequestId && !repairCandidate.sac_request_id) {
            patch.sac_request_id = sacRequestId;
            patch.status = "received";
          }

          if (Object.keys(patch).length > 1) {
            const { error: updErr } = await admin
              .from("email_communications")
              .update(patch)
              .eq("id", repairCandidate.id);
            if (updErr) { failed++; errors.push(`uid ${uid}: ${updErr.message}`); continue; }
            repaired++;
          } else {
            skipped++;
          }
          continue;
        }

        // Idempotency for normal new inbound messages. This must run after
        // the repair path, otherwise previously stored placeholders can never
        // be corrected because their message-id already exists.
        if (messageId) {
          const { data: existing } = await admin
            .from("email_communications").select("id").eq("resend_id", messageId).maybeSingle();
          if (existing) { await imap.markSeen(uid); skipped++; continue; }
        }

        // 1. Identify "Internal" emails (Digitale to Digitale)
        const DOMAIN = "digitaletextil.com.br";
        const fromNormalized = (from || "").toLowerCase();
        const toNormalized = (to || "").toLowerCase();
        const isFromDigitale = fromNormalized.endsWith(`@${DOMAIN}`);
        const isToDigitale = toNormalized.endsWith(`@${DOMAIN}`);
        const isInternal = isFromDigitale && isToDigitale;

        // 2. Identify if it's one of our formal service accounts
        const OWN_ADDRESSES = ["qualidade@digitaletextil.com.br", "gerente@digitaletextil.com.br"];
        const isOwnSender = OWN_ADDRESSES.some((a) => fromNormalized.includes(a));

        // Ignore internal messages (e.g. comercial to qualidade) unless it involves a protocol
        if (isInternal && !protocol) {
          await imap.markSeen(uid);
          skipped++;
          continue;
        }

        // Auto-classify direction based on flow
        const direction: "inbound" | "outbound" = isOwnSender ? "outbound" : "inbound";

        const { error: insErr } = await admin.from("email_communications").insert({
          sac_request_id: sacRequestId,
          direction,
          from_email: from || "desconhecido",
          to_email: to,
          subject,
          body: text || "(sem conteúdo)",
          status: sacRequestId ? (direction === "outbound" ? "sent" : "received") : "unlinked",
          resend_id: messageId,
          raw_payload: { source: "imap-locaweb", uid, messageId, date: headers["date"] ?? null, auto_classified: direction, is_internal: isInternal },
          email_body: htmlBody,
        });
        if (insErr) { failed++; errors.push(`uid ${uid}: ${insErr.message}`); continue; }

        if (sacRequestId) linked++; else unlinked++;
        await imap.markSeen(uid);
      } catch (e) {
        failed++;
        errors.push(`uid ${uid}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await imap.logout();
  } catch (e) {
    console.error("imap-poll-inbox error:", e);
    try { await imap.logout(); } catch { /* ignore */ }
    return new Response(JSON.stringify({
      error: "Falha IMAP", details: e instanceof Error ? e.message : String(e),
      processed, linked, unlinked, failed,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    success: true, processed, linked, unlinked, skipped, repaired, failed,
    ...(errors.length ? { errors } : {}),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});