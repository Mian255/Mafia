// NOTE: This file is hand-maintained. Once the new migrations are applied, it
// should be regenerated from the live schema via `supabase gen types typescript`
// (rather than hand-edited) to keep it in sync with the database.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GameRole = 'mafia' | 'civilian' | 'doctor' | 'detective';

// Collapsed by 20260927000003_game_engine.sql: night is one simultaneous phase
// (mafia/doctor/detective act together) rather than three sequential sub-phases.
export type GamePhase =
  | 'role_reveal'
  | 'night'
  | 'dawn'
  | 'day_discussion'
  | 'day_voting'
  | 'result'
  | 'game_over';

// Sequential night turns (20261011000003_sequential_night_turns.sql): while the
// phase is 'night', exactly one role is awake at a time, in this order.
export type NightStage = 'mafia' | 'doctor' | 'detective';

export type RoomStatus = 'lobby' | 'in_progress' | 'completed' | 'abandoned';
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type ChatChannel = 'lobby' | 'day' | 'mafia' | 'ghost';
export type GameWinner = 'town' | 'mafia' | 'draw' | null;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          code: string;
          name: string;
          host_id: string;
          is_public: boolean;
          status: RoomStatus;
          max_players: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          host_id: string;
          is_public?: boolean;
          status?: RoomStatus;
          max_players?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          host_id?: string;
          is_public?: boolean;
          status?: RoomStatus;
          max_players?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      room_players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string | null;
          is_ready: boolean;
          is_host: boolean;
          is_bot: boolean;
          bot_name: string | null;
          bot_avatar: string | null;
          joined_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id?: string | null;
          is_ready?: boolean;
          is_host?: boolean;
          is_bot?: boolean;
          bot_name?: string | null;
          bot_avatar?: string | null;
          joined_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string | null;
          is_ready?: boolean;
          is_host?: boolean;
          is_bot?: boolean;
          bot_name?: string | null;
          bot_avatar?: string | null;
          last_seen_at?: string;
        };
        Relationships: [];
      };
      room_settings: {
        Row: {
          room_id: string;
          mafia_count: number;
          doctor_enabled: boolean;
          detective_enabled: boolean;
          night_duration_seconds: number;
          discussion_duration_seconds: number;
          voting_duration_seconds: number;
          narrator_enabled: boolean;
          voice_enabled: boolean;
          reveal_role_on_death: boolean;
          updated_at: string;
        };
        Insert: {
          room_id: string;
          mafia_count?: number;
          doctor_enabled?: boolean;
          detective_enabled?: boolean;
          night_duration_seconds?: number;
          discussion_duration_seconds?: number;
          voting_duration_seconds?: number;
          narrator_enabled?: boolean;
          voice_enabled?: boolean;
          reveal_role_on_death?: boolean;
          updated_at?: string;
        };
        Update: {
          mafia_count?: number;
          doctor_enabled?: boolean;
          detective_enabled?: boolean;
          night_duration_seconds?: number;
          discussion_duration_seconds?: number;
          voting_duration_seconds?: number;
          narrator_enabled?: boolean;
          voice_enabled?: boolean;
          reveal_role_on_death?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: FriendRequestStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: FriendRequestStatus;
          created_at?: string;
        };
        Update: {
          status?: FriendRequestStatus;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          friend_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          friend_id?: string;
        };
        Relationships: [];
      };
      blocked_users: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: {
          blocker_id?: string;
          blocked_id?: string;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_id: string;
          reason: string;
          details: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_id: string;
          reason: string;
          details?: string | null;
          created_at?: string;
        };
        Update: {
          reason?: string;
          details?: string | null;
        };
        Relationships: [];
      };
      games: {
        Row: {
          id: string;
          room_id: string;
          phase: GamePhase;
          round_number: number;
          phase_deadline: string | null;
          night_stage: NightStage | null;
          winner: GameWinner;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          phase?: GamePhase;
          round_number?: number;
          phase_deadline?: string | null;
          night_stage?: NightStage | null;
          winner?: GameWinner;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          phase?: GamePhase;
          round_number?: number;
          phase_deadline?: string | null;
          night_stage?: NightStage | null;
          winner?: GameWinner;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_players: {
        Row: {
          id: string;
          game_id: string;
          // Nullable + bot columns added by 20260927000003_game_engine.sql: bots are
          // real game_players rows (user_id NULL, is_bot=true) resolved virtually.
          user_id: string | null;
          role: GameRole;
          is_alive: boolean;
          is_bot: boolean;
          bot_name: string | null;
          bot_avatar: string | null;
          seat_number: number | null;
          death_round: number | null;
          death_phase: string | null;
          death_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id?: string | null;
          role: GameRole;
          is_alive?: boolean;
          is_bot?: boolean;
          bot_name?: string | null;
          bot_avatar?: string | null;
          seat_number?: number | null;
          death_round?: number | null;
          death_phase?: string | null;
          death_reason?: string | null;
          created_at?: string;
        };
        Update: {
          is_alive?: boolean;
          death_round?: number | null;
          death_phase?: string | null;
          death_reason?: string | null;
        };
        Relationships: [];
      };
      night_actions: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          actor_id: string;
          role: GameRole;
          // target_id is legacy (profiles-based) and now nullable; the engine targets
          // the seat via target_player_id (game_players.id), added by 20260927000003.
          target_id: string | null;
          target_player_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          actor_id: string;
          role: GameRole;
          target_id?: string | null;
          target_player_id?: string | null;
          created_at?: string;
        };
        Update: {
          target_id?: string | null;
          target_player_id?: string | null;
        };
        Relationships: [];
      };
      votes: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          voter_id: string;
          target_id: string | null;
          // Seat-based vote target (game_players.id), added by 20260927000003.
          target_player_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          voter_id: string;
          target_id?: string | null;
          target_player_id?: string | null;
          created_at?: string;
        };
        Update: {
          target_id?: string | null;
          target_player_id?: string | null;
        };
        Relationships: [];
      };
      game_events: {
        Row: {
          id: string;
          game_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          event_type?: string;
          payload?: Json;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          game_id: string | null;
          // Nullable since 20260927000004: AI bot messages have no profile.
          sender_id: string | null;
          sender_display: string | null;
          channel: ChatChannel;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          game_id?: string | null;
          sender_id?: string | null;
          sender_display?: string | null;
          channel: ChatChannel;
          content: string;
          created_at?: string;
        };
        Update: {
          content?: string;
          sender_display?: string | null;
        };
        Relationships: [];
      };
      user_stats: {
        Row: {
          user_id: string;
          games_played: number;
          games_won: number;
          mafia_wins: number;
          civilian_wins: number;
          doctor_wins: number;
          detective_wins: number;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          games_played?: number;
          games_won?: number;
          mafia_wins?: number;
          civilian_wins?: number;
          doctor_wins?: number;
          detective_wins?: number;
          updated_at?: string;
        };
        Update: {
          games_played?: number;
          games_won?: number;
          mafia_wins?: number;
          civilian_wins?: number;
          doctor_wins?: number;
          detective_wins?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      // Role-masked roster (20260927000001 + 20260927000003). `role` is NULL unless
      // the caller is that seat, a fellow mafia, or the game is over. security_invoker
      // = false, so it returns the full roster while base-table RLS stays enforced.
      game_players_view: {
        Row: {
          id: string;
          game_id: string;
          user_id: string | null;
          role: GameRole | null;
          is_alive: boolean;
          is_bot: boolean;
          bot_name: string | null;
          bot_avatar: string | null;
          seat_number: number | null;
          death_round: number | null;
          death_phase: string | null;
          death_reason: string | null;
          created_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      delete_user_account: {
        Args: Record<string, never>;
        Returns: void;
      };
      add_bot_to_room: {
        Args: {
          p_room_id: string;
          p_bot_name: string;
          p_bot_avatar: string;
        };
        Returns: Json;
      };
      remove_bot_from_room: {
        Args: {
          p_room_id: string;
          p_player_id: string;
        };
        Returns: boolean;
      };
      // Added by the phase-3 remediation migrations (20260927000001/2). This file is
      // hand-maintained; regenerate via `supabase gen types` once those are applied.
      get_email_for_username: {
        Args: { p_username: string };
        Returns: string | null;
      };
      accept_friend_request: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      join_room_atomic: {
        Args: { p_room_code: string };
        Returns: Database['public']['Tables']['room_players']['Row'];
      };
      // Added by the game engine migration (20260927000003). start_game and
      // advance_game_phase return the games Row (mirrors join_room_atomic above).
      start_game: {
        Args: { p_room_id: string };
        Returns: Database['public']['Tables']['games']['Row'];
      };
      submit_night_action: {
        Args: { p_game_id: string; p_target_player_id: string };
        Returns: undefined;
      };
      cast_vote: {
        Args: { p_game_id: string; p_target_player_id: string | null };
        Returns: undefined;
      };
      advance_game_phase: {
        Args: { p_game_id: string };
        Returns: Database['public']['Tables']['games']['Row'];
      };
      get_investigation_result: {
        Args: { p_game_id: string; p_round_number: number };
        Returns: boolean;
      };
      post_bot_message: {
        Args: {
          p_game_id: string;
          p_channel: string;
          p_bot_name: string;
          p_content: string;
        };
        Returns: Database['public']['Tables']['messages']['Row'];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
