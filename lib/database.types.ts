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
      alerts: {
        Row: {
          category_id: string | null
          community_id: string | null
          condition: Database["public"]["Enums"]["item_condition"] | null
          created_at: string
          description: string
          duration_hours: number
          expires_at: string
          id: string
          last_matched_at: string | null
          location_pref: string | null
          match_count: number
          max_price: number | null
          notify: Database["public"]["Enums"]["notify_channel"]
          status: Database["public"]["Enums"]["alert_status"]
          title: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          community_id?: string | null
          condition?: Database["public"]["Enums"]["item_condition"] | null
          created_at?: string
          description: string
          duration_hours: number
          expires_at: string
          id?: string
          last_matched_at?: string | null
          location_pref?: string | null
          match_count?: number
          max_price?: number | null
          notify?: Database["public"]["Enums"]["notify_channel"]
          status?: Database["public"]["Enums"]["alert_status"]
          title: string
          user_id: string
        }
        Update: {
          category_id?: string | null
          community_id?: string | null
          condition?: Database["public"]["Enums"]["item_condition"] | null
          created_at?: string
          description?: string
          duration_hours?: number
          expires_at?: string
          id?: string
          last_matched_at?: string | null
          location_pref?: string | null
          match_count?: number
          max_price?: number | null
          notify?: Database["public"]["Enums"]["notify_channel"]
          status?: Database["public"]["Enums"]["alert_status"]
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          body: string
          community_id: string
          created_at: string
          id: string
          is_pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          community_id: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          community_id?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id: string
          is_active?: boolean
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      comments: {
        Row: {
          body: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["feed_entity_type"]
          id: string
          is_edited: boolean
          like_count: number
          parent_comment_id: string | null
          reply_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["feed_entity_type"]
          id?: string
          is_edited?: boolean
          like_count?: number
          parent_comment_id?: string | null
          reply_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["feed_entity_type"]
          id?: string
          is_edited?: boolean
          like_count?: number
          parent_comment_id?: string | null
          reply_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          active_since: string
          co2_saved_kg: number
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          items_circulated: number
          location: string | null
          member_count: number
          name: string
          slug: string
          type: Database["public"]["Enums"]["community_type"]
          updated_at: string
        }
        Insert: {
          active_since?: string
          co2_saved_kg?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          items_circulated?: number
          location?: string | null
          member_count?: number
          name: string
          slug: string
          type?: Database["public"]["Enums"]["community_type"]
          updated_at?: string
        }
        Update: {
          active_since?: string
          co2_saved_kg?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          items_circulated?: number
          location?: string | null
          member_count?: number
          name?: string
          slug?: string
          type?: Database["public"]["Enums"]["community_type"]
          updated_at?: string
        }
        Relationships: []
      }
      community_members: {
        Row: {
          community_id: string
          joined_at: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          community_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          community_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["member_role"]
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
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_milestones: {
        Row: {
          community_id: string
          description: string | null
          id: string
          is_pinned: boolean
          metric: string
          reached_at: string
          title: string
          value_display: string
          value_numeric: number | null
        }
        Insert: {
          community_id: string
          description?: string | null
          id?: string
          is_pinned?: boolean
          metric: string
          reached_at?: string
          title: string
          value_display: string
          value_numeric?: number | null
        }
        Update: {
          community_id?: string
          description?: string | null
          id?: string
          is_pinned?: boolean
          metric?: string
          reached_at?: string
          title?: string
          value_display?: string
          value_numeric?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_milestones_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_id: string
          target_type: string
          target_user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id: string
          target_type: string
          target_user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_id?: string
          target_type?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string | null
          last_sender_id: string | null
          listing_id: string | null
          subject: string | null
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          last_sender_id?: string | null
          listing_id?: string | null
          subject?: string | null
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          last_sender_id?: string | null
          listing_id?: string | null
          subject?: string | null
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      event_form_responses: {
        Row: {
          answers: Json
          event_id: string
          form_id: string
          id: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          event_id: string
          form_id: string
          id?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          event_id?: string
          form_id?: string
          id?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_form_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "event_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_form_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_form_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_forms: {
        Row: {
          created_at: string
          event_id: string
          fields: Json
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          fields?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          fields?: Json
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_forms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          event_id: string
          rsvped_at: string
          status: Database["public"]["Enums"]["rsvp_status"]
          user_id: string
        }
        Insert: {
          event_id: string
          rsvped_at?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          user_id: string
        }
        Update: {
          event_id?: string
          rsvped_at?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_saves: {
        Row: {
          event_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          event_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          event_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_saves_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "event_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendee_count: number
          color_accent: string | null
          community_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          location: string
          max_attendees: number | null
          organizer_id: string
          photo_urls: string[]
          save_count: number
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at: string
          video_urls: string[]
          view_count: number
        }
        Insert: {
          attendee_count?: number
          color_accent?: string | null
          community_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          location: string
          max_attendees?: number | null
          organizer_id: string
          photo_urls?: string[]
          save_count?: number
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          updated_at?: string
          video_urls?: string[]
          view_count?: number
        }
        Update: {
          attendee_count?: number
          color_accent?: string | null
          community_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          location?: string
          max_attendees?: number | null
          organizer_id?: string
          photo_urls?: string[]
          save_count?: number
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          updated_at?: string
          video_urls?: string[]
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_log: {
        Row: {
          action_type: string
          co2_kg: number
          community_id: string
          created_at: string
          id: string
          money_saved: number
          notes: string | null
          points: number
          related_event_id: string | null
          related_listing_id: string | null
          related_request_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          co2_kg?: number
          community_id: string
          created_at?: string
          id?: string
          money_saved?: number
          notes?: string | null
          points?: number
          related_event_id?: string | null
          related_listing_id?: string | null
          related_request_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          co2_kg?: number
          community_id?: string
          created_at?: string
          id?: string
          money_saved?: number
          notes?: string | null
          points?: number
          related_event_id?: string | null
          related_listing_id?: string | null
          related_request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impact_log_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_log_related_event_id_fkey"
            columns: ["related_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_log_related_listing_id_fkey"
            columns: ["related_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_log_related_request_id_fkey"
            columns: ["related_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impact_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "impact_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          borrow_started_at: string | null
          borrowed_by: string | null
          category_id: string | null
          community_id: string
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          owner_id: string | null
          photo_color: string | null
          photo_icon: string | null
          photo_url: string | null
          status: Database["public"]["Enums"]["inventory_status"]
          title: string
          total_borrows: number
          updated_at: string
        }
        Insert: {
          borrow_started_at?: string | null
          borrowed_by?: string | null
          category_id?: string | null
          community_id: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          photo_color?: string | null
          photo_icon?: string | null
          photo_url?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          title: string
          total_borrows?: number
          updated_at?: string
        }
        Update: {
          borrow_started_at?: string | null
          borrowed_by?: string | null
          category_id?: string | null
          community_id?: string
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          owner_id?: string | null
          photo_color?: string | null
          photo_icon?: string | null
          photo_url?: string | null
          status?: Database["public"]["Enums"]["inventory_status"]
          title?: string
          total_borrows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_borrowed_by_fkey"
            columns: ["borrowed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_items_borrowed_by_fkey"
            columns: ["borrowed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "inventory_items_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_responses: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          message: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          message?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          message?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_responses_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "listing_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category_id: string | null
          community_id: string
          comp: string | null
          condition: Database["public"]["Enums"]["item_condition"]
          description: string | null
          id: string
          is_featured: boolean
          kind: string
          listing_type: Database["public"]["Enums"]["listing_type"]
          location: string | null
          notify_on_engagement: boolean | null
          photo_color: string | null
          photo_icon: string | null
          photo_urls: string[]
          posted_at: string
          price: number | null
          price_band: string | null
          response_count: number
          save_count: number
          status: Database["public"]["Enums"]["listing_status"]
          tags: string[]
          title: string
          updated_at: string
          user_id: string
          video_urls: string[]
          view_count: number
        }
        Insert: {
          category_id?: string | null
          community_id: string
          comp?: string | null
          condition?: Database["public"]["Enums"]["item_condition"]
          description?: string | null
          id?: string
          is_featured?: boolean
          kind?: string
          listing_type: Database["public"]["Enums"]["listing_type"]
          location?: string | null
          notify_on_engagement?: boolean | null
          photo_color?: string | null
          photo_icon?: string | null
          photo_urls?: string[]
          posted_at?: string
          price?: number | null
          price_band?: string | null
          response_count?: number
          save_count?: number
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
          video_urls?: string[]
          view_count?: number
        }
        Update: {
          category_id?: string | null
          community_id?: string
          comp?: string | null
          condition?: Database["public"]["Enums"]["item_condition"]
          description?: string | null
          id?: string
          is_featured?: boolean
          kind?: string
          listing_type?: Database["public"]["Enums"]["listing_type"]
          location?: string | null
          notify_on_engagement?: boolean | null
          photo_color?: string | null
          photo_icon?: string | null
          photo_urls?: string[]
          posted_at?: string
          price?: number | null
          price_band?: string | null
          response_count?: number
          save_count?: number
          status?: Database["public"]["Enums"]["listing_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
          video_urls?: string[]
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_found_reports: {
        Row: {
          category_id: string | null
          claimed_at: string | null
          claimed_by: string | null
          community_id: string
          contact_email: string | null
          contact_phone: string | null
          description: string | null
          id: string
          last_seen: string | null
          last_seen_date: string | null
          notify_on_engagement: boolean | null
          photo_color: string | null
          photo_icon: string | null
          photo_urls: string[]
          posted_at: string
          reward: string | null
          status: Database["public"]["Enums"]["lost_found_status"]
          title: string
          updated_at: string
          user_id: string
          verified: boolean
          video_urls: string[]
        }
        Insert: {
          category_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          community_id: string
          contact_email?: string | null
          contact_phone?: string | null
          description?: string | null
          id?: string
          last_seen?: string | null
          last_seen_date?: string | null
          notify_on_engagement?: boolean | null
          photo_color?: string | null
          photo_icon?: string | null
          photo_urls?: string[]
          posted_at?: string
          reward?: string | null
          status: Database["public"]["Enums"]["lost_found_status"]
          title: string
          updated_at?: string
          user_id: string
          verified?: boolean
          video_urls?: string[]
        }
        Update: {
          category_id?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          community_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          description?: string | null
          id?: string
          last_seen?: string | null
          last_seen_date?: string | null
          notify_on_engagement?: boolean | null
          photo_color?: string | null
          photo_icon?: string | null
          photo_urls?: string[]
          posted_at?: string
          reward?: string | null
          status?: Database["public"]["Enums"]["lost_found_status"]
          title?: string
          updated_at?: string
          user_id?: string
          verified?: boolean
          video_urls?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "lost_found_reports_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_reports_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lost_found_reports_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_reports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_found_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lost_found_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
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
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: Database["public"]["Enums"]["feed_entity_type"] | null
          id: string
          is_read: boolean
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["feed_entity_type"] | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          actor_id?: string | null
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: Database["public"]["Enums"]["feed_entity_type"] | null
          id?: string
          is_read?: boolean
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
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
          allow_dms: boolean
          avatar_color: string | null
          avatar_url: string | null
          badges: string[]
          bio: string | null
          co2_saved_kg: number
          college_id: string | null
          community_id: string | null
          contact_email_enabled: boolean
          contact_whatsapp_enabled: boolean
          course: string | null
          department: string | null
          email: string | null
          full_name: string | null
          graduating_year: number | null
          hide_listings_from_search: boolean
          hide_prices_on_feed: boolean
          id: string
          impact_score: number
          initials: string | null
          is_online: boolean
          items_received_count: number
          items_shared_count: number
          joined_at: string
          larger_text: boolean
          last_active_at: string | null
          money_saved: number
          notification_prefs: Json
          phone: string | null
          repairs_helped_count: number
          residence: Database["public"]["Enums"]["residence_kind"] | null
          role: string | null
          show_online_status: boolean
          show_phone_on_profile: boolean
          theme: string
          updated_at: string
          username: string | null
        }
        Insert: {
          allow_dms?: boolean
          avatar_color?: string | null
          avatar_url?: string | null
          badges?: string[]
          bio?: string | null
          co2_saved_kg?: number
          college_id?: string | null
          community_id?: string | null
          contact_email_enabled?: boolean
          contact_whatsapp_enabled?: boolean
          course?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          graduating_year?: number | null
          hide_listings_from_search?: boolean
          hide_prices_on_feed?: boolean
          id: string
          impact_score?: number
          initials?: string | null
          is_online?: boolean
          items_received_count?: number
          items_shared_count?: number
          joined_at?: string
          larger_text?: boolean
          last_active_at?: string | null
          money_saved?: number
          notification_prefs?: Json
          phone?: string | null
          repairs_helped_count?: number
          residence?: Database["public"]["Enums"]["residence_kind"] | null
          role?: string | null
          show_online_status?: boolean
          show_phone_on_profile?: boolean
          theme?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          allow_dms?: boolean
          avatar_color?: string | null
          avatar_url?: string | null
          badges?: string[]
          bio?: string | null
          co2_saved_kg?: number
          college_id?: string | null
          community_id?: string | null
          contact_email_enabled?: boolean
          contact_whatsapp_enabled?: boolean
          course?: string | null
          department?: string | null
          email?: string | null
          full_name?: string | null
          graduating_year?: number | null
          hide_listings_from_search?: boolean
          hide_prices_on_feed?: boolean
          id?: string
          impact_score?: number
          initials?: string | null
          is_online?: boolean
          items_received_count?: number
          items_shared_count?: number
          joined_at?: string
          larger_text?: boolean
          last_active_at?: string | null
          money_saved?: number
          notification_prefs?: Json
          phone?: string | null
          repairs_helped_count?: number
          residence?: Database["public"]["Enums"]["residence_kind"] | null
          role?: string | null
          show_online_status?: boolean
          show_phone_on_profile?: boolean
          theme?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      push_queue: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["notify_channel"]
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["push_status"]
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["notify_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          payload: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["push_status"]
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notify_channel"]
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["push_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["feed_entity_type"]
          id: string
          kind: Database["public"]["Enums"]["reaction_kind"]
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["feed_entity_type"]
          id?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["feed_entity_type"]
          id?: string
          kind?: Database["public"]["Enums"]["reaction_kind"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_offers: {
        Row: {
          created_at: string
          id: string
          message: string | null
          request_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          request_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_offers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "request_offers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          category_id: string | null
          community_id: string
          description: string | null
          expires_at: string | null
          id: string
          need_by_date: string | null
          notify_on_engagement: boolean | null
          offer_count: number
          photo_urls: string[]
          posted_at: string
          status: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["request_urgency"]
          user_id: string
          video_urls: string[]
        }
        Insert: {
          category_id?: string | null
          community_id: string
          description?: string | null
          expires_at?: string | null
          id?: string
          need_by_date?: string | null
          notify_on_engagement?: boolean | null
          offer_count?: number
          photo_urls?: string[]
          posted_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["request_urgency"]
          user_id: string
          video_urls?: string[]
        }
        Update: {
          category_id?: string | null
          community_id?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          need_by_date?: string | null
          notify_on_engagement?: boolean | null
          offer_count?: number
          photo_urls?: string[]
          posted_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["request_urgency"]
          user_id?: string
          video_urls?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_searches: {
        Row: {
          created_at: string
          id: string
          query: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query: string
          scope?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      saves: {
        Row: {
          listing_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          listing_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          listing_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saves_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_view"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocker_id: string
          created_at: string
          target_id: string
        }
        Insert: {
          blocker_id: string
          created_at?: string
          target_id: string
        }
        Update: {
          blocker_id?: string
          created_at?: string
          target_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      feed_view: {
        Row: {
          author_id: string | null
          body: string | null
          community_id: string | null
          data: Json | null
          entity_type: Database["public"]["Enums"]["feed_entity_type"] | null
          id: string | null
          posted_at: string | null
          response_count: number | null
          save_count: number | null
          title: string | null
        }
        Relationships: []
      }
      leaderboard_view: {
        Row: {
          avatar_color: string | null
          avatar_url: string | null
          co2_saved_kg: number | null
          community_id: string | null
          community_rank: number | null
          full_name: string | null
          global_rank: number | null
          impact_score: number | null
          initials: string | null
          items_received_count: number | null
          items_shared_count: number | null
          role: string | null
          user_id: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_notification: {
        Args: {
          _actor_id: string
          _body: string
          _entity_id: string
          _entity_type: Database["public"]["Enums"]["feed_entity_type"]
          _title: string
          _type: Database["public"]["Enums"]["notification_type"]
          _user_id: string
        }
        Returns: undefined
      }
      delete_my_account: { Args: never; Returns: undefined }
      get_contact: {
        Args: { target: string }
        Returns: {
          contact_email_enabled: boolean
          contact_whatsapp_enabled: boolean
          email: string
          phone: string
        }[]
      }
      get_or_create_conversation: {
        Args: { _listing_id?: string; _other_user: string; _subject?: string }
        Returns: string
      }
      invoke_send_push: { Args: never; Returns: undefined }
      is_community_admin: { Args: { _community_id: string }; Returns: boolean }
      is_community_member: { Args: { _community_id: string }; Returns: boolean }
      is_wecycle_admin: { Args: never; Returns: boolean }
      mark_expired_alerts: { Args: never; Returns: number }
      password_policy: { Args: never; Returns: Json }
      purge_old_expired_alerts: { Args: never; Returns: number }
      rpc_community_feed: {
        Args: { _before?: string; _community_id: string; _limit?: number }
        Returns: {
          author_id: string | null
          body: string | null
          community_id: string | null
          data: Json | null
          entity_type: Database["public"]["Enums"]["feed_entity_type"] | null
          id: string | null
          posted_at: string | null
          response_count: number | null
          save_count: number | null
          title: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feed_view"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_increment_event_view: {
        Args: { _event_id: string }
        Returns: undefined
      }
      rpc_increment_listing_view: {
        Args: { _listing_id: string }
        Returns: undefined
      }
      rpc_mark_notifications_read: {
        Args: { _ids?: string[] }
        Returns: number
      }
      rpc_my_impact_summary: { Args: never; Returns: Json }
      rpc_toggle_event_save: { Args: { _event_id: string }; Returns: boolean }
      rpc_toggle_like: {
        Args: {
          _entity_id: string
          _entity_type: Database["public"]["Enums"]["feed_entity_type"]
        }
        Returns: boolean
      }
      rpc_toggle_rsvp: { Args: { _event_id: string }; Returns: string }
      rpc_toggle_save: { Args: { _listing_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      subscribers_for_text: {
        Args: { _exclude_user: string; _scope: string; _text: string }
        Returns: {
          auth: string
          endpoint: string
          matched_query: string
          p256dh: string
        }[]
      }
      upsert_push_subscription: {
        Args: {
          _auth: string
          _endpoint: string
          _p256dh: string
          _user_agent?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      alert_status: "active" | "matched" | "expired" | "cancelled"
      community_type: "campus" | "apartment" | "office" | "neighborhood"
      event_status: "pending_review" | "published" | "completed" | "cancelled"
      event_type:
        | "swap"
        | "repair"
        | "cleanup"
        | "workshop"
        | "drive"
        | "challenge"
      feed_entity_type:
        | "listing"
        | "request"
        | "event"
        | "lost_found"
        | "milestone"
        | "announcement"
        | "alert"
      inventory_status: "available" | "borrowed" | "maintenance" | "retired"
      item_condition: "like_new" | "good" | "fair"
      listing_status: "active" | "pending" | "completed" | "hidden" | "removed"
      listing_type: "free" | "swap" | "borrow" | "sell"
      lost_found_status: "lost" | "found" | "claimed" | "returned"
      member_role: "member" | "moderator" | "admin"
      notification_type:
        | "response_received"
        | "request_help_offered"
        | "event_rsvp"
        | "event_starting_soon"
        | "item_liked"
        | "item_commented"
        | "lost_found_match"
        | "milestone_reached"
        | "community_announcement"
        | "alert_match"
        | "alert_expired"
      notify_channel: "email" | "phone" | "both"
      push_status: "pending" | "sent" | "failed" | "skipped"
      reaction_kind: "like"
      request_status: "open" | "fulfilled" | "expired" | "cancelled"
      request_urgency: "normal" | "urgent"
      residence_kind: "day_scholar" | "hosteler"
      rsvp_status: "going" | "maybe" | "declined"
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
      alert_status: ["active", "matched", "expired", "cancelled"],
      community_type: ["campus", "apartment", "office", "neighborhood"],
      event_status: ["pending_review", "published", "completed", "cancelled"],
      event_type: [
        "swap",
        "repair",
        "cleanup",
        "workshop",
        "drive",
        "challenge",
      ],
      feed_entity_type: [
        "listing",
        "request",
        "event",
        "lost_found",
        "milestone",
        "announcement",
        "alert",
      ],
      inventory_status: ["available", "borrowed", "maintenance", "retired"],
      item_condition: ["like_new", "good", "fair"],
      listing_status: ["active", "pending", "completed", "hidden", "removed"],
      listing_type: ["free", "swap", "borrow", "sell"],
      lost_found_status: ["lost", "found", "claimed", "returned"],
      member_role: ["member", "moderator", "admin"],
      notification_type: [
        "response_received",
        "request_help_offered",
        "event_rsvp",
        "event_starting_soon",
        "item_liked",
        "item_commented",
        "lost_found_match",
        "milestone_reached",
        "community_announcement",
        "alert_match",
        "alert_expired",
      ],
      notify_channel: ["email", "phone", "both"],
      push_status: ["pending", "sent", "failed", "skipped"],
      reaction_kind: ["like"],
      request_status: ["open", "fulfilled", "expired", "cancelled"],
      request_urgency: ["normal", "urgent"],
      residence_kind: ["day_scholar", "hosteler"],
      rsvp_status: ["going", "maybe", "declined"],
    },
  },
} as const
