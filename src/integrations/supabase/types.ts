export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts_payable: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string
          creditor_id: string | null
          creditor_name: string | null
          description: string
          due_date: string | null
          id: string
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by: string
          creditor_id?: string | null
          creditor_name?: string | null
          description: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          creditor_id?: string | null
          creditor_name?: string | null
          description?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_creditor_id_fkey"
            columns: ["creditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string
          cte_id: string | null
          debtor_id: string | null
          debtor_name: string | null
          description: string
          due_date: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by: string
          cte_id?: string | null
          debtor_id?: string | null
          debtor_name?: string | null
          description: string
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string
          cte_id?: string | null
          debtor_id?: string | null
          debtor_name?: string | null
          description?: string
          due_date?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_cte_id_fkey"
            columns: ["cte_id"]
            isOneToOne: false
            referencedRelation: "ctes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "financial_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      cargas: {
        Row: {
          ativo: boolean
          chaves_nfe_ref: string[] | null
          cod_buonny: string | null
          cod_opentech: string | null
          created_at: string
          created_by: string
          destinatario_cnpj: string | null
          destinatario_nome: string | null
          id: string
          municipio_destino_nome: string | null
          municipio_origem_nome: string | null
          ncm: string | null
          observacoes: string | null
          peso_bruto: number
          produto_predominante: string
          remetente_cnpj: string | null
          remetente_nome: string | null
          sinonimos: string | null
          tipo: string | null
          tolerancia_quebra: number | null
          uf_destino: string | null
          uf_origem: string | null
          unidade: string
          updated_at: string
          valor_carga: number
          valor_carga_averb: number | null
        }
        Insert: {
          ativo?: boolean
          chaves_nfe_ref?: string[] | null
          cod_buonny?: string | null
          cod_opentech?: string | null
          created_at?: string
          created_by: string
          destinatario_cnpj?: string | null
          destinatario_nome?: string | null
          id?: string
          municipio_destino_nome?: string | null
          municipio_origem_nome?: string | null
          ncm?: string | null
          observacoes?: string | null
          peso_bruto?: number
          produto_predominante: string
          remetente_cnpj?: string | null
          remetente_nome?: string | null
          sinonimos?: string | null
          tipo?: string | null
          tolerancia_quebra?: number | null
          uf_destino?: string | null
          uf_origem?: string | null
          unidade?: string
          updated_at?: string
          valor_carga?: number
          valor_carga_averb?: number | null
        }
        Update: {
          ativo?: boolean
          chaves_nfe_ref?: string[] | null
          cod_buonny?: string | null
          cod_opentech?: string | null
          created_at?: string
          created_by?: string
          destinatario_cnpj?: string | null
          destinatario_nome?: string | null
          id?: string
          municipio_destino_nome?: string | null
          municipio_origem_nome?: string | null
          ncm?: string | null
          observacoes?: string | null
          peso_bruto?: number
          produto_predominante?: string
          remetente_cnpj?: string | null
          remetente_nome?: string | null
          sinonimos?: string | null
          tipo?: string | null
          tolerancia_quebra?: number | null
          uf_destino?: string | null
          uf_origem?: string | null
          unidade?: string
          updated_at?: string
          valor_carga?: number
          valor_carga_averb?: number | null
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          ativo: boolean
          codigo: string
          conta_pai_id: string | null
          created_at: string
          empresa_id: string
          id: string
          nivel: number
          nome: string
          tipo: string
          tipo_operacional: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          conta_pai_id?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nivel?: number
          nome: string
          tipo: string
          tipo_operacional?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          conta_pai_id?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nivel?: number
          nome?: string
          tipo?: string
          tipo_operacional?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_conta_pai_id_fkey"
            columns: ["conta_pai_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chart_of_accounts_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      contingency_events: {
        Row: {
          created_at: string
          created_by: string | null
          detected_error: string | null
          documents_pending: number | null
          documents_resent: number | null
          establishment_id: string
          event_type: string
          id: string
          new_mode: string
          previous_mode: string
          reason: string | null
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detected_error?: string | null
          documents_pending?: number | null
          documents_resent?: number | null
          establishment_id: string
          event_type: string
          id?: string
          new_mode: string
          previous_mode?: string
          reason?: string | null
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detected_error?: string | null
          documents_pending?: number | null
          documents_resent?: number | null
          establishment_id?: string
          event_type?: string
          id?: string
          new_mode?: string
          previous_mode?: string
          reason?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contingency_events_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      ctes: {
        Row: {
          aliquota_icms: number
          base_calculo_icms: number
          cfop: string
          chave_acesso: string | null
          chaves_nfe_ref: string[] | null
          componentes_frete: Json | null
          created_at: string
          created_by: string
          cst_icms: string
          data_autorizacao: string | null
          data_emissao: string | null
          destinatario_cnpj: string | null
          destinatario_endereco: string | null
          destinatario_ie: string | null
          destinatario_municipio_ibge: string | null
          destinatario_nome: string
          destinatario_uf: string | null
          establishment_id: string
          expedidor_cnpj: string | null
          expedidor_endereco: string | null
          expedidor_ie: string | null
          expedidor_municipio_ibge: string | null
          expedidor_nome: string | null
          expedidor_uf: string | null
          id: string
          ind_ie_toma: number | null
          info_quantidade: Json | null
          modal: string | null
          motivo_rejeicao: string | null
          motorista_id: string | null
          municipio_destino_ibge: string | null
          municipio_destino_nome: string | null
          municipio_envio_ibge: string | null
          municipio_envio_nome: string | null
          municipio_origem_ibge: string | null
          municipio_origem_nome: string | null
          natureza_operacao: string
          numero: number | null
          observacoes: string | null
          peso_bruto: number | null
          placa_veiculo: string | null
          produto_predominante: string | null
          protocolo_autorizacao: string | null
          recebedor_cnpj: string | null
          recebedor_endereco: string | null
          recebedor_ie: string | null
          recebedor_municipio_ibge: string | null
          recebedor_nome: string | null
          recebedor_uf: string | null
          remetente_cnpj: string | null
          remetente_endereco: string | null
          remetente_ie: string | null
          remetente_municipio_ibge: string | null
          remetente_nome: string
          remetente_uf: string | null
          retira: number | null
          rntrc: string | null
          serie: number
          status: string
          tomador_cnpj: string | null
          tomador_endereco: string | null
          tomador_id: string | null
          tomador_ie: string | null
          tomador_municipio_ibge: string | null
          tomador_nome: string | null
          tomador_tipo: number | null
          tomador_uf: string | null
          tp_cte: number | null
          tp_serv: number | null
          uf_destino: string | null
          uf_envio: string | null
          uf_origem: string | null
          updated_at: string
          valor_carga: number
          valor_carga_averb: number | null
          valor_frete: number
          valor_icms: number
          valor_receber: number | null
          valor_total_tributos: number | null
          veiculo_id: string | null
          xml_autorizado: string | null
          xml_enviado: string | null
        }
        Insert: {
          aliquota_icms?: number
          base_calculo_icms?: number
          cfop?: string
          chave_acesso?: string | null
          chaves_nfe_ref?: string[] | null
          componentes_frete?: Json | null
          created_at?: string
          created_by: string
          cst_icms?: string
          data_autorizacao?: string | null
          data_emissao?: string | null
          destinatario_cnpj?: string | null
          destinatario_endereco?: string | null
          destinatario_ie?: string | null
          destinatario_municipio_ibge?: string | null
          destinatario_nome: string
          destinatario_uf?: string | null
          establishment_id: string
          expedidor_cnpj?: string | null
          expedidor_endereco?: string | null
          expedidor_ie?: string | null
          expedidor_municipio_ibge?: string | null
          expedidor_nome?: string | null
          expedidor_uf?: string | null
          id?: string
          ind_ie_toma?: number | null
          info_quantidade?: Json | null
          modal?: string | null
          motivo_rejeicao?: string | null
          motorista_id?: string | null
          municipio_destino_ibge?: string | null
          municipio_destino_nome?: string | null
          municipio_envio_ibge?: string | null
          municipio_envio_nome?: string | null
          municipio_origem_ibge?: string | null
          municipio_origem_nome?: string | null
          natureza_operacao?: string
          numero?: number | null
          observacoes?: string | null
          peso_bruto?: number | null
          placa_veiculo?: string | null
          produto_predominante?: string | null
          protocolo_autorizacao?: string | null
          recebedor_cnpj?: string | null
          recebedor_endereco?: string | null
          recebedor_ie?: string | null
          recebedor_municipio_ibge?: string | null
          recebedor_nome?: string | null
          recebedor_uf?: string | null
          remetente_cnpj?: string | null
          remetente_endereco?: string | null
          remetente_ie?: string | null
          remetente_municipio_ibge?: string | null
          remetente_nome: string
          remetente_uf?: string | null
          retira?: number | null
          rntrc?: string | null
          serie?: number
          status?: string
          tomador_cnpj?: string | null
          tomador_endereco?: string | null
          tomador_id?: string | null
          tomador_ie?: string | null
          tomador_municipio_ibge?: string | null
          tomador_nome?: string | null
          tomador_tipo?: number | null
          tomador_uf?: string | null
          tp_cte?: number | null
          tp_serv?: number | null
          uf_destino?: string | null
          uf_envio?: string | null
          uf_origem?: string | null
          updated_at?: string
          valor_carga?: number
          valor_carga_averb?: number | null
          valor_frete?: number
          valor_icms?: number
          valor_receber?: number | null
          valor_total_tributos?: number | null
          veiculo_id?: string | null
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Update: {
          aliquota_icms?: number
          base_calculo_icms?: number
          cfop?: string
          chave_acesso?: string | null
          chaves_nfe_ref?: string[] | null
          componentes_frete?: Json | null
          created_at?: string
          created_by?: string
          cst_icms?: string
          data_autorizacao?: string | null
          data_emissao?: string | null
          destinatario_cnpj?: string | null
          destinatario_endereco?: string | null
          destinatario_ie?: string | null
          destinatario_municipio_ibge?: string | null
          destinatario_nome?: string
          destinatario_uf?: string | null
          establishment_id?: string
          expedidor_cnpj?: string | null
          expedidor_endereco?: string | null
          expedidor_ie?: string | null
          expedidor_municipio_ibge?: string | null
          expedidor_nome?: string | null
          expedidor_uf?: string | null
          id?: string
          ind_ie_toma?: number | null
          info_quantidade?: Json | null
          modal?: string | null
          motivo_rejeicao?: string | null
          motorista_id?: string | null
          municipio_destino_ibge?: string | null
          municipio_destino_nome?: string | null
          municipio_envio_ibge?: string | null
          municipio_envio_nome?: string | null
          municipio_origem_ibge?: string | null
          municipio_origem_nome?: string | null
          natureza_operacao?: string
          numero?: number | null
          observacoes?: string | null
          peso_bruto?: number | null
          placa_veiculo?: string | null
          produto_predominante?: string | null
          protocolo_autorizacao?: string | null
          recebedor_cnpj?: string | null
          recebedor_endereco?: string | null
          recebedor_ie?: string | null
          recebedor_municipio_ibge?: string | null
          recebedor_nome?: string | null
          recebedor_uf?: string | null
          remetente_cnpj?: string | null
          remetente_endereco?: string | null
          remetente_ie?: string | null
          remetente_municipio_ibge?: string | null
          remetente_nome?: string
          remetente_uf?: string | null
          retira?: number | null
          rntrc?: string | null
          serie?: number
          status?: string
          tomador_cnpj?: string | null
          tomador_endereco?: string | null
          tomador_id?: string | null
          tomador_ie?: string | null
          tomador_municipio_ibge?: string | null
          tomador_nome?: string | null
          tomador_tipo?: number | null
          tomador_uf?: string | null
          tp_cte?: number | null
          tp_serv?: number | null
          uf_destino?: string | null
          uf_envio?: string | null
          uf_origem?: string | null
          updated_at?: string
          valor_carga?: number
          valor_carga_averb?: number | null
          valor_frete?: number
          valor_icms?: number
          valor_receber?: number | null
          valor_total_tributos?: number | null
          veiculo_id?: string | null
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ctes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctes_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctes_tomador_id_fkey"
            columns: ["tomador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ctes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_documents: {
        Row: {
          cnh_category: string | null
          cnh_expiry: string | null
          cnh_number: string | null
          cpf: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cnh_category?: string | null
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cnh_category?: string | null
          cnh_expiry?: string | null
          cnh_number?: string | null
          cpf?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      driver_services: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          service_type: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          service_type: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          service_type?: string
          user_id?: string
        }
        Relationships: []
      }
      establishment_certificates: {
        Row: {
          certificate_id: string
          created_at: string
          establishment_id: string
          id: string
        }
        Insert: {
          certificate_id: string
          created_at?: string
          establishment_id: string
          id?: string
        }
        Update: {
          certificate_id?: string
          created_at?: string
          establishment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_certificates_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "fiscal_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_certificates_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_installments: {
        Row: {
          boleto_url: string | null
          created_at: string
          data_vencimento: string
          expense_id: string
          id: string
          numero_parcela: number
          status: string
          valor: number
        }
        Insert: {
          boleto_url?: string | null
          created_at?: string
          data_vencimento: string
          expense_id: string
          id?: string
          numero_parcela?: number
          status?: string
          valor?: number
        }
        Update: {
          boleto_url?: string | null
          created_at?: string
          data_vencimento?: string
          expense_id?: string
          id?: string
          numero_parcela?: number
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_installments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_items: {
        Row: {
          cfop: string | null
          created_at: string
          descricao: string
          expense_id: string
          id: string
          ncm: string | null
          quantidade: number
          unidade: string | null
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          cfop?: string | null
          created_at?: string
          descricao: string
          expense_id: string
          id?: string
          ncm?: string | null
          quantidade?: number
          unidade?: string | null
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          cfop?: string | null
          created_at?: string
          descricao?: string
          expense_id?: string
          id?: string
          ncm?: string | null
          quantidade?: number
          unidade?: string | null
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_maintenance_items: {
        Row: {
          created_at: string
          descricao: string
          expense_id: string
          id: string
          quantidade: number
          tipo: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao: string
          expense_id: string
          id?: string
          quantidade?: number
          tipo?: string
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          expense_id?: string
          id?: string
          quantidade?: number
          tipo?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_maintenance_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_payments: {
        Row: {
          created_at: string
          created_by: string
          data_pagamento: string
          expense_id: string
          forma_pagamento: string
          id: string
          observacoes: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          created_by: string
          data_pagamento?: string
          expense_id: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          valor?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          data_pagamento?: string
          expense_id?: string
          forma_pagamento?: string
          id?: string
          observacoes?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_payments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          afeta_caixa: boolean
          categoria_financeira_id: string | null
          centro_custo: Database["public"]["Enums"]["cost_center"]
          chave_nfe: string | null
          comprovante_url: string | null
          conta_financeira_id: string | null
          contrato_id: string | null
          created_at: string
          created_by: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string | null
          deleted_at: string | null
          descricao: string
          documento_fiscal_importado: boolean
          documento_fiscal_numero: string | null
          empresa_id: string
          favorecido_id: string | null
          favorecido_nome: string | null
          forma_pagamento: string | null
          fornecedor_cnpj: string | null
          fornecedor_mecanica: string | null
          id: string
          km_atual: number | null
          km_odometro: number | null
          litros: number | null
          motorista_id: string | null
          numero_multa: string | null
          observacoes: string | null
          origem: Database["public"]["Enums"]["expense_origin"]
          plano_contas_id: string | null
          proxima_manutencao_km: number | null
          sefaz_status: string | null
          status: Database["public"]["Enums"]["expense_status"]
          tempo_parado: string | null
          tipo_despesa: Database["public"]["Enums"]["expense_type"]
          tipo_manutencao: string | null
          updated_at: string
          valor_pago: number
          valor_total: number
          veiculo_id: string | null
          veiculo_placa: string | null
          viagem_id: string | null
          xml_original: string | null
        }
        Insert: {
          afeta_caixa?: boolean
          categoria_financeira_id?: string | null
          centro_custo?: Database["public"]["Enums"]["cost_center"]
          chave_nfe?: string | null
          comprovante_url?: string | null
          conta_financeira_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao: string
          documento_fiscal_importado?: boolean
          documento_fiscal_numero?: string | null
          empresa_id: string
          favorecido_id?: string | null
          favorecido_nome?: string | null
          forma_pagamento?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_mecanica?: string | null
          id?: string
          km_atual?: number | null
          km_odometro?: number | null
          litros?: number | null
          motorista_id?: string | null
          numero_multa?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["expense_origin"]
          plano_contas_id?: string | null
          proxima_manutencao_km?: number | null
          sefaz_status?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          tempo_parado?: string | null
          tipo_despesa?: Database["public"]["Enums"]["expense_type"]
          tipo_manutencao?: string | null
          updated_at?: string
          valor_pago?: number
          valor_total?: number
          veiculo_id?: string | null
          veiculo_placa?: string | null
          viagem_id?: string | null
          xml_original?: string | null
        }
        Update: {
          afeta_caixa?: boolean
          categoria_financeira_id?: string | null
          centro_custo?: Database["public"]["Enums"]["cost_center"]
          chave_nfe?: string | null
          comprovante_url?: string | null
          conta_financeira_id?: string | null
          contrato_id?: string | null
          created_at?: string
          created_by?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          deleted_at?: string | null
          descricao?: string
          documento_fiscal_importado?: boolean
          documento_fiscal_numero?: string | null
          empresa_id?: string
          favorecido_id?: string | null
          favorecido_nome?: string | null
          forma_pagamento?: string | null
          fornecedor_cnpj?: string | null
          fornecedor_mecanica?: string | null
          id?: string
          km_atual?: number | null
          km_odometro?: number | null
          litros?: number | null
          motorista_id?: string | null
          numero_multa?: string | null
          observacoes?: string | null
          origem?: Database["public"]["Enums"]["expense_origin"]
          plano_contas_id?: string | null
          proxima_manutencao_km?: number | null
          sefaz_status?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          tempo_parado?: string | null
          tipo_despesa?: Database["public"]["Enums"]["expense_type"]
          tipo_manutencao?: string | null
          updated_at?: string
          valor_pago?: number
          valor_total?: number
          veiculo_id?: string | null
          veiculo_placa?: string | null
          viagem_id?: string | null
          xml_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_categoria_financeira_id_fkey"
            columns: ["categoria_financeira_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_favorecido_id_fkey"
            columns: ["favorecido_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          plano_contas_id: string | null
          tipo_operacional: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          plano_contas_id?: string | null
          tipo_operacional?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          plano_contas_id?: string | null
          tipo_operacional?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_invoice_items: {
        Row: {
          amount: number
          created_at: string
          cte_id: string
          id: string
          invoice_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          cte_id: string
          id?: string
          invoice_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          cte_id?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_invoice_items_cte_id_fkey"
            columns: ["cte_id"]
            isOneToOne: false
            referencedRelation: "ctes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "financial_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_invoices: {
        Row: {
          created_at: string
          created_by: string
          debtor_id: string | null
          debtor_name: string
          due_date: string | null
          harvest_job_id: string | null
          id: string
          invoice_number: number
          notes: string | null
          source_type: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          debtor_id?: string | null
          debtor_name: string
          due_date?: string | null
          harvest_job_id?: string | null
          id?: string
          invoice_number?: number
          notes?: string | null
          source_type?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          debtor_id?: string | null
          debtor_name?: string
          due_date?: string | null
          harvest_job_id?: string | null
          id?: string
          invoice_number?: number
          notes?: string | null
          source_type?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_invoices_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_invoices_harvest_job_id_fkey"
            columns: ["harvest_job_id"]
            isOneToOne: false
            referencedRelation: "harvest_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_certificates: {
        Row: {
          ativo: boolean
          caminho_storage: string
          created_at: string
          id: string
          nome: string
          senha_criptografada: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          caminho_storage: string
          created_at?: string
          id?: string
          nome: string
          senha_criptografada: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          caminho_storage?: string
          created_at?: string
          id?: string
          nome?: string
          senha_criptografada?: string
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_establishments: {
        Row: {
          active: boolean | null
          ambiente: string | null
          cnpj: string
          codigo_municipio_ibge: string | null
          contingency_activated_at: string | null
          contingency_justification: string | null
          contingency_mode: string | null
          contingency_protocol: string | null
          created_at: string | null
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_logradouro: string | null
          endereco_municipio: string | null
          endereco_numero: string | null
          endereco_uf: string | null
          fiscal_settings_id: string | null
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          razao_social: string
          rntrc: string | null
          serie_cte: number | null
          serie_mdfe: number | null
          type: Database["public"]["Enums"]["establishment_type"]
          ultimo_numero_cte: number | null
          ultimo_numero_mdfe: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          ambiente?: string | null
          cnpj: string
          codigo_municipio_ibge?: string | null
          contingency_activated_at?: string | null
          contingency_justification?: string | null
          contingency_mode?: string | null
          contingency_protocol?: string | null
          created_at?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_logradouro?: string | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          fiscal_settings_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          razao_social: string
          rntrc?: string | null
          serie_cte?: number | null
          serie_mdfe?: number | null
          type?: Database["public"]["Enums"]["establishment_type"]
          ultimo_numero_cte?: number | null
          ultimo_numero_mdfe?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          ambiente?: string | null
          cnpj?: string
          codigo_municipio_ibge?: string | null
          contingency_activated_at?: string | null
          contingency_justification?: string | null
          contingency_mode?: string | null
          contingency_protocol?: string | null
          created_at?: string | null
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_logradouro?: string | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          fiscal_settings_id?: string | null
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          razao_social?: string
          rntrc?: string | null
          serie_cte?: number | null
          serie_mdfe?: number | null
          type?: Database["public"]["Enums"]["establishment_type"]
          ultimo_numero_cte?: number | null
          ultimo_numero_mdfe?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_establishments_fiscal_settings_id_fkey"
            columns: ["fiscal_settings_id"]
            isOneToOne: false
            referencedRelation: "fiscal_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_logs: {
        Row: {
          action: string
          ambiente: string | null
          attempt: number | null
          cnpj_emissor: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          establishment_id: string | null
          id: string
          queue_job_id: string | null
          response_time_ms: number | null
          sefaz_code: string | null
          sefaz_message: string | null
          sefaz_url: string | null
          uf: string | null
          user_id: string
        }
        Insert: {
          action: string
          ambiente?: string | null
          attempt?: number | null
          cnpj_emissor?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          establishment_id?: string | null
          id?: string
          queue_job_id?: string | null
          response_time_ms?: number | null
          sefaz_code?: string | null
          sefaz_message?: string | null
          sefaz_url?: string | null
          uf?: string | null
          user_id: string
        }
        Update: {
          action?: string
          ambiente?: string | null
          attempt?: number | null
          cnpj_emissor?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          establishment_id?: string | null
          id?: string
          queue_job_id?: string | null
          response_time_ms?: number | null
          sefaz_code?: string | null
          sefaz_message?: string | null
          sefaz_url?: string | null
          uf?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_logs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_queue: {
        Row: {
          attempts: number
          completed_at: string | null
          contingency_mode: string | null
          created_at: string
          created_by: string
          entity_id: string
          error_message: string | null
          establishment_id: string | null
          id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          original_job_id: string | null
          payload: Json
          requires_resend: boolean | null
          result: Json | null
          started_at: string | null
          status: string
          timeout_seconds: number
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          contingency_mode?: string | null
          created_at?: string
          created_by: string
          entity_id: string
          error_message?: string | null
          establishment_id?: string | null
          id?: string
          job_type: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          original_job_id?: string | null
          payload?: Json
          requires_resend?: boolean | null
          result?: Json | null
          started_at?: string | null
          status?: string
          timeout_seconds?: number
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          contingency_mode?: string | null
          created_at?: string
          created_by?: string
          entity_id?: string
          error_message?: string | null
          establishment_id?: string | null
          id?: string
          job_type?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_retry_at?: string | null
          original_job_id?: string | null
          payload?: Json
          requires_resend?: boolean | null
          result?: Json | null
          started_at?: string | null
          status?: string
          timeout_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_queue_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          ambiente: string
          certificado_a1_path: string | null
          cnpj: string
          codigo_municipio_ibge: string | null
          created_at: string
          endereco_bairro: string | null
          endereco_cep: string | null
          endereco_logradouro: string | null
          endereco_municipio: string | null
          endereco_numero: string | null
          endereco_uf: string | null
          id: string
          inscricao_estadual: string
          nome_fantasia: string | null
          razao_social: string
          regime_tributario: string
          senha_certificado_encrypted: string | null
          serie_cte: number
          serie_mdfe: number
          uf_emissao: string
          ultimo_numero_cte: number
          ultimo_numero_mdfe: number
          updated_at: string
          user_id: string
        }
        Insert: {
          ambiente?: string
          certificado_a1_path?: string | null
          cnpj: string
          codigo_municipio_ibge?: string | null
          created_at?: string
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_logradouro?: string | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual: string
          nome_fantasia?: string | null
          razao_social: string
          regime_tributario?: string
          senha_certificado_encrypted?: string | null
          serie_cte?: number
          serie_mdfe?: number
          uf_emissao?: string
          ultimo_numero_cte?: number
          ultimo_numero_mdfe?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          ambiente?: string
          certificado_a1_path?: string | null
          cnpj?: string
          codigo_municipio_ibge?: string | null
          created_at?: string
          endereco_bairro?: string | null
          endereco_cep?: string | null
          endereco_logradouro?: string | null
          endereco_municipio?: string | null
          endereco_numero?: string | null
          endereco_uf?: string | null
          id?: string
          inscricao_estadual?: string
          nome_fantasia?: string | null
          razao_social?: string
          regime_tributario?: string
          senha_certificado_encrypted?: string | null
          serie_cte?: number
          serie_mdfe?: number
          uf_emissao?: string
          ultimo_numero_cte?: number
          ultimo_numero_mdfe?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      freight_applications: {
        Row: {
          applied_at: string
          cte_number: string | null
          discharge_proof_sent_at: string | null
          discharge_proof_status: string | null
          discharge_proof_url: string | null
          freight_id: string
          id: string
          loading_order_sent_at: string | null
          loading_order_url: string | null
          loading_proof_sent_at: string | null
          loading_proof_url: string | null
          payment_completed_at: string | null
          payment_receipt_url: string | null
          payment_status: string | null
          status: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          applied_at?: string
          cte_number?: string | null
          discharge_proof_sent_at?: string | null
          discharge_proof_status?: string | null
          discharge_proof_url?: string | null
          freight_id: string
          id?: string
          loading_order_sent_at?: string | null
          loading_order_url?: string | null
          loading_proof_sent_at?: string | null
          loading_proof_url?: string | null
          payment_completed_at?: string | null
          payment_receipt_url?: string | null
          payment_status?: string | null
          status?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          applied_at?: string
          cte_number?: string | null
          discharge_proof_sent_at?: string | null
          discharge_proof_status?: string | null
          discharge_proof_url?: string | null
          freight_id?: string
          id?: string
          loading_order_sent_at?: string | null
          loading_order_url?: string | null
          loading_proof_sent_at?: string | null
          loading_proof_url?: string | null
          payment_completed_at?: string | null
          payment_receipt_url?: string | null
          payment_status?: string | null
          status?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_applications_freight_id_fkey"
            columns: ["freight_id"]
            isOneToOne: false
            referencedRelation: "freights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_applications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      freights: {
        Row: {
          cargo_type: string
          company_name: string
          created_at: string
          delivery_date: string | null
          description: string | null
          destination_city: string
          destination_state: string
          distance_km: number | null
          id: string
          origin_city: string
          origin_state: string
          pickup_date: string
          required_vehicle_type:
            | Database["public"]["Enums"]["vehicle_type"]
            | null
          status: Database["public"]["Enums"]["freight_status"]
          updated_at: string
          value_brl: number
          weight_kg: number
        }
        Insert: {
          cargo_type: string
          company_name: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          destination_city: string
          destination_state: string
          distance_km?: number | null
          id?: string
          origin_city: string
          origin_state: string
          pickup_date: string
          required_vehicle_type?:
            | Database["public"]["Enums"]["vehicle_type"]
            | null
          status?: Database["public"]["Enums"]["freight_status"]
          updated_at?: string
          value_brl: number
          weight_kg: number
        }
        Update: {
          cargo_type?: string
          company_name?: string
          created_at?: string
          delivery_date?: string | null
          description?: string | null
          destination_city?: string
          destination_state?: string
          distance_km?: number | null
          id?: string
          origin_city?: string
          origin_state?: string
          pickup_date?: string
          required_vehicle_type?:
            | Database["public"]["Enums"]["vehicle_type"]
            | null
          status?: Database["public"]["Enums"]["freight_status"]
          updated_at?: string
          value_brl?: number
          weight_kg?: number
        }
        Relationships: []
      }
      fuel_orders: {
        Row: {
          created_at: string
          created_by: string
          establishment_id: string
          fill_mode: string
          fuel_type: string
          id: string
          liters: number | null
          notes: string | null
          order_number: number
          requester_name: string
          requester_user_id: string
          status: string
          supplier_id: string | null
          supplier_name: string
          updated_at: string
          vehicle_id: string | null
          vehicle_plate: string
        }
        Insert: {
          created_at?: string
          created_by: string
          establishment_id: string
          fill_mode?: string
          fuel_type: string
          id?: string
          liters?: number | null
          notes?: string | null
          order_number?: number
          requester_name: string
          requester_user_id: string
          status?: string
          supplier_id?: string | null
          supplier_name: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate: string
        }
        Update: {
          created_at?: string
          created_by?: string
          establishment_id?: string
          fill_mode?: string
          fuel_type?: string
          id?: string
          liters?: number | null
          notes?: string | null
          order_number?: number
          requester_name?: string
          requester_user_id?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_plate?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_orders_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuelings: {
        Row: {
          created_at: string
          created_by: string
          data_abastecimento: string
          deleted_at: string | null
          empresa_id: string
          expense_id: string | null
          forma_pagamento: string
          id: string
          km_atual: number | null
          motorista_id: string | null
          observacoes: string | null
          posto_combustivel: string | null
          quantidade_litros: number
          status_faturamento: string
          tipo_combustivel: string
          updated_at: string
          valor_por_litro: number
          valor_total: number
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          data_abastecimento?: string
          deleted_at?: string | null
          empresa_id: string
          expense_id?: string | null
          forma_pagamento?: string
          id?: string
          km_atual?: number | null
          motorista_id?: string | null
          observacoes?: string | null
          posto_combustivel?: string | null
          quantidade_litros?: number
          status_faturamento?: string
          tipo_combustivel?: string
          updated_at?: string
          valor_por_litro?: number
          valor_total?: number
          veiculo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          data_abastecimento?: string
          deleted_at?: string | null
          empresa_id?: string
          expense_id?: string | null
          forma_pagamento?: string
          id?: string
          km_atual?: number | null
          motorista_id?: string | null
          observacoes?: string | null
          posto_combustivel?: string | null
          quantidade_litros?: number
          status_faturamento?: string
          tipo_combustivel?: string
          updated_at?: string
          valor_por_litro?: number
          valor_total?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuelings_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuelings_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_assignments: {
        Row: {
          company_daily_value: number | null
          company_discounts: Json | null
          created_at: string
          daily_value: number | null
          discounts: Json | null
          end_date: string | null
          harvest_job_id: string
          id: string
          start_date: string
          status: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          company_daily_value?: number | null
          company_discounts?: Json | null
          created_at?: string
          daily_value?: number | null
          discounts?: Json | null
          end_date?: string | null
          harvest_job_id: string
          id?: string
          start_date?: string
          status?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          company_daily_value?: number | null
          company_discounts?: Json | null
          created_at?: string
          daily_value?: number | null
          discounts?: Json | null
          end_date?: string | null
          harvest_job_id?: string
          id?: string
          start_date?: string
          status?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "harvest_assignments_harvest_job_id_fkey"
            columns: ["harvest_job_id"]
            isOneToOne: false
            referencedRelation: "harvest_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "harvest_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_jobs: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          farm_name: string
          harvest_period_end: string | null
          harvest_period_start: string
          id: string
          location: string
          monthly_value: number
          notes: string | null
          payment_closing_day: number
          payment_value: number
          status: string
          total_third_party_vehicles: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          farm_name: string
          harvest_period_end?: string | null
          harvest_period_start: string
          id?: string
          location: string
          monthly_value?: number
          notes?: string | null
          payment_closing_day?: number
          payment_value?: number
          status?: string
          total_third_party_vehicles?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          farm_name?: string
          harvest_period_end?: string | null
          harvest_period_start?: string
          id?: string
          location?: string
          monthly_value?: number
          notes?: string | null
          payment_closing_day?: number
          payment_value?: number
          status?: string
          total_third_party_vehicles?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "harvest_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      harvest_payments: {
        Row: {
          created_at: string
          created_by: string
          filter_context: string
          harvest_job_id: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          total_amount: number
          total_expected: number
        }
        Insert: {
          created_at?: string
          created_by: string
          filter_context?: string
          harvest_job_id: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          total_amount?: number
          total_expected?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          filter_context?: string
          harvest_job_id?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          total_amount?: number
          total_expected?: number
        }
        Relationships: [
          {
            foreignKeyName: "harvest_payments_harvest_job_id_fkey"
            columns: ["harvest_job_id"]
            isOneToOne: false
            referencedRelation: "harvest_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenances: {
        Row: {
          created_at: string
          created_by: string
          custo_total: number
          data_manutencao: string
          data_proxima_manutencao: string | null
          descricao: string
          expense_id: string | null
          fornecedor: string | null
          id: string
          nfse_expense_id: string | null
          odometro: number
          proxima_manutencao_km: number | null
          status: string
          tipo_manutencao: string
          updated_at: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          custo_total?: number
          data_manutencao?: string
          data_proxima_manutencao?: string | null
          descricao?: string
          expense_id?: string | null
          fornecedor?: string | null
          id?: string
          nfse_expense_id?: string | null
          odometro?: number
          proxima_manutencao_km?: number | null
          status?: string
          tipo_manutencao?: string
          updated_at?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          custo_total?: number
          data_manutencao?: string
          data_proxima_manutencao?: string | null
          descricao?: string
          expense_id?: string | null
          fornecedor?: string | null
          id?: string
          nfse_expense_id?: string | null
          odometro?: number
          proxima_manutencao_km?: number | null
          status?: string
          tipo_manutencao?: string
          updated_at?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenances_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenances_nfse_expense_id_fkey"
            columns: ["nfse_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenances_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mdfe: {
        Row: {
          chave_acesso: string | null
          created_at: string
          created_by: string
          data_autorizacao: string | null
          data_emissao: string | null
          data_encerramento: string | null
          establishment_id: string
          id: string
          lista_ctes: string[] | null
          motorista_id: string | null
          municipio_carregamento_ibge: string | null
          municipio_descarregamento_ibge: string | null
          numero: number | null
          placa_veiculo: string
          protocolo_autorizacao: string | null
          protocolo_encerramento: string | null
          rntrc: string | null
          serie: number
          status: string
          uf_carregamento: string | null
          uf_descarregamento: string | null
          updated_at: string
          veiculo_id: string | null
          xml_autorizado: string | null
          xml_enviado: string | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string
          created_by: string
          data_autorizacao?: string | null
          data_emissao?: string | null
          data_encerramento?: string | null
          establishment_id: string
          id?: string
          lista_ctes?: string[] | null
          motorista_id?: string | null
          municipio_carregamento_ibge?: string | null
          municipio_descarregamento_ibge?: string | null
          numero?: number | null
          placa_veiculo: string
          protocolo_autorizacao?: string | null
          protocolo_encerramento?: string | null
          rntrc?: string | null
          serie?: number
          status?: string
          uf_carregamento?: string | null
          uf_descarregamento?: string | null
          updated_at?: string
          veiculo_id?: string | null
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string
          created_by?: string
          data_autorizacao?: string | null
          data_emissao?: string | null
          data_encerramento?: string | null
          establishment_id?: string
          id?: string
          lista_ctes?: string[] | null
          motorista_id?: string | null
          municipio_carregamento_ibge?: string | null
          municipio_descarregamento_ibge?: string | null
          numero?: number | null
          placa_veiculo?: string
          protocolo_autorizacao?: string | null
          protocolo_encerramento?: string | null
          rntrc?: string | null
          serie?: number
          status?: string
          uf_carregamento?: string | null
          uf_descarregamento?: string | null
          updated_at?: string
          veiculo_id?: string | null
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mdfe_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mdfe_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mdfe_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          created_at: string
          created_by: string
          description: string
          file_name: string
          file_url: string
          harvest_job_id: string | null
          harvest_payment_id: string | null
          id: string
          person_id: string | null
          person_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          file_name: string
          file_url: string
          harvest_job_id?: string | null
          harvest_payment_id?: string | null
          id?: string
          person_id?: string | null
          person_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          file_name?: string
          file_url?: string
          harvest_job_id?: string | null
          harvest_payment_id?: string | null
          id?: string
          person_id?: string | null
          person_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_harvest_job_id_fkey"
            columns: ["harvest_job_id"]
            isOneToOne: false
            referencedRelation: "harvest_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_harvest_payment_id_fkey"
            columns: ["harvest_payment_id"]
            isOneToOne: false
            referencedRelation: "harvest_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_receipts_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zip: string | null
          avatar_url: string | null
          bank_account: string | null
          bank_account_type: string | null
          bank_agency: string | null
          bank_name: string | null
          category: string
          cnpj: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          inscricao_estadual: string | null
          nome_fantasia: string | null
          notes: string | null
          person_type: string | null
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          razao_social: string | null
          signature_data: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          category?: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          person_type?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          razao_social?: string | null
          signature_data?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zip?: string | null
          avatar_url?: string | null
          bank_account?: string | null
          bank_account_type?: string | null
          bank_agency?: string | null
          bank_name?: string | null
          category?: string
          cnpj?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          inscricao_estadual?: string | null
          nome_fantasia?: string | null
          notes?: string | null
          person_type?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          razao_social?: string | null
          signature_data?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          alimentacao_por_conta: string | null
          carga_id: string | null
          client_id: string | null
          combustivel_por_conta: string | null
          created_at: string
          created_by: string
          destino_cidade: string | null
          destino_uf: string | null
          establishment_id: string | null
          id: string
          numero: number
          observacoes: string | null
          origem_cidade: string | null
          origem_uf: string | null
          peso_kg: number | null
          previsao_inicio: string | null
          previsao_termino: string | null
          produto: string | null
          quantidade_caminhoes: number | null
          status: string
          type: string
          updated_at: string
          validade_dias: number | null
          valor_alimentacao_dia: number | null
          valor_frete: number | null
          valor_mensal_por_caminhao: number | null
        }
        Insert: {
          alimentacao_por_conta?: string | null
          carga_id?: string | null
          client_id?: string | null
          combustivel_por_conta?: string | null
          created_at?: string
          created_by: string
          destino_cidade?: string | null
          destino_uf?: string | null
          establishment_id?: string | null
          id?: string
          numero?: number
          observacoes?: string | null
          origem_cidade?: string | null
          origem_uf?: string | null
          peso_kg?: number | null
          previsao_inicio?: string | null
          previsao_termino?: string | null
          produto?: string | null
          quantidade_caminhoes?: number | null
          status?: string
          type: string
          updated_at?: string
          validade_dias?: number | null
          valor_alimentacao_dia?: number | null
          valor_frete?: number | null
          valor_mensal_por_caminhao?: number | null
        }
        Update: {
          alimentacao_por_conta?: string | null
          carga_id?: string | null
          client_id?: string | null
          combustivel_por_conta?: string | null
          created_at?: string
          created_by?: string
          destino_cidade?: string | null
          destino_uf?: string | null
          establishment_id?: string | null
          id?: string
          numero?: number
          observacoes?: string | null
          origem_cidade?: string | null
          origem_uf?: string | null
          peso_kg?: number | null
          previsao_inicio?: string | null
          previsao_termino?: string | null
          produto?: string | null
          quantidade_caminhoes?: number | null
          status?: string
          type?: string
          updated_at?: string
          validade_dias?: number | null
          valor_alimentacao_dia?: number | null
          valor_frete?: number | null
          valor_mensal_por_caminhao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "fiscal_establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_entries: {
        Row: {
          created_at: string
          id: string
          key: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          function_name: string
          id: string
          source_ip: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          function_name: string
          id?: string
          source_ip?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          function_name?: string
          id?: string
          source_ip?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      smtp_settings: {
        Row: {
          created_at: string
          created_by: string
          from_email: string
          from_name: string
          host: string
          id: string
          password_encrypted: string
          port: number
          updated_at: string
          use_tls: boolean
          username: string
        }
        Insert: {
          created_at?: string
          created_by: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          password_encrypted?: string
          port?: number
          updated_at?: string
          use_tls?: boolean
          username?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          from_email?: string
          from_name?: string
          host?: string
          id?: string
          password_encrypted?: string
          port?: number
          updated_at?: string
          use_tls?: boolean
          username?: string
        }
        Relationships: []
      }
      trailers: {
        Row: {
          capacity_kg: number
          created_at: string
          id: string
          plate: string
          renavam: string
          trailer_type: string
          vehicle_id: string
        }
        Insert: {
          capacity_kg: number
          created_at?: string
          id?: string
          plate: string
          renavam: string
          trailer_type: string
          vehicle_id: string
        }
        Update: {
          capacity_kg?: number
          created_at?: string
          id?: string
          plate?: string
          renavam?: string
          trailer_type?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trailers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          antt_number: string | null
          brand: string
          cargo_type: string | null
          created_at: string
          driver_id: string | null
          fleet_type: string
          id: string
          is_active: boolean | null
          model: string
          owner_id: string | null
          plate: string
          renavam: string
          trailer_plate_1: string | null
          trailer_plate_2: string | null
          trailer_plate_3: string | null
          trailer_renavam_1: string | null
          trailer_renavam_2: string | null
          trailer_renavam_3: string | null
          updated_at: string
          user_id: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year: number
        }
        Insert: {
          antt_number?: string | null
          brand: string
          cargo_type?: string | null
          created_at?: string
          driver_id?: string | null
          fleet_type?: string
          id?: string
          is_active?: boolean | null
          model: string
          owner_id?: string | null
          plate: string
          renavam: string
          trailer_plate_1?: string | null
          trailer_plate_2?: string | null
          trailer_plate_3?: string | null
          trailer_renavam_1?: string | null
          trailer_renavam_2?: string | null
          trailer_renavam_3?: string | null
          updated_at?: string
          user_id: string
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
          year: number
        }
        Update: {
          antt_number?: string | null
          brand?: string
          cargo_type?: string | null
          created_at?: string
          driver_id?: string | null
          fleet_type?: string
          id?: string
          is_active?: boolean | null
          model?: string
          owner_id?: string | null
          plate?: string
          renavam?: string
          trailer_plate_1?: string | null
          trailer_plate_2?: string | null
          trailer_plate_3?: string | null
          trailer_renavam_1?: string | null
          trailer_renavam_2?: string | null
          trailer_renavam_3?: string | null
          updated_at?: string
          user_id?: string
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
          year?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { _key: string; _max_requests?: number; _window_seconds?: number }
        Returns: {
          allowed: boolean
          current_count: number
          remaining: number
          reset_at: string
        }[]
      }
      claim_queue_jobs: {
        Args: { _batch_size?: number; _instance_id: string }
        Returns: {
          attempts: number
          completed_at: string | null
          contingency_mode: string | null
          created_at: string
          created_by: string
          entity_id: string
          error_message: string | null
          establishment_id: string | null
          id: string
          job_type: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_retry_at: string | null
          original_job_id: string | null
          payload: Json
          requires_resend: boolean | null
          result: Json | null
          started_at: string | null
          status: string
          timeout_seconds: number
        }[]
        SetofOptions: {
          from: "*"
          to: "fiscal_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_rate_limit_entries: { Args: never; Returns: number }
      get_my_masked_documents: {
        Args: never
        Returns: {
          cnh_category: string
          cnh_expiry: string
          cnh_masked: string
          cpf_masked: string
          has_valid_cnh: boolean
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_cte_number:
        | { Args: never; Returns: number }
        | { Args: { _establishment_id: string }; Returns: number }
      next_mdfe_number:
        | { Args: never; Returns: number }
        | { Args: { _establishment_id: string }; Returns: number }
      reset_stale_queue_locks: {
        Args: { _timeout_seconds?: number }
        Returns: number
      }
      user_has_documents: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      cost_center:
        | "frota_propria"
        | "frota_terceiros"
        | "administrativo"
        | "operacional"
      document_status: "pending" | "approved" | "rejected" | "expired"
      establishment_type: "matriz" | "filial"
      expense_origin:
        | "manual"
        | "xml"
        | "abastecimento"
        | "manutencao"
        | "importacao"
      expense_status: "pendente" | "pago" | "atrasado" | "parcial"
      expense_type:
        | "combustivel"
        | "manutencao"
        | "pedagio"
        | "multa"
        | "administrativo"
        | "frete_terceiro"
        | "imposto"
        | "outros"
      freight_status: "available" | "in_progress" | "completed" | "cancelled"
      vehicle_type:
        | "truck"
        | "bitruck"
        | "carreta"
        | "carreta_ls"
        | "rodotrem"
        | "bitrem"
        | "treminhao"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      cost_center: [
        "frota_propria",
        "frota_terceiros",
        "administrativo",
        "operacional",
      ],
      document_status: ["pending", "approved", "rejected", "expired"],
      establishment_type: ["matriz", "filial"],
      expense_origin: [
        "manual",
        "xml",
        "abastecimento",
        "manutencao",
        "importacao",
      ],
      expense_status: ["pendente", "pago", "atrasado", "parcial"],
      expense_type: [
        "combustivel",
        "manutencao",
        "pedagio",
        "multa",
        "administrativo",
        "frete_terceiro",
        "imposto",
        "outros",
      ],
      freight_status: ["available", "in_progress", "completed", "cancelled"],
      vehicle_type: [
        "truck",
        "bitruck",
        "carreta",
        "carreta_ls",
        "rodotrem",
        "bitrem",
        "treminhao",
      ],
    },
  },
} as const
