import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

// Receives inbound emails from Resend webhook (event: email.inbound or via webhook forwarder).
// Matches the SAC request via the protocol token in the subject line: [SAC20260616-V5LG53]
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const payload = await req.json();
    console.log("Inbound payload:", JSON.stringify(payload).slice(0, 500));

    // Accept both Resend webhook envelope { type, data } and raw inbound objects
    const data = payload?.data ?? payload;
    const subject: string = data?.subject ?? data?.headers?.subject ?? "";
    const from: string = (typeof data?.from === "string" ? data.from : data?.from?.email) ?? data?.sender ?? "";
    const to: string = Array.isArray(data?.to) ? data.to[0] : (data?.to?.email ?? data?.to ?? "");
    const text: string = data?.text ?? data?.body_plain ?? data?.html ?? data?.body_html ?? "";

    const match = subject.match(/SAC\d{8}-[A-Z0-9]+/i);
    if (!match) {
      console.warn("No protocol matched in subject:", subject);
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const protocol = match[0].toUpperCase();

    const { data: sac } = await admin
      .from("sac_requests").select("id").eq("protocol", protocol).maybeSingle();
    if (!sac) {
      console.warn("Protocol not found:", protocol);
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("email_communications").insert({
      sac_request_id: sac.id,
      direction: "inbound",
      from_email: from || "desconhecido",
      to_email: to || "qualidade@digitaletextil.com.br",
      subject,
      body: text || "(sem conteúdo)",
      status: "received",
      raw_payload: payload,
    });

    return new Response(JSON.stringify({ ok: true, matched: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("inbound webhook error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});