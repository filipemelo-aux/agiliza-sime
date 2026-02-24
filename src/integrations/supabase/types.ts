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
          nome_fantasia: string | null
          notes: string | null
          person_type: string | null
          phone: string | null
          pix_key: string | null
          pix_key_type: string | null
          razao_social: string | null
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
          nome_fantasia?: string | null
          notes?: string | null
          person_type?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          razao_social?: string | null
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
          nome_fantasia?: string | null
          notes?: string | null
          person_type?: string | null
          phone?: string | null
          pix_key?: string | null
          pix_key_type?: string | null
          razao_social?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      document_status: "pending" | "approved" | "rejected" | "expired"
      establishment_type: "matriz" | "filial"
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
      document_status: ["pending", "approved", "rejected", "expired"],
      establishment_type: ["matriz", "filial"],
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
