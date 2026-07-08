// Edge Function pública para o Portal Digitale Têxtil (Vendas).
// Retorna SACs em modo somente-leitura, autenticada por token compartilhado.
//
// Uso:
//   GET  /list-sacs-portal            -> lista resumida
//   GET  /list-sacs-portal?id=<uuid>  -> detalhe (mensagem, tickets internos, anexos, laudos)
//
// Header obrigatório: `x-portal-token: <VENDAS_PORTAL_TOKEN>`

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders as baseCors } from "npm:@supabase/supabase-js@2/cors";

const corsHeaders = {
  ...baseCors,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-token",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTAL_TOKEN = Deno.env.get("VENDAS_PORTAL_TOKEN")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function signLaudos(paths: string[] | null): Promise<{ path: string; url: string | null }[]> {
  if (!paths || paths.length === 0) return [];
  const out: { path: string; url: string | null }[] = [];
  for (const p of paths) {
    const { data } = await admin.storage.from("laudos").createSignedUrl(p, 60 * 60);
    out.push({ path: p, url: data?.signedUrl ?? null });
  }
  return out;
}

function publicAttachmentUrls(paths: string[] | null) {
  if (!paths || paths.length === 0) return [];
  return paths.map((p) => {
    const { data } = admin.storage.from("sac-attachments").getPublicUrl(p);
    return { path: p, url: data.publicUrl };
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = req.headers.get("x-portal-token")?.trim();
  if (!token || token !== PORTAL_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const { data: sac, error } = await admin
        .from("sac_requests")
        .select(
          "id, protocol, name, email, phone, status, subject, message, contact_type, complaint_type, order_number, procedencia, attachments, laudos, created_at",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      if (!sac) return json({ error: "not_found" }, 404);

      const { data: tickets } = await admin
        .from("tickets")
        .select("id, message, author_name, author_email, is_internal, created_at")
        .eq("sac_request_id", id)
        .eq("is_internal", true)
        .order("created_at", { ascending: true });

      return json({
        sac: {
          ...sac,
          attachments: publicAttachmentUrls(sac.attachments as string[] | null),
          laudos: await signLaudos(sac.laudos as string[] | null),
        },
        tickets: tickets ?? [],
      });
    }

    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
    const status = url.searchParams.get("status");

    let query = admin
      .from("sac_requests")
      .select("id, protocol, name, email, status, contact_type, complaint_type, subject, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    return json({ items: data ?? [] });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});