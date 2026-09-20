export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GameRole = 'mafia' | 'civilian' | 'doctor' | 'detective';

export type GamePhase =
  | 'role_reveal'
  | 'night_mafia'
  | 'night_doctor'
  | 'night_detective'
  | 'dawn'
  | 'day_discussion'
  | 'day_voting'
  | 'result'
  | 'game_over';

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
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          avatar_url?: string | null;
          updated_at?: string;
        };
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
      };
      room_players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          is_ready: boolean;
          is_host: boolean;
          joined_at: string;
          last_seen_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          is_ready?: boolean;
          is_host?: boolean;
          joined_at?: string;
          last_seen_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          is_ready?: boolean;
          is_host?: boolean;
          last_seen_at?: string;
        };
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
      };
      games: {
        Row: {
          id: string;
          room_id: string;
          phase: GamePhase;
          round_number: number;
          phase_deadline: string | null;
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
          winner?: GameWinner;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          phase?: GamePhase;
          round_number?: number;
          phase_deadline?: string | null;
          winner?: GameWinner;
          updated_at?: string;
        };
      };
      game_players: {
        Row: {
          id: string;
          game_id: string;
          user_id: string;
          role: GameRole;
          is_alive: boolean;
          death_round: number | null;
          death_phase: string | null;
          death_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          user_id: string;
          role: GameRole;
          is_alive?: boolean;
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
      };
      night_actions: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          actor_id: string;
          role: GameRole;
          target_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          actor_id: string;
          role: GameRole;
          target_id: string;
          created_at?: string;
        };
        Update: {
          target_id?: string;
        };
      };
      votes: {
        Row: {
          id: string;
          game_id: string;
          round_number: number;
          voter_id: string;
          target_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          game_id: string;
          round_number: number;
          voter_id: string;
          target_id?: string | null;
          created_at?: string;
        };
        Update: {
          target_id?: string | null;
        };
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
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          game_id: string | null;
          sender_id: string;
          channel: ChatChannel;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          game_id?: string | null;
          sender_id: string;
          channel: ChatChannel;
          content: string;
          created_at?: string;
        };
        Update: {
          content?: string;
        };
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
      };
    };
  };
}
