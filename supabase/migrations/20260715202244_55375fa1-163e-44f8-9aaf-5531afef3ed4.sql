
DO $$
DECLARE
  v_empresa uuid := 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';
  v_parent uuid := '361432e8-5d19-44c8-a8ee-3c38b68958ba'; -- 2.2
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g5 uuid; g6 uuid; g7 uuid; g8 uuid;
  v_remaining int;
BEGIN
  -- Groups (Nivel 3)
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.1','Instalações e Ocupação (Escritório)','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g1;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.2','Administrativo e Escritório','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g2;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.3','Serviços Profissionais e Terceiros','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g3;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.4','Pessoal Administrativo (RH Backoffice)','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g4;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.5','Impostos, Taxas e Regulatório','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g5;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.6','Despesas Financeiras','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g6;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.7','Empréstimos, Financiamentos e Consórcios','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g7;
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id)
  VALUES ('2.2.8','Sócios e Contas Transitórias','despesa',v_parent,3,true,v_empresa) RETURNING id INTO g8;

  -- Nivel 4 sub-contas
  INSERT INTO chart_of_accounts (codigo, nome, tipo, conta_pai_id, nivel, ativo, empresa_id) VALUES
    ('2.2.1.01','Aluguel e Condomínio','despesa',g1,4,true,v_empresa),
    ('2.2.1.02','Energia Elétrica e Água','despesa',g1,4,true,v_empresa),
    ('2.2.1.03','Internet e Telefonia','despesa',g1,4,true,v_empresa),
    ('2.2.1.04','Manutenção Predial e Limpeza','despesa',g1,4,true,v_empresa),
    ('2.2.2.01','Material de Escritório e Consumo','despesa',g2,4,true,v_empresa),
    ('2.2.2.02','Softwares e Sistemas','despesa',g2,4,true,v_empresa),
    ('2.2.3.01','Serviços Contábeis e Auditoria','despesa',g3,4,true,v_empresa),
    ('2.2.3.02','Honorários Advocatícios e Judiciais','despesa',g3,4,true,v_empresa),
    ('2.2.3.03','Despachante e Serviços Cartorários','despesa',g3,4,true,v_empresa),
    ('2.2.3.04','Outros Serviços de Terceiros','despesa',g3,4,true,v_empresa),
    ('2.2.4.01','Salários e Encargos Admin','despesa',g4,4,true,v_empresa),
    ('2.2.4.02','Medicina e Segurança do Trabalho','despesa',g4,4,true,v_empresa),
    ('2.2.4.03','Reembolsos de Despesas','despesa',g4,4,true,v_empresa),
    ('2.2.5.01','Taxas e Alvarás (ANM/IBAMA/CREA)','despesa',g5,4,true,v_empresa),
    ('2.2.5.02','Autos de Infração e Multas','despesa',g5,4,true,v_empresa),
    ('2.2.6.01','Tarifas Bancárias e Custódia','despesa',g6,4,true,v_empresa),
    ('2.2.6.02','Juros e Multas Pagos','despesa',g6,4,true,v_empresa),
    ('2.2.7.01','Parcelas de Financiamentos','despesa',g7,4,true,v_empresa),
    ('2.2.7.02','Parcelas de Consórcios','despesa',g7,4,true,v_empresa),
    ('2.2.7.03','Parcelas de Empréstimos','despesa',g7,4,true,v_empresa),
    ('2.2.8.01','Retirada de Sócios/Despesas Pessoais','despesa',g8,4,true,v_empresa),
    ('2.2.8.02','Transferência entre Contas','despesa',g8,4,true,v_empresa),
    ('2.2.8.03','Pagamento Fatura Cartão','despesa',g8,4,true,v_empresa);
END $$;

-- Mapping: DE -> PARA
-- Build a temp map
CREATE TEMP TABLE _map (old_id uuid, new_code text);
INSERT INTO _map VALUES
  ('88b8d07c-e7d9-4dbf-8db4-b8c9670abf13','2.2.1.01'), -- 2.2.01 Aluguel
  ('25b8a1ef-c136-41c4-a445-edcc022e532f','2.2.1.02'), -- 2.2.02 Energia
  ('535d56bb-c6d3-46d4-aed2-0497dee2e85e','2.2.1.03'), -- 2.2.03 Telefone/Internet
  ('3d67af4a-ed1b-492f-b64d-fae8638770f1','2.2.1.04'), -- 2.2.27 Manutenção Ar Cond.
  ('8ef4707c-7def-4b90-8eb9-98b1f97e7b61','2.2.2.01'), -- 2.2.04 Material
  ('0cdb44e3-80f8-4e57-8ec3-3ed0c53f09e3','2.2.2.02'), -- 2.2.21 Mensalidade Sistemas
  ('00a7a18a-96a6-4507-9cc4-b2164a314d4a','2.2.2.02'), -- 2.2.23 Softwares
  ('0f75c7c8-62a1-4077-860c-0420b274df6c','2.2.3.01'), -- 2.2.11 Contabilidade
  ('c4efe358-ff8c-4d89-8902-1c4f56171ebf','2.2.3.02'), -- 2.2.13 Honorários
  ('fc3b8095-986b-4bd6-862e-bec07a33446c','2.2.3.02'), -- 2.2.25 Despesas judiciais
  ('2495d703-0df7-4d7a-a7c9-0657cf4c2a99','2.2.3.03'), -- 2.2.16 Despachante
  ('6f3d3b05-887e-42b4-9f31-37604f16f542','2.2.3.03'), -- 2.2.17 Cartório
  ('e8596bc3-d770-4494-b273-2728f86a2602','2.2.3.04'), -- 2.2.26 Serviços Diversos
  ('43b08931-e16c-431f-86b9-8d33c301dd8b','2.2.4.02'), -- 2.2.08 Medicina
  ('ba051a5c-f814-48d0-b854-67642331a841','2.2.4.01'), -- 2.2.09 DARF, FGTS
  ('2aa60883-98a9-4148-b744-7e3bc45c98ca','2.2.4.03'), -- 2.2.18 Reembolso
  ('da081081-03bc-48e0-b4f7-53c35e4542e1','2.2.5.01'), -- 2.2.15 Taxas
  ('5bb495e1-4948-4bb7-813d-f5e85ce7f548','2.2.5.02'), -- 2.2.24 Auto Infração
  ('b0c29f44-3e62-48a0-a2e0-7c2ea3503d58','2.2.6.01'), -- 2.2.07 Custódia
  ('899b1a5c-2d29-473c-817e-1069d8d95120','2.2.6.01'), -- 2.2.20 Tarifas bancárias
  ('b7bae4d5-c16d-40d9-8059-3fa5e42226c5','2.2.6.02'), -- 2.2.12 Juros
  ('1a5a3e79-01fb-4db3-994d-d136b86772af','2.2.7.01'), -- 2.2.05 Financiamento
  ('fc500993-3357-4f35-a3ce-0391a7e59a28','2.2.7.02'), -- 2.2.06 Consórcio
  ('d59799e9-0d77-4299-b9b1-127340c3a4e7','2.2.7.03'), -- 2.2.19 Empréstimo
  ('15bc21cb-bafe-4d56-8ff0-df570b3d6028','2.2.8.01'), -- 2.2.14 Despesas Pessoais
  ('fb02e99c-08d0-4c91-8f1d-7c4916018332','2.2.8.02'), -- 2.2.22 Transferência
  ('3248ef55-6f62-4be6-af6b-884a7526880f','2.2.8.03'); -- 2.2.10 Cartão

-- Resolve new ids
CREATE TEMP TABLE _resolved AS
SELECT m.old_id, c.id AS new_id
FROM _map m
JOIN chart_of_accounts c ON c.codigo = m.new_code AND c.empresa_id = 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';

-- Migrate expenses
UPDATE expenses e
SET plano_contas_id = r.new_id
FROM _resolved r
WHERE e.plano_contas_id = r.old_id;

-- Migrate credit_card_invoice_items
UPDATE credit_card_invoice_items i
SET plano_contas_id = r.new_id
FROM _resolved r
WHERE i.plano_contas_id = r.old_id;

-- Migrate accounts_payable (chart_of_account_id)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts_payable' AND column_name='chart_of_account_id') THEN
    EXECUTE 'UPDATE accounts_payable a SET chart_of_account_id = r.new_id FROM _resolved r WHERE a.chart_of_account_id = r.old_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts_payable' AND column_name='plano_contas_id') THEN
    EXECUTE 'UPDATE accounts_payable a SET plano_contas_id = r.new_id FROM _resolved r WHERE a.plano_contas_id = r.old_id';
  END IF;
END $$;

-- movimentacoes_bancarias
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='movimentacoes_bancarias' AND column_name='plano_contas_id') THEN
    EXECUTE 'UPDATE movimentacoes_bancarias m SET plano_contas_id = r.new_id FROM _resolved r WHERE m.plano_contas_id = r.old_id';
  END IF;
END $$;

-- Verification: any leftover references?
DO $$
DECLARE
  v_exp int; v_cci int; v_ap int := 0; v_mb int := 0;
BEGIN
  SELECT COUNT(*) INTO v_exp FROM expenses WHERE plano_contas_id IN (SELECT old_id FROM _resolved);
  SELECT COUNT(*) INTO v_cci FROM credit_card_invoice_items WHERE plano_contas_id IN (SELECT old_id FROM _resolved);
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts_payable' AND column_name='chart_of_account_id') THEN
    EXECUTE 'SELECT COUNT(*) FROM accounts_payable WHERE chart_of_account_id IN (SELECT old_id FROM _resolved)' INTO v_ap;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='movimentacoes_bancarias' AND column_name='plano_contas_id') THEN
    EXECUTE 'SELECT COUNT(*) FROM movimentacoes_bancarias WHERE plano_contas_id IN (SELECT old_id FROM _resolved)' INTO v_mb;
  END IF;
  IF v_exp + v_cci + v_ap + v_mb > 0 THEN
    RAISE EXCEPTION 'Dependências restantes: expenses=%, cc_items=%, ap=%, mb=%', v_exp, v_cci, v_ap, v_mb;
  END IF;
END $$;

-- Hard delete old accounts
DELETE FROM chart_of_accounts
WHERE id IN (SELECT old_id FROM _resolved);
