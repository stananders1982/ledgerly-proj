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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      action_permissions: {
        Row: {
          action_key: string
          allowed: boolean
          company_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_key: string
          allowed?: boolean
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_key?: string
          allowed?: boolean
          company_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_log: {
        Row: {
          action: string
          changes: Json | null
          company_id: string | null
          created_at: string
          entity_id: string | null
          entity_label: string | null
          entity_type: string
          id: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          company_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_label?: string | null
          entity_type?: string
          id?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      admin_chat_messages: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message_id: string | null
          parts: Json
          role: string
          thread_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message_id?: string | null
          parts?: Json
          role: string
          thread_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message_id?: string | null
          parts?: Json
          role?: string
          thread_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "admin_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_chat_threads: {
        Row: {
          company_id: string
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_chat_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_events: {
        Row: {
          affiliate_id: string
          amount: number
          company_id: string
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          amount?: number
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_events_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_events_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_guarantee_periods: {
        Row: {
          actual_cpa_cost: number
          affiliate_id: string
          company_id: string
          created_at: string
          guaranteed_amount: number
          id: string
          period_end: string
          period_start: string
          shortfall_amount: number
          status: string
          updated_at: string
        }
        Insert: {
          actual_cpa_cost?: number
          affiliate_id: string
          company_id?: string
          created_at?: string
          guaranteed_amount?: number
          id?: string
          period_end: string
          period_start: string
          shortfall_amount?: number
          status?: string
          updated_at?: string
        }
        Update: {
          actual_cpa_cost?: number
          affiliate_id?: string
          company_id?: string
          created_at?: string
          guaranteed_amount?: number
          id?: string
          period_end?: string
          period_start?: string
          shortfall_amount?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_guarantee_periods_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_guarantee_periods_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_guarantee_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          active: boolean
          alert_threshold: number | null
          balance_activated_at: string | null
          balance_start_date: string | null
          company_id: string
          cpa_rate: number
          created_at: string
          email: string | null
          group_key: string | null
          guarantee_period: string
          guarantee_type: string
          guarantee_value: number
          id: string
          name: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          alert_threshold?: number | null
          balance_activated_at?: string | null
          balance_start_date?: string | null
          company_id?: string
          cpa_rate?: number
          created_at?: string
          email?: string | null
          group_key?: string | null
          guarantee_period?: string
          guarantee_type?: string
          guarantee_value?: number
          id?: string
          name: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          alert_threshold?: number | null
          balance_activated_at?: string | null
          balance_start_date?: string | null
          company_id?: string
          cpa_rate?: number
          created_at?: string
          email?: string | null
          group_key?: string | null
          guarantee_period?: string
          guarantee_type?: string
          guarantee_value?: number
          id?: string
          name?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: string[]
          revoked_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix?: string
          last_used_at?: string | null
          name: string
          permissions?: string[]
          revoked_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: string[]
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_logs: {
        Row: {
          company_id: string | null
          created_at: string
          details: Json | null
          id: string
          level: string
          message: string
          path: string | null
          source: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message: string
          path?: string | null
          source?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          level?: string
          message?: string
          path?: string | null
          source?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          filename: string
          id: string
          mime_type: string | null
          path: string
          size_bytes: number | null
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          entity_id: string
          entity_type: string
          filename: string
          id?: string
          mime_type?: string | null
          path: string
          size_bytes?: number | null
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          filename?: string
          id?: string
          mime_type?: string | null
          path?: string
          size_bytes?: number | null
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          company_id: string
          created_at: string
          date: string
          employee_id: string
          id: string
          notes: string | null
          present: boolean
          updated_at: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          date: string
          employee_id: string
          id?: string
          notes?: string | null
          present?: boolean
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          employee_id?: string
          id?: string
          notes?: string | null
          present?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      client_communications: {
        Row: {
          activation_id: string | null
          channel: string
          client_name: string | null
          company_id: string
          created_at: string
          created_by: string | null
          direction: string
          employee_id: string | null
          id: string
          occurred_at: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          activation_id?: string | null
          channel?: string
          client_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          employee_id?: string | null
          id?: string
          occurred_at?: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          activation_id?: string | null
          channel?: string
          client_name?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          employee_id?: string | null
          id?: string
          occurred_at?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_communications_activation_id_fkey"
            columns: ["activation_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_activations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_communications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_communications_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_onboarding: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          step_affiliate: string
          step_agent: string
          step_basics: string
          step_source: string
          updated_at: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          step_affiliate?: string
          step_agent?: string
          step_basics?: string
          step_source?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          step_affiliate?: string
          step_agent?: string
          step_basics?: string
          step_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_onboarding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          brand_color: string | null
          company_id: string
          created_at: string
          currency: string
          default_activation_balance: number
          fiscal_year_start_month: number
          ftd_balance_threshold: number
          ftd_commission: number
          high_threshold: number
          logo_url: string | null
          method_fee_card_pct: number
          method_fee_crypto_pct: number
          method_fee_wire_pct: number
          mid_threshold: number
          small_threshold: number
          timezone: string
          updated_at: string
          whale_threshold: number
          withdrawal_penalty_pct: number
        }
        Insert: {
          brand_color?: string | null
          company_id: string
          created_at?: string
          currency?: string
          default_activation_balance?: number
          fiscal_year_start_month?: number
          ftd_balance_threshold?: number
          ftd_commission?: number
          high_threshold?: number
          logo_url?: string | null
          method_fee_card_pct?: number
          method_fee_crypto_pct?: number
          method_fee_wire_pct?: number
          mid_threshold?: number
          small_threshold?: number
          timezone?: string
          updated_at?: string
          whale_threshold?: number
          withdrawal_penalty_pct?: number
        }
        Update: {
          brand_color?: string | null
          company_id?: string
          created_at?: string
          currency?: string
          default_activation_balance?: number
          fiscal_year_start_month?: number
          ftd_balance_threshold?: number
          ftd_commission?: number
          high_threshold?: number
          logo_url?: string | null
          method_fee_card_pct?: number
          method_fee_crypto_pct?: number
          method_fee_wire_pct?: number
          mid_threshold?: number
          small_threshold?: number
          timezone?: string
          updated_at?: string
          whale_threshold?: number
          withdrawal_penalty_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          company_id: string
          created_at: string
          role_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          role_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          role_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_defs: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          field_key: string
          field_type: string
          id: string
          label: string
          module: string
          options: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          field_key: string
          field_type?: string
          id?: string
          label: string
          module: string
          options?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          field_key?: string
          field_type?: string
          id?: string
          label?: string
          module?: string
          options?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_lead_activations: {
        Row: {
          activated_count: number
          activation_date: string
          age: number | null
          ai_analyzed_at: string | null
          ai_next_action: string | null
          ai_opportunity_label: string | null
          ai_opportunity_reason: string | null
          ai_opportunity_score: number | null
          ai_risk_label: string | null
          ai_risk_score: number | null
          ai_suggested_potential: number | null
          ai_summary: string | null
          answered: boolean
          balance: number
          city: string | null
          company_id: string
          conversion_employee_id: string | null
          country: string | null
          created_at: string
          custom_fields: Json
          date_of_birth: string | null
          deposit_appetite: number | null
          email: string | null
          employee_id: string
          entry_id: string | null
          exposure_elsewhere: number | null
          gender: string | null
          id: string
          language: string | null
          lead_name: string | null
          legacy: boolean
          liquid_funds: number | null
          low_potential_alerted: boolean
          monthly_income: number | null
          net_worth: number | null
          next_follow_up: string | null
          notes: string | null
          occupation: string | null
          phone: string | null
          potential: string | null
          potential_value: number | null
          preferred_contact_time: string | null
          qualified_at: string | null
          source_of_funds: string | null
          status: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          activated_count?: number
          activation_date?: string
          age?: number | null
          ai_analyzed_at?: string | null
          ai_next_action?: string | null
          ai_opportunity_label?: string | null
          ai_opportunity_reason?: string | null
          ai_opportunity_score?: number | null
          ai_risk_label?: string | null
          ai_risk_score?: number | null
          ai_suggested_potential?: number | null
          ai_summary?: string | null
          answered?: boolean
          balance?: number
          city?: string | null
          company_id?: string
          conversion_employee_id?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json
          date_of_birth?: string | null
          deposit_appetite?: number | null
          email?: string | null
          employee_id: string
          entry_id?: string | null
          exposure_elsewhere?: number | null
          gender?: string | null
          id?: string
          language?: string | null
          lead_name?: string | null
          legacy?: boolean
          liquid_funds?: number | null
          low_potential_alerted?: boolean
          monthly_income?: number | null
          net_worth?: number | null
          next_follow_up?: string | null
          notes?: string | null
          occupation?: string | null
          phone?: string | null
          potential?: string | null
          potential_value?: number | null
          preferred_contact_time?: string | null
          qualified_at?: string | null
          source_of_funds?: string | null
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          activated_count?: number
          activation_date?: string
          age?: number | null
          ai_analyzed_at?: string | null
          ai_next_action?: string | null
          ai_opportunity_label?: string | null
          ai_opportunity_reason?: string | null
          ai_opportunity_score?: number | null
          ai_risk_label?: string | null
          ai_risk_score?: number | null
          ai_suggested_potential?: number | null
          ai_summary?: string | null
          answered?: boolean
          balance?: number
          city?: string | null
          company_id?: string
          conversion_employee_id?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json
          date_of_birth?: string | null
          deposit_appetite?: number | null
          email?: string | null
          employee_id?: string
          entry_id?: string | null
          exposure_elsewhere?: number | null
          gender?: string | null
          id?: string
          language?: string | null
          lead_name?: string | null
          legacy?: boolean
          liquid_funds?: number | null
          low_potential_alerted?: boolean
          monthly_income?: number | null
          net_worth?: number | null
          next_follow_up?: string | null
          notes?: string | null
          occupation?: string | null
          phone?: string | null
          potential?: string | null
          potential_value?: number | null
          preferred_contact_time?: string | null
          qualified_at?: string | null
          source_of_funds?: string | null
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_lead_activations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_lead_activations_conversion_employee_id_fkey"
            columns: ["conversion_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_lead_activations_conversion_employee_id_fkey"
            columns: ["conversion_employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_lead_activations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_lead_activations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_lead_activations_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_lead_entries: {
        Row: {
          activated: number
          campaign: string | null
          company_id: string
          converted: number
          cost: number
          created_at: string
          created_by: string | null
          custom_fields: Json
          entry_date: string
          id: string
          invalid: number
          notes: string | null
          received: number
          reported: number
          source: string | null
          source_id: string | null
          updated_at: string
        }
        Insert: {
          activated?: number
          campaign?: string | null
          company_id?: string
          converted?: number
          cost?: number
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          entry_date?: string
          id?: string
          invalid?: number
          notes?: string | null
          received?: number
          reported?: number
          source?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          activated?: number
          campaign?: string | null
          company_id?: string
          converted?: number
          cost?: number
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          entry_date?: string
          id?: string
          invalid?: number
          notes?: string | null
          received?: number
          reported?: number
          source?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_lead_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_lead_entries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          commission_pct: number
          commission_tier1_max: number
          commission_tier1_pct: number
          commission_tier2_max: number
          commission_tier2_pct: number
          commission_tier3_pct: number
          company_id: string
          created_at: string
          custom_fields: Json
          email: string | null
          ftd_commission: number
          id: string
          name: string
          profile_id: string | null
          role: string | null
          salary: number
          std_bonus: number
          target_ftds: number | null
          target_revenue: number | null
          target_stds: number | null
          team: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          commission_pct?: number
          commission_tier1_max?: number
          commission_tier1_pct?: number
          commission_tier2_max?: number
          commission_tier2_pct?: number
          commission_tier3_pct?: number
          company_id?: string
          created_at?: string
          custom_fields?: Json
          email?: string | null
          ftd_commission?: number
          id?: string
          name: string
          profile_id?: string | null
          role?: string | null
          salary?: number
          std_bonus?: number
          target_ftds?: number | null
          target_revenue?: number | null
          target_stds?: number | null
          team?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          commission_pct?: number
          commission_tier1_max?: number
          commission_tier1_pct?: number
          commission_tier2_max?: number
          commission_tier2_pct?: number
          commission_tier3_pct?: number
          company_id?: string
          created_at?: string
          custom_fields?: Json
          email?: string | null
          ftd_commission?: number
          id?: string
          name?: string
          profile_id?: string | null
          role?: string | null
          salary?: number
          std_bonus?: number
          target_ftds?: number | null
          target_revenue?: number | null
          target_stds?: number | null
          team?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          affiliate_id: string | null
          amount: number
          category_id: string | null
          company_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          affiliate_id?: string | null
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          company_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          period_month: string
          target_metric: string
          target_value: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          period_month: string
          target_metric: string
          target_value: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          period_month?: string
          target_metric?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          expected_conversion_rate: number
          id: string
          name: string
          price: number
          pricing_model: Database["public"]["Enums"]["pricing_model"]
        }
        Insert: {
          active?: boolean
          company_id?: string
          created_at?: string
          expected_conversion_rate?: number
          id?: string
          name: string
          price?: number
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          expected_conversion_rate?: number
          id?: string
          name?: string
          price?: number
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          activated: boolean
          affiliate_id: string | null
          company_id: string
          cost: number
          created_at: string
          email: string | null
          employee_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          reported: boolean
          source_id: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          activated?: boolean
          affiliate_id?: string | null
          company_id?: string
          cost?: number
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          reported?: boolean
          source_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          activated?: boolean
          affiliate_id?: string | null
          company_id?: string
          cost?: number
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          reported?: boolean
          source_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      nav_permissions: {
        Row: {
          company_id: string
          created_at: string
          id: string
          nav_key: string
          user_id: string
        }
        Insert: {
          company_id?: string
          created_at?: string
          id?: string
          nav_key: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          nav_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nav_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          amount: number
          body: string | null
          company_id: string
          created_at: string
          id: string
          lead_activation_id: string | null
          lead_name: string | null
          read_at: string | null
          title: string
          type: string
        }
        Insert: {
          amount?: number
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lead_activation_id?: string | null
          lead_name?: string | null
          read_at?: string | null
          title: string
          type?: string
        }
        Update: {
          amount?: number
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          lead_activation_id?: string | null
          lead_name?: string | null
          read_at?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          company_id: string
          created_at: string
          employee_id: string
          generated_by: string | null
          gross_commission: number
          id: string
          month: string
          net_payable: number
          user_email: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          employee_id: string
          generated_by?: string | null
          gross_commission?: number
          id?: string
          month: string
          net_payable?: number
          user_email?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          employee_id?: string
          generated_by?: string | null
          gross_commission?: number
          id?: string
          month?: string
          net_payable?: number
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      record_comments: {
        Row: {
          body: string
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          mentions: string[]
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          body: string
          company_id?: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          mentions?: string[]
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          mentions?: string[]
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          company_id: string
          created_at: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          name: string
          next_due_date: string
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          name: string
          next_due_date?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          company_id?: string
          created_at?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          name?: string
          next_due_date?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_revenue: {
        Row: {
          active: boolean
          affiliate_id: string | null
          amount: number
          company_id: string
          created_at: string
          customer_name: string | null
          employee_id: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          method: string | null
          method_provider: string | null
          name: string
          next_due_date: string
          notes: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          affiliate_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          customer_name?: string | null
          employee_id?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          method?: string | null
          method_provider?: string | null
          name: string
          next_due_date?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          affiliate_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          customer_name?: string | null
          employee_id?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          method?: string | null
          method_provider?: string | null
          name?: string
          next_due_date?: string
          notes?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_revenue_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_revenue_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_revenue_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_revenue_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue: {
        Row: {
          activation_id: string | null
          affiliate_id: string | null
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          custom_fields: Json
          customer_name: string
          date: string
          employee_id: string | null
          employee_id_2: string | null
          id: string
          lead_id: string | null
          method: string | null
          method_provider: string | null
          notes: string | null
          reconciled_at: string | null
          reconciled_by: string | null
          split_pct: number
          updated_at: string
        }
        Insert: {
          activation_id?: string | null
          affiliate_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          customer_name: string
          date?: string
          employee_id?: string | null
          employee_id_2?: string | null
          id?: string
          lead_id?: string | null
          method?: string | null
          method_provider?: string | null
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          split_pct?: number
          updated_at?: string
        }
        Update: {
          activation_id?: string | null
          affiliate_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          customer_name?: string
          date?: string
          employee_id?: string | null
          employee_id_2?: string | null
          id?: string
          lead_id?: string | null
          method?: string | null
          method_provider?: string | null
          notes?: string | null
          reconciled_at?: string | null
          reconciled_by?: string | null
          split_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_activation_id_fkey"
            columns: ["activation_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_activations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_employee_id_2_fkey"
            columns: ["employee_id_2"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_employee_id_2_fkey"
            columns: ["employee_id_2"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          action_key: string | null
          allowed: boolean
          company_id: string
          created_at: string
          id: string
          nav_key: string | null
          role_key: string
          updated_at: string
        }
        Insert: {
          action_key?: string | null
          allowed?: boolean
          company_id: string
          created_at?: string
          id?: string
          nav_key?: string | null
          role_key: string
          updated_at?: string
        }
        Update: {
          action_key?: string | null
          allowed?: boolean
          company_id?: string
          created_at?: string
          id?: string
          nav_key?: string | null
          role_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          activation_id: string | null
          client_name: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          employee_id: string | null
          entry_id: string | null
          id: string
          notes: string | null
          priority: string
          revenue_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          activation_id?: string | null
          client_name?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          employee_id?: string | null
          entry_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          revenue_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          activation_id?: string | null
          client_name?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          employee_id?: string | null
          entry_id?: string | null
          id?: string
          notes?: string | null
          priority?: string
          revenue_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_activation_id_fkey"
            columns: ["activation_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_activations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "daily_lead_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: false
            referencedRelation: "revenue"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          action_key: string | null
          allowed: boolean
          company_id: string
          created_at: string
          id: string
          nav_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_key?: string | null
          allowed: boolean
          company_id: string
          created_at?: string
          id?: string
          nav_key?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_key?: string | null
          allowed?: boolean
          company_id?: string
          created_at?: string
          id?: string
          nav_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      withdrawals: {
        Row: {
          affiliate_id: string | null
          amount: number
          company_id: string
          created_at: string
          customer_name: string
          date: string
          employee_id: string | null
          employee_id_2: string | null
          employee_penalty: number
          id: string
          notes: string | null
          revenue_id: string | null
          split_pct: number
          updated_at: string
        }
        Insert: {
          affiliate_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          customer_name: string
          date?: string
          employee_id?: string | null
          employee_id_2?: string | null
          employee_penalty?: number
          id?: string
          notes?: string | null
          revenue_id?: string | null
          split_pct?: number
          updated_at?: string
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          company_id?: string
          created_at?: string
          customer_name?: string
          date?: string
          employee_id?: string | null
          employee_id_2?: string | null
          employee_penalty?: number
          id?: string
          notes?: string | null
          revenue_id?: string | null
          split_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_employee_id_2_fkey"
            columns: ["employee_id_2"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_employee_id_2_fkey"
            columns: ["employee_id_2"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "withdrawals_revenue_id_fkey"
            columns: ["revenue_id"]
            isOneToOne: false
            referencedRelation: "revenue"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      affiliates_directory: {
        Row: {
          active: boolean | null
          id: string | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      employees_directory: {
        Row: {
          active: boolean | null
          id: string | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activation_effective_balance: {
        Args: {
          _act: Database["public"]["Tables"]["daily_lead_activations"]["Row"]
        }
        Returns: number
      }
      activation_qualifies: {
        Args: {
          _act: Database["public"]["Tables"]["daily_lead_activations"]["Row"]
        }
        Returns: boolean
      }
      advance_due_date: {
        Args: {
          _d: string
          _f: Database["public"]["Enums"]["recurrence_frequency"]
        }
        Returns: string
      }
      affiliate_period_window: {
        Args: { _period: string; _ref: string }
        Returns: {
          period_end: string
          period_start: string
        }[]
      }
      can_do: { Args: { _action: string }; Returns: boolean }
      current_company_id: { Args: never; Returns: string }
      effective_permission: {
        Args: {
          _action_key: string
          _company_id: string
          _nav_key: string
          _user_id: string
        }
        Returns: boolean
      }
      ftd_balance_threshold: { Args: { _company_id: string }; Returns: number }
      generate_due_recurring_expenses: { Args: never; Returns: number }
      generate_due_recurring_revenue: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      list_affiliates_directory: {
        Args: never
        Returns: {
          active: boolean
          id: string
          name: string
        }[]
      }
      list_employees_directory: {
        Args: never
        Returns: {
          active: boolean
          id: string
          name: string
          team: string
        }[]
      }
      mfa_satisfied: { Args: never; Returns: boolean }
      my_permissions: {
        Args: never
        Returns: {
          action_key: string
          allowed: boolean
          nav_key: string
        }[]
      }
      recompute_affiliate_period: {
        Args: { _affiliate_id: string; _ref: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      lead_status: "new" | "contacted" | "qualified" | "activated" | "lost"
      pricing_model: "CPL" | "CPA"
      recurrence_frequency: "weekly" | "monthly" | "quarterly" | "yearly"
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
      app_role: ["admin", "user"],
      lead_status: ["new", "contacted", "qualified", "activated", "lost"],
      pricing_model: ["CPL", "CPA"],
      recurrence_frequency: ["weekly", "monthly", "quarterly", "yearly"],
    },
  },
} as const
