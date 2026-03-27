import { ClassSession } from '../types/navigation';

// Función para generar usuarios mock
const generateMockUsers = (count: number): any[] => {
  const names = ['Ana', 'Carlos', 'María', 'David', 'Laura', 'Pedro', 'Sofia', 'Miguel'];
  const avatars = [
    'https://i.pravatar.cc/150?img=1',
    'https://i.pravatar.cc/150?img=2',
    'https://i.pravatar.cc/150?img=3',
    'https://i.pravatar.cc/150?img=4',
    'https://i.pravatar.cc/150?img=5',
  ];
  
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    name: names[i % names.length],
    avatar: avatars[i % avatars.length],
  }));
};

// Función para obtener clases de un día específico
export const getClassesForDate = (date: Date): ClassSession[] => {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const currentHour = now.getHours();

  const sessions: ClassSession[] = [
    {
      id: '1',
      name: 'CROSS TRAINING',
      time: '10:00',
      maxSpots: 12,
      bookedUsers: generateMockUsers(6),
      status: isToday && currentHour >= 11 ? 'finished' : 'available',
    },
    {
      id: '2',
      name: 'CROSS TRAINING',
      time: '11:00',
      maxSpots: 12,
      bookedUsers: generateMockUsers(8),
      status: isToday && currentHour >= 12 ? 'finished' : 'available',
    },
    {
      id: '3',
      name: 'POWERLIFTING',
      time: '17:00',
      maxSpots: 10,
      bookedUsers: generateMockUsers(4),
      status: isToday && currentHour >= 18 ? 'finished' : 'available',
    },
    {
      id: '4',
      name: 'CROSS TRAINING',
      time: '18:00',
      maxSpots: 12,
      bookedUsers: generateMockUsers(7),
      status: isToday && currentHour >= 19 ? 'finished' : 'available',
    },
    {
      id: '5',
      name: 'HALTEROFILIA',
      time: '19:00',
      maxSpots: 8,
      bookedUsers: generateMockUsers(8),
      status: isToday && currentHour >= 20 ? 'finished' : 'full',
    },
    {
      id: '6',
      name: 'CROSS TRAINING',
      time: '20:00',
      maxSpots: 12,
      bookedUsers: generateMockUsers(3),
      status: isToday && currentHour >= 21 ? 'finished' : 'available',
    },
  ];

  return sessions;
};

// Generar array de 14 días (hoy + 13 días)
export const generateWeekDays = (): Date[] => {
  const days: Date[] = [];
  const today = new Date();
  
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push(date);
  }
  
  return days;
};

// Horarios disponibles
export const AVAILABLE_TIMES = ['10:00', '11:00', '17:00', '18:00', '19:00', '20:00'];