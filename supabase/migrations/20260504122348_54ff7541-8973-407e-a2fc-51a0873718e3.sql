-- Resincroniza o nome da fazenda no metadata das previsões de colheita
-- com o farm_name atual cadastrado em harvest_jobs (snapshot anterior podia conter endereço).
UPDATE previsoes_recebimento p
SET metadata = jsonb_set(
      jsonb_set(
        COALESCE(p.metadata, '{}'::jsonb),
        '{fazenda}',
        to_jsonb(hj.farm_name)
      ),
      '{localizacao}',
      to_jsonb(COALESCE(hj.location, ''))
    )
FROM harvest_jobs hj
WHERE p.origem_tipo = 'colheita'
  AND p.origem_id = hj.id
  AND hj.farm_name IS NOT NULL
  AND hj.farm_name <> ''
  AND (p.metadata->>'fazenda') IS DISTINCT FROM hj.farm_name;