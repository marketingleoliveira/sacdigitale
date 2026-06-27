import { ImapFlow } from "npm:imapflow@1.0.164";
import { simpleParser } from "npm:mailparser@3.7.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Polls the Locaweb IMAP inbox for qualidade@digitaletextil.com.br and links
// replies to SAC requests by matching the [SACyyyymmdd-XXXX] protocol token in
// the subject line. Unmatched messages are still stored (sac_request_id=null)
// so they can be reviewed manually later.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth: accept either a valid Supabase JWT (manual sync from admin UI)
  // or the IMAP_CRON_SECRET header (scheduled pg_cron call).
  const cronSecret = Deno.env.get("IMAP_CRON_SECRET") ?? "";
  const providedCron = req.headers.get("x-cron-secret") ?? "";
  const isCron = cronSecret && providedCron && providedCron === cronSecret;

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

  const client = new ImapFlow({
    host, port, secure: port === 993,
    auth: { user, pass },
    logger: false,
    socketTimeout: 30_000,
  });

  let processed = 0, linked = 0, unlinked = 0, skipped = 0, failed = 0;
  const errors: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Fetch unseen messages (limit batch to 50 per run)
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      const batch = uids.slice(0, 50);

      for (const uid of batch) {
        processed++;
        try {
          const msg = await client.fetchOne(String(uid), { source: true, envelope: true, uid: true }, { uid: true });
          if (!msg || !msg.source) { skipped++; continue; }

          const parsed = await simpleParser(msg.source as Uint8Array);
          const subject = parsed.subject ?? msg.envelope?.subject ?? "";
          const from = parsed.from?.value?.[0]?.address ?? msg.envelope?.from?.[0]?.address ?? "desconhecido";
          const to = parsed.to && "value" in parsed.to ? parsed.to.value?.[0]?.address : msg.envelope?.to?.[0]?.address ?? user;
          const text = (parsed.text || parsed.html || "").toString().slice(0, 50_000);
          const messageId = parsed.messageId ?? msg.envelope?.messageId ?? null;

          // Idempotency: skip if we've already stored this message-id
          if (messageId) {
            const { data: existing } = await admin
              .from("email_communications")
              .select("id")
              .eq("resend_id", messageId)
              .maybeSingle();
            if (existing) {
              await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
              skipped++;
              continue;
            }
          }

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
            from_email: from,
            to_email: to || user,
            subject,
            body: text || "(sem conteúdo)",
            status: sacRequestId ? "received" : "unlinked",
            resend_id: messageId,
            raw_payload: {
              source: "imap-locaweb",
              uid,
              messageId,
              date: parsed.date?.toISOString?.() ?? null,
              headers: Object.fromEntries(parsed.headerLines?.map?.((h) => [h.key, h.line]) ?? []),
            },
          });

          if (insErr) {
            failed++;
            errors.push(`uid ${uid}: ${insErr.message}`);
            continue;
          }

          if (sacRequestId) linked++; else unlinked++;
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
        } catch (e) {
          failed++;
          errors.push(`uid ${uid}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    console.error("imap-poll-inbox error:", e);
    try { await client.close(); } catch { /* ignore */ }
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