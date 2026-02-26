#!/bin/bash
# ============================================================
# FIX Multi-Tenant - Corrige enum, trigger e edge function
# 
# Uso: chmod +x fix-multitenant.sh && sudo ./fix-multitenant.sh
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}▶ Corrigindo Multi-Tenant${NC}"
echo "────────────────────────────────────────"

# ============================================================
# 1. CORRIGIR ENUM E TRIGGER NO BANCO
# ============================================================
echo ""
echo -e "${YELLOW}[1/3] Corrigindo enum app_role + trigger handle_new_user...${NC}"

docker exec -i supabase-db psql -U postgres -d postgres << 'SQLFIX'

-- ═══════════════════════════════════════════════════════════
-- 1. Adicionar 'super_admin' ao enum app_role
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  -- Verifica se super_admin já existe no enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'super_admin' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'super_admin';
    RAISE NOTICE '✅ super_admin adicionado ao enum app_role';
  ELSE
    RAISE NOTICE 'ℹ️  super_admin já existe no enum';
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════
-- 2. Adicionar coluna owner_id na profiles (se não existe)
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    RAISE NOTICE '✅ Coluna owner_id adicionada na profiles';
  ELSE
    RAISE NOTICE 'ℹ️  Coluna owner_id já existe';
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════
-- 3. Recriar trigger handle_new_user com suporte a role do metadata
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  meta_role text;
  actual_role public.app_role;
  trial_days integer;
  sub_end timestamptz;
  meta_owner_id uuid;
BEGIN
  -- Ler role do user_metadata (passado na criação do usuário)
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  
  -- Validar e converter para enum
  IF meta_role = 'super_admin' THEN
    actual_role := 'super_admin';
    sub_end := '2099-12-31T23:59:59Z'::timestamptz;
  ELSIF meta_role = 'admin' THEN
    actual_role := 'admin';
    sub_end := '2099-12-31T23:59:59Z'::timestamptz;
  ELSE
    actual_role := 'user';
    -- Para users, usar trial_days do system_settings
    SELECT COALESCE(value::integer, 30) INTO trial_days
    FROM public.system_settings WHERE key = 'default_trial_days';
    IF trial_days IS NULL THEN trial_days := 30; END IF;
    sub_end := now() + (trial_days || ' days')::interval;
  END IF;

  -- Ler owner_id do metadata (admin que criou este user)
  meta_owner_id := NULLIF(NEW.raw_user_meta_data->>'owner_id', '')::uuid;

  -- Criar profile
  INSERT INTO public.profiles (user_id, name, email, subscription_start, subscription_end, owner_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    now(),
    sub_end,
    meta_owner_id
  );

  -- Criar role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, actual_role);

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 4. Atualizar has_role para aceitar super_admin
--    (a function já funciona com enum, mas garantir)
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- 5. RLS: Super admin pode ver/gerenciar tudo
-- ═══════════════════════════════════════════════════════════
-- Profiles: super_admin pode ver todos
DROP POLICY IF EXISTS "Super admin can manage all profiles" ON public.profiles;
CREATE POLICY "Super admin can manage all profiles" ON public.profiles
FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- User roles: super_admin pode gerenciar todos
DROP POLICY IF EXISTS "Super admin can manage all roles" ON public.user_roles;
CREATE POLICY "Super admin can manage all roles" ON public.user_roles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- System settings: super_admin pode gerenciar
DROP POLICY IF EXISTS "Super admin manage settings" ON public.system_settings;
CREATE POLICY "Super admin manage settings" ON public.system_settings
FOR ALL TO authenticated 
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- ═══════════════════════════════════════════════════════════
-- 6. Corrigir o Super Admin existente (se foi criado com role 'user')
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE
  sa_user_id uuid;
BEGIN
  -- Encontrar usuário com metadata role='super_admin'
  SELECT id INTO sa_user_id FROM auth.users 
  WHERE raw_user_meta_data->>'role' = 'super_admin' 
  LIMIT 1;
  
  IF sa_user_id IS NOT NULL THEN
    -- Deletar role 'user' que o trigger antigo criou
    DELETE FROM public.user_roles WHERE user_id = sa_user_id AND role = 'user';
    
    -- Inserir role 'super_admin' se não existe
    INSERT INTO public.user_roles (user_id, role) 
    VALUES (sa_user_id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Atualizar subscription para nunca expirar
    UPDATE public.profiles 
    SET subscription_end = '2099-12-31T23:59:59Z', is_active = true
    WHERE user_id = sa_user_id;
    
    RAISE NOTICE '✅ Super Admin corrigido: %', sa_user_id;
  ELSE
    RAISE NOTICE '⚠️  Nenhum super_admin encontrado no metadata';
  END IF;
END$$;

SQLFIX

echo -e "${GREEN}✔ Banco corrigido${NC}"

# ============================================================
# 2. SUBSTITUIR EDGE FUNCTION admin-users
# ============================================================
echo ""
echo -e "${YELLOW}[2/3] Atualizando edge function admin-users...${NC}"

SUPABASE_DIR="/opt/gestaopro/supabase-docker"
FUNC_DIR="$SUPABASE_DIR/volumes/functions/admin-users"
mkdir -p "$FUNC_DIR"

cat > "$FUNC_DIR/index.ts" << 'EDGEFUNC'
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

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role - accept admin OR super_admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: any) => r.role);
    const isSuperAdmin = userRoles.includes("super_admin");
    const isAdmin = userRoles.includes("admin");

    if (!isSuperAdmin && !isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden - no admin/super_admin role" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...params } = await req.json();

    // ── CREATE ADMIN (super_admin only) ─────────────────────
    if (action === "create_admin") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super_admin can create admins" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { email, password, name, max_clients_per_user, max_users, subscription_days } = params;

      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || "", role: "admin" },
      });
      if (error) throw error;

      // Wait for trigger to create profile + admin role
      await new Promise((r) => setTimeout(r, 2000));

      const userId = newUser.user.id;
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

    // ── DELETE ADMIN (super_admin only) ─────────────────────
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

      // Delete users owned by this admin
      const { data: ownedUsers } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("owner_id", user_id);

      if (ownedUsers) {
        for (const owned of ownedUsers) {
          await supabase.auth.admin.deleteUser(owned.user_id);
          await supabase.from("user_roles").delete().eq("user_id", owned.user_id);
          await supabase.from("profiles").delete().eq("user_id", owned.user_id);
        }
      }

      const { error } = await supabase.auth.admin.deleteUser(user_id);
      if (error) throw error;
      await supabase.from("user_roles").delete().eq("user_id", user_id);
      await supabase.from("profiles").delete().eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE ADMIN (super_admin only) ─────────────────────
    if (action === "update_admin") {
      if (!isSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super_admin can update admins" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { user_id, password, max_clients_per_user, max_users, subscription_days, is_active } = params;

      if (password) {
        const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
        if (error) throw error;
      }

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

    // ── CREATE USER (admin creates reseller) ────────────────
    if (action === "create_user") {
      const { email, password, name } = params;
      const { data: newUser, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: name || "", role: "user", owner_id: user.id },
      });
      if (error) throw error;
      return new Response(JSON.stringify({ user: newUser.user }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE USER ──────────────────────────────────────────
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

    // ── UPDATE PASSWORD ─────────────────────────────────────
    if (action === "update_password") {
      const { user_id, password } = params;
      const { error } = await supabase.auth.admin.updateUserById(user_id, { password });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
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
EDGEFUNC

echo -e "${GREEN}✔ Edge function atualizada${NC}"

# ============================================================
# 3. REINICIAR CONTAINER DE EDGE FUNCTIONS
# ============================================================
echo ""
echo -e "${YELLOW}[3/3] Reiniciando edge functions...${NC}"

cd "$SUPABASE_DIR"
docker compose restart functions

sleep 5
echo -e "${GREEN}✔ Edge functions reiniciadas${NC}"

# ============================================================
# RESUMO
# ============================================================
echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Multi-Tenant corrigido!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "  O que foi feito:"
echo "    1. Enum app_role: adicionado 'super_admin'"
echo "    2. Trigger handle_new_user: lê role do metadata"
echo "    3. Super Admin existente: corrigido para role super_admin"
echo "    4. RLS: super_admin pode gerenciar tudo"
echo "    5. Edge function admin-users: suporta create_admin"
echo "    6. Edge functions reiniciadas"
echo ""
echo "  Teste agora:"
echo "    → Acesse /super-admin e tente criar um admin"
echo ""
