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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json
          id: string
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      admin_emails: {
        Row: {
          created_at: string
          email: string
        }
        Insert: {
          created_at?: string
          email: string
        }
        Update: {
          created_at?: string
          email?: string
        }
        Relationships: []
      }
      admin_env_state: {
        Row: {
          admin_id: string
          is_test: boolean
          updated_at: string
        }
        Insert: {
          admin_id: string
          is_test?: boolean
          updated_at?: string
        }
        Update: {
          admin_id?: string
          is_test?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      admin_time_settings: {
        Row: {
          id: boolean
          offset_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          offset_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          offset_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          created_at: string
          day: string
          freelancer_id: string
          id: string
          is_test: boolean
        }
        Insert: {
          created_at?: string
          day: string
          freelancer_id: string
          id?: string
          is_test?: boolean
        }
        Update: {
          created_at?: string
          day?: string
          freelancer_id?: string
          id?: string
          is_test?: boolean
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
      availability_opportunity_state: {
        Row: {
          created_at: string
          freelancer_id: string
          is_test: boolean
          notified_at: string | null
          reason: string
          request_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          freelancer_id: string
          is_test?: boolean
          notified_at?: string | null
          reason?: string
          request_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          freelancer_id?: string
          is_test?: boolean
          notified_at?: string | null
          reason?: string
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_opportunity_state_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_opportunity_state_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_recompute_queue: {
        Row: {
          attempts: number
          created_at: string
          due_at: string
          freelancer_id: string
          is_test: boolean
          last_error: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          due_at: string
          freelancer_id: string
          is_test?: boolean
          last_error?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          due_at?: string
          freelancer_id?: string
          is_test?: boolean
          last_error?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_recompute_queue_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_day_notes: {
        Row: {
          busy: boolean
          created_at: string
          day: string
          freelancer_id: string
          id: string
          is_test: boolean
          note: string
          updated_at: string
        }
        Insert: {
          busy?: boolean
          created_at?: string
          day: string
          freelancer_id: string
          id?: string
          is_test?: boolean
          note: string
          updated_at?: string
        }
        Update: {
          busy?: boolean
          created_at?: string
          day?: string
          freelancer_id?: string
          id?: string
          is_test?: boolean
          note?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_day_notes_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_log: {
        Row: {
          category: string
          code: string | null
          created_at: string
          id: string
          is_test: boolean
          reference_id: string
          route_pattern: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          category: string
          code?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          reference_id: string
          route_pattern?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          code?: string | null
          created_at?: string
          id?: string
          is_test?: boolean
          reference_id?: string
          route_pattern?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_hook_config: {
        Row: {
          endpoint: string
          id: boolean
          secret: string
        }
        Insert: {
          endpoint: string
          id?: boolean
          secret: string
        }
        Update: {
          endpoint?: string
          id?: boolean
          secret?: string
        }
        Relationships: []
      }
      engagements: {
        Row: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        Insert: {
          cancellation_kind?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          contact_check_sent_at?: string | null
          covered_days?: string[] | null
          created_at?: string
          currency?: string
          declined_at?: string | null
          end_date: string
          expired_at?: string | null
          expires_at?: string | null
          extension_count?: number
          fee?: number | null
          freelancer_contacted?: boolean | null
          freelancer_contacted_at?: string | null
          freelancer_id: string
          freelancer_marked_complete?: boolean
          ghosting_released_at?: string | null
          id?: string
          is_test?: boolean
          match_id?: string | null
          no_show?: boolean
          notes?: string | null
          proposed_by: string
          reminder_12_sent_at?: string | null
          reminder_24_sent_at?: string | null
          request_id?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact?: boolean | null
          team_confirmed_contact_at?: string | null
          team_id: string
          team_marked_complete?: boolean
          team_reminder1_sent_at?: string | null
          team_reminder2_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          cancellation_kind?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          confirmed_at?: string | null
          contact_check_sent_at?: string | null
          covered_days?: string[] | null
          created_at?: string
          currency?: string
          declined_at?: string | null
          end_date?: string
          expired_at?: string | null
          expires_at?: string | null
          extension_count?: number
          fee?: number | null
          freelancer_contacted?: boolean | null
          freelancer_contacted_at?: string | null
          freelancer_id?: string
          freelancer_marked_complete?: boolean
          ghosting_released_at?: string | null
          id?: string
          is_test?: boolean
          match_id?: string | null
          no_show?: boolean
          notes?: string | null
          proposed_by?: string
          reminder_12_sent_at?: string | null
          reminder_24_sent_at?: string | null
          request_id?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact?: boolean | null
          team_confirmed_contact_at?: string | null
          team_id?: string
          team_marked_complete?: boolean
          team_reminder1_sent_at?: string | null
          team_reminder2_sent_at?: string | null
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
      freelancer_contacts: {
        Row: {
          created_at: string
          phone_dial_code: string | null
          phone_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          phone_dial_code?: string | null
          phone_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          phone_dial_code?: string | null
          phone_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      freelancer_profiles: {
        Row: {
          bio: string | null
          calendar_last_confirmed_at: string | null
          calendar_last_updated_at: string
          currency: string
          day_rate: number | null
          disciplines: Database["public"]["Enums"]["discipline"][]
          education: string | null
          experiences: Json
          headline: string | null
          is_test: boolean
          languages: Json
          location: string | null
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_region: string | null
          mute_availability_opportunities: boolean
          pit_code: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          skills: string[]
          sub_roles: Json
          travels: boolean
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          calendar_last_confirmed_at?: string | null
          calendar_last_updated_at?: string
          currency?: string
          day_rate?: number | null
          disciplines?: Database["public"]["Enums"]["discipline"][]
          education?: string | null
          experiences?: Json
          headline?: string | null
          is_test?: boolean
          languages?: Json
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_region?: string | null
          mute_availability_opportunities?: boolean
          pit_code?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"] | null
          role_group?: string | null
          skills?: string[]
          sub_roles?: Json
          travels?: boolean
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          calendar_last_confirmed_at?: string | null
          calendar_last_updated_at?: string
          currency?: string
          day_rate?: number | null
          disciplines?: Database["public"]["Enums"]["discipline"][]
          education?: string | null
          experiences?: Json
          headline?: string | null
          is_test?: boolean
          languages?: Json
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_region?: string | null
          mute_availability_opportunities?: boolean
          pit_code?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"] | null
          role_group?: string | null
          skills?: string[]
          sub_roles?: Json
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
      hot_partial_state: {
        Row: {
          created_at: string
          freelancer_id: string
          is_test: boolean
          missing_days_count: number
          missing_fingerprint: string
          notified_at: string | null
          request_id: string
          resolved_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          freelancer_id: string
          is_test?: boolean
          missing_days_count?: number
          missing_fingerprint?: string
          notified_at?: string | null
          request_id: string
          resolved_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          freelancer_id?: string
          is_test?: boolean
          missing_days_count?: number
          missing_fingerprint?: string
          notified_at?: string | null
          request_id?: string
          resolved_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hot_partial_state_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hot_partial_state_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          doc_type: string
          id: string
          is_test: boolean
          source: string
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          doc_type: string
          id?: string
          is_test?: boolean
          source: string
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          doc_type?: string
          id?: string
          is_test?: boolean
          source?: string
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_history: {
        Row: {
          best_score: number
          created_at: string
          first_matched_at: string
          freelancer_id: string
          id: string
          is_test: boolean
          request_id: string
          team_id: string
        }
        Insert: {
          best_score?: number
          created_at?: string
          first_matched_at?: string
          freelancer_id: string
          id?: string
          is_test?: boolean
          request_id: string
          team_id: string
        }
        Update: {
          best_score?: number
          created_at?: string
          first_matched_at?: string
          freelancer_id?: string
          id?: string
          is_test?: boolean
          request_id?: string
          team_id?: string
        }
        Relationships: []
      }
      match_unlocks: {
        Row: {
          free_preview: boolean
          freelancer_id: string
          id: string
          match_id: string
          request_id: string
          team_id: string
          unlocked_at: string
        }
        Insert: {
          free_preview?: boolean
          freelancer_id: string
          id?: string
          match_id: string
          request_id: string
          team_id: string
          unlocked_at?: string
        }
        Update: {
          free_preview?: boolean
          freelancer_id?: string
          id?: string
          match_id?: string
          request_id?: string
          team_id?: string
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_unlocks_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_unlocks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          created_at: string
          edge_only: boolean
          final_score: number
          freelancer_id: string
          id: string
          is_partial: boolean
          is_perfect: boolean
          is_test: boolean
          match_score: number
          missing_criteria: Json
          missing_days: number
          missing_pct: number
          overlap_days: number
          request_id: string
          revealed_by_freelancer: boolean
          revealed_by_team: boolean
          score: number
          skills_score: number
          stale: boolean
          team_id: string
        }
        Insert: {
          created_at?: string
          edge_only?: boolean
          final_score?: number
          freelancer_id: string
          id?: string
          is_partial?: boolean
          is_perfect?: boolean
          is_test?: boolean
          match_score?: number
          missing_criteria?: Json
          missing_days?: number
          missing_pct?: number
          overlap_days?: number
          request_id: string
          revealed_by_freelancer?: boolean
          revealed_by_team?: boolean
          score?: number
          skills_score?: number
          stale?: boolean
          team_id: string
        }
        Update: {
          created_at?: string
          edge_only?: boolean
          final_score?: number
          freelancer_id?: string
          id?: string
          is_partial?: boolean
          is_perfect?: boolean
          is_test?: boolean
          match_score?: number
          missing_criteria?: Json
          missing_days?: number
          missing_pct?: number
          overlap_days?: number
          request_id?: string
          revealed_by_freelancer?: boolean
          revealed_by_team?: boolean
          score?: number
          skills_score?: number
          stale?: boolean
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
      matching_weights: {
        Row: {
          calendar_freshness_weight: number
          day_rate_weight: number
          disciplines_weight: number
          education_weight: number
          id: boolean
          languages_weight: number
          level_exact_pct: number
          level_one_below_pct: number
          level_two_below_pct: number
          location_weight: number
          role_weight: number
          skills_weight: number
          sub_role_weight: number
          updated_at: string
        }
        Insert: {
          calendar_freshness_weight?: number
          day_rate_weight?: number
          disciplines_weight?: number
          education_weight?: number
          id?: boolean
          languages_weight?: number
          level_exact_pct?: number
          level_one_below_pct?: number
          level_two_below_pct?: number
          location_weight?: number
          role_weight?: number
          skills_weight?: number
          sub_role_weight?: number
          updated_at?: string
        }
        Update: {
          calendar_freshness_weight?: number
          day_rate_weight?: number
          disciplines_weight?: number
          education_weight?: number
          id?: boolean
          languages_weight?: number
          level_exact_pct?: number
          level_one_below_pct?: number
          level_two_below_pct?: number
          location_weight?: number
          role_weight?: number
          skills_weight?: number
          sub_role_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          emailed_at: string | null
          id: string
          is_test: boolean
          kind: Database["public"]["Enums"]["notif_kind"]
          payload: Json
          pushed_at: string | null
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          emailed_at?: string | null
          id?: string
          is_test?: boolean
          kind: Database["public"]["Enums"]["notif_kind"]
          payload?: Json
          pushed_at?: string | null
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          emailed_at?: string | null
          id?: string
          is_test?: boolean
          kind?: Database["public"]["Enums"]["notif_kind"]
          payload?: Json
          pushed_at?: string | null
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
      platform_capacity_state: {
        Row: {
          id: boolean
          last_checked_at: string | null
          last_level: string
          last_notified_at: string | null
          last_notified_level: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          last_checked_at?: string | null
          last_level?: string
          last_notified_at?: string | null
          last_notified_level?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          last_checked_at?: string | null
          last_level?: string
          last_notified_at?: string | null
          last_notified_level?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          category: string
          description: string | null
          key: string
          label: string
          sort_order: number
          unit: string
          updated_at: string
          updated_by: string | null
          value_num: number
        }
        Insert: {
          category?: string
          description?: string | null
          key: string
          label: string
          sort_order?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
          value_num: number
        }
        Update: {
          category?: string
          description?: string | null
          key?: string
          label?: string
          sort_order?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
          value_num?: number
        }
        Relationships: []
      }
      pool_search_unlocks: {
        Row: {
          id: string
          request_id: string
          team_id: string
          tokens_spent: number
          unlocked_at: string
        }
        Insert: {
          id?: string
          request_id: string
          team_id: string
          tokens_spent?: number
          unlocked_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          team_id?: string
          tokens_spent?: number
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_search_unlocks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_search_unlocks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          blocked_at: string | null
          created_at: string
          display_name: string
          first_name: string | null
          id: string
          is_test: boolean
          last_name: string | null
          legal_version: string | null
          preferred_language: string
          privacy_accepted_at: string | null
          terms_accepted_at: string | null
          token_balance: number
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_url?: string | null
          blocked_at?: string | null
          created_at?: string
          display_name: string
          first_name?: string | null
          id: string
          is_test?: boolean
          last_name?: string | null
          legal_version?: string | null
          preferred_language?: string
          privacy_accepted_at?: string | null
          terms_accepted_at?: string | null
          token_balance?: number
          updated_at?: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_url?: string | null
          blocked_at?: string | null
          created_at?: string
          display_name?: string
          first_name?: string | null
          id?: string
          is_test?: boolean
          last_name?: string | null
          legal_version?: string | null
          preferred_language?: string
          privacy_accepted_at?: string | null
          terms_accepted_at?: string | null
          token_balance?: number
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          attempts: number
          created_at: string
          id: string
          is_test: boolean
          last_attempt_at: string | null
          last_error: string | null
          notification_id: string
          status: string
          subscription_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          is_test?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          notification_id: string
          status?: string
          subscription_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          is_test?: boolean
          last_attempt_at?: string | null
          last_error?: string | null
          notification_id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          is_test: boolean
          last_seen_at: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          is_test?: boolean
          last_seen_at?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_test?: boolean
          last_seen_at?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_flags: {
        Row: {
          created_at: string
          id: string
          rating_id: string
          reason: string
          reported_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating_id: string
          reason: string
          reported_by: string
        }
        Update: {
          created_at?: string
          id?: string
          rating_id?: string
          reason?: string
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_flags_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "ratings"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          auto_suspicious: boolean
          comment: string | null
          created_at: string
          engagement_id: string
          flag_reason: string | null
          flagged_at: string | null
          flagged_by: string | null
          from_user_id: string
          id: string
          is_test: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: Database["public"]["Enums"]["rating_moderation_status"]
          notified_at: string | null
          overall: number | null
          stars: number
          sub_scores: Json
          to_user_id: string
          token_bonus_awarded: boolean
          unlocked_at: string | null
        }
        Insert: {
          auto_suspicious?: boolean
          comment?: string | null
          created_at?: string
          engagement_id: string
          flag_reason?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          from_user_id: string
          id?: string
          is_test?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: Database["public"]["Enums"]["rating_moderation_status"]
          notified_at?: string | null
          overall?: number | null
          stars: number
          sub_scores?: Json
          to_user_id: string
          token_bonus_awarded?: boolean
          unlocked_at?: string | null
        }
        Update: {
          auto_suspicious?: boolean
          comment?: string | null
          created_at?: string
          engagement_id?: string
          flag_reason?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          from_user_id?: string
          id?: string
          is_test?: boolean
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_status?: Database["public"]["Enums"]["rating_moderation_status"]
          notified_at?: string | null
          overall?: number | null
          stars?: number
          sub_scores?: Json
          to_user_id?: string
          token_bonus_awarded?: boolean
          unlocked_at?: string | null
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
      request_recheck_ledger: {
        Row: {
          created_at: string
          id: string
          is_test: boolean
          kind: string
          request_id: string | null
          team_id: string
          units: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_test?: boolean
          kind: string
          request_id?: string | null
          team_id: string
          units?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_test?: boolean
          kind?: string
          request_id?: string | null
          team_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_recheck_ledger_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_recheck_ledger_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_team_reveals: {
        Row: {
          created_at: string
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_team_reveals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_tier_unlocks: {
        Row: {
          id: string
          request_id: string
          scope: string
          team_id: string
          tier: number
          tokens_spent: number
          unlocked_at: string
        }
        Insert: {
          id?: string
          request_id: string
          scope?: string
          team_id: string
          tier: number
          tokens_spent?: number
          unlocked_at?: string
        }
        Update: {
          id?: string
          request_id?: string
          scope?: string
          team_id?: string
          tier?: number
          tokens_spent?: number
          unlocked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_tier_unlocks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          activated_at: string | null
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          education: string[]
          end_date: string
          ever_full_matched: boolean
          ever_partial_matched: boolean
          ever_relevant_match: boolean
          experience_requirements: Json
          id: string
          initial_match_potential: string | null
          is_active: boolean
          is_test: boolean
          languages: Json
          last_modified_at: string | null
          location: string | null
          location_anchor: string
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_radius_km: number | null
          location_region: string | null
          location_relevance: string
          match_potential_current: string | null
          modify_count: number
          notes: string | null
          partial_refund_taken: boolean
          red_cancel_tokens: number | null
          red_cancelled_at: string | null
          refund_kind: string | null
          refund_pct: number | null
          refund_tokens: number | null
          review_deadline_at: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          role_hard: boolean
          search_mode: string | null
          season_dates: string[] | null
          skills: string[]
          skills_hard: string[]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          sub_role: string | null
          sub_role_hard: boolean
          sub_role_min_level: string
          team_id: string
          title: string
          travel_required: boolean
          updated_at: string
          was_pool_request: boolean
        }
        Insert: {
          activated_at?: string | null
          budget_max?: number | null
          budget_min?: number | null
          budget_unit?: string
          circuit?: string | null
          created_at?: string
          currency?: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration?: Database["public"]["Enums"]["duration_type"]
          education?: string[]
          end_date: string
          ever_full_matched?: boolean
          ever_partial_matched?: boolean
          ever_relevant_match?: boolean
          experience_requirements?: Json
          id?: string
          initial_match_potential?: string | null
          is_active?: boolean
          is_test?: boolean
          languages?: Json
          last_modified_at?: string | null
          location?: string | null
          location_anchor?: string
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_radius_km?: number | null
          location_region?: string | null
          location_relevance?: string
          match_potential_current?: string | null
          modify_count?: number
          notes?: string | null
          partial_refund_taken?: boolean
          red_cancel_tokens?: number | null
          red_cancelled_at?: string | null
          refund_kind?: string | null
          refund_pct?: number | null
          refund_tokens?: number | null
          review_deadline_at?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"] | null
          role_group?: string | null
          role_hard?: boolean
          search_mode?: string | null
          season_dates?: string[] | null
          skills?: string[]
          skills_hard?: string[]
          start_date: string
          status?: Database["public"]["Enums"]["request_status"]
          sub_role?: string | null
          sub_role_hard?: boolean
          sub_role_min_level?: string
          team_id: string
          title: string
          travel_required?: boolean
          updated_at?: string
          was_pool_request?: boolean
        }
        Update: {
          activated_at?: string | null
          budget_max?: number | null
          budget_min?: number | null
          budget_unit?: string
          circuit?: string | null
          created_at?: string
          currency?: string
          discipline?: Database["public"]["Enums"]["discipline"]
          duration?: Database["public"]["Enums"]["duration_type"]
          education?: string[]
          end_date?: string
          ever_full_matched?: boolean
          ever_partial_matched?: boolean
          ever_relevant_match?: boolean
          experience_requirements?: Json
          id?: string
          initial_match_potential?: string | null
          is_active?: boolean
          is_test?: boolean
          languages?: Json
          last_modified_at?: string | null
          location?: string | null
          location_anchor?: string
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_radius_km?: number | null
          location_region?: string | null
          location_relevance?: string
          match_potential_current?: string | null
          modify_count?: number
          notes?: string | null
          partial_refund_taken?: boolean
          red_cancel_tokens?: number | null
          red_cancelled_at?: string | null
          refund_kind?: string | null
          refund_pct?: number | null
          refund_tokens?: number | null
          review_deadline_at?: string | null
          role?: Database["public"]["Enums"]["freelancer_role"] | null
          role_group?: string | null
          role_hard?: boolean
          search_mode?: string | null
          season_dates?: string[] | null
          skills?: string[]
          skills_hard?: string[]
          start_date?: string
          status?: Database["public"]["Enums"]["request_status"]
          sub_role?: string | null
          sub_role_hard?: boolean
          sub_role_min_level?: string
          team_id?: string
          title?: string
          travel_required?: boolean
          updated_at?: string
          was_pool_request?: boolean
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
      review_unlocks: {
        Row: {
          created_at: string
          id: string
          target_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          target_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
      sos_call_targets: {
        Row: {
          distance_km: number | null
          freelancer_id: string
          id: string
          match_id: string | null
          notified_at: string
          skills_score: number
          sos_id: string
        }
        Insert: {
          distance_km?: number | null
          freelancer_id: string
          id?: string
          match_id?: string | null
          notified_at?: string
          skills_score: number
          sos_id: string
        }
        Update: {
          distance_km?: number | null
          freelancer_id?: string
          id?: string
          match_id?: string | null
          notified_at?: string
          skills_score?: number
          sos_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_call_targets_sos_id_fkey"
            columns: ["sos_id"]
            isOneToOne: false
            referencedRelation: "sos_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      sos_calls: {
        Row: {
          auto_triggered: boolean
          id: string
          is_test: boolean
          min_pct: number
          radius_km: number | null
          request_id: string
          resolved_at: string | null
          resolved_engagement_id: string | null
          target_count: number
          team_id: string
          triggered_at: string
          triggered_by: string
        }
        Insert: {
          auto_triggered?: boolean
          id?: string
          is_test?: boolean
          min_pct: number
          radius_km?: number | null
          request_id: string
          resolved_at?: string | null
          resolved_engagement_id?: string | null
          target_count?: number
          team_id: string
          triggered_at?: string
          triggered_by: string
        }
        Update: {
          auto_triggered?: boolean
          id?: string
          is_test?: boolean
          min_pct?: number
          radius_km?: number | null
          request_id?: string
          resolved_at?: string | null
          resolved_engagement_id?: string | null
          target_count?: number
          team_id?: string
          triggered_at?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "sos_calls_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sos_calls_resolved_engagement_id_fkey"
            columns: ["resolved_engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      team_match_notification_state: {
        Row: {
          activity_pending: boolean
          created_at: string
          first_full_notified: boolean
          first_match_notified: boolean
          is_test: boolean
          last_activity_notified_at: string
          match_fingerprint: string
          request_id: string
          strong_reached_notified: boolean
          team_id: string
          updated_at: string
        }
        Insert: {
          activity_pending?: boolean
          created_at?: string
          first_full_notified?: boolean
          first_match_notified?: boolean
          is_test?: boolean
          last_activity_notified_at?: string
          match_fingerprint?: string
          request_id: string
          strong_reached_notified?: boolean
          team_id: string
          updated_at?: string
        }
        Update: {
          activity_pending?: boolean
          created_at?: string
          first_full_notified?: boolean
          first_match_notified?: boolean
          is_test?: boolean
          last_activity_notified_at?: string
          match_fingerprint?: string
          request_id?: string
          strong_reached_notified?: boolean
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_match_notification_state_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_match_notification_state_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_pool: {
        Row: {
          created_at: string
          engagement_id: string | null
          freelancer_id: string
          id: string
          is_test: boolean
          source: string
          team_id: string
        }
        Insert: {
          created_at?: string
          engagement_id?: string | null
          freelancer_id: string
          id?: string
          is_test?: boolean
          source?: string
          team_id: string
        }
        Update: {
          created_at?: string
          engagement_id?: string | null
          freelancer_id?: string
          id?: string
          is_test?: boolean
          source?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_pool_freelancer_id_fkey"
            columns: ["freelancer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_pool_team_id_fkey"
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
          is_test: boolean
          location: string | null
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_region: string | null
          primary_discipline: Database["public"]["Enums"]["discipline"] | null
          size: string | null
          team_name: string
          team_type: string | null
          updated_at: string
          user_id: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          bio?: string | null
          founded_year?: number | null
          initials?: string | null
          is_test?: boolean
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_region?: string | null
          primary_discipline?: Database["public"]["Enums"]["discipline"] | null
          size?: string | null
          team_name: string
          team_type?: string | null
          updated_at?: string
          user_id: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          bio?: string | null
          founded_year?: number | null
          initials?: string | null
          is_test?: boolean
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_place_id?: string | null
          location_region?: string | null
          primary_discipline?: Database["public"]["Enums"]["discipline"] | null
          size?: string | null
          team_name?: string
          team_type?: string | null
          updated_at?: string
          user_id?: string
          vat_number?: string | null
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
      team_reveals: {
        Row: {
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: []
      }
      token_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          is_test: boolean
          note: string | null
          reason: Database["public"]["Enums"]["token_reason"]
          ref_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          is_test?: boolean
          note?: string | null
          reason: Database["public"]["Enums"]["token_reason"]
          ref_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          is_test?: boolean
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
      user_calendars: {
        Row: {
          created_at: string
          dates: string[]
          discipline: string | null
          events: Json
          id: string
          is_test: boolean
          name: string
          owner_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          season_year: number | null
          source: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dates?: string[]
          discipline?: string | null
          events?: Json
          id?: string
          is_test?: boolean
          name: string
          owner_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          season_year?: number | null
          source?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dates?: string[]
          discipline?: string | null
          events?: Json
          id?: string
          is_test?: boolean
          name?: string
          owner_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          season_year?: number | null
          source?: string
          submitted_at?: string | null
          updated_at?: string
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
      accept_match_confirmation: {
        Args: { _engagement_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_sos_call: {
        Args: { _sos_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_request_if_due: {
        Args: { _request_id: string }
        Returns: {
          activated_at: string | null
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          education: string[]
          end_date: string
          ever_full_matched: boolean
          ever_partial_matched: boolean
          ever_relevant_match: boolean
          experience_requirements: Json
          id: string
          initial_match_potential: string | null
          is_active: boolean
          is_test: boolean
          languages: Json
          last_modified_at: string | null
          location: string | null
          location_anchor: string
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_radius_km: number | null
          location_region: string | null
          location_relevance: string
          match_potential_current: string | null
          modify_count: number
          notes: string | null
          partial_refund_taken: boolean
          red_cancel_tokens: number | null
          red_cancelled_at: string | null
          refund_kind: string | null
          refund_pct: number | null
          refund_tokens: number | null
          review_deadline_at: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          role_hard: boolean
          search_mode: string | null
          season_dates: string[] | null
          skills: string[]
          skills_hard: string[]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          sub_role: string | null
          sub_role_hard: boolean
          sub_role_min_level: string
          team_id: string
          title: string
          travel_required: boolean
          updated_at: string
          was_pool_request: boolean
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_request_now: {
        Args: { _request_id: string }
        Returns: {
          activated_at: string | null
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          education: string[]
          end_date: string
          ever_full_matched: boolean
          ever_partial_matched: boolean
          ever_relevant_match: boolean
          experience_requirements: Json
          id: string
          initial_match_potential: string | null
          is_active: boolean
          is_test: boolean
          languages: Json
          last_modified_at: string | null
          location: string | null
          location_anchor: string
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_radius_km: number | null
          location_region: string | null
          location_relevance: string
          match_potential_current: string | null
          modify_count: number
          notes: string | null
          partial_refund_taken: boolean
          red_cancel_tokens: number | null
          red_cancelled_at: string | null
          refund_kind: string | null
          refund_pct: number | null
          refund_tokens: number | null
          review_deadline_at: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          role_hard: boolean
          search_mode: string | null
          season_dates: string[] | null
          skills: string[]
          skills_hard: string[]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          sub_role: string | null
          sub_role_hard: boolean
          sub_role_min_level: string
          team_id: string
          title: string
          travel_required: boolean
          updated_at: string
          was_pool_request: boolean
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_pool_member_by_code: {
        Args: { _code: string }
        Returns: {
          created_at: string
          engagement_id: string | null
          freelancer_id: string
          id: string
          is_test: boolean
          source: string
          team_id: string
        }
        SetofOptions: {
          from: "*"
          to: "team_pool"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_pool_member_from_engagement: {
        Args: { _engagement_id: string }
        Returns: {
          created_at: string
          engagement_id: string | null
          freelancer_id: string
          id: string
          is_test: boolean
          source: string
          team_id: string
        }
        SetofOptions: {
          from: "*"
          to: "team_pool"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_env: { Args: { _is_test: boolean }; Returns: boolean }
      admin_set_rating_moderation: {
        Args: { _action: string; _rating_id: string }
        Returns: {
          auto_suspicious: boolean
          comment: string | null
          created_at: string
          engagement_id: string
          flag_reason: string | null
          flagged_at: string | null
          flagged_by: string | null
          from_user_id: string
          id: string
          is_test: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: Database["public"]["Enums"]["rating_moderation_status"]
          notified_at: string | null
          overall: number | null
          stars: number
          sub_scores: Json
          to_user_id: string
          token_bonus_awarded: boolean
          unlocked_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_activate_pending_reviews: { Args: never; Returns: number }
      auto_activate_pending_reviews_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      availability_day_active: {
        Args: { _day: string; _freelancer: string }
        Returns: boolean
      }
      can_view_team_identity: { Args: { _team: string }; Returns: boolean }
      cancel_engagement: {
        Args: { _engagement_id: string; _reason?: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      classify_match_potential: {
        Args: { _match_count: number }
        Returns: string
      }
      cleanup_client_error_log: { Args: never; Returns: number }
      cleanup_push_deliveries: { Args: never; Returns: number }
      close_expired_requests: { Args: never; Returns: number }
      close_proposed_for_request: {
        Args: { _kind: string; _request_id: string }
        Returns: number
      }
      complete_expired_engagements: { Args: never; Returns: number }
      complete_expired_engagements_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      confirm_calendar: { Args: never; Returns: string }
      create_request: {
        Args: { _payload: Json }
        Returns: {
          activated_at: string | null
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          education: string[]
          end_date: string
          ever_full_matched: boolean
          ever_partial_matched: boolean
          ever_relevant_match: boolean
          experience_requirements: Json
          id: string
          initial_match_potential: string | null
          is_active: boolean
          is_test: boolean
          languages: Json
          last_modified_at: string | null
          location: string | null
          location_anchor: string
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_radius_km: number | null
          location_region: string | null
          location_relevance: string
          match_potential_current: string | null
          modify_count: number
          notes: string | null
          partial_refund_taken: boolean
          red_cancel_tokens: number | null
          red_cancelled_at: string | null
          refund_kind: string | null
          refund_pct: number | null
          refund_tokens: number | null
          review_deadline_at: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          role_hard: boolean
          search_mode: string | null
          season_dates: string[] | null
          skills: string[]
          skills_hard: string[]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          sub_role: string | null
          sub_role_hard: boolean
          sub_role_min_level: string
          team_id: string
          title: string
          travel_required: boolean
          updated_at: string
          was_pool_request: boolean
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
      day_blocked_by_engagement: {
        Args: { _day: string; _freelancer: string }
        Returns: boolean
      }
      day_frozen_by_pending_request: {
        Args: { _day: string; _freelancer: string }
        Returns: boolean
      }
      decline_match_confirmation: {
        Args: { _engagement_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      dispatch_notification_emails: { Args: never; Returns: undefined }
      dispatch_notification_push: { Args: never; Returns: undefined }
      dispatch_platform_capacity_check: { Args: never; Returns: undefined }
      emit_availability_opportunity_notifications: {
        Args: { _is_test: boolean }
        Returns: number
      }
      emit_availability_opportunity_notifications_live: {
        Args: never
        Returns: number
      }
      emit_calendar_stale_notifications: { Args: never; Returns: number }
      emit_calendar_stale_notifications_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      emit_contact_checks: { Args: never; Returns: number }
      emit_contact_checks_env: { Args: { _is_test: boolean }; Returns: number }
      emit_engagement_completed_notifications: {
        Args: { _engagement_id: string }
        Returns: number
      }
      emit_hot_partial_notifications: {
        Args: { _is_test: boolean }
        Returns: number
      }
      emit_hot_partial_notifications_live: { Args: never; Returns: number }
      emit_pitcall_outcome_notifications: {
        Args: {
          _confirmed_freelancer?: string
          _outcome: string
          _request_id: string
        }
        Returns: number
      }
      emit_potential_match_notifications: {
        Args: { _freelancer_id?: string; _request_id?: string }
        Returns: number
      }
      emit_rating_available_notifications: { Args: never; Returns: number }
      emit_team_ghosting_reminders: { Args: never; Returns: number }
      emit_team_ghosting_reminders_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      emit_team_match_activity: { Args: never; Returns: number }
      emit_team_match_activity_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      enqueue_availability_recompute: {
        Args: { _freelancer_id: string; _is_test: boolean }
        Returns: undefined
      }
      env_is_test: { Args: never; Returns: boolean }
      extend_match_confirmation: {
        Args: { _engagement_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      flag_rating: {
        Args: { _rating_id: string; _reason: string }
        Returns: undefined
      }
      freelancer_answer_contact: {
        Args: { _contacted: boolean; _engagement_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      freelancer_match_actionable: {
        Args: { _freelancer: string; _request: string }
        Returns: boolean
      }
      gen_pit_code: { Args: never; Returns: string }
      get_anonymous_reviews: {
        Args: { _target: string }
        Returns: {
          comment: string
          created_at: string
          id: string
          moderation_status: Database["public"]["Enums"]["rating_moderation_status"]
          overall: number
          stars: number
          sub_scores: Json
        }[]
      }
      get_setting_num: {
        Args: { _default: number; _key: string }
        Returns: number
      }
      get_user_rating_summary: {
        Args: { _user_id: string }
        Returns: {
          average: number
          count: number
          punct: number
          stress: number
          tech: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      haversine_km: {
        Args: { lat1: number; lat2: number; lon1: number; lon2: number }
        Returns: number
      }
      legacy_role_group: { Args: { _role: string }; Returns: string }
      legacy_sub_role: { Args: { _role: string }; Returns: string }
      market_stats: { Args: never; Returns: Json }
      match_edge_only: {
        Args: { _freelancer: string; _required: string[] }
        Returns: boolean
      }
      modify_request: {
        Args: { _payload: Json; _request_id: string }
        Returns: {
          activated_at: string | null
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          education: string[]
          end_date: string
          ever_full_matched: boolean
          ever_partial_matched: boolean
          ever_relevant_match: boolean
          experience_requirements: Json
          id: string
          initial_match_potential: string | null
          is_active: boolean
          is_test: boolean
          languages: Json
          last_modified_at: string | null
          location: string | null
          location_anchor: string
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_radius_km: number | null
          location_region: string | null
          location_relevance: string
          match_potential_current: string | null
          modify_count: number
          notes: string | null
          partial_refund_taken: boolean
          red_cancel_tokens: number | null
          red_cancelled_at: string | null
          refund_kind: string | null
          refund_pct: number | null
          refund_tokens: number | null
          review_deadline_at: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          role_hard: boolean
          search_mode: string | null
          season_dates: string[] | null
          skills: string[]
          skills_hard: string[]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          sub_role: string | null
          sub_role_hard: boolean
          sub_role_min_level: string
          team_id: string
          title: string
          travel_required: boolean
          updated_at: string
          was_pool_request: boolean
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_availability_opportunity_mute: {
        Args: never
        Returns: {
          mute_availability_opportunities: boolean
        }[]
      }
      my_day_rate: {
        Args: never
        Returns: {
          currency: string
          day_rate: number
        }[]
      }
      my_freelancer_phone: {
        Args: never
        Returns: {
          phone_dial_code: string
          phone_number: string
        }[]
      }
      my_profile_coords: {
        Args: never
        Returns: {
          location_lat: number
          location_lng: number
        }[]
      }
      my_team_vat: { Args: never; Returns: string }
      my_token_balance: { Args: never; Returns: number }
      notify_no_confirmable_matches: {
        Args: { _request_id: string }
        Returns: boolean
      }
      platform_capacity_counts: {
        Args: never
        Returns: {
          active_pit_calls: number
          total_freelancers: number
          total_teams: number
        }[]
      }
      platform_capacity_level: {
        Args: { active_pcs: number; freelancers: number }
        Returns: string
      }
      process_availability_recompute_queue: { Args: never; Returns: number }
      process_availability_recompute_queue_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      process_engagement_deadlines: { Args: never; Returns: number }
      process_engagement_deadlines_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      purge_test_environment: {
        Args: never
        Returns: {
          user_id: string
        }[]
      }
      rating_opens_at: { Args: { _engagement_id: string }; Returns: string }
      recompute_matches: {
        Args: { _freelancer_id?: string; _request_id?: string }
        Returns: number
      }
      recompute_matches_env: { Args: { _is_test: boolean }; Returns: number }
      recompute_matches_freelancer_env: {
        Args: { _freelancer_id: string; _is_test: boolean }
        Returns: number
      }
      recompute_my_matches_after_profile_save: { Args: never; Returns: number }
      record_legal_acceptance: {
        Args: { _source?: string; _version: string }
        Returns: string
      }
      record_team_match_notifications: {
        Args: { _request_id: string }
        Returns: undefined
      }
      record_team_match_notifications_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      red_cancel_request: {
        Args: { _request_id: string }
        Returns: {
          balance: number
          refund_tokens: number
        }[]
      }
      refund_and_close_request: {
        Args: { _mode: string; _request_id: string }
        Returns: {
          balance: number
          kind: string
          refund_pct: number
          refund_tokens: number
        }[]
      }
      release_ghosted_engagements: { Args: never; Returns: number }
      release_ghosted_engagements_env: {
        Args: { _is_test: boolean }
        Returns: number
      }
      request_confirmable_matches_left: {
        Args: { _request_id: string }
        Returns: number
      }
      request_expand_eligibility: {
        Args: { _request_id: string }
        Returns: boolean
      }
      request_match_confirmation: {
        Args: { _match_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_matching_fingerprint: {
        Args: { _request_id: string }
        Returns: Json
      }
      request_missing_required_days: {
        Args: { _freelancer_id: string; _request_id: string }
        Returns: string[]
      }
      request_refund_quote: {
        Args: { _request_id: string }
        Returns: {
          low_relevance_eligible: boolean
          low_relevance_refund: number
          refund_full: number
          refund_partial: number
          refund_pct: number
          spent: number
          zero_match_refund_full: number
        }[]
      }
      request_required_days: {
        Args: { _request_id: string }
        Returns: string[]
      }
      request_start_ts: { Args: { _request_id: string }; Returns: string }
      reveal_match: {
        Args: { _match_id: string }
        Returns: {
          new_balance: number
          revealed_freelancer: string
          revealed_team: string
        }[]
      }
      reveal_request: { Args: { _request_id: string }; Returns: number }
      reveal_reviews: { Args: { _target: string }; Returns: number }
      reveal_team: { Args: { _team_id: string }; Returns: number }
      run_availability_opportunity_test: { Args: never; Returns: number }
      run_hot_partial_test: { Args: never; Returns: number }
      run_team_match_notifications_test: { Args: never; Returns: number }
      set_availability_opportunity_mute: {
        Args: { _muted: boolean }
        Returns: boolean
      }
      set_my_rate_location: {
        Args: {
          _day_rate: number
          _location_lat: number
          _location_lng: number
        }
        Returns: boolean
      }
      set_request_status: {
        Args: {
          _id: string
          _status: Database["public"]["Enums"]["request_status"]
        }
        Returns: {
          activated_at: string | null
          budget_max: number | null
          budget_min: number | null
          budget_unit: string
          circuit: string | null
          created_at: string
          currency: string
          discipline: Database["public"]["Enums"]["discipline"]
          duration: Database["public"]["Enums"]["duration_type"]
          education: string[]
          end_date: string
          ever_full_matched: boolean
          ever_partial_matched: boolean
          ever_relevant_match: boolean
          experience_requirements: Json
          id: string
          initial_match_potential: string | null
          is_active: boolean
          is_test: boolean
          languages: Json
          last_modified_at: string | null
          location: string | null
          location_anchor: string
          location_city: string | null
          location_country: string | null
          location_lat: number | null
          location_lng: number | null
          location_place_id: string | null
          location_radius_km: number | null
          location_region: string | null
          location_relevance: string
          match_potential_current: string | null
          modify_count: number
          notes: string | null
          partial_refund_taken: boolean
          red_cancel_tokens: number | null
          red_cancelled_at: string | null
          refund_kind: string | null
          refund_pct: number | null
          refund_tokens: number | null
          review_deadline_at: string | null
          role: Database["public"]["Enums"]["freelancer_role"] | null
          role_group: string | null
          role_hard: boolean
          search_mode: string | null
          season_dates: string[] | null
          skills: string[]
          skills_hard: string[]
          start_date: string
          status: Database["public"]["Enums"]["request_status"]
          sub_role: string | null
          sub_role_hard: boolean
          sub_role_min_level: string
          team_id: string
          title: string
          travel_required: boolean
          updated_at: string
          was_pool_request: boolean
        }
        SetofOptions: {
          from: "*"
          to: "requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_rating_v2: {
        Args: {
          _comment?: string
          _engagement_id: string
          _overall: number
          _sub_scores: Json
        }
        Returns: {
          auto_suspicious: boolean
          comment: string | null
          created_at: string
          engagement_id: string
          flag_reason: string | null
          flagged_at: string | null
          flagged_by: string | null
          from_user_id: string
          id: string
          is_test: boolean
          moderated_at: string | null
          moderated_by: string | null
          moderation_status: Database["public"]["Enums"]["rating_moderation_status"]
          notified_at: string | null
          overall: number | null
          stars: number
          sub_scores: Json
          to_user_id: string
          token_bonus_awarded: boolean
          unlocked_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "ratings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_can_see_match: {
        Args: { _freelancer: string; _request: string; _team: string }
        Returns: boolean
      }
      team_cancellation_stats: {
        Args: { _team_id: string }
        Returns: {
          avg_days_notice: number
          count: number
        }[]
      }
      team_confirm_contact: {
        Args: { _engagement_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      team_recheck_budget_left: { Args: { _team_id: string }; Returns: number }
      touch_push_subscription: { Args: { _endpoint: string }; Returns: boolean }
      trigger_sos_call: {
        Args: { _request_id: string }
        Returns: {
          auto_triggered: boolean
          id: string
          is_test: boolean
          min_pct: number
          radius_km: number | null
          request_id: string
          resolved_at: string | null
          resolved_engagement_id: string | null
          target_count: number
          team_id: string
          triggered_at: string
          triggered_by: string
        }
        SetofOptions: {
          from: "*"
          to: "sos_calls"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unlock_match_for_team: { Args: { _match_id: string }; Returns: number }
      unlock_pool_search: {
        Args: { _request_id: string }
        Returns: {
          balance: number
          tokens_spent: number
        }[]
      }
      unlock_request_tier: {
        Args: { _request_id: string; _scope?: string; _tier: number }
        Returns: {
          balance: number
          tier: number
          tokens_spent: number
          total_matches: number
        }[]
      }
      upgrade_request_to_standard: {
        Args: { _request_id: string }
        Returns: {
          already: boolean
          balance: number
          tokens_spent: number
        }[]
      }
      withdraw_match_confirmation: {
        Args: { _engagement_id: string }
        Returns: {
          cancellation_kind: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          confirmed_at: string | null
          contact_check_sent_at: string | null
          covered_days: string[] | null
          created_at: string
          currency: string
          declined_at: string | null
          end_date: string
          expired_at: string | null
          expires_at: string | null
          extension_count: number
          fee: number | null
          freelancer_contacted: boolean | null
          freelancer_contacted_at: string | null
          freelancer_id: string
          freelancer_marked_complete: boolean
          ghosting_released_at: string | null
          id: string
          is_test: boolean
          match_id: string | null
          no_show: boolean
          notes: string | null
          proposed_by: string
          reminder_12_sent_at: string | null
          reminder_24_sent_at: string | null
          request_id: string | null
          start_date: string
          status: Database["public"]["Enums"]["engagement_status"]
          team_confirmed_contact: boolean | null
          team_confirmed_contact_at: string | null
          team_id: string
          team_marked_complete: boolean
          team_reminder1_sent_at: string | null
          team_reminder2_sent_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "engagements"
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
        | "other"
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
        | "rating_available"
        | "rating_unlocked"
        | "match_taken"
        | "match_reopened"
        | "sos_call"
        | "sos_taken"
        | "engagement_cancelled"
        | "request_unfilled"
        | "calendar_stale"
        | "contact_check"
        | "team_contact_reminder_1"
        | "team_contact_reminder_2"
        | "ghosting_released"
        | "team_ghosted"
        | "admin_alert"
        | "engagement_expiring"
        | "engagement_expired"
        | "engagement_declined"
        | "engagement_more_time"
      rating_moderation_status:
        | "active"
        | "flagged"
        | "frozen"
        | "deleted"
        | "approved"
      request_status:
        | "active"
        | "paused"
        | "closed"
        | "completed"
        | "filled"
        | "pending_review"
      token_reason:
        | "signup_bonus"
        | "purchase"
        | "reveal_spend"
        | "admin_credit"
        | "admin_debit"
        | "refund"
        | "request_post"
        | "team_reveal_spend"
        | "rating_bonus"
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
        "other",
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
        "rating_available",
        "rating_unlocked",
        "match_taken",
        "match_reopened",
        "sos_call",
        "sos_taken",
        "engagement_cancelled",
        "request_unfilled",
        "calendar_stale",
        "contact_check",
        "team_contact_reminder_1",
        "team_contact_reminder_2",
        "ghosting_released",
        "team_ghosted",
        "admin_alert",
        "engagement_expiring",
        "engagement_expired",
        "engagement_declined",
        "engagement_more_time",
      ],
      rating_moderation_status: [
        "active",
        "flagged",
        "frozen",
        "deleted",
        "approved",
      ],
      request_status: [
        "active",
        "paused",
        "closed",
        "completed",
        "filled",
        "pending_review",
      ],
      token_reason: [
        "signup_bonus",
        "purchase",
        "reveal_spend",
        "admin_credit",
        "admin_debit",
        "refund",
        "request_post",
        "team_reveal_spend",
        "rating_bonus",
      ],
      user_type: ["freelancer", "team"],
    },
  },
} as const
