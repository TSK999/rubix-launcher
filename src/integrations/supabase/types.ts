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
          last_seen_at: string
          left_at: string | null
          peer_id: string
          user_id: string
        }
        Insert: {
          call_id: string
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          peer_id: string
          user_id: string
        }
        Update: {
          call_id?: string
          joined_at?: string
          last_seen_at?: string
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
      clip_comments: {
        Row: {
          clip_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          clip_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          clip_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      clip_reactions: {
        Row: {
          clip_id: string
          created_at: string
          emoji: string
          user_id: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          emoji: string
          user_id: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          emoji?: string
          user_id?: string
        }
        Relationships: []
      }
      clip_reports: {
        Row: {
          clip_id: string
          created_at: string
          id: string
          reason: string
          reporter_id: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
        }
        Relationships: []
      }
      clip_views: {
        Row: {
          clip_id: string
          created_at: string
          user_id: string
          viewed_on: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          user_id: string
          viewed_on?: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          user_id?: string
          viewed_on?: string
        }
        Relationships: []
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
      community_event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          channel_id: string | null
          community_id: string
          created_at: string
          creator_id: string
          description: string | null
          ends_at: string | null
          game_cover: string | null
          game_title: string | null
          id: string
          max_attendees: number | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          channel_id?: string | null
          community_id: string
          created_at?: string
          creator_id: string
          description?: string | null
          ends_at?: string | null
          game_cover?: string | null
          game_title?: string | null
          id?: string
          max_attendees?: number | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          channel_id?: string | null
          community_id?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          ends_at?: string | null
          game_cover?: string | null
          game_title?: string | null
          id?: string
          max_attendees?: number | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_community_id_fkey"
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
          muted: boolean
          nickname: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          nickname?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          is_admin?: boolean
          joined_at?: string
          last_read_at?: string
          muted?: boolean
          nickname?: string | null
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
          executable_path: string | null
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
          executable_path?: string | null
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
          executable_path?: string | null
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
      game_clips_user: {
        Row: {
          caption: string | null
          created_at: string
          duration_seconds: number | null
          game_key: string
          height: number | null
          id: string
          size_bytes: number | null
          storage_path: string
          taken_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          duration_seconds?: number | null
          game_key: string
          height?: number | null
          id?: string
          size_bytes?: number | null
          storage_path: string
          taken_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          duration_seconds?: number | null
          game_key?: string
          height?: number | null
          id?: string
          size_bytes?: number | null
          storage_path?: string
          taken_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
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
      game_screenshots_user: {
        Row: {
          caption: string | null
          created_at: string
          game_key: string
          height: number | null
          id: string
          storage_path: string
          taken_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          game_key: string
          height?: number | null
          id?: string
          storage_path: string
          taken_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          game_key?: string
          height?: number | null
          id?: string
          storage_path?: string
          taken_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      game_user_data: {
        Row: {
          created_at: string
          game_key: string
          id: string
          notes: string
          source: string | null
          tags: string[]
          title_snapshot: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_key: string
          id?: string
          notes?: string
          source?: string | null
          tags?: string[]
          title_snapshot?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_key?: string
          id?: string
          notes?: string
          source?: string | null
          tags?: string[]
          title_snapshot?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      games: {
        Row: {
          age_rating: string
          cover_horizontal_url: string | null
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
          cover_horizontal_url?: string | null
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
          cover_horizontal_url?: string | null
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
      lfg_participants: {
        Row: {
          joined_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lfg_participants_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "lfg_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      lfg_posts: {
        Row: {
          community_id: string | null
          created_at: string
          expires_at: string
          game_cover: string | null
          game_title: string
          host_id: string
          id: string
          mic_required: boolean
          mode: string
          notes: string | null
          slots_total: number
          updated_at: string
          visibility: string
        }
        Insert: {
          community_id?: string | null
          created_at?: string
          expires_at?: string
          game_cover?: string | null
          game_title: string
          host_id: string
          id?: string
          mic_required?: boolean
          mode?: string
          notes?: string | null
          slots_total?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          community_id?: string | null
          created_at?: string
          expires_at?: string
          game_cover?: string | null
          game_title?: string
          host_id?: string
          id?: string
          mic_required?: boolean
          mode?: string
          notes?: string | null
          slots_total?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "lfg_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
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
      passport_stamps: {
        Row: {
          code: string
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string
          game_key: string | null
          icon_emoji: string
          id: string
          name: string
          rarity: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          criteria_type: string
          criteria_value?: number
          description: string
          game_key?: string | null
          icon_emoji?: string
          id?: string
          name: string
          rarity?: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string
          game_key?: string | null
          icon_emoji?: string
          id?: string
          name?: string
          rarity?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          background_kind: string | null
          background_url: string | null
          bio: string | null
          created_at: string
          customization: Json
          display_name: string | null
          id: string
          location: string | null
          privacy: string
          pronouns: string | null
          socials: Json
          status_emoji: string | null
          status_text: string | null
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
          customization?: Json
          display_name?: string | null
          id?: string
          location?: string | null
          privacy?: string
          pronouns?: string | null
          socials?: Json
          status_emoji?: string | null
          status_text?: string | null
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
          customization?: Json
          display_name?: string | null
          id?: string
          location?: string | null
          privacy?: string
          pronouns?: string | null
          socials?: Json
          status_emoji?: string | null
          status_text?: string | null
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
      shared_clips: {
        Row: {
          created_at: string
          duration_seconds: number | null
          game_key: string | null
          game_title: string | null
          height: number | null
          id: string
          mime_type: string | null
          original_path: string | null
          processing_status: string
          share_count: number
          share_slug: string
          size_bytes: number | null
          source_clip_id: string | null
          stream_path: string | null
          thumbnail_path: string | null
          title: string
          updated_at: string
          user_id: string
          view_count: number
          visibility: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          game_key?: string | null
          game_title?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          original_path?: string | null
          processing_status?: string
          share_count?: number
          share_slug?: string
          size_bytes?: number | null
          source_clip_id?: string | null
          stream_path?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          user_id: string
          view_count?: number
          visibility?: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          game_key?: string | null
          game_title?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          original_path?: string | null
          processing_status?: string
          share_count?: number
          share_slug?: string
          size_bytes?: number | null
          source_clip_id?: string | null
          stream_path?: string | null
          thumbnail_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
          visibility?: string
          width?: number | null
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
      user_game_playtime: {
        Row: {
          first_launched_at: string
          game_key: string
          id: string
          last_launched_at: string
          launch_count: number
          longest_session_seconds: number
          title_snapshot: string | null
          total_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          first_launched_at?: string
          game_key: string
          id?: string
          last_launched_at?: string
          launch_count?: number
          longest_session_seconds?: number
          title_snapshot?: string | null
          total_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          first_launched_at?: string
          game_key?: string
          id?: string
          last_launched_at?: string
          launch_count?: number
          longest_session_seconds?: number
          title_snapshot?: string | null
          total_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_passport_stamps: {
        Row: {
          earned_at: string
          game_key: string | null
          id: string
          stamp_id: string
          user_id: string
        }
        Insert: {
          earned_at?: string
          game_key?: string | null
          id?: string
          stamp_id: string
          user_id: string
        }
        Update: {
          earned_at?: string
          game_key?: string | null
          id?: string
          stamp_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_passport_stamps_stamp_id_fkey"
            columns: ["stamp_id"]
            isOneToOne: false
            referencedRelation: "passport_stamps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          auto_status: string | null
          game: string | null
          game_started_at: string | null
          last_active_at: string
          last_game: string | null
          last_game_ended_at: string | null
          last_seen_at: string
          manual_status: string | null
          session_day: string | null
          session_seconds_today: number
          spotify_art_url: string | null
          spotify_artist: string | null
          spotify_track: string | null
          spotify_updated_at: string | null
          updated_at: string
          user_id: string
          vc_call_id: string | null
          vc_channel_id: string | null
          vc_conversation_id: string | null
          vc_joined_at: string | null
          vc_speaking: boolean
        }
        Insert: {
          auto_status?: string | null
          game?: string | null
          game_started_at?: string | null
          last_active_at?: string
          last_game?: string | null
          last_game_ended_at?: string | null
          last_seen_at?: string
          manual_status?: string | null
          session_day?: string | null
          session_seconds_today?: number
          spotify_art_url?: string | null
          spotify_artist?: string | null
          spotify_track?: string | null
          spotify_updated_at?: string | null
          updated_at?: string
          user_id: string
          vc_call_id?: string | null
          vc_channel_id?: string | null
          vc_conversation_id?: string | null
          vc_joined_at?: string | null
          vc_speaking?: boolean
        }
        Update: {
          auto_status?: string | null
          game?: string | null
          game_started_at?: string | null
          last_active_at?: string
          last_game?: string | null
          last_game_ended_at?: string | null
          last_seen_at?: string
          manual_status?: string | null
          session_day?: string | null
          session_seconds_today?: number
          spotify_art_url?: string | null
          spotify_artist?: string | null
          spotify_track?: string | null
          spotify_updated_at?: string | null
          updated_at?: string
          user_id?: string
          vc_call_id?: string | null
          vc_channel_id?: string | null
          vc_conversation_id?: string | null
          vc_joined_at?: string | null
          vc_speaking?: boolean
        }
        Relationships: []
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
      public_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          id: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      are_rubix_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      can_view_lfg_post: {
        Args: { _post_id: string; _uid: string }
        Returns: boolean
      }
      channel_community: { Args: { _chid: string }; Returns: string }
      community_role_of: {
        Args: { _cid: string; _uid: string }
        Returns: Database["public"]["Enums"]["community_role"]
      }
      create_community: {
        Args: { _icon_url?: string; _name: string }
        Returns: string
      }
      event_community: { Args: { _eid: string }; Returns: string }
      gen_clip_slug: { Args: never; Returns: string }
      gen_invite_code: { Args: never; Returns: string }
      get_community_invite_code: { Args: { _cid: string }; Returns: string }
      get_friend_presence: {
        Args: { _uids: string[] }
        Returns: {
          game: string
          game_started_at: string
          last_active_at: string
          last_game: string
          last_game_ended_at: string
          last_seen_at: string
          manual_status: string
          session_seconds_today: number
          spotify_art_url: string
          spotify_artist: string
          spotify_track: string
          spotify_updated_at: string
          user_id: string
          vc_call_id: string
          vc_channel_id: string
          vc_channel_name: string
          vc_conversation_id: string
          vc_conversation_name: string
          vc_joined_at: string
          vc_participant_count: number
          vc_speaking: boolean
        }[]
      }
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
      increment_clip_share: { Args: { _clip_id: string }; Returns: undefined }
      increment_clip_view: { Args: { _clip_id: string }; Returns: undefined }
      is_call_member: {
        Args: { _call_id: string; _uid: string }
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
      is_friend_of: { Args: { _other: string }; Returns: boolean }
      join_community_by_code: { Args: { _code: string }; Returns: string }
      message_community: { Args: { _mid: string }; Returns: string }
      regenerate_invite_code: { Args: { _cid: string }; Returns: string }
      shared_clip_viewable: {
        Args: { _clip_id: string; _uid: string }
        Returns: boolean
      }
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
