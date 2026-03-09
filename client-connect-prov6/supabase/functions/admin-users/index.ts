import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role - accept both 'admin' and 'super_admin'
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: any) => r.role);
    const isSuperAdmin = userRoles.includes("super_admin");
    const isAdmin = userRoles.includes("admin");

    if (!isSuperAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    // ── CREATE ADMIN (super_admin only) ──────────────────────────
    if (action === "create_admin") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super_admin can create admins" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { email, password, name, max_clients_per_user, max_users, subscription_days } = params;

      // Create auth user with role=admin in metadata so trigger handles it
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || "", role: "admin" },
      });
      if (error) throw error;

      // Wait for trigger to create profile + role
      await new Promise((r) => setTimeout(r, 2000));

      const userId = newUser.user.id;

      // Update profile with admin-specific limits
      const subEnd = new Date(Date.now() + (subscription_days || 365) * 86400000).toISOString();
      await supabase.from("profiles").update({
        max_clients: max_clients_per_user || 10000,
        max_instances: max_users || 1000,
        subscription_end: subEnd,
        is_active: true,
      }).eq("user_id", userId);

      return new Response(JSON.stringify({ user: newUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ADMIN (super_admin only) ──────────────────────────
    if (action === "delete_admin") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super_admin can delete admins" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { user_id } = params;
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete all users owned by this admin first (created_by column)
      const { data: ownedUsers } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("created_by", user_id);

      if (ownedUsers) {
        for (const owned of ownedUsers) {
          await supabase.auth.admin.deleteUser(owned.user_id);
          await supabase.from("user_roles").delete().eq("user_id", owned.user_id);
          await supabase.from("profiles").delete().eq("user_id", owned.user_id);
        }
      }

      // Delete the admin itself
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) throw error;
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      await supabase.from("profiles").delete().eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE ADMIN (super_admin only) ──────────────────────────
    if (action === "update_admin") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super_admin can update admins" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { user_id, password, max_clients_per_user, max_users, subscription_days, is_active } = params;

      // Update password if provided
      if (password) {
        const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
      }

      // Update profile
      const updates: any = {};
      if (max_clients_per_user !== undefined) updates.max_clients = max_clients_per_user;
      if (max_users !== undefined) updates.max_instances = max_users;
      if (is_active !== undefined) updates.is_active = is_active;
      if (subscription_days) {
        updates.subscription_end = new Date(Date.now() + subscription_days * 86400000).toISOString();
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("profiles").update(updates).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE USER (admin creates reseller) ─────────────────────
    if (action === "create_user") {
      const { email, password, name } = params;
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || "", role: "user", created_by: user.id },
      });
      if (error) throw error;
      return new Response(JSON.stringify({ user: newUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE USER ───────────────────────────────────────────────
    if (action === "delete_user") {
      const { user_id } = params;
      if (user_id === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) throw error;
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      await supabase.from("profiles").delete().eq("user_id", user_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE PASSWORD ──────────────────────────────────────────
    if (action === "update_password") {
      const { user_id, password } = params;
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
