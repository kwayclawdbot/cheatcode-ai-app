export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          broker_connection_id: string | null
          buying_power: number | null
          cash: number | null
          created_at: string
          currency: string | null
          equity: number | null
          id: string
          kind: Database["public"]["Enums"]["account_kind"]
          last_reset_at: string | null
          name: string
          options_level: number | null
          reset_count: number | null
          starting_balance: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          broker_connection_id?: string | null
          buying_power?: number | null
          cash?: number | null
          created_at?: string
          currency?: string | null
          equity?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["account_kind"]
          last_reset_at?: string | null
          name: string
          options_level?: number | null
          reset_count?: number | null
          starting_balance?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          broker_connection_id?: string | null
          buying_power?: number | null
          cash?: number | null
          created_at?: string
          currency?: string | null
          equity?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["account_kind"]
          last_reset_at?: string | null
          name?: string
          options_level?: number | null
          reset_count?: number | null
          starting_balance?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_broker_connection_id_fkey"
            columns: ["broker_connection_id"]
            isOneToOne: false
            referencedRelation: "broker_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      alert_triggers: {
        Row: {
          alert_id: string
          created_at: string
          delivered: Json | null
          id: string
          late: boolean | null
          snapshot: Json
          triggered_at: string
        }
        Insert: {
          alert_id: string
          created_at?: string
          delivered?: Json | null
          id?: string
          late?: boolean | null
          snapshot: Json
          triggered_at: string
        }
        Update: {
          alert_id?: string
          created_at?: string
          delivered?: Json | null
          id?: string
          late?: boolean | null
          snapshot?: Json
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_triggers_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          channels: Database["public"]["Enums"]["notif_channel"][]
          condition: Json
          created_at: string | null
          data_dependency: Json
          expires_at: string | null
          frequency: string | null
          id: string
          natural_language: string | null
          refs: Json | null
          status: Database["public"]["Enums"]["alert_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channels?: Database["public"]["Enums"]["notif_channel"][]
          condition: Json
          created_at?: string | null
          data_dependency: Json
          expires_at?: string | null
          frequency?: string | null
          id?: string
          natural_language?: string | null
          refs?: Json | null
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channels?: Database["public"]["Enums"]["notif_channel"][]
          condition?: Json
          created_at?: string | null
          data_dependency?: Json
          expires_at?: string | null
          frequency?: string | null
          id?: string
          natural_language?: string | null
          refs?: Json | null
          status?: Database["public"]["Enums"]["alert_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      allocation_models: {
        Row: {
          active: boolean | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          risk_band: string
          sleeves: Json
          updated_at: string | null
          version: number
        }
        Insert: {
          active?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          risk_band: string
          sleeves: Json
          updated_at?: string | null
          version: number
        }
        Update: {
          active?: boolean | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          risk_band?: string
          sleeves?: Json
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_models_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "allocation_models_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      broker_connections: {
        Row: {
          access: Database["public"]["Enums"]["connection_access"]
          authorization_id: string | null
          capabilities: Json | null
          created_at: string
          data_lag: string
          error_detail: string | null
          id: string
          last_synced_at: string | null
          provider: string
          snaptrade_user_id: string | null
          status: Database["public"]["Enums"]["broker_conn_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access?: Database["public"]["Enums"]["connection_access"]
          authorization_id?: string | null
          capabilities?: Json | null
          created_at?: string
          data_lag?: string
          error_detail?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          snaptrade_user_id?: string | null
          status?: Database["public"]["Enums"]["broker_conn_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access?: Database["public"]["Enums"]["connection_access"]
          authorization_id?: string | null
          capabilities?: Json | null
          created_at?: string
          data_lag?: string
          error_detail?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          snaptrade_user_id?: string | null
          status?: Database["public"]["Enums"]["broker_conn_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "broker_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      candles: {
        Row: {
          c: number | null
          h: number | null
          l: number | null
          o: number | null
          symbol: string
          timeframe: string
          ts: string
          v: number | null
        }
        Insert: {
          c?: number | null
          h?: number | null
          l?: number | null
          o?: number | null
          symbol: string
          timeframe: string
          ts: string
          v?: number | null
        }
        Update: {
          c?: number | null
          h?: number | null
          l?: number | null
          o?: number | null
          symbol?: string
          timeframe?: string
          ts?: string
          v?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "candles_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      community_signals: {
        Row: {
          catalysts: Json | null
          computed_at: string
          confidence_limits: string
          created_at: string
          id: string
          mentioned_levels: Json | null
          open_questions: Json | null
          sample_size: number
          sentiment: Json
          source_rooms: string[] | null
          symbol: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          catalysts?: Json | null
          computed_at: string
          confidence_limits: string
          created_at?: string
          id?: string
          mentioned_levels?: Json | null
          open_questions?: Json | null
          sample_size: number
          sentiment: Json
          source_rooms?: string[] | null
          symbol: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          catalysts?: Json | null
          computed_at?: string
          confidence_limits?: string
          created_at?: string
          id?: string
          mentioned_levels?: Json | null
          open_questions?: Json | null
          sample_size?: number
          sentiment?: Json
          source_rooms?: string[] | null
          symbol?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      contributor_stats: {
        Row: {
          created_at: string
          defined_risk_rate: number | null
          ideas_posted: number | null
          outcomes_disclosed: number | null
          role_labels: string[]
          theses_updated: number | null
          updated_at: string | null
          usefulness_score: number | null
          user_id: string
          weighting: number
        }
        Insert: {
          created_at?: string
          defined_risk_rate?: number | null
          ideas_posted?: number | null
          outcomes_disclosed?: number | null
          role_labels?: string[]
          theses_updated?: number | null
          updated_at?: string | null
          usefulness_score?: number | null
          user_id: string
          weighting?: number
        }
        Update: {
          created_at?: string
          defined_risk_rate?: number | null
          ideas_posted?: number | null
          outcomes_disclosed?: number | null
          role_labels?: string[]
          theses_updated?: number | null
          updated_at?: string | null
          usefulness_score?: number | null
          user_id?: string
          weighting?: number
        }
        Relationships: [
          {
            foreignKeyName: "contributor_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contributor_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: Json
          conversation_id: string
          created_at: string | null
          id: string
          role: string
          seq: number
        }
        Insert: {
          content: Json
          conversation_id: string
          created_at?: string | null
          id?: string
          role: string
          seq: number
        }
        Update: {
          content?: Json
          conversation_id?: string
          created_at?: string | null
          id?: string
          role?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          mode: Database["public"]["Enums"]["app_mode"] | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["app_mode"] | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["app_mode"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      course_modules: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          position: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          position?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          position?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          level: Database["public"]["Enums"]["experience_level"] | null
          mode: Database["public"]["Enums"]["app_mode"] | null
          position: number | null
          published: boolean | null
          slug: string | null
          tier_required: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          level?: Database["public"]["Enums"]["experience_level"] | null
          mode?: Database["public"]["Enums"]["app_mode"] | null
          position?: number | null
          published?: boolean | null
          slug?: string | null
          tier_required?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          level?: Database["public"]["Enums"]["experience_level"] | null
          mode?: Database["public"]["Enums"]["app_mode"] | null
          position?: number | null
          published?: boolean | null
          slug?: string | null
          tier_required?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debriefs: {
        Row: {
          created_at: string | null
          id: string
          kai_object_id: string | null
          kai_summary: string | null
          lesson_refs: string[] | null
          outcome: Json
          plan_id: string | null
          position_id: string | null
          process_review: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          kai_object_id?: string | null
          kai_summary?: string | null
          lesson_refs?: string[] | null
          outcome: Json
          plan_id?: string | null
          position_id?: string | null
          process_review?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          kai_object_id?: string | null
          kai_summary?: string | null
          lesson_refs?: string[] | null
          outcome?: Json
          plan_id?: string | null
          position_id?: string | null
          process_review?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debriefs_kai_object_id_fkey"
            columns: ["kai_object_id"]
            isOneToOne: false
            referencedRelation: "kai_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debriefs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trade_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debriefs_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      disclosure_templates: {
        Row: {
          active: boolean | null
          body: string
          created_at: string
          key: string
          updated_at: string | null
          version: number
        }
        Insert: {
          active?: boolean | null
          body: string
          created_at?: string
          key: string
          updated_at?: string | null
          version: number
        }
        Update: {
          active?: boolean | null
          body?: string
          created_at?: string
          key?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: []
      }
      entitlement_flags: {
        Row: {
          created_at: string
          flag: string
          tier: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string
          flag: string
          tier: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string
          flag?: string
          tier?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      fills: {
        Row: {
          created_at: string
          id: string
          liquidity: string | null
          order_id: string
          price: number
          qty: number
          ts: string
        }
        Insert: {
          created_at?: string
          id?: string
          liquidity?: string | null
          order_id: string
          price: number
          qty: number
          ts: string
        }
        Update: {
          created_at?: string
          id?: string
          liquidity?: string | null
          order_id?: string
          price?: number
          qty?: number
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "fills_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          active: boolean | null
          created_at: string
          exchange: string | null
          kind: Database["public"]["Enums"]["instrument_kind"]
          meta: Json | null
          name: string | null
          symbol: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          exchange?: string | null
          kind?: Database["public"]["Enums"]["instrument_kind"]
          meta?: Json | null
          name?: string | null
          symbol: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string
          exchange?: string | null
          kind?: Database["public"]["Enums"]["instrument_kind"]
          meta?: Json | null
          name?: string | null
          symbol?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      invest_goals: {
        Row: {
          account_id: string | null
          created_at: string
          horizon_years: number | null
          id: string
          monthly_contribution: number | null
          name: string | null
          risk_band: string | null
          target_amount: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          horizon_years?: number | null
          id?: string
          monthly_contribution?: number | null
          name?: string | null
          risk_band?: string | null
          target_amount?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          horizon_years?: number | null
          id?: string
          monthly_contribution?: number | null
          name?: string | null
          risk_band?: string | null
          target_amount?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invest_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invest_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      invest_recommendations: {
        Row: {
          applied_order_ids: string[] | null
          created_at: string | null
          disclosures: string[]
          goal_id: string | null
          id: string
          kind: string
          payload: Json
          status: Database["public"]["Enums"]["rebalance_status"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          applied_order_ids?: string[] | null
          created_at?: string | null
          disclosures: string[]
          goal_id?: string | null
          id?: string
          kind: string
          payload: Json
          status?: Database["public"]["Enums"]["rebalance_status"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          applied_order_ids?: string[] | null
          created_at?: string | null
          disclosures?: string[]
          goal_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          status?: Database["public"]["Enums"]["rebalance_status"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invest_recommendations_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "invest_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      kai_explanations: {
        Row: {
          body: Json
          context_key: string | null
          created_at: string
          id: string
          level: Database["public"]["Enums"]["experience_level"]
          model: string | null
          prompt_version: string | null
          updated_at: string | null
        }
        Insert: {
          body: Json
          context_key?: string | null
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["experience_level"]
          model?: string | null
          prompt_version?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: Json
          context_key?: string | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["experience_level"]
          model?: string | null
          prompt_version?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      kai_objects: {
        Row: {
          created_at: string | null
          disclosures: string[]
          id: string
          model: string
          payload: Json
          prompt_version: string
          refs: Json | null
          type: Database["public"]["Enums"]["kai_object_type"]
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          disclosures?: string[]
          id?: string
          model: string
          payload: Json
          prompt_version: string
          refs?: Json | null
          type: Database["public"]["Enums"]["kai_object_type"]
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          disclosures?: string[]
          id?: string
          model?: string
          payload?: Json
          prompt_version?: string
          refs?: Json | null
          type?: Database["public"]["Enums"]["kai_object_type"]
          user_id?: string | null
        }
        Relationships: []
      }
      kai_user_memory: {
        Row: {
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          kind: string
          refs: Json | null
          superseded_by: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          kind: string
          refs?: Json | null
          superseded_by?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          kind?: string
          refs?: Json | null
          superseded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kai_user_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kai_user_memory_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      legacy_imports: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          email: string | null
          id: string
          imported_at: string | null
          legacy_meta: Json | null
          phone_hash: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          imported_at?: string | null
          legacy_meta?: Json | null
          phone_hash?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          email?: string | null
          id?: string
          imported_at?: string | null
          legacy_meta?: Json | null
          phone_hash?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_imports_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "legacy_imports_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          created_at: string
          lesson_id: string
          quiz_result: Json | null
          state: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          lesson_id: string
          quiz_result?: Json | null
          state?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          lesson_id?: string
          quiz_result?: Json | null
          state?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: Json
          context_tags: string[] | null
          created_at: string
          id: string
          module_id: string | null
          position: number | null
          published: boolean | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content: Json
          context_tags?: string[] | null
          created_at?: string
          id?: string
          module_id?: string | null
          position?: number | null
          published?: boolean | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: Json
          context_tags?: string[] | null
          created_at?: string
          id?: string
          module_id?: string | null
          position?: number | null
          published?: boolean | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      market_memory: {
        Row: {
          as_of: string
          created_at: string | null
          embedding: string | null
          entities: string[] | null
          id: string
          kind: string
          source: Json | null
          summary: string
          symbols: string[] | null
        }
        Insert: {
          as_of: string
          created_at?: string | null
          embedding?: string | null
          entities?: string[] | null
          id?: string
          kind: string
          source?: Json | null
          summary: string
          symbols?: string[] | null
        }
        Update: {
          as_of?: string
          created_at?: string | null
          embedding?: string | null
          entities?: string[] | null
          id?: string
          kind?: string
          source?: Json | null
          summary?: string
          symbols?: string[] | null
        }
        Relationships: []
      }
      market_sessions: {
        Row: {
          closes_at: string | null
          created_at: string
          notes: string | null
          opens_at: string | null
          session_date: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          notes?: string | null
          opens_at?: string | null
          session_date: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          notes?: string | null
          opens_at?: string | null
          session_date?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string | null
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          flags: Json
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          parent_id: string | null
          position_disclosure: Json | null
          refs: Json | null
          room_id: string
          seq: number
          structured_idea: Json | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          flags?: Json
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          parent_id?: string | null
          position_disclosure?: Json | null
          refs?: Json | null
          room_id: string
          seq: number
          structured_idea?: Json | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          flags?: Json
          id?: string
          kind?: Database["public"]["Enums"]["message_kind"]
          parent_id?: string | null
          position_disclosure?: Json | null
          refs?: Json | null
          room_id?: string
          seq?: number
          structured_idea?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      moderation_log: {
        Row: {
          action: Database["public"]["Enums"]["moderation_action"]
          actor_id: string | null
          created_at: string | null
          id: number
          reason: string | null
          target: Json
        }
        Insert: {
          action: Database["public"]["Enums"]["moderation_action"]
          actor_id?: string | null
          created_at?: string | null
          id?: number
          reason?: string | null
          target: Json
        }
        Update: {
          action?: Database["public"]["Enums"]["moderation_action"]
          actor_id?: string | null
          created_at?: string | null
          id?: number
          reason?: string | null
          target?: Json
        }
        Relationships: []
      }
      notification_prefs: {
        Row: {
          created_at: string
          per_mode: Json
          quiet_hours: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          per_mode?: Json
          quiet_hours?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          per_mode?: Json
          quiet_hours?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notif_channel"]
          created_at: string
          delivery: Json | null
          id: string
          kind: string
          payload: Json
          sent_at: string | null
          user_id: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notif_channel"]
          created_at?: string
          delivery?: Json | null
          id?: string
          kind: string
          payload: Json
          sent_at?: string | null
          user_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notif_channel"]
          created_at?: string
          delivery?: Json | null
          id?: string
          kind?: string
          payload?: Json
          sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      option_contracts: {
        Row: {
          active: boolean | null
          created_at: string
          exercise_style: string | null
          expiry: string
          kind: string
          multiplier: number | null
          occ_symbol: string
          strike: number
          underlying: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string
          exercise_style?: string | null
          expiry: string
          kind: string
          multiplier?: number | null
          occ_symbol: string
          strike: number
          underlying: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string
          exercise_style?: string | null
          expiry?: string
          kind?: string
          multiplier?: number | null
          occ_symbol?: string
          strike?: number
          underlying?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "option_contracts_underlying_fkey"
            columns: ["underlying"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string | null
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: number
          order_id: string
          payload: Json | null
          to_status: Database["public"]["Enums"]["order_status"] | null
        }
        Insert: {
          created_at?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: number
          order_id: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Update: {
          created_at?: string | null
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: number
          order_id?: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["order_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          account_id: string
          bracket_group: string | null
          created_at: string
          driver: string
          duration: string | null
          external_ref: string | null
          id: string
          idempotency_key: string
          instrument_kind: Database["public"]["Enums"]["instrument_kind"]
          limit_price: number | null
          occ_symbol: string | null
          origin: Json
          plan_id: string | null
          preview: Json | null
          qty: number
          reject_reason: string | null
          reject_reason_raw: string | null
          side: Database["public"]["Enums"]["position_effect"]
          status: Database["public"]["Enums"]["order_status"]
          stop_price: number | null
          symbol: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          bracket_group?: string | null
          created_at?: string
          driver?: string
          duration?: string | null
          external_ref?: string | null
          id?: string
          idempotency_key: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          limit_price?: number | null
          occ_symbol?: string | null
          origin?: Json
          plan_id?: string | null
          preview?: Json | null
          qty: number
          reject_reason?: string | null
          reject_reason_raw?: string | null
          side: Database["public"]["Enums"]["position_effect"]
          status?: Database["public"]["Enums"]["order_status"]
          stop_price?: number | null
          symbol: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          bracket_group?: string | null
          created_at?: string
          driver?: string
          duration?: string | null
          external_ref?: string | null
          id?: string
          idempotency_key?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          limit_price?: number | null
          occ_symbol?: string | null
          origin?: Json
          plan_id?: string | null
          preview?: Json | null
          qty?: number
          reject_reason?: string | null
          reject_reason_raw?: string | null
          side?: Database["public"]["Enums"]["position_effect"]
          status?: Database["public"]["Enums"]["order_status"]
          stop_price?: number | null
          symbol?: string
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_occ_symbol_fkey"
            columns: ["occ_symbol"]
            isOneToOne: false
            referencedRelation: "option_contracts"
            referencedColumns: ["occ_symbol"]
          },
          {
            foreignKeyName: "orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trade_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      plan_events: {
        Row: {
          created_at: string | null
          id: number
          payload: Json
          plan_id: string
          seq: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          payload: Json
          plan_id: string
          seq: number
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          payload?: Json
          plan_id?: string
          seq?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "trade_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          account_id: string
          avg_cost: number
          closed_at: string | null
          created_at: string
          direction: string
          id: string
          instrument_kind: Database["public"]["Enums"]["instrument_kind"]
          mode: Database["public"]["Enums"]["app_mode"]
          occ_symbol: string | null
          opened_at: string
          origin: Json
          origin_plan_id: string | null
          origin_room_id: string | null
          origin_setup_id: string | null
          qty: number
          realized_pnl: number | null
          source: string
          symbol: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          avg_cost: number
          closed_at?: string | null
          created_at?: string
          direction: string
          id?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          mode: Database["public"]["Enums"]["app_mode"]
          occ_symbol?: string | null
          opened_at: string
          origin?: Json
          origin_plan_id?: string | null
          origin_room_id?: string | null
          origin_setup_id?: string | null
          qty: number
          realized_pnl?: number | null
          source?: string
          symbol: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          avg_cost?: number
          closed_at?: string | null
          created_at?: string
          direction?: string
          id?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          mode?: Database["public"]["Enums"]["app_mode"]
          occ_symbol?: string | null
          opened_at?: string
          origin?: Json
          origin_plan_id?: string | null
          origin_room_id?: string | null
          origin_setup_id?: string | null
          qty?: number
          realized_pnl?: number | null
          source?: string
          symbol?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_occ_symbol_fkey"
            columns: ["occ_symbol"]
            isOneToOne: false
            referencedRelation: "option_contracts"
            referencedColumns: ["occ_symbol"]
          },
          {
            foreignKeyName: "positions_origin_plan_id_fkey"
            columns: ["origin_plan_id"]
            isOneToOne: false
            referencedRelation: "trade_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_origin_setup_id_fkey"
            columns: ["origin_setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          experience: Database["public"]["Enums"]["experience_level"]
          explanation_level: Database["public"]["Enums"]["experience_level"]
          handle: string | null
          involvement: Database["public"]["Enums"]["involvement"]
          memory_enabled: boolean
          onboarding: Json
          primary_mode: Database["public"]["Enums"]["app_mode"]
          timezone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          experience?: Database["public"]["Enums"]["experience_level"]
          explanation_level?: Database["public"]["Enums"]["experience_level"]
          handle?: string | null
          involvement?: Database["public"]["Enums"]["involvement"]
          memory_enabled?: boolean
          onboarding?: Json
          primary_mode?: Database["public"]["Enums"]["app_mode"]
          timezone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          experience?: Database["public"]["Enums"]["experience_level"]
          explanation_level?: Database["public"]["Enums"]["experience_level"]
          handle?: string | null
          involvement?: Database["public"]["Enums"]["involvement"]
          memory_enabled?: boolean
          onboarding?: Json
          primary_mode?: Database["public"]["Enums"]["app_mode"]
          timezone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          id: string
          message_id: string | null
          reason: string
          reporter_id: string | null
          resolution: string | null
          room_id: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id?: string | null
          reason: string
          reporter_id?: string | null
          resolution?: string | null
          room_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string | null
          reason?: string
          reporter_id?: string | null
          resolution?: string | null
          room_id?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      risk_policies: {
        Row: {
          created_at: string
          daily_loss_cap_usd: number | null
          max_open_positions: number | null
          max_position_pct: number | null
          max_sector_concentration_pct: number | null
          min_reward_risk: number | null
          pdt_warnings: boolean | null
          updated_at: string | null
          updated_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_loss_cap_usd?: number | null
          max_open_positions?: number | null
          max_position_pct?: number | null
          max_sector_concentration_pct?: number | null
          min_reward_risk?: number | null
          pdt_warnings?: boolean | null
          updated_at?: string | null
          updated_by?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_loss_cap_usd?: number | null
          max_open_positions?: number | null
          max_position_pct?: number | null
          max_sector_concentration_pct?: number | null
          min_reward_risk?: number | null
          pdt_warnings?: boolean | null
          updated_at?: string | null
          updated_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_policies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "risk_policies_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      risk_policy_events: {
        Row: {
          change: Json
          created_at: string | null
          id: number
          user_id: string
        }
        Insert: {
          change: Json
          created_at?: string | null
          id?: number
          user_id: string
        }
        Update: {
          change?: Json
          created_at?: string | null
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      room_members: {
        Row: {
          banned: boolean | null
          created_at: string
          last_read_seq: number | null
          moderation_muted_until: string | null
          muted_until: string | null
          role: Database["public"]["Enums"]["member_role"]
          room_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          banned?: boolean | null
          created_at?: string
          last_read_seq?: number | null
          moderation_muted_until?: string | null
          muted_until?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          room_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          banned?: boolean | null
          created_at?: string
          last_read_seq?: number | null
          moderation_muted_until?: string | null
          muted_until?: string | null
          role?: Database["public"]["Enums"]["member_role"]
          room_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_members_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "room_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      room_seq_counters: {
        Row: {
          last_seq: number
          room_id: string
        }
        Insert: {
          last_seq?: number
          room_id: string
        }
        Update: {
          last_seq?: number
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_seq_counters_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          id: string
          mode: Database["public"]["Enums"]["app_mode"] | null
          name: string
          pinned: Json
          setup_id: string | null
          slug: string | null
          type: Database["public"]["Enums"]["room_type"]
          updated_at: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["app_mode"] | null
          name: string
          pinned?: Json
          setup_id?: string | null
          slug?: string | null
          type: Database["public"]["Enums"]["room_type"]
          updated_at?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["app_mode"] | null
          name?: string
          pinned?: Json
          setup_id?: string | null
          slug?: string | null
          type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_universes: {
        Row: {
          created_at: string
          name: string
          symbols: string[]
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          name: string
          symbols: string[]
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          name?: string
          symbols?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      setup_alert_prefs: {
        Row: {
          created_at: string
          enabled: boolean | null
          intents: Database["public"]["Enums"]["position_effect"][] | null
          max_per_day: number | null
          min_grade: Database["public"]["Enums"]["grade_band"] | null
          modes: Database["public"]["Enums"]["app_mode"][] | null
          quiet_hours: Json | null
          symbols_exclude: string[] | null
          symbols_include: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean | null
          intents?: Database["public"]["Enums"]["position_effect"][] | null
          max_per_day?: number | null
          min_grade?: Database["public"]["Enums"]["grade_band"] | null
          modes?: Database["public"]["Enums"]["app_mode"][] | null
          quiet_hours?: Json | null
          symbols_exclude?: string[] | null
          symbols_include?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean | null
          intents?: Database["public"]["Enums"]["position_effect"][] | null
          max_per_day?: number | null
          min_grade?: Database["public"]["Enums"]["grade_band"] | null
          modes?: Database["public"]["Enums"]["app_mode"][] | null
          quiet_hours?: Json | null
          symbols_exclude?: string[] | null
          symbols_include?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_alert_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "setup_alert_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      setup_events: {
        Row: {
          created_at: string | null
          id: number
          payload: Json
          seq: number
          setup_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          payload: Json
          seq: number
          setup_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: number
          payload?: Json
          seq?: number
          setup_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_events_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
        ]
      }
      setups: {
        Row: {
          annotations: Json | null
          catalyst: Json | null
          created_at: string
          discussion_room_id: string | null
          entry_condition: Json | null
          grade_band: Database["public"]["Enums"]["grade_band"] | null
          grade_display: string | null
          id: string
          intent: Database["public"]["Enums"]["position_effect"]
          invalidation: Json | null
          mode: Database["public"]["Enums"]["app_mode"]
          quote_snapshot: Json
          scanner_run_id: string | null
          score: number | null
          score_components: Json | null
          state: Database["public"]["Enums"]["setup_state"]
          stop: number | null
          symbol: string
          targets: Json | null
          thesis_plain: string | null
          thesis_technical: string | null
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          annotations?: Json | null
          catalyst?: Json | null
          created_at?: string
          discussion_room_id?: string | null
          entry_condition?: Json | null
          grade_band?: Database["public"]["Enums"]["grade_band"] | null
          grade_display?: string | null
          id?: string
          intent: Database["public"]["Enums"]["position_effect"]
          invalidation?: Json | null
          mode: Database["public"]["Enums"]["app_mode"]
          quote_snapshot: Json
          scanner_run_id?: string | null
          score?: number | null
          score_components?: Json | null
          state?: Database["public"]["Enums"]["setup_state"]
          stop?: number | null
          symbol: string
          targets?: Json | null
          thesis_plain?: string | null
          thesis_technical?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          annotations?: Json | null
          catalyst?: Json | null
          created_at?: string
          discussion_room_id?: string | null
          entry_condition?: Json | null
          grade_band?: Database["public"]["Enums"]["grade_band"] | null
          grade_display?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["position_effect"]
          invalidation?: Json | null
          mode?: Database["public"]["Enums"]["app_mode"]
          quote_snapshot?: Json
          scanner_run_id?: string | null
          score?: number | null
          score_components?: Json | null
          state?: Database["public"]["Enums"]["setup_state"]
          stop?: number | null
          symbol?: string
          targets?: Json | null
          thesis_plain?: string | null
          thesis_technical?: string | null
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_setup_room"
            columns: ["discussion_room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setups_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      system_status: {
        Row: {
          component: string
          created_at: string
          detail: Json | null
          healthy: boolean | null
          updated_at: string | null
        }
        Insert: {
          component: string
          created_at?: string
          detail?: Json | null
          healthy?: boolean | null
          updated_at?: string | null
        }
        Update: {
          component?: string
          created_at?: string
          detail?: Json | null
          healthy?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      theses: {
        Row: {
          created_at: string | null
          evidence: Json | null
          id: string
          intent: Database["public"]["Enums"]["position_effect"]
          mode: Database["public"]["Enums"]["app_mode"]
          setup_id: string | null
          status: string
          summary_plain: string
          superseded_by: string | null
          supersession: Json | null
          symbol: string
          timeframe: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          evidence?: Json | null
          id?: string
          intent: Database["public"]["Enums"]["position_effect"]
          mode: Database["public"]["Enums"]["app_mode"]
          setup_id?: string | null
          status?: string
          summary_plain: string
          superseded_by?: string | null
          supersession?: Json | null
          symbol: string
          timeframe: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          evidence?: Json | null
          id?: string
          intent?: Database["public"]["Enums"]["position_effect"]
          mode?: Database["public"]["Enums"]["app_mode"]
          setup_id?: string | null
          status?: string
          summary_plain?: string
          superseded_by?: string | null
          supersession?: Json | null
          symbol?: string
          timeframe?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "theses_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theses_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "theses"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_plans: {
        Row: {
          created_at: string | null
          entry_condition: Json | null
          exit_style: string
          id: string
          instrument_kind: Database["public"]["Enums"]["instrument_kind"]
          intent: Database["public"]["Enums"]["position_effect"]
          invalidation: Json | null
          mode: Database["public"]["Enums"]["app_mode"]
          occ_symbol: string | null
          origin: Json
          scenarios: Json | null
          setup_id: string | null
          size: Json | null
          status: Database["public"]["Enums"]["plan_status"]
          stop: number | null
          symbol: string
          targets: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entry_condition?: Json | null
          exit_style?: string
          id?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          intent: Database["public"]["Enums"]["position_effect"]
          invalidation?: Json | null
          mode: Database["public"]["Enums"]["app_mode"]
          occ_symbol?: string | null
          origin: Json
          scenarios?: Json | null
          setup_id?: string | null
          size?: Json | null
          status?: Database["public"]["Enums"]["plan_status"]
          stop?: number | null
          symbol: string
          targets?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entry_condition?: Json | null
          exit_style?: string
          id?: string
          instrument_kind?: Database["public"]["Enums"]["instrument_kind"]
          intent?: Database["public"]["Enums"]["position_effect"]
          invalidation?: Json | null
          mode?: Database["public"]["Enums"]["app_mode"]
          occ_symbol?: string | null
          origin?: Json
          scenarios?: Json | null
          setup_id?: string | null
          size?: Json | null
          status?: Database["public"]["Enums"]["plan_status"]
          stop?: number | null
          symbol?: string
          targets?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_plans_occ_symbol_fkey"
            columns: ["occ_symbol"]
            isOneToOne: false
            referencedRelation: "option_contracts"
            referencedColumns: ["occ_symbol"]
          },
          {
            foreignKeyName: "trade_plans_setup_id_fkey"
            columns: ["setup_id"]
            isOneToOne: false
            referencedRelation: "setups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "trade_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_event_counters: {
        Row: {
          last_seq: number
          user_id: string
        }
        Insert: {
          last_seq?: number
          user_id: string
        }
        Update: {
          last_seq?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_event_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_events: {
        Row: {
          entity_id: string
          entity_type: string
          event_type: string
          occurred_at: string
          payload: Json
          seq: number
          user_id: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          event_type: string
          occurred_at?: string
          payload: Json
          seq: number
          user_id: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          event_type?: string
          occurred_at?: string
          payload?: Json
          seq?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      verifications: {
        Row: {
          claim: string
          created_at: string | null
          effect_on_setup: string | null
          id: string
          kai_object_id: string | null
          message_id: string | null
          result: Database["public"]["Enums"]["verification_result"]
          sources: Json
          uncertainty: string | null
        }
        Insert: {
          claim: string
          created_at?: string | null
          effect_on_setup?: string | null
          id?: string
          kai_object_id?: string | null
          message_id?: string | null
          result: Database["public"]["Enums"]["verification_result"]
          sources: Json
          uncertainty?: string | null
        }
        Update: {
          claim?: string
          created_at?: string | null
          effect_on_setup?: string | null
          id?: string
          kai_object_id?: string | null
          message_id?: string | null
          result?: Database["public"]["Enums"]["verification_result"]
          sources?: Json
          uncertainty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verifications_kai_object_id_fkey"
            columns: ["kai_object_id"]
            isOneToOne: false
            referencedRelation: "kai_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages_public"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_items: {
        Row: {
          added_at: string
          note: string | null
          symbol: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          note?: string | null
          symbol: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          note?: string | null
          symbol?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_symbol_fkey"
            columns: ["symbol"]
            isOneToOne: false
            referencedRelation: "instruments"
            referencedColumns: ["symbol"]
          },
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "watchlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      messages_moderation: {
        Row: {
          body: string | null
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          flags: Json | null
          id: string | null
          kind: Database["public"]["Enums"]["message_kind"] | null
          parent_id: string | null
          position_disclosure: Json | null
          refs: Json | null
          room_id: string | null
          room_name: string | null
          room_slug: string | null
          seq: number | null
          structured_idea: Json | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      messages_public: {
        Row: {
          body: string | null
          created_at: string | null
          deleted: boolean | null
          deleted_at: string | null
          edited_at: string | null
          flags: Json | null
          id: string | null
          kind: Database["public"]["Enums"]["message_kind"] | null
          parent_id: string | null
          position_disclosure: Json | null
          refs: Json | null
          room_id: string | null
          seq: number | null
          structured_idea: Json | null
          user_id: string | null
        }
        Insert: {
          body?: never
          created_at?: string | null
          deleted?: never
          deleted_at?: string | null
          edited_at?: string | null
          flags?: Json | null
          id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"] | null
          parent_id?: string | null
          position_disclosure?: Json | null
          refs?: Json | null
          room_id?: string | null
          seq?: number | null
          structured_idea?: Json | null
          user_id?: string | null
        }
        Update: {
          body?: never
          created_at?: string | null
          deleted?: never
          deleted_at?: string | null
          edited_at?: string | null
          flags?: Json | null
          id?: string | null
          kind?: Database["public"]["Enums"]["message_kind"] | null
          parent_id?: string | null
          position_disclosure?: Json | null
          refs?: Json | null
          room_id?: string | null
          seq?: number | null
          structured_idea?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "messages_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          handle: string | null
          role_labels: string[] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      append_user_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_payload: Json
          p_user_id: string
        }
        Returns: number
      }
      complete_onboarding: {
        Args: { p_patch: Json; p_user_id: string }
        Returns: Json
      }
      is_room_member: { Args: { p_room: string }; Returns: boolean }
      join_core_room: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: {
          banned: boolean | null
          created_at: string
          last_read_seq: number | null
          moderation_muted_until: string | null
          muted_until: string | null
          role: Database["public"]["Enums"]["member_role"]
          room_id: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "room_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_room_message_seq: { Args: { p_room: string }; Returns: number }
      next_user_event_seq: { Args: { p_user: string }; Returns: number }
      notify: {
        Args: { p_kind: string; p_payload?: Json; p_user_id: string }
        Returns: {
          channel: Database["public"]["Enums"]["notif_channel"]
          created_at: string
          delivery: Json | null
          id: string
          kind: string
          payload: Json
          sent_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_kai_message: {
        Args: { p_body?: string; p_kai_object_id: string; p_room_id: string }
        Returns: {
          body: string | null
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          flags: Json
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          parent_id: string | null
          position_disclosure: Json | null
          refs: Json | null
          room_id: string
          seq: number
          structured_idea: Json | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      post_room_message: {
        Args: {
          p_body: string
          p_kind: Database["public"]["Enums"]["message_kind"]
          p_parent_id?: string
          p_position_disclosure?: Json
          p_refs?: Json
          p_room_id: string
          p_structured_idea?: Json
          p_user_id: string
        }
        Returns: {
          body: string | null
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          flags: Json
          id: string
          kind: Database["public"]["Enums"]["message_kind"]
          parent_id: string | null
          position_disclosure: Json | null
          refs: Json | null
          room_id: string
          seq: number
          structured_idea: Json | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_debrief: {
        Args: {
          p_kai_object_id?: string
          p_kai_summary?: string
          p_outcome: Json
          p_position_id: string
          p_process_review?: Json
          p_user_id: string
        }
        Returns: {
          created_at: string | null
          id: string
          kai_object_id: string | null
          kai_summary: string | null
          lesson_refs: string[] | null
          outcome: Json
          plan_id: string | null
          position_id: string | null
          process_review: Json | null
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "debriefs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reset_paper_account: { Args: { p_user_id: string }; Returns: Json }
      set_room_mute: {
        Args: { p_room_id: string; p_until: string; p_user_id: string }
        Returns: {
          banned: boolean | null
          created_at: string
          last_read_seq: number | null
          moderation_muted_until: string | null
          muted_until: string | null
          role: Database["public"]["Enums"]["member_role"]
          room_id: string
          updated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "room_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      simulate_closed_trade: {
        Args: {
          p_entry?: number
          p_exit?: number
          p_qty?: number
          p_symbol?: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      account_kind: "paper" | "broker"
      alert_status:
        | "draft"
        | "active"
        | "triggered"
        | "paused"
        | "expired"
        | "cancelled"
      app_mode: "day_trade" | "swing" | "invest"
      broker_conn_status:
        | "disconnected"
        | "connecting"
        | "connected"
        | "expired"
        | "permission_missing"
        | "error"
      connection_access: "read" | "trade"
      experience_level: "beginner" | "intermediate" | "advanced"
      freshness: "live" | "delayed" | "stale"
      grade_band: "A" | "B" | "C"
      instrument_kind: "equity" | "etf" | "option"
      involvement: "hands_on" | "guided"
      kai_object_type:
        | "briefing"
        | "graded_setup"
        | "comparison"
        | "research_report"
        | "verification_card"
        | "room_summary"
        | "community_intel"
        | "alert_preview"
        | "chart_response"
        | "position_update"
        | "action_preview"
        | "debrief"
        | "thesis_change"
      member_role: "member" | "moderator" | "educator" | "expert"
      message_kind:
        | "text"
        | "chart"
        | "voice_note"
        | "kai_object"
        | "position_update"
        | "system"
      moderation_action:
        | "remove"
        | "restrict"
        | "warn"
        | "mute"
        | "ban"
        | "lockdown"
        | "restore"
        | "label"
      notif_channel: "push" | "in_app"
      order_status:
        | "draft"
        | "previewed"
        | "submitted"
        | "accepted"
        | "partially_filled"
        | "filled"
        | "rejected"
        | "cancelled"
      order_type: "market" | "limit" | "stop" | "stop_limit"
      plan_status:
        | "draft"
        | "planned"
        | "active"
        | "exiting"
        | "closed"
        | "cancelled"
        | "invalidated"
      position_effect:
        | "buy_to_open"
        | "sell_to_close"
        | "sell_short"
        | "buy_to_cover"
      rebalance_status:
        | "proposed"
        | "previewed"
        | "confirmed"
        | "applied"
        | "dismissed"
      room_type: "core" | "setup" | "announcement"
      setup_state:
        | "discovered"
        | "watching"
        | "forming"
        | "ready"
        | "invalidated"
        | "expired"
      verification_result:
        | "verified"
        | "partially_verified"
        | "unverified"
        | "false"
        | "unverifiable"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_kind: ["paper", "broker"],
      alert_status: [
        "draft",
        "active",
        "triggered",
        "paused",
        "expired",
        "cancelled",
      ],
      app_mode: ["day_trade", "swing", "invest"],
      broker_conn_status: [
        "disconnected",
        "connecting",
        "connected",
        "expired",
        "permission_missing",
        "error",
      ],
      connection_access: ["read", "trade"],
      experience_level: ["beginner", "intermediate", "advanced"],
      freshness: ["live", "delayed", "stale"],
      grade_band: ["A", "B", "C"],
      instrument_kind: ["equity", "etf", "option"],
      involvement: ["hands_on", "guided"],
      kai_object_type: [
        "briefing",
        "graded_setup",
        "comparison",
        "research_report",
        "verification_card",
        "room_summary",
        "community_intel",
        "alert_preview",
        "chart_response",
        "position_update",
        "action_preview",
        "debrief",
        "thesis_change",
      ],
      member_role: ["member", "moderator", "educator", "expert"],
      message_kind: [
        "text",
        "chart",
        "voice_note",
        "kai_object",
        "position_update",
        "system",
      ],
      moderation_action: [
        "remove",
        "restrict",
        "warn",
        "mute",
        "ban",
        "lockdown",
        "restore",
        "label",
      ],
      notif_channel: ["push", "in_app"],
      order_status: [
        "draft",
        "previewed",
        "submitted",
        "accepted",
        "partially_filled",
        "filled",
        "rejected",
        "cancelled",
      ],
      order_type: ["market", "limit", "stop", "stop_limit"],
      plan_status: [
        "draft",
        "planned",
        "active",
        "exiting",
        "closed",
        "cancelled",
        "invalidated",
      ],
      position_effect: [
        "buy_to_open",
        "sell_to_close",
        "sell_short",
        "buy_to_cover",
      ],
      rebalance_status: [
        "proposed",
        "previewed",
        "confirmed",
        "applied",
        "dismissed",
      ],
      room_type: ["core", "setup", "announcement"],
      setup_state: [
        "discovered",
        "watching",
        "forming",
        "ready",
        "invalidated",
        "expired",
      ],
      verification_result: [
        "verified",
        "partially_verified",
        "unverified",
        "false",
        "unverifiable",
      ],
    },
  },
} as const

