import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SACRequest {
  contactType: string;
  name: string;
  email: string;
  phone?: string;
  orderNumber?: string;
  subject?: string;
  message: string;
}

const contactTypeLabels: Record<string, string> = {
  reclamacao: "Reclamação",
  sugestao: "Sugestão",
  elogio: "Elogio",
  duvida: "Dúvida",
};

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
    if (!requestData.contactType || !requestData.name || !requestData.email || !requestData.message) {
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
        name: requestData.name,
        email: requestData.email,
        phone: requestData.phone || null,
        order_number: requestData.orderNumber || null,
        message: requestData.message,
        protocol: protocol,
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

    // Send confirmation email to customer
    const customerEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #2563eb, #1d4ed8); padding: 30px; border-radius: 12px 12px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .protocol { background: #e0f2fe; border: 2px dashed #0ea5e9; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0; }
          .protocol strong { font-size: 24px; color: #0369a1; }
          .details { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; }
          .details h3 { margin-top: 0; color: #1e40af; }
          .footer { text-align: center; margin-top: 30px; color: #64748b; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📩 Recebemos sua Solicitação!</h1>
          </div>
          <div class="content">
            <p>Olá <strong>${requestData.name}</strong>,</p>
            <p>Agradecemos por entrar em contato conosco! Sua solicitação foi recebida com sucesso.</p>
            
            <div class="protocol">
              <p style="margin: 0 0 10px 0; color: #475569;">Seu número de protocolo é:</p>
              <strong>${protocol}</strong>
            </div>
            
            <p>Guarde este número para acompanhar sua solicitação.</p>
            
            <div class="details">
              <h3>Resumo da sua solicitação:</h3>
              <p><strong>Tipo:</strong> ${contactTypeLabels[requestData.contactType] || requestData.contactType}</p>
              ${requestData.orderNumber ? `<p><strong>Pedido:</strong> ${requestData.orderNumber}</p>` : ""}
              <p><strong>Mensagem:</strong></p>
              <p style="background: #f1f5f9; padding: 15px; border-radius: 6px;">${requestData.message}</p>
            </div>
            
            <p>Nossa equipe analisará sua solicitação e retornará o mais breve possível.</p>
            
            <div class="footer">
              <p>Atenciosamente,<br><strong>Equipe de Atendimento</strong></p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send email to customer
    try {
      const customerEmailResponse = await resend.emails.send({
        from: "SAC <onboarding@resend.dev>",
        to: [requestData.email],
        subject: `Solicitação Recebida - Protocolo ${protocol}`,
        html: customerEmailHtml,
      });
      console.log("Customer email sent:", customerEmailResponse);
    } catch (emailError) {
      console.error("Error sending customer email:", emailError);
      // Don't fail the request if email fails
    }

    // Send notification email to admin (you can change this to your email)
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 30px; border-radius: 12px 12px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
          .badge-reclamacao { background: #fee2e2; color: #dc2626; }
          .badge-sugestao { background: #fef3c7; color: #d97706; }
          .badge-elogio { background: #dcfce7; color: #16a34a; }
          .badge-duvida { background: #e0f2fe; color: #0284c7; }
          .details { background: white; padding: 20px; border-radius: 8px; margin-top: 20px; }
          .info-row { border-bottom: 1px solid #e2e8f0; padding: 10px 0; }
          .info-row:last-child { border-bottom: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔔 Nova Solicitação SAC</h1>
          </div>
          <div class="content">
            <p>Uma nova solicitação foi recebida através do formulário SAC:</p>
            
            <div class="details">
              <div class="info-row">
                <strong>Protocolo:</strong> ${protocol}
              </div>
              <div class="info-row">
                <strong>Tipo:</strong> 
                <span class="badge badge-${requestData.contactType}">
                  ${contactTypeLabels[requestData.contactType] || requestData.contactType}
                </span>
              </div>
              <div class="info-row">
                <strong>Nome:</strong> ${requestData.name}
              </div>
              <div class="info-row">
                <strong>E-mail:</strong> ${requestData.email}
              </div>
              ${requestData.phone ? `<div class="info-row"><strong>Telefone:</strong> ${requestData.phone}</div>` : ""}
              ${requestData.orderNumber ? `<div class="info-row"><strong>Pedido:</strong> ${requestData.orderNumber}</div>` : ""}
              <div class="info-row">
                <strong>Mensagem:</strong>
                <p style="background: #f1f5f9; padding: 15px; border-radius: 6px; margin-top: 10px;">${requestData.message}</p>
              </div>
              <div class="info-row">
                <strong>Data:</strong> ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Note: To receive admin emails, you need to verify your domain on Resend
    // For testing, emails can only be sent to the email used to create the Resend account
    try {
      const adminEmailResponse = await resend.emails.send({
        from: "SAC <onboarding@resend.dev>",
        to: ["admin@example.com"], // Change this to your admin email
        subject: `[SAC] Nova ${contactTypeLabels[requestData.contactType]} - ${protocol}`,
        html: adminEmailHtml,
      });
      console.log("Admin notification sent:", adminEmailResponse);
    } catch (emailError) {
      console.error("Error sending admin notification:", emailError);
      // Don't fail the request if admin email fails
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
