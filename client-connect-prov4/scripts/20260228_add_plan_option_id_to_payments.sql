-- ═══════════════════════════════════════════════
-- Adicionar plan_option_id na tabela payments
-- Para rastrear qual opção o cliente selecionou
-- ═══════════════════════════════════════════════

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS plan_option_id UUID REFERENCES public.plan_options(id);

-- Index para consultas
CREATE INDEX IF NOT EXISTS idx_payments_plan_option_id ON public.payments(plan_option_id);

-- Verificação
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'payments' AND column_name = 'plan_option_id';
