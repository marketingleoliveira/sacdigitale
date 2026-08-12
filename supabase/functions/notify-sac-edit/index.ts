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

    const { edit_data, sac_request } = await req.json();
    
    // Load settings for recipients
    const { data: settings } = await admin
      .from("email_settings")
      .select("internal_notification_emails")
      .limit(1)
      .maybeSingle();

    const recipients = settings?.internal_notification_emails
      ?.split(",")
      .map((e: string) => e.trim())
      .filter((e: string) => e.includes("@")) || ["gerente@digitaletextil.com.br", "renato@digitaletextil.com.br"];

    const protocol = sac_request?.protocol ?? "N/A";
    const companyName = sac_request?.name ?? "Não informada";
    const editorEmail = edit_data?.editor_email ?? "Comercial";
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const subject = `[EDIÇÃO SAC] SAC ${protocol} - Alteração por Vendas`;
    const htmlBody = `
      <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
        <h2 style="color:#0f172a">Edição Recente no SAC</h2>
        <p>Uma alteração foi realizada no SAC por um membro da equipe de vendas:</p>
        
        <div style="background-color:#f1f5f9; padding:12px; border-radius:6px; margin-bottom:15px;">
          <p style="margin:0;"><strong>Empresa:</strong> ${companyName}</p>
          <p style="margin:0;"><strong>Protocolo:</strong> ${protocol}</p>
          <p style="margin:0;"><strong>Editado por:</strong> ${editorEmail}</p>
          <p style="margin:0;"><strong>Data e Hora:</strong> ${timestamp}</p>
        </div>

        <div style="background-color:#fffbeb; border-left:4px solid #f59e0b; padding:15px; margin:20px 0;">
          <p style="margin:0;"><strong>Campo Alterado:</strong> Nota Fiscal</p>
          <p style="margin:0;"><strong>Novo Valor:</strong> ${edit_data.new_value || '(vazio)'}</p>
          <p style="margin:0; font-size:12px; color:#6b7280; margin-top:10px;">Valor anterior: ${edit_data.old_value || '(vazio)'}</p>
        </div>

        <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0">
        <p style="font-size:12px;color:#94a3b8">Este é um aviso automático enviado via SAC Digitale Têxtil.</p>
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

    return new Response(JSON.stringify({ success: resendResp.ok, data: resendData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-sac-edit error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
