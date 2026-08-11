import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (!resendKey) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { ticket, sac_request } = await req.json();
    if (!ticket) throw new Error("Ticket data missing");


    // Load settings
    const { data: settings } = await admin
      .from("email_settings")
      .select("internal_notifications_enabled, internal_notification_emails")
      .limit(1)
      .maybeSingle();

    if (!settings?.internal_notifications_enabled) {
      return new Response(JSON.stringify({ success: true, message: "Notifications disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const recipients = settings.internal_notification_emails
      ?.split(",")
      .map((e: string) => e.trim())
      .filter((e: string) => e.includes("@"));

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No valid recipients" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get SAC request context (prefer data passed in payload)
    let sac = sac_request;
    
    if (!sac) {
      console.log("SAC request context not provided in payload, fetching from DB...");
      const { data: dbSac, error: sacError } = await admin
        .from("sac_requests")
        .select("protocol, company_name, complaint_type, complaint_subtype")
        .eq("id", ticket.sac_request_id)
        .maybeSingle();
      
      if (sacError) {
        console.error("Error fetching SAC request:", sacError);
      }
      sac = dbSac;
    }

    const protocol = sac?.protocol ?? "N/A";
    const companyName = sac?.company_name ?? sac?.name ?? "Não informada";
    const complaintType = sac?.complaint_type ?? "Geral";
    const complaintSubtype = sac?.complaint_subtype ? ` - ${sac.complaint_subtype}` : "";

    const author = ticket.author_name || ticket.author_email || "Sistema";

    const subject = `[NOTIFICAÇÃO INTERNA] SAC ${protocol} - ${companyName}`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
        <h2 style="color:#0f172a">Nova Anotação Interna</h2>
        <p>Uma nova comunicação interna foi registrada para a solicitação:</p>
        
        <div style="background-color:#f1f5f9; padding:12px; border-radius:6px; margin-bottom:15px;">
          <p style="margin:0;"><strong>Empresa:</strong> ${companyName}</p>
          <p style="margin:0;"><strong>Protocolo:</strong> ${protocol}</p>
          <p style="margin:0;"><strong>Tipo de Reclamação:</strong> ${complaintType}${complaintSubtype}</p>
        </div>

        <div style="background-color:#f8fafc;border-left:4px solid #3b82f6;padding:15px;margin:20px 0;">
          <p style="margin-top:0;font-weight:bold;color:#64748b;font-size:12px">AUTOR: ${author}</p>
          <div style="white-space:pre-wrap">${ticket.message}</div>
        </div>

        <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#94a3b8">Este é um aviso automático enviado para Diretoria e Gerência via SAC Digitale Têxtil.</p>
      </div>
    `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SAC Digitale <qualidade@digitaletextil.com.br>",
        to: recipients,
        subject: subject,
        html: htmlBody,
      }),
    });

    const resendData = await resendResp.json();
    
    // Log the result
    try {
      await admin.from("internal_ticket_logs").insert({
        ticket_id: ticket.id,
        status: resendResp.ok ? "success" : "failure",
        recipient_email: recipients.join(", "),
        error_message: resendResp.ok ? null : (resendData.message || JSON.stringify(resendData))
      });
    } catch (logErr) {
      console.error("Failed to log internal notification:", logErr);
    }

    return new Response(JSON.stringify({ success: resendResp.ok, data: resendData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-internal-ticket error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
