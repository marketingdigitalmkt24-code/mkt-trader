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
      client_profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      iqoption_config: {
        Row: {
          account_type: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          last_connected_at: string | null
          password: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          account_type?: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          last_connected_at?: string | null
          password: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          account_type?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          last_connected_at?: string | null
          password?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      metaapi_config: {
        Row: {
          account_id: string
          account_name: string | null
          connection_status: string | null
          created_at: string
          id: string
          is_active: boolean
          mt5_login: string | null
          mt5_password: string | null
          mt5_server: string | null
          take_profit_pips: number
          token: string
          updated_at: string
          volume: number
        }
        Insert: {
          account_id: string
          account_name?: string | null
          connection_status?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mt5_login?: string | null
          mt5_password?: string | null
          mt5_server?: string | null
          take_profit_pips?: number
          token: string
          updated_at?: string
          volume?: number
        }
        Update: {
          account_id?: string
          account_name?: string | null
          connection_status?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mt5_login?: string | null
          mt5_password?: string | null
          mt5_server?: string | null
          take_profit_pips?: number
          token?: string
          updated_at?: string
          volume?: number
        }
        Relationships: []
      }
      operation_results: {
        Row: {
          asset: string
          created_at: string
          direction: string
          entry_price: number | null
          exit_price: number | null
          expiration_time: string | null
          id: string
          iq_option_id: string | null
          is_ai_analyzed: boolean | null
          is_auto_trade: boolean | null
          profit: number
          result: string
          signal_id: string
          timeframe: string
        }
        Insert: {
          asset: string
          created_at?: string
          direction: string
          entry_price?: number | null
          exit_price?: number | null
          expiration_time?: string | null
          id?: string
          iq_option_id?: string | null
          is_ai_analyzed?: boolean | null
          is_auto_trade?: boolean | null
          profit?: number
          result: string
          signal_id: string
          timeframe?: string
        }
        Update: {
          asset?: string
          created_at?: string
          direction?: string
          entry_price?: number | null
          exit_price?: number | null
          expiration_time?: string | null
          id?: string
          iq_option_id?: string | null
          is_ai_analyzed?: boolean | null
          is_auto_trade?: boolean | null
          profit?: number
          result?: string
          signal_id?: string
          timeframe?: string
        }
        Relationships: []
      }
      price_candles: {
        Row: {
          created_at: string
          id: string
          price: number
          symbol: string
        }
        Insert: {
          created_at?: string
          id?: string
          price: number
          symbol: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          symbol?: string
        }
        Relationships: []
      }
      trade_queue: {
        Row: {
          amount: number
          asset: string
          confluence_score: number
          created_at: string
          direction: string
          error: string | null
          executed_at: string | null
          expiration: number
          id: string
          iq_option_id: string | null
          profit: number | null
          result: string | null
          signal_id: string
          status: string
          timeframe: string
        }
        Insert: {
          amount?: number
          asset: string
          confluence_score?: number
          created_at?: string
          direction: string
          error?: string | null
          executed_at?: string | null
          expiration?: number
          id?: string
          iq_option_id?: string | null
          profit?: number | null
          result?: string | null
          signal_id: string
          status?: string
          timeframe?: string
        }
        Update: {
          amount?: number
          asset?: string
          confluence_score?: number
          created_at?: string
          direction?: string
          error?: string | null
          executed_at?: string | null
          expiration?: number
          id?: string
          iq_option_id?: string | null
          profit?: number | null
          result?: string | null
          signal_id?: string
          status?: string
          timeframe?: string
        }
        Relationships: []
      }
      trading_signals: {
        Row: {
          asset: string
          asset_icon: string
          confirmations: Json
          confluence_count: number
          confluence_score: number
          created_at: string
          expiration: string
          id: string
          indicators: Json
          is_hot: boolean
          market_type: string
          price: number
          signal_id: string
          status: string
          strength: number
          timeframe: string
          type: string
        }
        Insert: {
          asset: string
          asset_icon?: string
          confirmations?: Json
          confluence_count?: number
          confluence_score?: number
          created_at?: string
          expiration: string
          id?: string
          indicators?: Json
          is_hot?: boolean
          market_type: string
          price: number
          signal_id: string
          status?: string
          strength?: number
          timeframe: string
          type: string
        }
        Update: {
          asset?: string
          asset_icon?: string
          confirmations?: Json
          confluence_count?: number
          confluence_score?: number
          created_at?: string
          expiration?: string
          id?: string
          indicators?: Json
          is_hot?: boolean
          market_type?: string
          price?: number
          signal_id?: string
          status?: string
          strength?: number
          timeframe?: string
          type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_trading_settings: {
        Row: {
          ai_min_confidence: number
          auto_trading_enabled: boolean
          created_at: string
          daily_limit_enabled: boolean
          id: string
          iq_max_stake_pct: number
          iq_stake_cap_usd: number
          max_consecutive_losses: number
          max_daily_trades: number
          min_confluence: number
          mt5_trade_amount: number
          profit_target_type: string
          profit_target_value: number
          risk_per_trade: number
          trade_amount: number
          updated_at: string
          use_ai_analysis: boolean
          use_dynamic_stake: boolean
          user_id: string
        }
        Insert: {
          ai_min_confidence?: number
          auto_trading_enabled?: boolean
          created_at?: string
          daily_limit_enabled?: boolean
          id?: string
          iq_max_stake_pct?: number
          iq_stake_cap_usd?: number
          max_consecutive_losses?: number
          max_daily_trades?: number
          min_confluence?: number
          mt5_trade_amount?: number
          profit_target_type?: string
          profit_target_value?: number
          risk_per_trade?: number
          trade_amount?: number
          updated_at?: string
          use_ai_analysis?: boolean
          use_dynamic_stake?: boolean
          user_id: string
        }
        Update: {
          ai_min_confidence?: number
          auto_trading_enabled?: boolean
          created_at?: string
          daily_limit_enabled?: boolean
          id?: string
          iq_max_stake_pct?: number
          iq_stake_cap_usd?: number
          max_consecutive_losses?: number
          max_daily_trades?: number
          min_confluence?: number
          mt5_trade_amount?: number
          profit_target_type?: string
          profit_target_value?: number
          risk_per_trade?: number
          trade_amount?: number
          updated_at?: string
          use_ai_analysis?: boolean
          use_dynamic_stake?: boolean
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_numbers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string | null
          phone_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          phone_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      zapi_config: {
        Row: {
          client_token: string
          created_at: string
          id: string
          instance_id: string
          is_active: boolean
          token: string
          updated_at: string
        }
        Insert: {
          client_token: string
          created_at?: string
          id?: string
          instance_id: string
          is_active?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          client_token?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_active?: boolean
          token?: string
          updated_at?: string
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
      app_role: "admin" | "moderator" | "user"
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
    },
  },
} as const
