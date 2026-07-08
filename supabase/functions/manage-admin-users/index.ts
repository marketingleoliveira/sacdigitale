import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const getRequestingUserId = async (authHeader: string, supabaseAdmin: ReturnType<typeof createClient>) => {
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Token inválido");
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    throw new Error("Token inválido");
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Token inválido");
  }

  return data.user.id;
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

    let requestingUserId: string;
    try {
      requestingUserId = await getRequestingUserId(authHeader, supabaseAdmin);
    } catch (authError) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: requesterRoleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUserId)
      .in("role", ["admin", "desenvolvedor", "qualidade", "gerencia"])
      .maybeSingle();

    const requesterRole = requesterRoleRow?.role as string | undefined;
    const canManageUsers = requesterRole === "admin" || requesterRole === "desenvolvedor" || requesterRole === "gerencia";

    if (!requesterRole) {
      return new Response(
        JSON.stringify({ error: "Acesso negado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "list") {
      if (!canManageUsers) {
        return new Response(
          JSON.stringify({ error: "Apenas Desenvolvedor ou Gerência podem listar usuários" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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
      if (!canManageUsers) {
        return new Response(
          JSON.stringify({ error: "Apenas Desenvolvedor ou Gerência podem alterar senhas" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
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

    if (action === "update_role") {
      if (!canManageUsers) {
        return new Response(
          JSON.stringify({ error: "Apenas Desenvolvedor ou Gerência podem alterar cargos" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { user_id, role, display_name } = body as { user_id: string; role: string; display_name?: string };
      const allowed = ["desenvolvedor", "qualidade", "gerencia", "vendas"];
      if (!user_id || !allowed.includes(role)) {
        return new Response(
          JSON.stringify({ error: "Cargo inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (role === "vendas" && (!display_name || !display_name.trim())) {
        return new Response(
          JSON.stringify({ error: "Nome do vendedor é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Remove existing staff roles for this user, then insert the new one
      const { error: delErr } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", user_id)
        .in("role", ["admin", "desenvolvedor", "qualidade", "gerencia", "vendas"]);
      if (delErr) throw delErr;
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id, role, display_name: display_name?.trim() || null });
      if (insErr) throw insErr;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_display_name") {
      if (!canManageUsers) {
        return new Response(
          JSON.stringify({ error: "Sem permissão" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const { user_id, display_name } = body as { user_id: string; display_name: string | null };
      const { error: updErr } = await supabaseAdmin
        .from("user_roles")
        .update({ display_name: display_name?.trim() || null })
        .eq("user_id", user_id);
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