export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Home: { 
    email: string;
    name?: string;
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