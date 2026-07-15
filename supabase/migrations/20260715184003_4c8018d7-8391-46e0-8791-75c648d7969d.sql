
DO $$
DECLARE
  v_emp uuid := 'bf86790f-7442-4b0a-b5e2-dc5a5e369a0a';
  v_desp_op uuid := '2e1e1e40-f73d-42e4-923c-56bf54c05292'; -- 2.1
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g5 uuid; g6 uuid; g7 uuid; g8 uuid;
  -- leaves
  l_diesel uuid; l_arla uuid; l_oleos uuid;
  l_pneu uuid; l_recap uuid; l_borr uuid;
  l_pecas uuid; l_mec uuid; l_solda uuid; l_lonas uuid; l_lav uuid;
  l_ped uuid; l_balsa uuid; l_diar uuid; l_chapa uuid;
  l_ipva uuid; l_segv uuid; l_segc uuid; l_rast uuid; l_lic uuid; l_mult uuid;
  l_comb_ap uuid; l_man_ap uuid; l_ipva_ap uuid;
  l_fret uuid;
  l_sal uuid; l_com uuid; l_enc uuid; l_ben uuid; l_epi uuid;
BEGIN
  -- ============ Passo 1: GRUPOS Nível 3 ============
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.1','Combustíveis e Lubrificantes','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g1;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.2','Pneus e Rodagem','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g2;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.3','Manutenção Pesada (Rodocaçamba)','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g3;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.4','Despesas de Viagem e Rota','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g4;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5','Custos Fixos e Regulatórios','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g5;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.6','Frota de Apoio (Utilitários)','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g6;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.7','Terceirização de Frota','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g7;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.8','Pessoal Operacional (Motoristas)','despesa',v_desp_op,3,true,v_emp) RETURNING id INTO g8;

  -- ============ Passo 2: FOLHAS Nível 4 ============
  -- 2.1.1
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.1.01','Diesel','despesa',g1,4,true,v_emp,'combustivel') RETURNING id INTO l_diesel;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.1.02','Arla 32','despesa',g1,4,true,v_emp,'combustivel') RETURNING id INTO l_arla;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.1.03','Óleos e Fluidos','despesa',g1,4,true,v_emp) RETURNING id INTO l_oleos;

  -- 2.1.2
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.2.01','Compra de Pneus','despesa',g2,4,true,v_emp) RETURNING id INTO l_pneu;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.2.02','Recapagem','despesa',g2,4,true,v_emp) RETURNING id INTO l_recap;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.2.03','Borracharia/Alinhamento','despesa',g2,4,true,v_emp) RETURNING id INTO l_borr;

  -- 2.1.3
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.3.01','Peças e Componentes','despesa',g3,4,true,v_emp,'manutencao') RETURNING id INTO l_pecas;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.3.02','Serviços de Mecânica/Elétrica','despesa',g3,4,true,v_emp,'manutencao') RETURNING id INTO l_mec;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.3.03','Solda/Molas/Chapeação','despesa',g3,4,true,v_emp,'manutencao') RETURNING id INTO l_solda;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.3.04','Lonas e Amarração','despesa',g3,4,true,v_emp) RETURNING id INTO l_lonas;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.3.05','Lavagem/Estética','despesa',g3,4,true,v_emp) RETURNING id INTO l_lav;

  -- 2.1.4
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.4.01','Pedágios','despesa',g4,4,true,v_emp) RETURNING id INTO l_ped;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.4.02','Travessia de Balsa','despesa',g4,4,true,v_emp) RETURNING id INTO l_balsa;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.4.03','Diárias/Alimentação/Hospedagem','despesa',g4,4,true,v_emp) RETURNING id INTO l_diar;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.4.04','Chapa/Carga e Descarga','despesa',g4,4,true,v_emp) RETURNING id INTO l_chapa;

  -- 2.1.5
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5.01','IPVA/Licenciamento','despesa',g5,4,true,v_emp) RETURNING id INTO l_ipva;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5.02','Seguro Veículo','despesa',g5,4,true,v_emp) RETURNING id INTO l_segv;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5.03','Seguro Carga','despesa',g5,4,true,v_emp) RETURNING id INTO l_segc;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5.04','Rastreamento','despesa',g5,4,true,v_emp) RETURNING id INTO l_rast;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5.05','Licenças AET/ANTT','despesa',g5,4,true,v_emp) RETURNING id INTO l_lic;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.5.06','Multas','despesa',g5,4,true,v_emp) RETURNING id INTO l_mult;

  -- 2.1.6
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.6.01','Combustível Apoio','despesa',g6,4,true,v_emp,'combustivel') RETURNING id INTO l_comb_ap;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id,tipo_operacional)
  VALUES ('2.1.6.02','Manutenção Apoio','despesa',g6,4,true,v_emp,'manutencao') RETURNING id INTO l_man_ap;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.6.03','IPVA/Seguro Apoio','despesa',g6,4,true,v_emp) RETURNING id INTO l_ipva_ap;

  -- 2.1.7
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.7.01','Pagamento Frete Terceiro','despesa',g7,4,true,v_emp) RETURNING id INTO l_fret;

  -- 2.1.8
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.8.01','Salários','despesa',g8,4,true,v_emp) RETURNING id INTO l_sal;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.8.02','Comissões/Premiações','despesa',g8,4,true,v_emp) RETURNING id INTO l_com;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.8.03','Encargos Sociais','despesa',g8,4,true,v_emp) RETURNING id INTO l_enc;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.8.04','Benefícios','despesa',g8,4,true,v_emp) RETURNING id INTO l_ben;
  INSERT INTO chart_of_accounts (codigo,nome,tipo,conta_pai_id,nivel,ativo,empresa_id)
  VALUES ('2.1.8.05','EPIs/Exames','despesa',g8,4,true,v_emp) RETURNING id INTO l_epi;

  -- ============ Passo 3: MIGRAÇÃO DE DADOS ============
  -- Mapa antigo -> novo
  -- Combustível (2.1.01) -> Diesel
  UPDATE expenses SET plano_contas_id = l_diesel WHERE plano_contas_id = 'dc88b21b-386e-4e65-9a8b-84968e20da5f';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_diesel WHERE plano_contas_id = 'dc88b21b-386e-4e65-9a8b-84968e20da5f';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_diesel WHERE plano_contas_id = 'dc88b21b-386e-4e65-9a8b-84968e20da5f';

  -- Óleo Lubrificante (2.1.17) -> Óleos e Fluidos
  UPDATE expenses SET plano_contas_id = l_oleos WHERE plano_contas_id = '98f95080-ab66-46a7-bc54-b03ae532ad5d';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_oleos WHERE plano_contas_id = '98f95080-ab66-46a7-bc54-b03ae532ad5d';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_oleos WHERE plano_contas_id = '98f95080-ab66-46a7-bc54-b03ae532ad5d';

  -- Pneus (2.1.04) -> Compra de Pneus
  UPDATE expenses SET plano_contas_id = l_pneu WHERE plano_contas_id = '17824f86-d752-4c52-bd2d-76e7dc02ec87';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_pneu WHERE plano_contas_id = '17824f86-d752-4c52-bd2d-76e7dc02ec87';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_pneu WHERE plano_contas_id = '17824f86-d752-4c52-bd2d-76e7dc02ec87';

  -- Recapagem de Pneus (2.1.07) -> Recapagem
  UPDATE expenses SET plano_contas_id = l_recap WHERE plano_contas_id = 'a9e1847c-51fb-433f-8bc1-6d5fbeb54b29';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_recap WHERE plano_contas_id = 'a9e1847c-51fb-433f-8bc1-6d5fbeb54b29';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_recap WHERE plano_contas_id = 'a9e1847c-51fb-433f-8bc1-6d5fbeb54b29';

  -- Serviços de Borracharia (2.1.08) -> Borracharia/Alinhamento
  UPDATE expenses SET plano_contas_id = l_borr WHERE plano_contas_id = 'e184850c-5910-4206-8013-0d1b930b2731';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_borr WHERE plano_contas_id = 'e184850c-5910-4206-8013-0d1b930b2731';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_borr WHERE plano_contas_id = 'e184850c-5910-4206-8013-0d1b930b2731';

  -- Manutenção de Frota (2.1.02), Peças Diversas (2.1.13), Parafusos (2.1.20), Mangueiras (2.1.18),
  -- Radiadores (2.1.16), Disco Tacógrafo (2.1.21), Acessórios (2.1.15) -> Peças e Componentes
  UPDATE expenses SET plano_contas_id = l_pecas WHERE plano_contas_id IN (
    'bb4b683f-8975-4a02-8f05-3fe5b4093cb1','1f419e19-412e-4d45-b9f8-121b9a96bd15',
    '3771fa62-ebf4-487d-8315-20f3e6f5a8e8','bf034d6a-a8b1-4a63-bb50-f2e151a145d0',
    '9b847188-3db5-4a61-ad02-a3e7f4134a71','fbef5a7b-056d-4da2-9e66-900e675823e6',
    'cfa16bf7-38e3-4d72-9acc-d839749482a9'
  );
  UPDATE credit_card_invoice_items SET plano_contas_id = l_pecas WHERE plano_contas_id IN (
    'bb4b683f-8975-4a02-8f05-3fe5b4093cb1','1f419e19-412e-4d45-b9f8-121b9a96bd15',
    '3771fa62-ebf4-487d-8315-20f3e6f5a8e8','bf034d6a-a8b1-4a63-bb50-f2e151a145d0',
    '9b847188-3db5-4a61-ad02-a3e7f4134a71','fbef5a7b-056d-4da2-9e66-900e675823e6',
    'cfa16bf7-38e3-4d72-9acc-d839749482a9'
  );
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_pecas WHERE plano_contas_id IN (
    'bb4b683f-8975-4a02-8f05-3fe5b4093cb1','1f419e19-412e-4d45-b9f8-121b9a96bd15',
    '3771fa62-ebf4-487d-8315-20f3e6f5a8e8','bf034d6a-a8b1-4a63-bb50-f2e151a145d0',
    '9b847188-3db5-4a61-ad02-a3e7f4134a71','fbef5a7b-056d-4da2-9e66-900e675823e6',
    'cfa16bf7-38e3-4d72-9acc-d839749482a9'
  );

  -- Serviços de Mecânica (2.1.09) e Auto Elétrica (2.1.24) -> Mecânica/Elétrica
  UPDATE expenses SET plano_contas_id = l_mec WHERE plano_contas_id IN (
    '6f39ec97-7ddd-4294-a745-bad032f6dbcc','d5f33812-6498-4a8f-86c4-d9540db26d66'
  );
  UPDATE credit_card_invoice_items SET plano_contas_id = l_mec WHERE plano_contas_id IN (
    '6f39ec97-7ddd-4294-a745-bad032f6dbcc','d5f33812-6498-4a8f-86c4-d9540db26d66'
  );
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_mec WHERE plano_contas_id IN (
    '6f39ec97-7ddd-4294-a745-bad032f6dbcc','d5f33812-6498-4a8f-86c4-d9540db26d66'
  );

  -- Chapeação (2.1.22) -> Solda/Molas/Chapeação
  UPDATE expenses SET plano_contas_id = l_solda WHERE plano_contas_id = '19c0bef9-a465-4884-bacf-5f77fcfed07a';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_solda WHERE plano_contas_id = '19c0bef9-a465-4884-bacf-5f77fcfed07a';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_solda WHERE plano_contas_id = '19c0bef9-a465-4884-bacf-5f77fcfed07a';

  -- Pedágios (2.1.03) -> Pedágios
  UPDATE expenses SET plano_contas_id = l_ped WHERE plano_contas_id = '3d0920c1-24cc-4faf-88b5-5be0fa5224e9';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_ped WHERE plano_contas_id = '3d0920c1-24cc-4faf-88b5-5be0fa5224e9';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_ped WHERE plano_contas_id = '3d0920c1-24cc-4faf-88b5-5be0fa5224e9';

  -- Travessia de Balsa (2.1.23) -> Travessia de Balsa
  UPDATE expenses SET plano_contas_id = l_balsa WHERE plano_contas_id = '3809eabe-7b6b-4bde-b833-296fcc8ecba3';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_balsa WHERE plano_contas_id = '3809eabe-7b6b-4bde-b833-296fcc8ecba3';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_balsa WHERE plano_contas_id = '3809eabe-7b6b-4bde-b833-296fcc8ecba3';

  -- Hospedagem e Alimentação (2.1.19) -> Diárias/Alimentação/Hospedagem
  UPDATE expenses SET plano_contas_id = l_diar WHERE plano_contas_id = 'f8058f3f-9cf8-43fd-a790-a72b506f77b9';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_diar WHERE plano_contas_id = 'f8058f3f-9cf8-43fd-a790-a72b506f77b9';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_diar WHERE plano_contas_id = 'f8058f3f-9cf8-43fd-a790-a72b506f77b9';

  -- IPVA e Licenciamento (2.1.14) -> IPVA/Licenciamento
  UPDATE expenses SET plano_contas_id = l_ipva WHERE plano_contas_id = '0ff9c2ea-6e48-4176-92c8-a20a0e63b06f';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_ipva WHERE plano_contas_id = '0ff9c2ea-6e48-4176-92c8-a20a0e63b06f';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_ipva WHERE plano_contas_id = '0ff9c2ea-6e48-4176-92c8-a20a0e63b06f';

  -- Seguro (2.1.10) -> Seguro Veículo
  UPDATE expenses SET plano_contas_id = l_segv WHERE plano_contas_id = 'a9205fb8-2580-4829-902e-c73ba7502bac';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_segv WHERE plano_contas_id = 'a9205fb8-2580-4829-902e-c73ba7502bac';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_segv WHERE plano_contas_id = 'a9205fb8-2580-4829-902e-c73ba7502bac';

  -- Rastreamento (2.1.06) -> Rastreamento
  UPDATE expenses SET plano_contas_id = l_rast WHERE plano_contas_id = '6d5ffe09-8618-4b85-bcc3-91216561d2fd';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_rast WHERE plano_contas_id = '6d5ffe09-8618-4b85-bcc3-91216561d2fd';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_rast WHERE plano_contas_id = '6d5ffe09-8618-4b85-bcc3-91216561d2fd';

  -- Pagamento frete terceiro (2.1.05) -> Pagamento Frete Terceiro
  UPDATE expenses SET plano_contas_id = l_fret WHERE plano_contas_id = '6ba93f8e-8742-4ea3-abdf-895ff635c47e';
  UPDATE credit_card_invoice_items SET plano_contas_id = l_fret WHERE plano_contas_id = '6ba93f8e-8742-4ea3-abdf-895ff635c47e';
  UPDATE movimentacoes_bancarias SET plano_contas_id = l_fret WHERE plano_contas_id = '6ba93f8e-8742-4ea3-abdf-895ff635c47e';

  -- ============ Passo 4: DESATIVAR contas antigas remapeadas ============
  UPDATE chart_of_accounts SET ativo = false, tipo_operacional = NULL WHERE id IN (
    'dc88b21b-386e-4e65-9a8b-84968e20da5f', -- Combustível
    '98f95080-ab66-46a7-bc54-b03ae532ad5d', -- Óleo Lubrificante
    '17824f86-d752-4c52-bd2d-76e7dc02ec87', -- Pneus
    'a9e1847c-51fb-433f-8bc1-6d5fbeb54b29', -- Recapagem
    'e184850c-5910-4206-8013-0d1b930b2731', -- Borracharia
    'bb4b683f-8975-4a02-8f05-3fe5b4093cb1', -- Manutenção de Frota
    '1f419e19-412e-4d45-b9f8-121b9a96bd15', -- Peças Diversas
    '3771fa62-ebf4-487d-8315-20f3e6f5a8e8', -- Parafusos
    'bf034d6a-a8b1-4a63-bb50-f2e151a145d0', -- Mangueiras
    '9b847188-3db5-4a61-ad02-a3e7f4134a71', -- Radiadores
    'fbef5a7b-056d-4da2-9e66-900e675823e6', -- Disco Tacógrafo
    'cfa16bf7-38e3-4d72-9acc-d839749482a9', -- Acessórios
    '6f39ec97-7ddd-4294-a745-bad032f6dbcc', -- Mecânica
    'd5f33812-6498-4a8f-86c4-d9540db26d66', -- Auto Elétrica
    '19c0bef9-a465-4884-bacf-5f77fcfed07a', -- Chapeação
    '3d0920c1-24cc-4faf-88b5-5be0fa5224e9', -- Pedágios
    '3809eabe-7b6b-4bde-b833-296fcc8ecba3', -- Balsa
    'f8058f3f-9cf8-43fd-a790-a72b506f77b9', -- Hospedagem
    '0ff9c2ea-6e48-4176-92c8-a20a0e63b06f', -- IPVA
    'a9205fb8-2580-4829-902e-c73ba7502bac', -- Seguro
    '6d5ffe09-8618-4b85-bcc3-91216561d2fd', -- Rastreamento
    '6ba93f8e-8742-4ea3-abdf-895ff635c47e'  -- Frete terceiro
  );
END $$;
