import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SACRequest {
  contactType: string;
  name: string;
  email: string;
  phone: string;
  orderNumber: string;
  subject: string;
  message: string;
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
        name: requestData.name,
        email: requestData.email,
        phone: requestData.phone,
        order_number: requestData.orderNumber,
        subject: requestData.subject,
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
