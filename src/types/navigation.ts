export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
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
  AdminCreateClass: {
    initialDate?: string;
  };
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
  avatar?: string;
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