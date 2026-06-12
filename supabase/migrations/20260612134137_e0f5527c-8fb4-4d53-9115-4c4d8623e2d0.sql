
-- 1) Identificar canônicos (mais antigo) e duplicatas
WITH ranked AS (
  SELECT id, UPPER(TRIM(plate)) AS pk, ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(plate)) ORDER BY created_at) AS rn
  FROM public.vehicles
),
canonical AS (
  SELECT pk, id AS canonical_id FROM ranked WHERE rn = 1
),
mapping AS (
  SELECT r.id AS dup_id, c.canonical_id
  FROM ranked r JOIN canonical c ON c.pk = r.pk
  WHERE r.rn > 1
)
SELECT 1;

-- Usaremos uma tabela temp para o mapping
CREATE TEMP TABLE _veh_map AS
WITH ranked AS (
  SELECT id, UPPER(TRIM(plate)) AS pk, ROW_NUMBER() OVER (PARTITION BY UPPER(TRIM(plate)) ORDER BY created_at) AS rn
  FROM public.vehicles
),
canonical AS (
  SELECT pk, id AS canonical_id FROM ranked WHERE rn = 1
)
SELECT r.id AS dup_id, c.canonical_id
FROM ranked r JOIN canonical c ON c.pk = r.pk
WHERE r.rn > 1;

-- 2) Reapontar todas as referências
UPDATE public.fuelings f SET veiculo_id = m.canonical_id FROM _veh_map m WHERE f.veiculo_id = m.dup_id;
UPDATE public.maintenances x SET veiculo_id = m.canonical_id FROM _veh_map m WHERE x.veiculo_id = m.dup_id;
UPDATE public.fuel_orders x SET vehicle_id = m.canonical_id FROM _veh_map m WHERE x.vehicle_id = m.dup_id;
UPDATE public.ctes x SET veiculo_id = m.canonical_id FROM _veh_map m WHERE x.veiculo_id = m.dup_id;
UPDATE public.expenses x SET veiculo_id = m.canonical_id FROM _veh_map m WHERE x.veiculo_id = m.dup_id;
UPDATE public.freight_contracts x SET vehicle_id = m.canonical_id FROM _veh_map m WHERE x.vehicle_id = m.dup_id;
UPDATE public.credit_card_invoice_items x SET veiculo_id = m.canonical_id FROM _veh_map m WHERE x.veiculo_id = m.dup_id;
UPDATE public.mdfe x SET veiculo_id = m.canonical_id FROM _veh_map m WHERE x.veiculo_id = m.dup_id;
UPDATE public.trailers x SET vehicle_id = m.canonical_id FROM _veh_map m WHERE x.vehicle_id = m.dup_id;
UPDATE public.previsoes_recebimento x SET veiculo_id = m.canonical_id FROM _veh_map m WHERE x.veiculo_id = m.dup_id;
UPDATE public.harvest_assignments x SET vehicle_id = m.canonical_id FROM _veh_map m WHERE x.vehicle_id = m.dup_id;
UPDATE public.freight_applications x SET vehicle_id = m.canonical_id FROM _veh_map m WHERE x.vehicle_id = m.dup_id;

-- 3) Excluir veículos duplicados
DELETE FROM public.vehicles v USING _veh_map m WHERE v.id = m.dup_id;

DROP TABLE _veh_map;

-- 4) Índice único para prevenir duplicatas futuras (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_unique_idx ON public.vehicles (UPPER(TRIM(plate)));
