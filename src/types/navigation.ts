export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  MainMenu: { 
    email: string;
    name?: string;
  };
  Home: {
    email: string;
    name?: string;
  };
  Profile: {
    email: string;
    name?: string;
  };
  AdminDashboard: {
    email: string;
    name?: string;
  };
  AdminTemplates: undefined;
  AdminClasses: undefined;
  AdminUsers: undefined;
  AdminPlans: undefined;
  AdminPlanForm: { planId?: string };
  AdminCreateClass: {
    initialDate?: string;
  };
  AdminCreateRecurringClass: undefined;
  AdminClassDetail: { classId: string };
  AdminEditClass: { classId: string };
  Notifications: undefined;
  MyClasses: { email: string; name?: string };
  Reservation: { email: string; name?: string };
  AdminClassPreBook: { classId: string };
  AdminUserTemplates: { userId: string };
  AdminEditUser: { userId?: string };  // sin userId = crear nuevo usuario
  WorkoutNotes: undefined;
  Workout: { email?: string; name?: string };
  WorkoutHistory: { email?: string; name?: string; exerciseId?: string };
  AdminWorkout: undefined;
  AdminUserWorkout: { userId: string; userName: string };
};

// Tipos para las clases
export interface ClassSession {
  id: string;
  name: string;
  time: string;
  maxSpots: number;
  bookedUsers: User[];
  status: 'available' | 'full' | 'finished';
}

export interface User {
  id: string;
  name: string;
  avatar: string | null;
}

export interface ClassWithBookings {
  id: string;
  name: string;
  class_date: string;
  class_time: string;
  max_spots: number;
  class_type: string;
  bookedUsers: User[];
  status: 'available' | 'full' | 'finished';
  isBookedByMe?: boolean;
}