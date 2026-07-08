import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SACRequest {
  contactType: string;
  complaintType?: string | null;
  name: string;
  email: string;
  phone: string;
  orderNumber: string;
  subject: string;
  message: string;
  attachments?: string[];
}

const generateProtocol = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SAC${year}${month}${day}-${random}`;
};

const handler = async (req: Request): Promise<Response> => {
  console.log("Received request:", req.method);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const requestData: SACRequest = await req.json();
    console.log("Request data:", requestData);

    // Validate required fields
    if (!requestData.contactType || !requestData.name || !requestData.email || !requestData.phone || !requestData.orderNumber || !requestData.subject || !requestData.message) {
      console.log("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios não preenchidos" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Generate protocol number
    const protocol = generateProtocol();
    console.log("Generated protocol:", protocol);

    // Insert into database
    const { data: sacData, error: dbError } = await supabase
      .from("sac_requests")
      .insert({
        contact_type: requestData.contactType,
        complaint_type: requestData.contactType === "reclamacao" ? (requestData.complaintType || null) : null,
        name: requestData.name,
        email: requestData.email,
        phone: requestData.phone,
        order_number: requestData.orderNumber,
        subject: requestData.subject,
        message: requestData.message,
        protocol: protocol,
        attachments: requestData.attachments || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar solicitação", details: dbError.message }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("SAC request saved:", sacData);

    // Send confirmation email to the customer (and copy to qualidade@)
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (resendKey) {
        const FROM = "SAC Digitale <qualidade@digitaletextil.com.br>";
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.6">
            <p>Olá <strong>${requestData.name}</strong>,</p>
            <p>Recebemos sua solicitação e ela <strong>está sendo analisada</strong> pela nossa equipe de qualidade.
            Responderemos em breve pelo mesmo canal.</p>
            <p><strong>Protocolo:</strong> ${protocol}<br>
            <strong>Assunto:</strong> ${requestData.subject}</p>
            <hr>
            <div style="font-size:11px;color:#888">Digitale Têxtil — SAC Qualidade</div>
          </div>`;
        const confSubject = `[${protocol}] Recebemos sua solicitação — em análise`;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM,
            to: [requestData.email],
            reply_to: FROM,
            subject: confSubject,
            html,
          }),
        });
        if (!r.ok) {
          console.error("submit-sac confirmation email failed:", await r.text());
        } else {
          // Log as OUTBOUND in the thread so it appears as "Enviado" in the admin UI
          // (and so qualidade@ inbox does not receive/duplicate it as "Recebido").
          await supabase.from("email_communications").insert({
            sac_request_id: sacData.id,
            direction: "outbound",
            from_email: "qualidade@digitaletextil.com.br",
            to_email: requestData.email,
            subject: confSubject,
            body: `Olá ${requestData.name},\n\nRecebemos sua solicitação e ela está sendo analisada pela nossa equipe de qualidade. Responderemos em breve pelo mesmo canal.\n\nProtocolo: ${protocol}\nAssunto: ${requestData.subject}`,
            status: "sent",
            sent_by_email: "sistema@digitaletextil.com.br",
            raw_payload: { type: "sac.confirmation", source: "submit-sac" },
          });
        }
      }
    } catch (e) {
      console.error("submit-sac confirmation email error:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        protocol: protocol,
        message: "Solicitação enviada com sucesso",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in submit-sac function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
