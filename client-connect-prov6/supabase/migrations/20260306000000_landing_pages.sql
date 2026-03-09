-- ══════════════════════════════════════════════════════════════
--  LANDING PAGES
--  Arquivo: supabase/migrations/20260306000000_landing_pages.sql
-- ══════════════════════════════════════════════════════════════

-- ── Tabela: landing_pages ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.landing_pages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL,
  panel_credential_id  UUID REFERENCES public.panel_credentials(id) ON DELETE SET NULL,

  -- Config de trial por provedor:
  -- Sigma:       { "server_id": "BV4D3rLaqZ", "trial_package_id": "rlKWO3lWzo", "trial_hours": 1 }
  -- CloudNation: { "plano_id": "17" }
  -- Koffice:     {}
  trial_config         JSONB NOT NULL DEFAULT '{}',

  html_content         TEXT,          -- HTML em base64
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, slug)
);

-- ── Tabela: landing_page_leads ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.landing_page_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landing_page_id      UUID NOT NULL REFERENCES public.landing_pages(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL,   -- denormalizado para queries rápidas

  -- Dados do lead
  name                 TEXT,
  whatsapp_encrypted   TEXT NOT NULL,   -- criptografado com ENCRYPTION_KEY igual aos clientes

  -- Credenciais geradas
  trial_username       TEXT,
  trial_password       TEXT,
  provider             TEXT,

  -- Status
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sent', 'failed')),
  error_message        TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_landing_pages_user
  ON public.landing_pages(user_id);

CREATE INDEX IF NOT EXISTS idx_landing_pages_slug
  ON public.landing_pages(slug);

CREATE INDEX IF NOT EXISTS idx_landing_page_leads_lp
  ON public.landing_page_leads(landing_page_id, created_at DESC);

-- Índice para deduplicação por whatsapp + landing_page
CREATE INDEX IF NOT EXISTS idx_landing_page_leads_dedup
  ON public.landing_page_leads(landing_page_id, whatsapp_encrypted);

-- ── Trigger updated_at ────────────────────────────────────────
CREATE TRIGGER update_landing_pages_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_page_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own landing pages"
  ON public.landing_pages FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users read admin landing pages"
  ON public.landing_pages FOR SELECT
  USING (user_id = public.get_admin_id(auth.uid()));

CREATE POLICY "Users manage own leads"
  ON public.landing_page_leads FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users read admin leads"
  ON public.landing_page_leads FOR SELECT
  USING (user_id = public.get_admin_id(auth.uid()));
