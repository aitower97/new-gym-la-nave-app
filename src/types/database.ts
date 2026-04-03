export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      classes: {
        Row: {
          id: string;
          name: string;
          class_date: string;
          class_time: string;
          max_spots: number;
          class_type: string;
          created_at: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          class_id: string;
          user_id: string;
          created_at: string;
        };
      };
    };
  };
}

export type ClassRow = Database['public']['Tables']['classes']['Row'];
export type BookingRow = Database['public']['Tables']['bookings']['Row'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];