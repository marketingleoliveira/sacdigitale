import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM_EMAIL = "SAC Digitale <qualidade@digitaletextil.com.br>";
const DEFAULT_BCC_EMAIL = Deno.env.get("DEFAULT_BCC_EMAIL") ?? "gerente@digitaletextil.com.br";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const allowed = ["admin", "desenvolvedor", "gerencia", "qualidade"];
    const hasAccess = (roles ?? []).some((r: { role: string }) => allowed.includes(r.role));
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Apenas administradores" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sac_request_id, to, subject, body, attachments } = await req.json();
    if (!sac_request_id || !to || !subject || !body) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get protocol for reply tracking
    const { data: sac } = await admin
      .from("sac_requests").select("protocol").eq("id", sac_request_id).maybeSingle();
    const protocol = sac?.protocol ?? "";

    // Load BCC settings (configurable via admin UI; falls back to env default)
    const { data: settings } = await admin
      .from("email_settings")
      .select("bcc_enabled, bcc_email, emails_enabled, self_copy_enabled")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const emailsEnabled = settings?.emails_enabled ?? true;
    if (!emailsEnabled) {
      return new Response(JSON.stringify({ error: "Envio de e-mails está desativado nas configurações." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bccEnabled = settings?.bcc_enabled ?? true;
    const bccEmail = (settings?.bcc_email ?? DEFAULT_BCC_EMAIL)?.trim() || null;
    const useBcc = bccEnabled && bccEmail;
    const selfCopy = settings?.self_copy_enabled ?? true;
    // Sender receipt: send a copy back to the sending mailbox itself (qualidade@).
    const SENDER_ADDR = "qualidade@digitaletextil.com.br";
    const bccList: string[] = [];
    if (useBcc) bccList.push(bccEmail!);
    if (selfCopy) bccList.push(SENDER_ADDR);

    const finalSubject = subject.includes(`[${protocol}]`) ? subject : `[${protocol}] ${subject}`;
    const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;white-space:pre-wrap">${
      String(body).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]!))
    }</div><br><hr><div style="font-size:11px;color:#888">Protocolo ${protocol} — Digitale Têxtil</div>`;

    const payload: Record<string, unknown> = {
      from: FROM_EMAIL,
      to: [to],
      subject: finalSubject,
      html: htmlBody,
      reply_to: FROM_EMAIL,
    };
    if (bccList.length > 0) payload.bcc = bccList;

    // Process attachments: download from signed URL → base64 → Resend attachment
    const attachmentMeta: { filename: string; url: string; size?: number; content_type?: string }[] = [];
    if (Array.isArray(attachments) && attachments.length > 0) {
      const resendAttachments: { filename: string; content: string }[] = [];
      for (const a of attachments) {
        try {
          const r = await fetch(a.url);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const buf = new Uint8Array(await r.arrayBuffer());
          // base64 encode
          let bin = "";
          for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          const b64 = btoa(bin);
          resendAttachments.push({ filename: a.filename, content: b64 });
          attachmentMeta.push({ filename: a.filename, url: a.url, size: a.size, content_type: a.content_type });
        } catch (e) {
          console.error(`[send-customer-email] falha ao anexar ${a.filename}:`, e);
        }
      }
      if (resendAttachments.length > 0) payload.attachments = resendAttachments;
    }

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const resendData = await resendResp.json();
    if (!resendResp.ok) {
      await admin.from("email_communications").insert({
        sac_request_id, direction: "outbound", from_email: FROM_EMAIL, to_email: to,
        bcc_email: useBcc ? bccEmail : null,
        subject: finalSubject, body, sent_by: user.id, sent_by_email: user.email,
        status: "failed", error_message: JSON.stringify(resendData),
        attachments: attachmentMeta,
      });
      return new Response(JSON.stringify({ error: "Falha no envio", details: resendData }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (useBcc && resendData?.id) {
      // BCC is delivered as part of the same Resend send. If Resend reports any
      // per-recipient failure metadata in the future, log it but do not fail the
      // customer-facing send.
      console.log(`[send-customer-email] BCC enviado para ${bccEmail} (resend id ${resendData.id})`);
    }

    await admin.from("email_communications").insert({
      sac_request_id, direction: "outbound", from_email: FROM_EMAIL, to_email: to,
      bcc_email: useBcc ? bccEmail : null,
      subject: finalSubject, body, resend_id: resendData.id, sent_by: user.id,
      sent_by_email: user.email, status: "sent",
      attachments: attachmentMeta,
    });

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-customer-email error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});