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
      availability: {
        Row: {
          created_at: string
          day: string
          freelancer_id: string
          id: string
        }
        Insert: {
          created_at?: string
          day: string
          freelancer_id: string
          id?: string
        }
        Update: {
          created_at?: string
          day?: string
          freelancer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          created_at: string
          currency: string
          end_date: string
          fee: number | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          id: string
          match_id: string | null
          notes: string | null
          proposed_by: string
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_id: string
          team_marked_complete: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          end_date: string
          fee?: number | null
          freelancer_id: string
          freelancer_marked_complete?: boolean
          id?: string
          match_id?: string | null
          notes?: string | null
          proposed_by: string
          request_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["engagement_status"]
          team_id: string
          team_marked_complete?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          end_date?: string
          fee?: number | null
          freelancer_id?: string
          freelancer_marked_complete?: boolean
          id?: string
          match_id?: string | null
          notes?: string | null
          proposed_by?: string
          request_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          team_id?: string
          team_marked_complete?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      freelancer_profiles: {
        Row: {
          bio: string | null
          currency: string
          day_rate: number | null
          disciplines: Database["public"]["Enums"]["discipline"][]
          headline: string | null
          location: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          skills: string[]
          travels: boolean
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          currency?: string
          day_rate?: number | null
          disciplines?: Database["public"]["Enums"]["discipline"][]
          headline?: string | null
          location?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"]
          skills?: string[]
          travels?: boolean
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          currency?: string
          day_rate?: number | null
          disciplines?: Database["public"]["Enums"]["discipline"][]
          headline?: string | null
          location?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"]
          skills?: string[]
          travels?: boolean
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "freelancer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          freelancer_id: string
          id: string
          overlap_days: number
          request_id: string
          revealed_by_freelancer: boolean
          revealed_by_team: boolean
          score: number
          team_id: string
        }
        Insert: {
          created_at?: string
          freelancer_id: string
          id?: string
          overlap_days?: number
          request_id: string
          revealed_by_freelancer?: boolean
          revealed_by_team?: boolean
          score?: number
          team_id: string
        }
        Update: {
          created_at?: string
          freelancer_id?: string
          id?: string
          overlap_days?: number
          request_id?: string
          revealed_by_freelancer?: boolean
          revealed_by_team?: boolean
          score?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notif_kind"]
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notif_kind"]
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notif_kind"]
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          preferred_language: string
          token_balance: number
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id: string
          preferred_language?: string
          token_balance?: number
          updated_at?: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          preferred_language?: string
          token_balance?: number
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          engagement_id: string
          from_user_id: string
          id: string
          stars: number
          to_user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          engagement_id: string
          from_user_id: string
          id?: string
          stars: number
          to_user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          engagement_id?: string
          from_user_id?: string
          id?: string
          stars?: number
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          end_date: string
          id: string
          is_active: boolean
          location: string | null
          notes: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          season_dates: string[] | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
          title: string
          updated_at: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          budget_unit?: string
          circuit?: string | null
          created_at?: string
          currency?: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration?: Database["public"]["Enums"]["duration_type"]
          end_date: string
          id?: string
          is_active?: boolean
          location?: string | null
          notes?: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          season_dates?: string[] | null
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          team_id: string
          title: string
          updated_at?: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          budget_unit?: string
          circuit?: string | null
          created_at?: string
          currency?: string
          discipline?: Database["public"]["Enums"]["discipline"]
          duration?: Database["public"]["Enums"]["duration_type"]
          end_date?: string
          id?: string
          is_active?: boolean
          location?: string | null
          notes?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"]
          season_dates?: string[] | null
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          team_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_profiles: {
        Row: {
          bio: string | null
          founded_year: number | null
          initials: string | null
          location: string | null
          primary_discipline: Database["public"]["Enums"]["discipline"] | null
          size: string | null
          team_name: string
          team_type: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          bio?: string | null
          founded_year?: number | null
          initials?: string | null
          location?: string | null
          primary_discipline?: Database["public"]["Enums"]["discipline"] | null
          size?: string | null
          team_name: string
          team_type?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          bio?: string | null
          founded_year?: number | null
          initials?: string | null
          location?: string | null
          primary_discipline?: Database["public"]["Enums"]["discipline"] | null
          size?: string | null
          team_name?: string
          team_type?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          note: string | null
          reason: Database["public"]["Enums"]["token_reason"]
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          note?: string | null
          reason: Database["public"]["Enums"]["token_reason"]
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["token_reason"]
          ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
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
      create_request: {
        Args: { _payload: Json }
        Returns: {
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          end_date: string
          id: string
          is_active: boolean
          location: string | null
          notes: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          season_dates: string[] | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      credit_tokens: {
        Args: {
          _delta: number
          _note?: string
          _reason: Database["public"]["Enums"]["token_reason"]
          _ref?: string
          _user_id: string
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_token_balance: { Args: never; Returns: number }
      recompute_matches: {
        Args: { _freelancer_id?: string; _request_id?: string }
        Returns: number
      }
      reveal_match: {
        Args: { _match_id: string }
        Returns: {
          new_balance: number
          revealed_freelancer: string
          revealed_team: string
        }[]
      }
      set_request_status: {
        Args: {
          _id: string
          _status: Database["public"]["Enums"]["request_status"]
        }
        Returns: {
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          end_date: string
          id: string
          is_active: boolean
          location: string | null
          notes: string | null
          role: Database["public"]["Enums"]["freelancer_role"]
          season_dates: string[] | null
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          team_id: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      discipline:
        | "f1"
        | "rally"
        | "wec_gt"
        | "karting"
        | "formula_1"
        | "formula_2"
        | "formula_3"
        | "freca"
        | "formula_regional_americas"
        | "formula_regional_japanese"
        | "formula_regional_oceania"
        | "formula_regional_middle_east"
        | "gb3_championship"
        | "euroformula_open"
        | "f4_italian"
        | "f4_british"
        | "f4_spanish"
        | "usf_pro_2000"
        | "usf2000"
        | "indycar"
        | "indy_nxt"
        | "super_formula"
        | "wec_hypercar"
        | "lmp2"
        | "gt3"
        | "gt4"
        | "dtm"
        | "tcr"
        | "wrc_rally1"
        | "rally2"
        | "rally3"
        | "rally4"
        | "rally5"
        | "rallycross"
        | "nascar_cup"
        | "nascar_xfinity"
        | "nascar_truck"
        | "supercars"
        | "sprint_cars"
        | "midget_cars"
        | "autocross"
        | "hillclimb_specials"
        | "drift_cars"
        | "trophy_trucks"
        | "dakar_rally"
      duration_type: "full_season" | "race_weekend" | "test_session"
      engagement_status: "proposed" | "confirmed" | "completed" | "cancelled"
      freelancer_role:
        | "track_engineer"
        | "mechanic"
        | "telemetrist"
        | "data_analyst"
        | "tire_specialist"
        | "chief_mechanic"
        | "other"
        | "accounting_finance"
        | "assembly_sub_assembly"
        | "composite_design_engineer"
        | "composite_staff"
        | "control_systems_engineer"
        | "design_engineer"
        | "driver_management"
        | "electric_vehicles"
        | "electronics_engineer"
        | "engine_powertrain"
        | "events"
        | "finance"
        | "hospitality_staff"
        | "inspector_quality_control"
        | "it_computer_engineer"
        | "logistics"
        | "managers"
        | "marketing"
        | "performance_engineer"
        | "procurement_buyer"
        | "production_engineer"
        | "production_manager"
        | "project_engineer"
        | "project_planner"
        | "rd_development_engineer"
        | "race_mechanics"
        | "simulation_engineer"
        | "stores_parts_coordinator"
        | "technicians"
        | "test_engineers"
        | "truck_driver"
        | "vehicle_dynamics_engineer"
      notif_kind:
        | "new_matches"
        | "revealed_by"
        | "engagement_proposed"
        | "engagement_confirmed"
        | "engagement_completed"
        | "rating_received"
        | "tokens_credited"
      request_status: "active" | "paused" | "closed" | "completed"
      token_reason:
        | "signup_bonus"
        | "purchase"
        | "reveal_spend"
        | "admin_credit"
        | "admin_debit"
        | "refund"
        | "request_post"
      user_type: "freelancer" | "team"
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
      discipline: [
        "f1",
        "rally",
        "wec_gt",
        "karting",
        "formula_1",
        "formula_2",
        "formula_3",
        "freca",
        "formula_regional_americas",
        "formula_regional_japanese",
        "formula_regional_oceania",
        "formula_regional_middle_east",
        "gb3_championship",
        "euroformula_open",
        "f4_italian",
        "f4_british",
        "f4_spanish",
        "usf_pro_2000",
        "usf2000",
        "indycar",
        "indy_nxt",
        "super_formula",
        "wec_hypercar",
        "lmp2",
        "gt3",
        "gt4",
        "dtm",
        "tcr",
        "wrc_rally1",
        "rally2",
        "rally3",
        "rally4",
        "rally5",
        "rallycross",
        "nascar_cup",
        "nascar_xfinity",
        "nascar_truck",
        "supercars",
        "sprint_cars",
        "midget_cars",
        "autocross",
        "hillclimb_specials",
        "drift_cars",
        "trophy_trucks",
        "dakar_rally",
      ],
      duration_type: ["full_season", "race_weekend", "test_session"],
      engagement_status: ["proposed", "confirmed", "completed", "cancelled"],
      freelancer_role: [
        "track_engineer",
        "mechanic",
        "telemetrist",
        "data_analyst",
        "tire_specialist",
        "chief_mechanic",
        "other",
        "accounting_finance",
        "assembly_sub_assembly",
        "composite_design_engineer",
        "composite_staff",
        "control_systems_engineer",
        "design_engineer",
        "driver_management",
        "electric_vehicles",
        "electronics_engineer",
        "engine_powertrain",
        "events",
        "finance",
        "hospitality_staff",
        "inspector_quality_control",
        "it_computer_engineer",
        "logistics",
        "managers",
        "marketing",
        "performance_engineer",
        "procurement_buyer",
        "production_engineer",
        "production_manager",
        "project_engineer",
        "project_planner",
        "rd_development_engineer",
        "race_mechanics",
        "simulation_engineer",
        "stores_parts_coordinator",
        "technicians",
        "test_engineers",
        "truck_driver",
        "vehicle_dynamics_engineer",
      ],
      notif_kind: [
        "new_matches",
        "revealed_by",
        "engagement_proposed",
        "engagement_confirmed",
        "engagement_completed",
        "rating_received",
        "tokens_credited",
      ],
      request_status: ["active", "paused", "closed", "completed"],
      token_reason: [
        "signup_bonus",
        "purchase",
        "reveal_spend",
        "admin_credit",
        "admin_debit",
        "refund",
        "request_post",
      ],
      user_type: ["freelancer", "team"],
    },
  },
} as const
