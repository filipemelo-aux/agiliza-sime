ALTER TABLE public.faturas_recebimento
  ADD COLUMN IF NOT EXISTS valor_acrescimo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_desconto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacoes text;

CREATE OR REPLACE FUNCTION public.recalculate_fatura(_fatura_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric;
  v_num_parcelas int;
  v_intervalo int;
  v_data_emissao date;
  v_cliente uuid;
  v_recebidas int;
  v_valor_parcela numeric;
  v_valor_ultima numeric;
  v_vencimento date;
  v_acresc numeric;
  v_desc numeric;
  i int;
BEGIN
  SELECT COALESCE(SUM(p.valor), 0) INTO v_total
  FROM fatura_previsoes fp
  JOIN previsoes_recebimento p ON p.id = fp.previsao_id
  WHERE fp.fatura_id = _fatura_id;

  SELECT COALESCE(valor_acrescimo, 0), COALESCE(valor_desconto, 0)
    INTO v_acresc, v_desc
  FROM faturas_recebimento WHERE id = _fatura_id;

  v_total := GREATEST(v_total + COALESCE(v_acresc, 0) - COALESCE(v_desc, 0), 0);

  SELECT COUNT(*) INTO v_recebidas
  FROM contas_receber
  WHERE fatura_id = _fatura_id AND status = 'recebido';

  IF v_recebidas > 0 THEN
    RAISE EXCEPTION 'Fatura possui títulos já recebidos. Estorne os recebimentos antes de alterar o CT-e vinculado.';
  END IF;

  UPDATE faturas_recebimento
  SET valor_total = v_total
  WHERE id = _fatura_id
  RETURNING num_parcelas, intervalo_dias, data_emissao, cliente_id
  INTO v_num_parcelas, v_intervalo, v_data_emissao, v_cliente;

  DELETE FROM contas_receber WHERE fatura_id = _fatura_id;

  v_valor_parcela := TRUNC(v_total / v_num_parcelas, 2);
  v_valor_ultima := v_total - (v_valor_parcela * (v_num_parcelas - 1));

  FOR i IN 1..v_num_parcelas LOOP
    IF v_num_parcelas = 1 THEN
      v_vencimento := v_data_emissao;
    ELSE
      v_vencimento := v_data_emissao + (i * v_intervalo);
    END IF;

    INSERT INTO contas_receber (fatura_id, cliente_id, valor, data_vencimento, status, data_recebimento)
    VALUES (
      _fatura_id, v_cliente,
      CASE WHEN i = v_num_parcelas THEN v_valor_ultima ELSE v_valor_parcela END,
      v_vencimento, 'aberto', NULL
    );
  END LOOP;
END;
$function$;