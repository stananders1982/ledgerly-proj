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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliate_events: {
        Row: {
          affiliate_id: string
          amount: number
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          status: string
        }
        Insert: {
          affiliate_id: string
          amount?: number
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          status?: string
        }
        Update: {
          affiliate_id?: string
          amount?: number
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
        ]
      }
      affiliates: {
        Row: {
          active: boolean
          cpa_rate: number
          created_at: string
          email: string | null
          guarantee_period: string
          guarantee_type: string
          guarantee_value: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cpa_rate?: number
          created_at?: string
          email?: string | null
          guarantee_period?: string
          guarantee_type?: string
          guarantee_value?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cpa_rate?: number
          created_at?: string
          email?: string | null
          guarantee_period?: string
          guarantee_type?: string
          guarantee_value?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          employee_id: string
          id: string
          notes: string | null
          present: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          employee_id: string
          id?: string
          notes?: string | null
          present?: boolean
          updated_at?: string
        }
        Update: {
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
      daily_lead_entries: {
        Row: {
          activated: number
          campaign: string | null
          converted: number
          cost: number
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
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
          converted?: number
          cost?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
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
          converted?: number
          cost?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          notes?: string | null
          received?: number
          reported?: number
          source?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          email: string | null
          id: string
          name: string
          profile_id: string | null
          role: string | null
          salary: number
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
          created_at?: string
          email?: string | null
          id?: string
          name: string
          profile_id?: string | null
          role?: string | null
          salary?: number
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
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          profile_id?: string | null
          role?: string | null
          salary?: number
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          affiliate_id: string | null
          amount: number
          category_id: string | null
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
        ]
      }
      lead_sources: {
        Row: {
          active: boolean
          created_at: string
          expected_conversion_rate: number
          id: string
          name: string
          price: number
          pricing_model: Database["public"]["Enums"]["pricing_model"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          expected_conversion_rate?: number
          id?: string
          name: string
          price?: number
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
        }
        Update: {
          active?: boolean
          created_at?: string
          expected_conversion_rate?: number
          id?: string
          name?: string
          price?: number
          pricing_model?: Database["public"]["Enums"]["pricing_model"]
        }
        Relationships: []
      }
      leads: {
        Row: {
          activated: boolean
          affiliate_id: string | null
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
          created_at: string
          id: string
          nav_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nav_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nav_key?: string
          user_id?: string
        }
        Relationships: []
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
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
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
        ]
      }
      revenue: {
        Row: {
          affiliate_id: string | null
          amount: number
          created_at: string
          created_by: string | null
          customer_name: string
          date: string
          employee_id: string | null
          employee_id_2: string | null
          id: string
          lead_id: string | null
          notes: string | null
          split_pct: number
          updated_at: string
        }
        Insert: {
          affiliate_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_name: string
          date?: string
          employee_id?: string | null
          employee_id_2?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          split_pct?: number
          updated_at?: string
        }
        Update: {
          affiliate_id?: string | null
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_name?: string
          date?: string
          employee_id?: string | null
          employee_id_2?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          split_pct?: number
          updated_at?: string
        }
        Relationships: [
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
          amount: number
          created_at: string
          customer_name: string
          date: string
          employee_id: string | null
          employee_penalty: number
          id: string
          notes: string | null
          revenue_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_name: string
          date?: string
          employee_id?: string | null
          employee_penalty?: number
          id?: string
          notes?: string | null
          revenue_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_name?: string
          date?: string
          employee_id?: string | null
          employee_penalty?: number
          id?: string
          notes?: string | null
          revenue_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
          id: string | null
          name: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      generate_due_recurring_expenses: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      mfa_satisfied: { Args: never; Returns: boolean }
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
