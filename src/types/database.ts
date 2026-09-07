// Manual database types matching supabase/migrations/20260907154700_initial_schema.sql.
// They will be replaced by `supabase gen types` output once a database is available.

export type MediaType = 'movie' | 'tv'

export type WatchStatus = 'watchlist' | 'watching' | 'watched'

export interface Database {
  public: {
    Tables: {
      households: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
      }
      profiles: {
        Row: {
          id: string
          household_id: string | null
          display_name: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          household_id?: string | null
          display_name: string
          avatar_url?: string | null
        }
        Update: {
          id?: string
          household_id?: string | null
          display_name?: string
          avatar_url?: string | null
        }
      }
      titles: {
        Row: {
          id: string
          tmdb_id: number
          media_type: MediaType
          title: string
          year: number | null
          overview: string
          poster_path: string | null
          backdrop_path: string | null
          genres: string[]
          created_at: string
        }
        Insert: {
          id?: string
          tmdb_id: number
          media_type: MediaType
          title: string
          year?: number | null
          overview?: string
          poster_path?: string | null
          backdrop_path?: string | null
          genres?: string[]
        }
        Update: {
          id?: string
          tmdb_id?: number
          media_type?: MediaType
          title?: string
          year?: number | null
          overview?: string
          poster_path?: string | null
          backdrop_path?: string | null
          genres?: string[]
        }
      }
      user_title_state: {
        Row: {
          user_id: string
          title_id: string
          watch_status: WatchStatus | null
          watched_at: string | null
          is_favorite: boolean
          rating: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          title_id: string
          watch_status?: WatchStatus | null
          watched_at?: string | null
          is_favorite?: boolean
          rating?: number | null
        }
        Update: {
          user_id?: string
          title_id?: string
          watch_status?: WatchStatus | null
          watched_at?: string | null
          is_favorite?: boolean
          rating?: number | null
        }
      }
      reviews: {
        Row: {
          user_id: string
          title_id: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          title_id: string
          content: string
        }
        Update: {
          user_id?: string
          title_id?: string
          content?: string
        }
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      media_type: MediaType
      watch_status: WatchStatus
    }
  }
}
