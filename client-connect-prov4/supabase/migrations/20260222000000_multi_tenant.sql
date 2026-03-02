-- ============================================================
-- GestãoPro - Migration Completa (Multi-Tenant 3 Camadas)
-- super_admin → admin → user
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Role enum (3 camadas)
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');

-- ============================================================
-- FUNÇÕES UTILITÁRIAS
-- ============================================================

-- Atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============================================================
-- FUNÇÃO ANTI-RECURSÃO RLS (SECURITY DEFINER bypassa RLS)
-- Usada nas policies de user_roles para evitar loop infinito
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- Verificar se user tem determinada role (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Buscar o admin_id (created_by) de um user qualquer
-- Se o próprio user é admin ou super_admin, retorna ele mesmo
CREATE OR REPLACE FUNCTION public.get_admin_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin', 'super_admin'))
    THEN _user_id
    ELSE (SELECT created_by FROM public.profiles WHERE user_id = _user_id)
  END
$$;

-- ============================================================
-- TABELAS CORE
-- ============================================================

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  max_clients INTEGER NOT NULL DEFAULT 100,
  max_users INTEGER NOT NULL DEFAULT 50,
  max_instances INTEGER NOT NULL DEFAULT 1,
  messages_per_minute INTEGER NOT NULL DEFAULT 10,
  subscription_start TIMESTAMPTZ DEFAULT now(),
  subscription_end TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- WuzAPI (por user, configurado pelo admin)
  wuzapi_url TEXT,
  wuzapi_token TEXT,
  -- Pagamentos do user
  mercadopago_access_token TEXT,
  pix_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- System settings (POR ADMIN - não mais global)
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, key)
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELAS DE NEGÓCIO (isoladas por user_id)
-- ============================================================

-- Servers
CREATE TABLE public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cost_per_screen NUMERIC(10,2) NOT NULL DEFAULT 0,
  multiply_by_screens BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

-- Panel credentials
CREATE TABLE public.panel_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('sigma','cloudnation','koffice','uniplay','club','rush','painelfoda')),
  label TEXT NOT NULL DEFAULT '',
  domain TEXT,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.panel_credentials ENABLE ROW LEVEL SECURITY;

-- Plans
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 1,
  num_screens INTEGER NOT NULL DEFAULT 1,
  panel_credential_id UUID REFERENCES public.panel_credentials(id) ON DELETE SET NULL,
  package_id TEXT,
  -- Legacy fields
  is_sigma_plan BOOLEAN DEFAULT false,
  sigma_plan_code TEXT,
  sigma_domain TEXT,
  is_live21_plan BOOLEAN DEFAULT false,
  is_koffice_plan BOOLEAN DEFAULT false,
  koffice_domain TEXT,
  is_uniplay_plan BOOLEAN DEFAULT false,
  is_unitv_plan BOOLEAN DEFAULT false,
  is_club_plan BOOLEAN DEFAULT false,
  is_painelfoda_plan BOOLEAN DEFAULT false,
  painelfoda_domain TEXT,
  painelfoda_username TEXT,
  painelfoda_password TEXT,
  painelfoda_package_id TEXT,
  is_rush_plan BOOLEAN DEFAULT false,
  rush_type TEXT CHECK (rush_type IN ('IPTV', 'P2P')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  whatsapp_number TEXT,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  server_id UUID REFERENCES public.servers(id) ON DELETE SET NULL,
  price_value NUMERIC(10,2) NOT NULL DEFAULT 0,
  due_date DATE,
  username TEXT,
  suffix TEXT,
  password TEXT,
  mac_address TEXT,
  device_key TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  payment_token UUID DEFAULT gen_random_uuid(),
  payment_type TEXT DEFAULT 'pix' CHECK (payment_type IN ('link', 'pix')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Message templates
CREATE TABLE public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Reminders
CREATE TABLE public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  days_offset INTEGER NOT NULL DEFAULT -3,
  send_time TEXT NOT NULL DEFAULT '09:00',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Payments (pagamentos dos clientes finais)
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  mp_payment_id TEXT,
  mp_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Activity logs
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Renewal retry queue
CREATE TABLE public.renewal_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.renewal_retry_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TABELAS DA PLATAFORMA (planos que admin vende para users)
-- ============================================================

-- Platform plans (POR ADMIN)
CREATE TABLE public.platform_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_clients INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

-- Platform payments (pagamento de user para admin)
CREATE TABLE public.platform_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  platform_plan_id UUID REFERENCES public.platform_plans(id),
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  mp_payment_id TEXT,
  mp_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- TRIGGERS updated_at
-- ============================================================

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_panel_credentials_updated_at BEFORE UPDATE ON public.panel_credentials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_message_templates_updated_at BEFORE UPDATE ON public.message_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_renewal_retry_queue_updated_at BEFORE UPDATE ON public.renewal_retry_queue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_plans_updated_at BEFORE UPDATE ON public.platform_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_platform_payments_updated_at BEFORE UPDATE ON public.platform_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGER: Auto-create profile on signup
-- Lê role e created_by do user_metadata (definido pela edge function admin-users)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role app_role;
  _created_by UUID;
  _trial_days INTEGER;
BEGIN
  -- Ler role do metadata (default: 'user')
  _role := COALESCE(NEW.raw_user_meta_data->>'role', 'user')::app_role;
  
  -- Ler created_by do metadata (quem criou esse user)
  _created_by := NULLIF(NEW.raw_user_meta_data->>'created_by', '')::UUID;

  -- Se for user normal, buscar trial_days do admin que o criou
  IF _role = 'user' AND _created_by IS NOT NULL THEN
    SELECT COALESCE(value::integer, 30) INTO _trial_days
    FROM public.system_settings 
    WHERE user_id = _created_by AND key = 'default_trial_days';
  END IF;
  
  IF _trial_days IS NULL THEN
    _trial_days := 30;
  END IF;

  -- Criar profile
  INSERT INTO public.profiles (user_id, created_by, name, email, subscription_start, subscription_end)
  VALUES (
    NEW.id,
    _created_by,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    now(),
    CASE 
      WHEN _role IN ('super_admin', 'admin') THEN '2099-12-31T23:59:59Z'::timestamptz
      ELSE now() + (_trial_days || ' days')::interval
    END
  );

  -- Criar role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- === user_roles ===
-- IMPORTANTE: usar is_super_admin() / is_admin_or_super() (SECURITY DEFINER)
-- em vez de has_role() para evitar recursão infinita no RLS
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.is_super_admin());

CREATE POLICY "Super admin can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "Super admin can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.is_super_admin());

CREATE POLICY "Admin can view roles of own users"
  ON public.user_roles FOR SELECT USING (
    public.is_admin_or_super() AND
    user_id IN (SELECT p.user_id FROM public.profiles p WHERE p.created_by = auth.uid())
  );

-- === profiles ===
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "Super admin can delete all profiles"
  ON public.profiles FOR DELETE
  USING (public.is_super_admin());

CREATE POLICY "Admin can view profiles of own users"
  ON public.profiles FOR SELECT USING (
    has_role(auth.uid(), 'admin') AND created_by = auth.uid()
  );

CREATE POLICY "Admin can update profiles of own users"
  ON public.profiles FOR UPDATE USING (
    has_role(auth.uid(), 'admin') AND created_by = auth.uid()
  );

CREATE POLICY "Admin can delete profiles of own users"
  ON public.profiles FOR DELETE USING (
    has_role(auth.uid(), 'admin') AND created_by = auth.uid()
  );

-- === system_settings (per-admin) ===
CREATE POLICY "Admin manages own settings"
  ON public.system_settings FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read settings of their admin"
  ON public.system_settings FOR SELECT USING (
    user_id = public.get_admin_id(auth.uid())
  );

CREATE POLICY "Super admin can manage all settings"
  ON public.system_settings FOR ALL USING (has_role(auth.uid(), 'super_admin'));

-- === servers ===
CREATE POLICY "Users manage own servers"
  ON public.servers FOR ALL USING (auth.uid() = user_id);

-- === panel_credentials ===
CREATE POLICY "Users manage own panel_credentials"
  ON public.panel_credentials FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === plans ===
CREATE POLICY "Users manage own plans"
  ON public.plans FOR ALL USING (auth.uid() = user_id);

-- === clients ===
CREATE POLICY "Users manage own clients"
  ON public.clients FOR ALL USING (auth.uid() = user_id);

-- === message_templates ===
CREATE POLICY "Users manage own templates"
  ON public.message_templates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === reminders ===
CREATE POLICY "Users manage own reminders"
  ON public.reminders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === payments ===
CREATE POLICY "Users manage own payments"
  ON public.payments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === activity_logs ===
CREATE POLICY "Users manage own activity_logs"
  ON public.activity_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === renewal_retry_queue ===
CREATE POLICY "Users manage own retry_queue"
  ON public.renewal_retry_queue FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- === platform_plans (per-admin) ===
CREATE POLICY "Admin manages own platform plans"
  ON public.platform_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read platform plans of their admin"
  ON public.platform_plans FOR SELECT USING (
    user_id = public.get_admin_id(auth.uid())
  );

CREATE POLICY "Super admin can manage all platform plans"
  ON public.platform_plans FOR ALL USING (has_role(auth.uid(), 'super_admin'));

-- === platform_payments ===
CREATE POLICY "Users view own platform payments"
  ON public.platform_payments FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platform payments"
  ON public.platform_payments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admin can view platform payments of own users"
  ON public.platform_payments FOR SELECT USING (admin_id = auth.uid());

CREATE POLICY "Admin manages own platform payments"
  ON public.platform_payments FOR ALL USING (
    has_role(auth.uid(), 'admin') AND admin_id = auth.uid()
  );

CREATE POLICY "Super admin can manage all platform payments"
  ON public.platform_payments FOR ALL USING (has_role(auth.uid(), 'super_admin'));
