-- ═══════════════════════════════════════════════════════════════
--  REESTRUTURAÇÃO: plan_options + ajuste clients
--  Cada plano passa a ter múltiplas opções (duração/preço/pkg)
-- ═══════════════════════════════════════════════════════════════

-- 1. Criar tabela plan_options
CREATE TABLE IF NOT EXISTS public.plan_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                          -- "Mensal 1 Tela", "Trimestral"
  package_id TEXT,                              -- sigma_plan_code / painelfoda_package_id
  duration_months INTEGER NOT NULL DEFAULT 1,
  num_screens INTEGER NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,       -- valor cobrado do cliente
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,        -- custo do provedor
  rush_type TEXT CHECK (rush_type IS NULL OR rush_type IN ('IPTV', 'P2P')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_options ENABLE ROW LEVEL SECURITY;

-- RLS: mesmas regras do plano pai
CREATE POLICY "Users can read plan_options of own plans"
  ON public.plan_options FOR SELECT
  USING (plan_id IN (SELECT id FROM public.plans WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage plan_options of own plans"
  ON public.plan_options FOR ALL
  USING (plan_id IN (SELECT id FROM public.plans WHERE user_id = auth.uid()));

-- Admins via get_admin_id (para users de admin)
CREATE POLICY "Users can read plan_options of admin plans"
  ON public.plan_options FOR SELECT
  USING (plan_id IN (
    SELECT id FROM public.plans WHERE user_id = public.get_admin_id(auth.uid())
  ));

-- 2. Adicionar plan_option_id na tabela clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS plan_option_id UUID REFERENCES public.plan_options(id) ON DELETE SET NULL;

-- 3. Migrar dados existentes: cada plano atual vira 1 plan_option
INSERT INTO public.plan_options (plan_id, label, package_id, duration_months, num_screens, price, cost, rush_type, sort_order)
SELECT
  p.id,
  p.name,                                       -- label = nome atual do plano
  p.package_id,
  p.duration_months,
  p.num_screens,
  0,                                             -- price (não tinha antes, ficava no client)
  0,                                             -- cost (vinha de servers)
  p.rush_type,
  0
FROM public.plans p
WHERE NOT EXISTS (
  SELECT 1 FROM public.plan_options po WHERE po.plan_id = p.id
);

-- 4. Vincular clientes existentes à plan_option migrada
UPDATE public.clients c
SET plan_option_id = po.id
FROM public.plan_options po
WHERE c.plan_id = po.plan_id
  AND c.plan_option_id IS NULL
  AND c.plan_id IS NOT NULL;

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_plan_options_plan_id ON public.plan_options(plan_id);
CREATE INDEX IF NOT EXISTS idx_clients_plan_option_id ON public.clients(plan_option_id);

-- 6. Verificação
DO $$
DECLARE
  _options INTEGER;
  _linked INTEGER;
BEGIN
  SELECT count(*) INTO _options FROM public.plan_options;
  SELECT count(*) INTO _linked FROM public.clients WHERE plan_option_id IS NOT NULL AND plan_id IS NOT NULL;
  RAISE NOTICE '✅ plan_options criadas: %', _options;
  RAISE NOTICE '✅ clientes vinculados: %', _linked;
END $$;
