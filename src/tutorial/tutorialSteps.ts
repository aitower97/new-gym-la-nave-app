import { RootStackParamList } from '../types/navigation';

export interface TutorialStep {
  id: string;
  /** Pantalla donde vive el elemento a resaltar. Si no coincide con la pantalla
   * actual, el motor navega ahí antes de mostrar el paso. */
  screen: keyof RootStackParamList;
  /** Params para navegar a esa pantalla si hace falta (login/email/name...). */
  params?: Record<string, any>;
  /** Id del target registrado con useTutorialTarget. null = paso sin recorte,
   * tarjeta centrada (usado para intro/cierre). */
  targetId: string | null;
  title: string;
  description: string;
}

export const USER_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'intro',
    screen: 'MainMenu',
    targetId: null,
    title: '¡Bienvenido a La Nave!',
    description: 'Un repaso rápido. Puedes saltarlo y volver a verlo con el "?".',
  },
  {
    id: 'menu-reservar',
    screen: 'MainMenu',
    targetId: 'menu-card-reservar',
    title: 'Reservar Clases',
    description: 'Aquí reservas tus clases.',
  },
  {
    id: 'reservation-day-selector',
    screen: 'Reservation',
    targetId: 'reservation-day-selector',
    title: 'Elige el día',
    description: 'Desliza para cambiar de día.',
  },
  {
    id: 'reservation-list',
    screen: 'Reservation',
    targetId: 'reservation-class-list',
    title: 'Elige tu clase',
    description: 'Toca una clase para reservarla. Tócala otra vez para cancelarla.',
  },
  {
    id: 'menu-mis-clases',
    screen: 'MainMenu',
    targetId: 'menu-card-mis-clases',
    title: 'Mis Clases',
    description: 'Todas tus reservas, en un calendario.',
  },
  {
    id: 'myclasses-calendar',
    screen: 'MyClasses',
    targetId: 'myclasses-calendar',
    title: 'Tu calendario',
    description: 'Los días con punto tienen clase. Tócalos para ver el detalle.',
  },
  {
    id: 'myclasses-select',
    screen: 'MyClasses',
    targetId: 'myclasses-select',
    title: 'Cancelar reservas',
    description: 'Marca varias reservas y cancélalas de una vez.',
  },
  {
    id: 'menu-progreso',
    screen: 'MainMenu',
    targetId: 'menu-card-progreso',
    title: 'Progreso y Ejercicios',
    description: 'Tu evolución, tus ejercicios y la calculadora de %1RM.',
  },
  {
    id: 'progress-volume-chart',
    screen: 'WorkoutProgress',
    targetId: 'progress-volume-chart',
    title: 'Carga de entrenamiento',
    description: 'Volumen por zona muscular y RPE medio, últimas 8 semanas.',
  },
  {
    id: 'progress-calculator',
    screen: 'WorkoutProgress',
    targetId: 'progress-1rm-calculator',
    title: 'Calculadora %1RM',
    description: 'Pon tu 1RM y un %, y te da el peso.',
  },
  {
    id: 'progress-search',
    screen: 'WorkoutProgress',
    targetId: 'progress-search',
    title: 'Busca y añade ejercicios',
    description: 'Busca un ejercicio o pulsa + para añadirlo al entreno de hoy.',
  },
  {
    id: 'menu-perfil',
    screen: 'MainMenu',
    targetId: 'menu-card-perfil',
    title: 'Mi Perfil',
    description: 'Tus datos y tu foto.',
  },
  {
    id: 'profile-avatar',
    screen: 'Profile',
    targetId: 'profile-avatar',
    title: 'Tu foto de perfil',
    description: 'Toca la foto para cambiarla. Debajo, tus datos.',
  },
  {
    id: 'menu-bell',
    screen: 'MainMenu',
    targetId: 'menu-bell',
    title: 'Notificaciones',
    description: 'Avisos de tus clases, tu cuota y el gimnasio.',
  },
  {
    id: 'workout-today',
    screen: 'MainMenu',
    targetId: 'menu-today-widget',
    title: 'Sesión de hoy',
    description: 'Te lleva a apuntar tus pesos y series de hoy.',
  },
  {
    id: 'workout-add-exercise',
    screen: 'Workout',
    targetId: 'workout-add-exercise',
    title: 'Añade tus propios ejercicios',
    description: 'Añade cualquier ejercicio que hagas por tu cuenta.',
  },
  {
    id: 'workout-session',
    screen: 'Workout',
    targetId: 'workout-session',
    title: 'Apunta y guarda tu entreno',
    description: 'Apunta peso, series y reps de cada ejercicio.',
  },
  {
    id: 'outro',
    screen: 'MainMenu',
    targetId: null,
    title: '¡Listo!',
    description: 'Ya está. Vuelve a verlo con el "?".',
  },
];

export const ADMIN_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'admin-intro',
    screen: 'AdminDashboard',
    targetId: null,
    title: 'Panel de administración',
    description: 'Un repaso rápido. Puedes saltarlo y volver a verlo con el "?".',
  },
  {
    id: 'admin-card-clases',
    screen: 'AdminDashboard',
    targetId: 'admin-card-clases',
    title: 'Clases',
    description: 'Crea clases y gestiona quién va a cada una.',
  },
  {
    id: 'admin-create-class',
    screen: 'AdminClasses',
    targetId: 'admin-create-class',
    title: 'Crear una clase',
    description: 'Crea una clase nueva.',
  },
  {
    id: 'admin-classes-calendar',
    screen: 'AdminClasses',
    targetId: 'admin-classes-calendar',
    title: 'Calendario de clases',
    description: 'Toca un día para ver sus clases. "Seleccionar días" borra varias a la vez.',
  },
  {
    id: 'admin-card-usuarios',
    screen: 'AdminDashboard',
    targetId: 'admin-card-usuarios',
    title: 'Usuarios',
    description: 'Todos los socios: datos, plan y cuota.',
  },
  {
    id: 'admin-users-search',
    screen: 'AdminUsers',
    targetId: 'admin-users-search',
    title: 'Buscar usuarios',
    description: 'Busca por nombre o email.',
  },
  {
    id: 'admin-users-actions',
    screen: 'AdminUsers',
    targetId: 'admin-users-actions',
    title: 'Gestiona cada usuario',
    description: 'Edita, asigna plantilla, llama o marca el pago.',
  },
  {
    id: 'admin-card-planes',
    screen: 'AdminDashboard',
    targetId: 'admin-card-planes',
    title: 'Planes',
    description: 'Las tarifas del gimnasio.',
  },
  {
    id: 'admin-create-plan',
    screen: 'AdminPlans',
    targetId: 'admin-create-plan',
    title: 'Crear un plan',
    description: 'Crea una tarifa nueva.',
  },
  {
    id: 'admin-plans-list',
    screen: 'AdminPlans',
    targetId: 'admin-plans-list',
    title: 'Tus planes',
    description: 'Toca una para editarla o desactivarla.',
  },
  {
    id: 'admin-card-entrenos',
    screen: 'AdminDashboard',
    targetId: 'admin-card-entrenos',
    title: 'Entrenos',
    description: 'La sesión del día, o un entreno para un socio.',
  },
  {
    id: 'admin-workout-tabs',
    screen: 'AdminWorkout',
    targetId: 'admin-workout-tabs',
    title: 'Gestión de entrenos',
    description: 'Sesión: para todos. Clase: quién viene hoy. Usuarios: entreno de un socio.',
  },
  {
    id: 'admin-workout-add',
    screen: 'AdminWorkout',
    targetId: 'admin-workout-add',
    title: 'Añade ejercicios a la sesión',
    description: 'Elige de la biblioteca o crea uno. Puedes agruparlos en bloques.',
  },
  {
    id: 'admin-card-vista-usuario',
    screen: 'AdminDashboard',
    targetId: 'admin-card-vista-usuario',
    title: 'Reservas',
    description: 'Las clases tal como las ve un socio.',
  },
  {
    id: 'admin-stats',
    screen: 'AdminDashboard',
    targetId: 'admin-stats',
    title: 'Vista rápida',
    description: 'Clases, reservas, socios y ocupación de hoy.',
  },
  {
    id: 'admin-outro',
    screen: 'AdminDashboard',
    targetId: null,
    title: '¡Listo!',
    description: 'Ya está. Vuelve a verlo con el "?".',
  },
];
