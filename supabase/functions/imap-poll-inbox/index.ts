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
    const sepIdx = raw.indexOf("\r\n\r\n");
    const headerText = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw;
    const bodyRaw = sepIdx >= 0 ? raw.slice(sepIdx + 4) : "";
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
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
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
  let processed = 0, linked = 0, unlinked = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  try {
    await imap.connect(host, port);
    await imap.login(user, pass);
    await imap.select("INBOX");
    const uids = await imap.searchUnseenUids();
    const batch = uids.slice(0, 25);

    for (const uid of batch) {
      processed++;
      try {
        const { headers, body } = await imap.fetchMessage(uid);
        const subject = decodeMimeHeader(headers["subject"] ?? "");
        const from = extractEmail(decodeMimeHeader(headers["from"] ?? ""));
        const to = extractEmail(decodeMimeHeader(headers["to"] ?? "")) || user;
        const messageId = (headers["message-id"] ?? "").replace(/[<>]/g, "").trim() || null;

        // Idempotency
        if (messageId) {
          const { data: existing } = await admin
            .from("email_communications").select("id").eq("resend_id", messageId).maybeSingle();
          if (existing) { await imap.markSeen(uid); skipped++; continue; }
        }

        // Body: try to decode QP; if HTML, strip; truncate
        let text = body;
        if (/<[a-z][\s\S]*>/i.test(text)) text = stripHtml(text);
        text = decodeQP(text).trim().slice(0, 20_000) || "(sem conteúdo)";

        const match = subject.match(/SAC\d{8}-[A-Z0-9]+/i);
        let sacRequestId: string | null = null;
        if (match) {
          const protocol = match[0].toUpperCase();
          const { data: sac } = await admin
            .from("sac_requests").select("id").eq("protocol", protocol).maybeSingle();
          sacRequestId = sac?.id ?? null;
        }

        const { error: insErr } = await admin.from("email_communications").insert({
          sac_request_id: sacRequestId,
          direction: "inbound",
          from_email: from || "desconhecido",
          to_email: to,
          subject,
          body: text,
          status: sacRequestId ? "received" : "unlinked",
          resend_id: messageId,
          raw_payload: { source: "imap-locaweb", uid, messageId, date: headers["date"] ?? null },
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
    success: true, processed, linked, unlinked, skipped, failed,
    ...(errors.length ? { errors } : {}),
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});