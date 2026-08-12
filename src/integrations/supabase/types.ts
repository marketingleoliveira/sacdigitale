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
      complaint_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_communications: {
        Row: {
          attachments: Json | null
          bcc_email: string | null
          body: string
          created_at: string
          direction: string
          email_body: string | null
          error_message: string | null
          from_email: string
          id: string
          raw_payload: Json | null
          read_at: string | null
          resend_id: string | null
          sac_request_id: string | null
          sent_by: string | null
          sent_by_email: string | null
          status: string
          subject: string | null
          to_email: string
        }
        Insert: {
          attachments?: Json | null
          bcc_email?: string | null
          body: string
          created_at?: string
          direction: string
          email_body?: string | null
          error_message?: string | null
          from_email: string
          id?: string
          raw_payload?: Json | null
          read_at?: string | null
          resend_id?: string | null
          sac_request_id?: string | null
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
          subject?: string | null
          to_email: string
        }
        Update: {
          attachments?: Json | null
          bcc_email?: string | null
          body?: string
          created_at?: string
          direction?: string
          email_body?: string | null
          error_message?: string | null
          from_email?: string
          id?: string
          raw_payload?: Json | null
          read_at?: string | null
          resend_id?: string | null
          sac_request_id?: string | null
          sent_by?: string | null
          sent_by_email?: string | null
          status?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_communications_sac_request_id_fkey"
            columns: ["sac_request_id"]
            isOneToOne: false
            referencedRelation: "sac_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          bcc_email: string
          bcc_enabled: boolean
          created_at: string
          emails_enabled: boolean
          id: string
          internal_notification_emails: string | null
          internal_notifications_enabled: boolean | null
          self_copy_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bcc_email?: string
          bcc_enabled?: boolean
          created_at?: string
          emails_enabled?: boolean
          id?: string
          internal_notification_emails?: string | null
          internal_notifications_enabled?: boolean | null
          self_copy_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bcc_email?: string
          bcc_enabled?: boolean
          created_at?: string
          emails_enabled?: boolean
          id?: string
          internal_notification_emails?: string | null
          internal_notifications_enabled?: boolean | null
          self_copy_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      internal_ticket_logs: {
        Row: {
          created_at: string | null
          email_body: string | null
          error_message: string | null
          id: string
          recipient_email: string
          status: string
          subject: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string | null
          email_body?: string | null
          error_message?: string | null
          id?: string
          recipient_email: string
          status: string
          subject?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string | null
          email_body?: string | null
          error_message?: string | null
          id?: string
          recipient_email?: string
          status?: string
          subject?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_ticket_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_edit_logs: {
        Row: {
          created_at: string | null
          edited_by: string | null
          edited_by_email: string | null
          field_edited: string | null
          id: string
          new_value: string | null
          old_value: string | null
          sac_request_id: string | null
        }
        Insert: {
          created_at?: string | null
          edited_by?: string | null
          edited_by_email?: string | null
          field_edited?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          sac_request_id?: string | null
        }
        Update: {
          created_at?: string | null
          edited_by?: string | null
          edited_by_email?: string | null
          field_edited?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          sac_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sac_edit_logs_sac_request_id_fkey"
            columns: ["sac_request_id"]
            isOneToOne: false
            referencedRelation: "sac_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sac_requests: {
        Row: {
          attachments: string[] | null
          complaint_type: string | null
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string
          email: string
          id: string
          laudos: string[] | null
          message: string
          name: string
          order_number: string | null
          phone: string | null
          procedencia: string | null
          protocol: string
          status: string
          subject: string | null
        }
        Insert: {
          attachments?: string[] | null
          complaint_type?: string | null
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          email: string
          id?: string
          laudos?: string[] | null
          message: string
          name: string
          order_number?: string | null
          phone?: string | null
          procedencia?: string | null
          protocol: string
          status?: string
          subject?: string | null
        }
        Update: {
          attachments?: string[] | null
          complaint_type?: string | null
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          email?: string
          id?: string
          laudos?: string[] | null
          message?: string
          name?: string
          order_number?: string | null
          phone?: string | null
          procedencia?: string | null
          protocol?: string
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      sac_updates: {
        Row: {
          author_email: string | null
          created_at: string | null
          created_by: string | null
          id: string
          message: string
          sac_request_id: string
        }
        Insert: {
          author_email?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          message: string
          sac_request_id: string
        }
        Update: {
          author_email?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string
          sac_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sac_updates_sac_request_id_fkey"
            columns: ["sac_request_id"]
            isOneToOne: false
            referencedRelation: "sac_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          author_email: string | null
          author_name: string | null
          created_at: string
          created_by: string
          id: string
          is_internal: boolean
          message: string
          sac_request_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          author_email?: string | null
          author_name?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_internal?: boolean
          message: string
          sac_request_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          author_email?: string | null
          author_name?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_internal?: boolean
          message?: string
          sac_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sac_request_id_fkey"
            columns: ["sac_request_id"]
            isOneToOne: false
            referencedRelation: "sac_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
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
      can_manage_users: { Args: { _user_id: string }; Returns: boolean }
      has_external_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "desenvolvedor"
        | "qualidade"
        | "gerencia"
        | "vendas"
      contact_type: "reclamacao" | "sugestao" | "elogio" | "duvida"
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
      app_role: [
        "admin",
        "user",
        "desenvolvedor",
        "qualidade",
        "gerencia",
        "vendas",
      ],
      contact_type: ["reclamacao", "sugestao", "elogio", "duvida"],
    },
  },
} as const
