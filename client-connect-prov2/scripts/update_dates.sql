-- ═══════════════════════════════════════════════
-- ATUALIZAR DATAS: clientes renovados no gestor antigo
-- ═══════════════════════════════════════════════
BEGIN;

-- abilio junior: 2026-03-04 → 2026-03-18
UPDATE public.clients SET due_date = '2026-03-18'
WHERE LOWER(name) = 'abilio junior' AND notes LIKE '%Migrado%';

-- Anderson Carlos: 2026-02-21 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'anderson carlos' AND notes LIKE '%Migrado%';

-- Antonio clemilton: 2026-02-22 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'antonio clemilton' AND notes LIKE '%Migrado%';

-- Arnaldo Pereira: 2026-02-20 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'arnaldo pereira' AND notes LIKE '%Migrado%';

-- Arnaldo pereira tela 2: 2026-02-20 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'arnaldo pereira tela 2' AND notes LIKE '%Migrado%';

-- Bruno Moraes: 2026-02-22 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'bruno moraes' AND notes LIKE '%Migrado%';

-- Cliente: 2026-02-25 → 2026-06-27
UPDATE public.clients SET due_date = '2026-06-27'
WHERE LOWER(name) = 'cliente' AND notes LIKE '%Migrado%';

-- Edilson Silva tela 2: 2026-02-25 → 2026-03-25
UPDATE public.clients SET due_date = '2026-03-25'
WHERE LOWER(name) = 'edilson silva tela 2' AND notes LIKE '%Migrado%';

-- Elvis Aguiar: 2026-02-23 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'elvis aguiar' AND notes LIKE '%Migrado%';

-- Erik Henrique: 2026-02-23 → 2026-05-23
UPDATE public.clients SET due_date = '2026-05-23'
WHERE LOWER(name) = 'erik henrique' AND notes LIKE '%Migrado%';

-- Felipe Cout: 2026-03-26 → 2026-04-26
UPDATE public.clients SET due_date = '2026-04-26'
WHERE LOWER(name) = 'felipe cout' AND notes LIKE '%Migrado%';

-- Fernanda Nascimento: 2026-02-25 → 2026-03-25
UPDATE public.clients SET due_date = '2026-03-25'
WHERE LOWER(name) = 'fernanda nascimento' AND notes LIKE '%Migrado%';

-- Fernando Dias: 2026-02-23 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'fernando dias' AND notes LIKE '%Migrado%';

-- Gabriel Cardoso: 2026-01-27 → 2026-03-08
UPDATE public.clients SET due_date = '2026-03-08'
WHERE LOWER(name) = 'gabriel cardoso' AND notes LIKE '%Migrado%';

-- Gisele Pereira: 2026-02-23 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'gisele pereira' AND notes LIKE '%Migrado%';

-- Jacqueline athayde: 2026-03-01 → 2026-12-18
UPDATE public.clients SET due_date = '2026-12-18'
WHERE LOWER(name) = 'jacqueline athayde' AND notes LIKE '%Migrado%';

-- Jair Ribeiro: 2026-02-27 → 2026-03-27
UPDATE public.clients SET due_date = '2026-03-27'
WHERE LOWER(name) = 'jair ribeiro' AND notes LIKE '%Migrado%';

-- Julio Cesar: 2026-05-11 → 2026-07-20
UPDATE public.clients SET due_date = '2026-07-20'
WHERE LOWER(name) = 'julio cesar' AND notes LIKE '%Migrado%';

-- Livio Cesar: 2026-02-24 → 2026-03-24
UPDATE public.clients SET due_date = '2026-03-24'
WHERE LOWER(name) = 'livio cesar' AND notes LIKE '%Migrado%';

-- Luana Cristina: 2026-02-20 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'luana cristina' AND notes LIKE '%Migrado%';

-- Luis Carlos: 2026-03-06 → 2026-03-07
UPDATE public.clients SET due_date = '2026-03-07'
WHERE LOWER(name) = 'luis carlos' AND notes LIKE '%Migrado%';

-- Maira de col: 2026-04-14 → 2026-02-17
UPDATE public.clients SET due_date = '2026-02-17'
WHERE LOWER(name) = 'maira de col' AND notes LIKE '%Migrado%';

-- Marcelo Antônio: 2026-02-11 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'marcelo antônio' AND notes LIKE '%Migrado%';

-- Neto remédio: 2026-02-22 → 2026-03-23
UPDATE public.clients SET due_date = '2026-03-23'
WHERE LOWER(name) = 'neto remédio' AND notes LIKE '%Migrado%';

-- Paulo Braga: 2026-02-25 → 2026-03-06
UPDATE public.clients SET due_date = '2026-03-06'
WHERE LOWER(name) = 'paulo braga' AND notes LIKE '%Migrado%';

-- Thiago cruz: 2026-03-16 → 2026-03-21
UPDATE public.clients SET due_date = '2026-03-21'
WHERE LOWER(name) = 'thiago cruz' AND notes LIKE '%Migrado%';

-- Vitor nazareno: 2026-03-08 → 2026-02-27
UPDATE public.clients SET due_date = '2026-02-27'
WHERE LOWER(name) = 'vitor nazareno' AND notes LIKE '%Migrado%';

-- Wesley Fonseca tela 2: 2026-02-25 → 2026-03-25
UPDATE public.clients SET due_date = '2026-03-25'
WHERE LOWER(name) = 'wesley fonseca tela 2' AND notes LIKE '%Migrado%';

-- Total: 28 clientes atualizados

-- Verificação
SELECT name, due_date FROM clients WHERE notes LIKE '%Migrado%' AND LOWER(name) IN (
  'abilio junior',
  'anderson carlos',
  'antonio clemilton',
  'arnaldo pereira',
  'arnaldo pereira tela 2',
  'bruno moraes',
  'cliente',
  'edilson silva tela 2',
  'elvis aguiar',
  'erik henrique',
  'felipe cout',
  'fernanda nascimento',
  'fernando dias',
  'gabriel cardoso',
  'gisele pereira',
  'jacqueline athayde',
  'jair ribeiro',
  'julio cesar',
  'livio cesar',
  'luana cristina',
  'luis carlos',
  'maira de col',
  'marcelo antônio',
  'neto remédio',
  'paulo braga',
  'thiago cruz',
  'vitor nazareno',
  'wesley fonseca tela 2'
) ORDER BY name;

COMMIT;
