# Multiempresa (Multi-Tenant) + Área SuperAdmin

Mudança grande e sensível (64 tabelas, todas as regras de acesso). Para não quebrar a operação da Sime, será feita em 4 etapas, cada uma validada antes da próxima.

## Etapa 1 — Base de empresas (sem impacto na operação)
- Tabela `tenants` (razão social, fantasia, CNPJ, IE, RNTRC, endereço, logo, status ativo/suspenso, ambiente Focus).
- Tokens Focus NF-e e senha do certificado ficam numa tabela separada `tenant_secrets`, legível só pelas funções do servidor — nunca chegam ao navegador (o pedido original os colocava em `tenants`; isso exporia as chaves a qualquer usuário da empresa).
- `tenant_certificates` (metadados do A1: arquivo no storage privado, validade, titular).
- Papel `superadmin` no enum; tabela `tenant_members` (usuário → empresa).
- Cadastro da Sime Transporte Ltda como primeiro tenant; todos os usuários atuais vinculados a ela.

## Etapa 2 — Isolamento de dados
- Coluna `tenant_id` (NOT NULL, default = empresa do usuário logado via função `current_tenant_id()`) em todas as tabelas operacionais; dados existentes preenchidos com a Sime.
- Funções de servidor (numeração de CT-e/MDF-e, contratos, faturas, conciliação etc.) passam a filtrar por tenant.
- Regras de acesso reescritas: toda política existente ganha `tenant_id = current_tenant_id()`; superadmin enxerga tudo apenas no tenant que escolheu para suporte.
- Empresa suspensa: login bloqueado para os usuários dela.
- Validação: lista de CT-es, financeiro e cheques da Sime devem continuar idênticos (contagens antes/depois).

## Etapa 3 — Painel /superadmin
- Layout próprio, rota protegida (só superadmin, verificado no servidor).
- Lista de empresas: busca, status, CNPJ, ações (editar, ativar/suspender, entrar como suporte).
- Formulário em blocos: dados cadastrais (CNPJ com BrasilAPI), logo, fiscal (A1 + senha, tokens Focus homologação/produção, ambiente), estabelecimento matriz criado automaticamente, administrador inicial (convite por e-mail com role admin no tenant).
- Função de servidor `superadmin-tenants` faz criação/edição/suspensão e grava segredos.

## Etapa 4 — White-label
- Hook `useTenant()` (logo, nome fantasia, CNPJ, cores).
- AdminLayout, login, relatórios e documentos usam os dados do tenant (Sime continua vendo nome e logo atuais, mesma fonte Exo itálica).
- Login: tela neutra "ERP Agiliza Transporte"; após entrar, marca da empresa.
- Seletor de empresa no topo para superadmin (modo suporte, com faixa de aviso).
- Função `focus-nfe` passa a usar o token/ambiente do tenant do CT-e.

## Detalhes técnicos
- `current_tenant_id()`: SECURITY DEFINER, lê `tenant_members` (ou o tenant de suporte salvo para superadmin).
- Políticas permanecem PERMISSIVE para papéis, mas o filtro de tenant entra como política RESTRICTIVE por tabela — um único ponto de isolamento, sem reescrever cada regra.
- Trigger BEFORE INSERT preenche `tenant_id` quando o app não envia, para o código atual continuar funcionando.
- Unicidades (número de CT-e por estabelecimento, CNPJ de pessoa etc.) passam a incluir `tenant_id`.
- Edge functions existentes revisadas para passar o tenant.

## Fora deste plano
- Cobrança/assinatura das empresas clientes.
- Domínio próprio por empresa.
