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
      activity_logs: {
        Row: {
          client_id: string | null
          created_at: string
          details: Json | null
          id: string
          status: string
          type: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          status: string
          type: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          device_key: string | null
          due_date: string | null
          id: string
          is_active: boolean
          mac_address: string | null
          name: string
          notes: string | null
          password: string | null
          payment_token: string | null
          payment_type: string | null
          plan_id: string | null
          price_value: number
          server_id: string | null
          suffix: string | null
          updated_at: string
          user_id: string
          username: string | null
          whatsapp_number: string | null
        }
        Insert: {
          created_at?: string
          device_key?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          mac_address?: string | null
          name: string
          notes?: string | null
          password?: string | null
          payment_token?: string | null
          payment_type?: string | null
          plan_id?: string | null
          price_value?: number
          server_id?: string | null
          suffix?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          created_at?: string
          device_key?: string | null
          due_date?: string | null
          id?: string
          is_active?: boolean
          mac_address?: string | null
          name?: string
          notes?: string | null
          password?: string | null
          payment_token?: string | null
          payment_type?: string | null
          plan_id?: string | null
          price_value?: number
          server_id?: string | null
          suffix?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      panel_credentials: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          is_active: boolean
          label: string
          password: string
          provider: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          is_active?: boolean
          label?: string
          password: string
          provider: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          is_active?: boolean
          label?: string
          password?: string
          provider?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          mp_payment_id: string | null
          mp_status: string | null
          payment_method: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_status?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_status?: string | null
          payment_method?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          duration_months: number
          id: string
          is_club_plan: boolean | null
          is_koffice_plan: boolean | null
          is_live21_plan: boolean | null
          is_painelfoda_plan: boolean | null
          is_rush_plan: boolean | null
          is_sigma_plan: boolean | null
          is_uniplay_plan: boolean | null
          is_unitv_plan: boolean | null
          koffice_domain: string | null
          name: string
          num_screens: number
          package_id: string | null
          painelfoda_domain: string | null
          painelfoda_package_id: string | null
          painelfoda_password: string | null
          painelfoda_username: string | null
          panel_credential_id: string | null
          rush_type: string | null
          sigma_domain: string | null
          sigma_plan_code: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_months?: number
          id?: string
          is_club_plan?: boolean | null
          is_koffice_plan?: boolean | null
          is_live21_plan?: boolean | null
          is_painelfoda_plan?: boolean | null
          is_rush_plan?: boolean | null
          is_sigma_plan?: boolean | null
          is_uniplay_plan?: boolean | null
          is_unitv_plan?: boolean | null
          koffice_domain?: string | null
          name: string
          num_screens?: number
          package_id?: string | null
          painelfoda_domain?: string | null
          painelfoda_package_id?: string | null
          painelfoda_password?: string | null
          painelfoda_username?: string | null
          panel_credential_id?: string | null
          rush_type?: string | null
          sigma_domain?: string | null
          sigma_plan_code?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_months?: number
          id?: string
          is_club_plan?: boolean | null
          is_koffice_plan?: boolean | null
          is_live21_plan?: boolean | null
          is_painelfoda_plan?: boolean | null
          is_rush_plan?: boolean | null
          is_sigma_plan?: boolean | null
          is_uniplay_plan?: boolean | null
          is_unitv_plan?: boolean | null
          koffice_domain?: string | null
          name?: string
          num_screens?: number
          package_id?: string | null
          painelfoda_domain?: string | null
          painelfoda_package_id?: string | null
          painelfoda_password?: string | null
          painelfoda_username?: string | null
          panel_credential_id?: string | null
          rush_type?: string | null
          sigma_domain?: string | null
          sigma_plan_code?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_panel_credential_id_fkey"
            columns: ["panel_credential_id"]
            isOneToOne: false
            referencedRelation: "panel_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          mp_payment_id: string | null
          mp_status: string | null
          platform_plan_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_status?: string | null
          platform_plan_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_status?: string | null
          platform_plan_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payments_platform_plan_id_fkey"
            columns: ["platform_plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_plans: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number
          id: string
          is_active: boolean
          max_clients: number
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          max_clients?: number
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number
          id?: string
          is_active?: boolean
          max_clients?: number
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          max_clients: number
          max_instances: number
          mercadopago_access_token: string | null
          messages_per_minute: number
          name: string
          phone: string | null
          pix_key: string | null
          subscription_end: string | null
          subscription_start: string | null
          updated_at: string
          user_id: string
          wuzapi_token: string | null
          wuzapi_url: string | null
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          max_clients?: number
          max_instances?: number
          mercadopago_access_token?: string | null
          messages_per_minute?: number
          name?: string
          phone?: string | null
          pix_key?: string | null
          subscription_end?: string | null
          subscription_start?: string | null
          updated_at?: string
          user_id: string
          wuzapi_token?: string | null
          wuzapi_url?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          max_clients?: number
          max_instances?: number
          mercadopago_access_token?: string | null
          messages_per_minute?: number
          name?: string
          phone?: string | null
          pix_key?: string | null
          subscription_end?: string | null
          subscription_start?: string | null
          updated_at?: string
          user_id?: string
          wuzapi_token?: string | null
          wuzapi_url?: string | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          days_offset: number
          id: string
          is_active: boolean
          last_sent_date: string | null
          name: string
          send_time: string
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_offset?: number
          id?: string
          is_active?: boolean
          last_sent_date?: string | null
          name: string
          send_time?: string
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_offset?: number
          id?: string
          is_active?: boolean
          last_sent_date?: string | null
          name?: string
          send_time?: string
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_retry_queue: {
        Row: {
          attempt: number
          client_id: string
          created_at: string
          id: string
          last_error: string | null
          max_attempts: number
          next_retry_at: string
          payload: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt?: number
          client_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at: string
          payload: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt?: number
          client_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_retry_at?: string
          payload?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_retry_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      servers: {
        Row: {
          cost_per_screen: number
          created_at: string
          id: string
          multiply_by_screens: boolean
          name: string
          user_id: string
        }
        Insert: {
          cost_per_screen?: number
          created_at?: string
          id?: string
          multiply_by_screens?: boolean
          name: string
          user_id: string
        }
        Update: {
          cost_per_screen?: number
          created_at?: string
          id?: string
          multiply_by_screens?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    },
  },
} as const
