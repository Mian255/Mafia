export * from './database';

// Frontend App & Component Helper Types
export type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'guest';

export interface RoomWithHostAndCount {
  id: string;
  code: string;
  name: string;
  host_id: string;
  host_username?: string;
  is_public: boolean;
  status: string;
  max_players: number;
  player_count?: number;
  created_at: string;
}
