export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: string;
          plan_id: string | null;
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
export type UserRole = 'user' | 'admin';

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: string;
  billing_period: string;
  classes_per_month: number | null;  // null = ilimitado
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserMembership {
  id: string;
  user_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'class_cancelled' | 'booking_confirmed' | 'reminder' | 'general';
  is_read: boolean;
  created_at: string;
}