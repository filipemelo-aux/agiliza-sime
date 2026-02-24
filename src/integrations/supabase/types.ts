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
      ctes: {
        Row: {
          aliquota_icms: number
          base_calculo_icms: number
          cfop: string
          chave_acesso: string | null
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
          id: string
          motivo_rejeicao: string | null
          motorista_id: string | null
          municipio_destino_ibge: string | null
          municipio_destino_nome: string | null
          municipio_origem_ibge: string | null
          municipio_origem_nome: string | null
          natureza_operacao: string
          numero: number | null
          observacoes: string | null
          peso_bruto: number | null
          placa_veiculo: string | null
          produto_predominante: string | null
          protocolo_autorizacao: string | null
          remetente_cnpj: string | null
          remetente_endereco: string | null
          remetente_ie: string | null
          remetente_municipio_ibge: string | null
          remetente_nome: string
          remetente_uf: string | null
          rntrc: string | null
          serie: number
          status: string
          tomador_id: string | null
          uf_destino: string | null
          uf_origem: string | null
          updated_at: string
          valor_carga: number
          valor_frete: number
          valor_icms: number
          veiculo_id: string | null
          xml_autorizado: string | null
          xml_enviado: string | null
        }
        Insert: {
          aliquota_icms?: number
          base_calculo_icms?: number
          cfop?: string
          chave_acesso?: string | null
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
          id?: string
          motivo_rejeicao?: string | null
          motorista_id?: string | null
          municipio_destino_ibge?: string | null
          municipio_destino_nome?: string | null
          municipio_origem_ibge?: string | null
          municipio_origem_nome?: string | null
          natureza_operacao?: string
          numero?: number | null
          observacoes?: string | null
          peso_bruto?: number | null
          placa_veiculo?: string | null
          produto_predominante?: string | null
          protocolo_autorizacao?: string | null
          remetente_cnpj?: string | null
          remetente_endereco?: string | null
          remetente_ie?: string | null
          remetente_municipio_ibge?: string | null
          remetente_nome: string
          remetente_uf?: string | null
          rntrc?: string | null
          serie?: number
          status?: string
          tomador_id?: string | null
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
          valor_carga?: number
          valor_frete?: number
          valor_icms?: number
          veiculo_id?: string | null
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Update: {
          aliquota_icms?: number
          base_calculo_icms?: number
          cfop?: string
          chave_acesso?: string | null
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
          id?: string
          motivo_rejeicao?: string | null
          motorista_id?: string | null
          municipio_destino_ibge?: string | null
          municipio_destino_nome?: string | null
          municipio_origem_ibge?: string | null
          municipio_origem_nome?: string | null
          natureza_operacao?: string
          numero?: number | null
          observacoes?: string | null
          peso_bruto?: number | null
          placa_veiculo?: string | null
          produto_predominante?: string | null
          protocolo_autorizacao?: string | null
          remetente_cnpj?: string | null
          remetente_endereco?: string | null
          remetente_ie?: string | null
          remetente_municipio_ibge?: string | null
          remetente_nome?: string
          remetente_uf?: string | null
          rntrc?: string | null
          serie?: number
          status?: string
          tomador_id?: string | null
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
          valor_carga?: number
          valor_frete?: number
          valor_icms?: number
          veiculo_id?: string | null
          xml_autorizado?: string | null
          xml_enviado?: string | null
        }
        Relationships: [
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
      fiscal_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
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
      next_cte_number: { Args: never; Returns: number }
      next_mdfe_number: { Args: never; Returns: number }
      user_has_documents: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      document_status: "pending" | "approved" | "rejected" | "expired"
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
