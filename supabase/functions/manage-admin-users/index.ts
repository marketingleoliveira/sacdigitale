import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } =
      await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem realizar esta ação" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      const { data: roles, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("*")
        .order("created_at", { ascending: false });
      if (rolesError) throw rolesError;

      const { data: usersData, error: usersError } =
        await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;

      const emailMap = new Map<string, string>();
      for (const u of usersData.users) {
        if (u.email) emailMap.set(u.id, u.email);
      }

      const enriched = (roles ?? []).map((r) => ({
        ...r,
        email: emailMap.get(r.user_id) ?? null,
      }));

      return new Response(JSON.stringify({ users: enriched }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_password") {
      const { user_id, password } = body as { user_id: string; password: string };
      if (!user_id || !password || password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Senha inválida (mínimo 6 caracteres)" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
        user_id,
        { password }
      );
      if (updErr) throw updErr;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("manage-admin-users error:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});