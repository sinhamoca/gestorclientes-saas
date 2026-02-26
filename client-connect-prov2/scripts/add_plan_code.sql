-- ═══════════════════════════════════════════════
--  Adicionar coluna 'code' na tabela plans
--  Código numérico sequencial por usuário
-- ═══════════════════════════════════════════════

-- Adicionar coluna code (integer, não auto-increment global)
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS code INTEGER;

-- Preencher codes para planos existentes (sequencial por user_id)
WITH numbered AS (
  SELECT id, user_id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
  FROM public.plans
  WHERE code IS NULL
)
UPDATE public.plans p
SET code = n.rn
FROM numbered n
WHERE p.id = n.id;

-- Criar função para auto-gerar code ao inserir novo plano
CREATE OR REPLACE FUNCTION public.generate_plan_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code IS NULL THEN
    SELECT COALESCE(MAX(code), 0) + 1 INTO NEW.code
    FROM public.plans
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger para auto-gerar code
DROP TRIGGER IF EXISTS set_plan_code ON public.plans;
CREATE TRIGGER set_plan_code
  BEFORE INSERT ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_plan_code();

-- Unique constraint: code deve ser único por user_id
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_user_code_unique;
ALTER TABLE public.plans ADD CONSTRAINT plans_user_code_unique UNIQUE (user_id, code);
