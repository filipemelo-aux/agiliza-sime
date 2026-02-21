
# CRM SIME TRANSPORTES - Plano de Implementacao em Fases

## Visao Geral

Transformacao do sistema atual de fretes em um CRM completo para a SIME TRANSPORTES, implementado em fases incrementais para garantir estabilidade e testes entre cada etapa.

---

## FASE 1 - Rebranding + Cadastro de Proprietarios/Motoristas

### 1.1 Rebranding para SIME TRANSPORTES
- Alterar nome "TransPorta" para "SIME TRANSPORTES" em todo o sistema (Header, AdminDashboard, index.html title)
- Atualizar cores/identidade visual se desejado

### 1.2 Tipos de Cadastro (Proprietario vs Motorista Autonomo)
- Adicionar campo `person_type` na tabela `profiles` com valores: `cnpj` (proprietario/empresa) e `cpf` (autonomo)
- Para proprietarios (CNPJ): campos adicionais `cnpj`, `razao_social`, `nome_fantasia`
- Para autonomos (CPF): manter o fluxo atual com CPF
- Atualizar formulario de registro com selecao do tipo de pessoa
- Admin tambem pode cadastrar motoristas/proprietarios pelo painel

### 1.3 Tipos de Veiculo (Simplificacao)
Manter os 4 tipos solicitados com as placas corretas para cada conjunto:

| Tipo | Placa Cavalo | Implementos |
|------|-------------|-------------|
| LS (Carreta simples) | Sim | Carreta (1 placa + RENAVAM) |
| Truck | Sim | Nenhum implemento |
| Bitrem | Sim | Carreta 1 + Carreta 2 (2 placas + RENAVAMs) |
| Rodotrem | Sim | Carreta 1 + Dolly + Carreta 2 (3 placas + RENAVAMs) |

- Remover tipos `bitruck`, `carreta`, `treminhao` do enum (ou manter para compatibilidade e ocultar na UI)
- Atualizar formularios de cadastro de veiculo

### 1.4 Vinculacao de Tipo de Servico pelo Admin
- Criar tabela `driver_services` com campos: `id`, `user_id`, `service_type` (enum: `fretes`, `colheita`), `created_at`, `assigned_by`
- Admin pode vincular motoristas a servicos pelo painel administrativo
- Nova tela admin: "Gerenciar Motoristas" com lista de motoristas e opcao de definir servico

---

## FASE 2 - Fluxo de Fretes (Reformulacao)

### 2.1 Substituir fluxo atual de ordens de carregamento
O fluxo atual sera substituido pelo novo fluxo de comprovantes de descarga:

1. Motorista vinculado ao servico "fretes" ve os fretes disponiveis (manter como esta)
2. Motorista se candidata ao frete (manter)
3. Admin aprova e envia ordem de carregamento (manter)
4. **NOVO**: Apos entrega, motorista envia comprovante de descarga informando:
   - Numero do CT-e
   - Placa do cavalo (selecionada dos seus veiculos)
   - Foto do comprovante de descarga
5. Admin visualiza, aceita ou recusa o comprovante
   - Se **recusar**: volta como pendente para o motorista reenviar
   - Se **aceitar**: entra na esteira de pagamento de saldo (se houver saldo a pagar)

### 2.2 Alteracoes no banco de dados
- Adicionar campos na tabela `freight_applications`: `cte_number`, `discharge_proof_url`, `discharge_proof_status` (pendente/aceito/recusado), `discharge_proof_sent_at`
- Criar bucket de storage `discharge-proofs` para comprovantes de descarga

### 2.3 Telas
- Atualizar tela do motorista (MyApplications) com botao "Enviar Comprovante de Descarga"
- Atualizar tela admin (AdminApplications) com visualizacao e aceite/recusa dos comprovantes

---

## FASE 3 - Modulo de Colheita

### 3.1 Novas tabelas

**`harvest_jobs`** (Servicos de Colheita):
- `id`, `farm_name` (nome da fazenda/cliente), `location` (local), `harvest_period_start`, `harvest_period_end`, `total_third_party_vehicles` (qtd veiculos terceiros contratados), `monthly_value` (valor total mensal pago aos terceiros), `payment_closing_day` (dia de fechamento para pagamento parcial), `status`, `created_at`, `created_by`

**`harvest_assignments`** (Vinculacao de motoristas terceiros):
- `id`, `harvest_job_id`, `user_id` (motorista terceiro), `vehicle_id`, `start_date` (data de inicio do servico), `end_date` (opcional), `status`, `created_at`

### 3.2 Logica de Calculo de Diarias
- Contagem de diarias: diferenca em dias entre `start_date` e hoje (ou `end_date` se encerrado)
- Valor da diaria: `monthly_value / 30`
- Valor a pagar por motorista: `valor_diaria * dias_trabalhados`
- Possibilidade de definir dia de fechamento para pagamento parcial

### 3.3 Tela Admin - Lancamentos de Colheita
- Lista de servicos de colheita cadastrados
- Formulario para criar novo servico com: fazenda, local, periodo, qtd veiculos, valor mensal, dia de fechamento
- Vincular motoristas terceiros a cada servico (selecionar da lista de motoristas com servico "colheita")
- Visualizacao com contagem automatica de diarias e valores calculados
- Opcao de fechamento parcial para gerar pagamento

---

## FASE 4 - Mural de Fretes (Divulgacao)

### 4.1 Manter funcionalidade atual
- A area de divulgacao de fretes ja existe e continuara funcionando
- Apenas motoristas vinculados ao servico "fretes" poderao se candidatar
- Ajustes visuais para identidade SIME TRANSPORTES

---

## Detalhes Tecnicos

### Migracao de banco de dados (Fase 1)
```sql
-- Adicionar campos de tipo de pessoa ao profiles
ALTER TABLE profiles ADD COLUMN person_type TEXT DEFAULT 'cpf';
ALTER TABLE profiles ADD COLUMN cnpj TEXT;
ALTER TABLE profiles ADD COLUMN razao_social TEXT;
ALTER TABLE profiles ADD COLUMN nome_fantasia TEXT;

-- Tabela de servicos vinculados
CREATE TABLE driver_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('fretes', 'colheita')),
  assigned_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, service_type)
);
ALTER TABLE driver_services ENABLE ROW LEVEL SECURITY;
```

### Migracao de banco de dados (Fase 2)
```sql
ALTER TABLE freight_applications ADD COLUMN cte_number TEXT;
ALTER TABLE freight_applications ADD COLUMN discharge_proof_url TEXT;
ALTER TABLE freight_applications ADD COLUMN discharge_proof_status TEXT DEFAULT 'pending';
ALTER TABLE freight_applications ADD COLUMN discharge_proof_sent_at TIMESTAMPTZ;
```

### Migracao de banco de dados (Fase 3)
```sql
CREATE TABLE harvest_jobs (...);
CREATE TABLE harvest_assignments (...);
-- Com RLS policies para admin gerenciar e motoristas visualizarem seus dados
```

### Novas rotas
- `/admin/drivers` - Gerenciamento de motoristas (admin)
- `/admin/harvest` - Lancamentos de colheita (admin)
- `/admin/harvest/:id` - Detalhes de um servico de colheita

### Arquivos principais afetados
- `src/components/Header.tsx` - Rebranding + novos links de navegacao
- `src/pages/Register.tsx` - Tipo de pessoa (CPF/CNPJ)
- `src/pages/AddVehicle.tsx` - Tipos de veiculo simplificados
- `src/pages/AdminDashboard.tsx` - Novos cards e metricas
- `src/pages/AdminApplications.tsx` - Fluxo de descarga
- `src/pages/MyApplications.tsx` - Envio de comprovante de descarga
- Novos: `AdminDrivers.tsx`, `AdminHarvest.tsx`, `HarvestDetail.tsx`

---

## Ordem de execucao sugerida

1. **Fase 1** - Rebranding + Cadastro (base de tudo)
2. **Fase 2** - Fretes reformulado (substitui fluxo atual)
3. **Fase 3** - Colheita (modulo novo independente)
4. **Fase 4** - Ajustes finais no mural de fretes

Cada fase sera implementada e testada antes de avancar para a proxima.
