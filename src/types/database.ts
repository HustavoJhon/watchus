export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      household_watchlist_order: {
        Row: {
          created_at: string
          household_id: string
          position: number
          title_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          position: number
          title_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          position?: number
          title_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'household_watchlist_order_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_watchlist_order_title_id_fkey'
            columns: ['title_id']
            isOneToOne: false
            referencedRelation: 'titles'
            referencedColumns: ['id']
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          join_code: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          household_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          household_id?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          household_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      reviews: {
        Row: {
          content: string
          created_at: string
          title_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          title_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          title_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'reviews_title_id_fkey'
            columns: ['title_id']
            isOneToOne: false
            referencedRelation: 'titles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'reviews_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      titles: {
        Row: {
          backdrop_path: string | null
          created_at: string
          genres: string[]
          id: string
          media_type: Database['public']['Enums']['media_type']
          overview: string
          poster_path: string | null
          title: string
          tmdb_id: number
          year: number | null
        }
        Insert: {
          backdrop_path?: string | null
          created_at?: string
          genres?: string[]
          id?: string
          media_type: Database['public']['Enums']['media_type']
          overview?: string
          poster_path?: string | null
          title: string
          tmdb_id: number
          year?: number | null
        }
        Update: {
          backdrop_path?: string | null
          created_at?: string
          genres?: string[]
          id?: string
          media_type?: Database['public']['Enums']['media_type']
          overview?: string
          poster_path?: string | null
          title?: string
          tmdb_id?: number
          year?: number | null
        }
        Relationships: []
      }
      user_title_state: {
        Row: {
          created_at: string
          is_favorite: boolean
          rating: number | null
          title_id: string
          updated_at: string
          user_id: string
          watch_status: Database['public']['Enums']['watch_status'] | null
          watched_at: string | null
        }
        Insert: {
          created_at?: string
          is_favorite?: boolean
          rating?: number | null
          title_id: string
          updated_at?: string
          user_id: string
          watch_status?: Database['public']['Enums']['watch_status'] | null
          watched_at?: string | null
        }
        Update: {
          created_at?: string
          is_favorite?: boolean
          rating?: number | null
          title_id?: string
          updated_at?: string
          user_id?: string
          watch_status?: Database['public']['Enums']['watch_status'] | null
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'user_title_state_title_id_fkey'
            columns: ['title_id']
            isOneToOne: false
            referencedRelation: 'titles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_title_state_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation_code: {
        Args: { invite_code: string }
        Returns: {
          created_at: string
          id: string
          join_code: string
          name: string
        }
        SetofOptions: {
          from: '*'
          to: 'households'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_household: {
        Args: { household_name: string }
        Returns: {
          created_at: string
          id: string
          join_code: string
          name: string
        }
        SetofOptions: {
          from: '*'
          to: 'households'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_invitation_code: {
        Args: never
        Returns: {
          created_at: string
          id: string
          join_code: string
          name: string
        }
        SetofOptions: {
          from: '*'
          to: 'households'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_title: {
        Args: {
          p_backdrop_path: string
          p_genres: string[]
          p_media_type: Database['public']['Enums']['media_type']
          p_overview: string
          p_poster_path: string
          p_title: string
          p_tmdb_id: number
          p_year: number
        }
        Returns: {
          backdrop_path: string | null
          created_at: string
          genres: string[]
          id: string
          media_type: Database['public']['Enums']['media_type']
          overview: string
          poster_path: string | null
          title: string
          tmdb_id: number
          year: number | null
        }
        SetofOptions: {
          from: '*'
          to: 'titles'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_title_from_catalog: {
        Args: { p_title_id: string }
        Returns: boolean
      }
      reorder_household_watchlist: {
        Args: { p_ordered_title_ids: string[] }
        Returns: undefined
      }
    }
    Enums: {
      media_type: 'movie' | 'tv'
      watch_status: 'watchlist' | 'watching' | 'watched'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      media_type: ['movie', 'tv'],
      watch_status: ['watchlist', 'watching', 'watched'],
    },
  },
} as const
