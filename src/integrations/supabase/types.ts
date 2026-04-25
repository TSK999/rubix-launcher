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
      call_participants: {
        Row: {
          call_id: string
          joined_at: string
          left_at: string | null
          peer_id: string
          user_id: string
        }
        Insert: {
          call_id: string
          joined_at?: string
          left_at?: string | null
          peer_id: string
          user_id: string
        }
        Update: {
          call_id?: string
          joined_at?: string
          left_at?: string | null
          peer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          channel_id: string | null
          conversation_id: string | null
          ended_at: string | null
          id: string
          started_at: string
          started_by: string
        }
        Insert: {
          channel_id?: string | null
          conversation_id?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          started_by: string
        }
        Update: {
          channel_id?: string | null
          conversation_id?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          banner_url: string | null
          created_at: string
          icon_url: string | null
          id: string
          invite_code: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          icon_url?: string | null
          id?: string
          invite_code: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          icon_url?: string | null
          id?: string
          invite_code?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_channels: {
        Row: {
          community_id: string
          created_at: string
          id: string
          kind: string
          name: string
          position: number
        }
        Insert: {
          community_id: string
          created_at?: string
          id?: string
          kind: string
          name: string
          position?: number
        }
        Update: {
          community_id?: string
          created_at?: string
          id?: string
          kind?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_channels_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          joined_at: string
          role: Database["public"]["Enums"]["community_role"]
          user_id: string
        }
        Insert: {
          community_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["community_role"]
          user_id: string
        }
        Update: {
          community_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["community_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_message_attachments: {
        Row: {
          created_at: string
          external_url: string | null
          file_name: string | null
          height: number | null
          id: string
          kind: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          height?: number | null
          id?: string
          kind: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          height?: number | null
          id?: string
          kind?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          channel_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          channel_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          is_admin: boolean
          joined_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string
          id: string
          is_group: boolean
          last_message_at: string
          name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_group?: boolean
          last_message_at?: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_group?: boolean
          last_message_at?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_emojis: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          storage_path: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          storage_path: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          storage_path?: string
          url?: string
        }
        Relationships: []
      }
      developer_applications: {
        Row: {
          company_name: string
          contact_email: string
          created_at: string
          description: string
          full_name: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          company_name: string
          contact_email: string
          created_at?: string
          description: string
          full_name: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          company_name?: string
          contact_email?: string
          created_at?: string
          description?: string
          full_name?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      game_builds: {
        Row: {
          created_at: string
          external_url: string | null
          file_path: string | null
          file_size: number | null
          game_id: string
          id: string
          platform: string
          version: string
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_path?: string | null
          file_size?: number | null
          game_id: string
          id?: string
          platform?: string
          version?: string
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_path?: string | null
          file_size?: number | null
          game_id?: string
          id?: string
          platform?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_builds_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_requirements: {
        Row: {
          cpu: string | null
          created_at: string
          game_id: string
          gpu: string | null
          id: string
          os: string | null
          ram_gb: number | null
          storage_gb: number | null
          type: string
        }
        Insert: {
          cpu?: string | null
          created_at?: string
          game_id: string
          gpu?: string | null
          id?: string
          os?: string | null
          ram_gb?: number | null
          storage_gb?: number | null
          type: string
        }
        Update: {
          cpu?: string | null
          created_at?: string
          game_id?: string
          gpu?: string | null
          id?: string
          os?: string | null
          ram_gb?: number | null
          storage_gb?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_requirements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_screenshots: {
        Row: {
          created_at: string
          game_id: string
          id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_screenshots_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          age_rating: string
          cover_url: string | null
          created_at: string
          description: string
          developer_id: string
          id: string
          price_cents: number
          rejection_reason: string | null
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          age_rating?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          developer_id: string
          id?: string
          price_cents?: number
          rejection_reason?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          age_rating?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          developer_id?: string
          id?: string
          price_cents?: number
          rejection_reason?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_attachments: {
        Row: {
          created_at: string
          external_url: string | null
          file_name: string | null
          height: number | null
          id: string
          kind: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          height?: number | null
          id?: string
          kind: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          external_url?: string | null
          file_name?: string | null
          height?: number | null
          id?: string
          kind?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          game_id: string
          id: string
          price_cents: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          price_cents?: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          price_cents?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          background_kind: string | null
          background_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          id: string
          privacy: string
          socials: Json
          steam_id: string | null
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          background_kind?: string | null
          background_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          privacy?: string
          socials?: Json
          steam_id?: string | null
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          background_kind?: string | null
          background_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          privacy?: string
          socials?: Json
          steam_id?: string | null
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      rubix_friendships: {
        Row: {
          created_at: string
          id: string
          requested_by: string
          status: string
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          requested_by: string
          status?: string
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          requested_by?: string
          status?: string
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      spotify_connections: {
        Row: {
          access_token: string
          avatar_url: string | null
          created_at: string
          display_name: string | null
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          spotify_id: string
          spotify_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          spotify_id: string
          spotify_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          spotify_id?: string
          spotify_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      typing_indicators: {
        Row: {
          conversation_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      are_rubix_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      channel_community: { Args: { _chid: string }; Returns: string }
      community_role_of: {
        Args: { _cid: string; _uid: string }
        Returns: Database["public"]["Enums"]["community_role"]
      }
      create_community: {
        Args: { _icon_url?: string; _name: string }
        Returns: string
      }
      gen_invite_code: { Args: never; Returns: string }
      get_or_create_direct_conversation: {
        Args: { _other_user_id: string }
        Returns: string
      }
      get_spotify_linked_users: {
        Args: { _user_ids: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          spotify_id: string
          spotify_username: string
          user_id: string
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: {
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_community_admin: {
        Args: { _cid: string; _uid: string }
        Returns: boolean
      }
      is_community_member: {
        Args: { _cid: string; _uid: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      join_community_by_code: { Args: { _code: string }; Returns: string }
      message_community: { Args: { _mid: string }; Returns: string }
      regenerate_invite_code: { Args: { _cid: string }; Returns: string }
      user_owns_game: {
        Args: { _game: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "developer" | "admin"
      community_role: "owner" | "admin" | "member"
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
      app_role: ["user", "developer", "admin"],
      community_role: ["owner", "admin", "member"],
    },
  },
} as const
