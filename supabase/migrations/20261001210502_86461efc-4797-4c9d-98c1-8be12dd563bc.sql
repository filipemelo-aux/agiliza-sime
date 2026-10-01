UPDATE public.ctes
SET numero = 8785,
    chave_acesso = NULL,
    xml_enviado = NULL,
    motivo_rejeicao = NULL,
    updated_at = now()
WHERE id = '47d400e7-ead3-4d9f-a445-ed368af3e1f1'
  AND status = 'rascunho'
  AND tipo_talao = 'producao'
  AND numero = 8627;

UPDATE public.fiscal_establishments
SET ultimo_numero_cte = 8785,
    updated_at = now()
WHERE id = 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a'
  AND ultimo_numero_cte < 8785;