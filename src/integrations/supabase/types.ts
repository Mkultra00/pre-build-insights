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
      facts: {
        Row: {
          category: string | null
          claim: string
          confidence: number
          created_at: string
          distance_m: number | null
          event_date: string | null
          geo_precision: string
          id: string
          is_folklore: boolean
          lat: number | null
          lon: number | null
          origin: string
          payload: Json
          place_name: string | null
          ref: string
          report_id: string
          retrieved_at: string
          section: string
          source_name: string | null
          source_url: string | null
          status: string
        }
        Insert: {
          category?: string | null
          claim: string
          confidence?: number
          created_at?: string
          distance_m?: number | null
          event_date?: string | null
          geo_precision?: string
          id?: string
          is_folklore?: boolean
          lat?: number | null
          lon?: number | null
          origin?: string
          payload?: Json
          place_name?: string | null
          ref: string
          report_id: string
          retrieved_at?: string
          section: string
          source_name?: string | null
          source_url?: string | null
          status?: string
        }
        Update: {
          category?: string | null
          claim?: string
          confidence?: number
          created_at?: string
          distance_m?: number | null
          event_date?: string | null
          geo_precision?: string
          id?: string
          is_folklore?: boolean
          lat?: number | null
          lon?: number | null
          origin?: string
          payload?: Json
          place_name?: string | null
          ref?: string
          report_id?: string
          retrieved_at?: string
          section?: string
          source_name?: string | null
          source_url?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "facts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_tasks: {
        Row: {
          attempts: number
          finished_at: string | null
          id: number
          log: Json
          report_id: string
          run_after: string
          stage: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          finished_at?: string | null
          id?: number
          log?: Json
          report_id: string
          run_after?: string
          stage: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          finished_at?: string | null
          id?: number
          log?: Json
          report_id?: string
          run_after?: string
          stage?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_tasks_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          address_hash: string
          address_norm: string | null
          address_raw: string
          bbl: string | null
          borough: string | null
          city: string
          created_at: string
          error: string | null
          generated_at: string | null
          id: string
          lat: number | null
          lon: number | null
          neighborhood: string | null
          partial: boolean
          progress: number
          radius_m: number
          schema_version: string
          sections: Json
          slug: string
          stage: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address_hash: string
          address_norm?: string | null
          address_raw: string
          bbl?: string | null
          borough?: string | null
          city?: string
          created_at?: string
          error?: string | null
          generated_at?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          neighborhood?: string | null
          partial?: boolean
          progress?: number
          radius_m?: number
          schema_version?: string
          sections?: Json
          slug: string
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address_hash?: string
          address_norm?: string | null
          address_raw?: string
          bbl?: string | null
          borough?: string | null
          city?: string
          created_at?: string
          error?: string | null
          generated_at?: string | null
          id?: string
          lat?: number | null
          lon?: number | null
          neighborhood?: string | null
          partial?: boolean
          progress?: number
          radius_m?: number
          schema_version?: string
          sections?: Json
          slug?: string
          stage?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_cache: {
        Row: {
          expires_at: string | null
          fetched_at: string
          key: string
          payload: Json
          source: string
        }
        Insert: {
          expires_at?: string | null
          fetched_at?: string
          key: string
          payload: Json
          source: string
        }
        Update: {
          expires_at?: string | null
          fetched_at?: string
          key?: string
          payload?: Json
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
