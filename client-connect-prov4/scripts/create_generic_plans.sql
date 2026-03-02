-- ═══════════════════════════════════════════════
-- CRIAR 3 PLANOS GENÉRICOS (sem painel IPTV)
-- ═══════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_plan1 UUID;
  v_plan2 UUID;
  v_plan3 UUID;
BEGIN
  -- Pegar user_id do admin
  SELECT user_id INTO v_user_id FROM plans LIMIT 1;

  -- ─── Plano Genérico 1 (20/48/80/144) ───
  INSERT INTO plans (user_id, name, duration_months, num_screens)
  VALUES (v_user_id, 'Plano Genérico 1', 1, 1)
  RETURNING id INTO v_plan1;

  INSERT INTO plan_options (plan_id, label, duration_months, num_screens, price, cost, sort_order) VALUES
    (v_plan1, '1 mes 1 tela 20 R$',   1,  1,  20.00, 0, 0),
    (v_plan1, '3 meses 1 tela 48 R$',  3,  1,  48.00, 0, 1),
    (v_plan1, '6 meses 1 tela 80 R$',  6,  1,  80.00, 0, 2),
    (v_plan1, '1 ano 1 tela 144 R$',  12,  1, 144.00, 0, 3);

  -- ─── Plano Genérico 2 (25/60/100/180) ───
  INSERT INTO plans (user_id, name, duration_months, num_screens)
  VALUES (v_user_id, 'Plano Genérico 2', 1, 1)
  RETURNING id INTO v_plan2;

  INSERT INTO plan_options (plan_id, label, duration_months, num_screens, price, cost, sort_order) VALUES
    (v_plan2, '1 mes 1 tela 25 R$',    1,  1,  25.00, 0, 0),
    (v_plan2, '3 meses 1 tela 60 R$',   3,  1,  60.00, 0, 1),
    (v_plan2, '6 meses 1 tela 100 R$',  6,  1, 100.00, 0, 2),
    (v_plan2, '1 ano 1 tela 180 R$',   12,  1, 180.00, 0, 3);

  -- ─── Plano Genérico 3 (30/72/120/216) ───
  INSERT INTO plans (user_id, name, duration_months, num_screens)
  VALUES (v_user_id, 'Plano Genérico 3', 1, 1)
  RETURNING id INTO v_plan3;

  INSERT INTO plan_options (plan_id, label, duration_months, num_screens, price, cost, sort_order) VALUES
    (v_plan3, '1 mes 1 tela 30 R$',    1,  1,  30.00, 0, 0),
    (v_plan3, '3 meses 1 tela 72 R$',   3,  1,  72.00, 0, 1),
    (v_plan3, '6 meses 1 tela 120 R$',  6,  1, 120.00, 0, 2),
    (v_plan3, '1 ano 1 tela 216 R$',   12,  1, 216.00, 0, 3);

  RAISE NOTICE '✅ Plano Genérico 1 (20/48/80/144): %', v_plan1;
  RAISE NOTICE '✅ Plano Genérico 2 (25/60/100/180): %', v_plan2;
  RAISE NOTICE '✅ Plano Genérico 3 (30/72/120/216): %', v_plan3;
END $$;

-- Verificação
SELECT p.code, p.name, po.label, po.price
FROM plans p
JOIN plan_options po ON po.plan_id = p.id
WHERE p.name LIKE 'Plano Genérico%'
ORDER BY p.name, po.sort_order;

COMMIT;
