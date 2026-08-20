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
    description: 'Te enseñamos rápido cómo funciona la app. Puedes saltarlo cuando quieras, y volver a verlo desde el botón "?" de arriba.',
  },
  {
    id: 'menu-reservar',
    screen: 'MainMenu',
    targetId: 'menu-card-reservar',
    title: 'Reservar Clases',
    description: 'Aquí reservas tu próxima clase. Puedes cambiar o cancelar tu reserva cuando quieras antes de que empiece. Vamos a verlo.',
  },
  {
    id: 'reservation-day-selector',
    screen: 'Reservation',
    targetId: 'reservation-day-selector',
    title: 'Elige el día',
    description: 'Desliza para moverte entre días. El día de hoy aparece siempre resaltado en azul.',
  },
  {
    id: 'reservation-list',
    screen: 'Reservation',
    targetId: 'reservation-class-list',
    title: 'Elige tu clase',
    description: 'Toca un horario para reservar. Si ya tienes una reserva ese día, tocar otra la cambia automáticamente. Y si tocas una clase que ya tienes reservada, te deja cancelarla.',
  },
  {
    id: 'menu-mis-clases',
    screen: 'MainMenu',
    targetId: 'menu-card-mis-clases',
    title: 'Mis Clases',
    description: 'Consulta el calendario con todas tus reservas, pasadas y futuras. Vamos a echar un vistazo.',
  },
  {
    id: 'myclasses-calendar',
    screen: 'MyClasses',
    targetId: 'myclasses-calendar',
    title: 'Tu calendario',
    description: 'Los días con un punto de color tienen una clase reservada. Tócalos para ver el detalle de esa reserva.',
  },
  {
    id: 'myclasses-select',
    screen: 'MyClasses',
    targetId: 'myclasses-select',
    title: 'Cancelar reservas',
    description: 'Pulsa "Seleccionar" para marcar una o varias reservas y cancelarlas de golpe, sin entrar en cada una.',
  },
  {
    id: 'menu-progreso',
    screen: 'MainMenu',
    targetId: 'menu-card-progreso',
    title: 'Progreso y Ejercicios',
    description: 'Estadísticas de cada ejercicio, tu evolución de peso y la calculadora de %1RM. Te lo enseñamos.',
  },
  {
    id: 'progress-volume-chart',
    screen: 'WorkoutProgress',
    targetId: 'progress-volume-chart',
    title: 'Carga de entrenamiento',
    description: 'Tu volumen semanal por zona muscular y el esfuerzo medio (RPE) de las últimas 8 semanas, de un vistazo.',
  },
  {
    id: 'progress-calculator',
    screen: 'WorkoutProgress',
    targetId: 'progress-1rm-calculator',
    title: 'Calculadora %1RM',
    description: 'Pon tu 1RM y un porcentaje, y te calculamos el peso exacto a levantar.',
  },
  {
    id: 'progress-search',
    screen: 'WorkoutProgress',
    targetId: 'progress-search',
    title: 'Busca y añade ejercicios',
    description: 'Busca cualquier ejercicio de tu historial, o pulsa el botón + para añadirlo directamente a tu entreno de hoy.',
  },
  {
    id: 'menu-perfil',
    screen: 'MainMenu',
    targetId: 'menu-card-perfil',
    title: 'Mi Perfil',
    description: 'Edita tus datos personales y tu foto. Vamos a verlo.',
  },
  {
    id: 'profile-avatar',
    screen: 'Profile',
    targetId: 'profile-avatar',
    title: 'Tu foto de perfil',
    description: 'Toca tu foto para cambiarla. Debajo puedes editar tu apodo, nombre, teléfono y fecha de nacimiento, y guardar los cambios.',
  },
  {
    id: 'menu-bell',
    screen: 'MainMenu',
    targetId: 'menu-bell',
    title: 'Notificaciones',
    description: 'Avisos de tus clases, tu cuota y novedades del gimnasio aparecen aquí.',
  },
  {
    id: 'workout-today',
    screen: 'MainMenu',
    targetId: 'menu-today-widget',
    title: 'Sesión de hoy',
    description: 'Cuando tu entrenador prepare el entreno, o si entrenas por tu cuenta, esta tarjeta te lleva directo a apuntar tus pesos y series.',
  },
  {
    id: 'workout-add-exercise',
    screen: 'Workout',
    targetId: 'workout-add-exercise',
    title: 'Añade tus propios ejercicios',
    description: 'Además de la sesión que prepara tu entrenador, puedes añadir aquí cualquier ejercicio que hagas por tu cuenta.',
  },
  {
    id: 'workout-session',
    screen: 'Workout',
    targetId: 'workout-session',
    title: 'Apunta y guarda tu entreno',
    description: 'Si tienes ejercicios asignados, aquí pones el peso, las series y las repeticiones de cada uno, y guardas al terminar. Sin ninguno asignado, verás cómo añadir el tuyo propio.',
  },
  {
    id: 'outro',
    screen: 'MainMenu',
    targetId: null,
    title: '¡Listo!',
    description: 'Ya conoces lo básico. Si te pierdes, vuelve a abrir este tutorial tocando el "?" junto a las notificaciones.',
  },
];

export const ADMIN_TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'admin-intro',
    screen: 'AdminDashboard',
    targetId: null,
    title: 'Panel de administración',
    description: 'Un repaso rápido a las herramientas de gestión del gimnasio. Puedes saltarlo cuando quieras, y volver a verlo desde el "?" de arriba.',
  },
  {
    id: 'admin-card-clases',
    screen: 'AdminDashboard',
    targetId: 'admin-card-clases',
    title: 'Clases',
    description: 'Crea clases sueltas o recurrentes, y gestiona quién está apuntado en cada una. Vamos a verlo.',
  },
  {
    id: 'admin-create-class',
    screen: 'AdminClasses',
    targetId: 'admin-create-class',
    title: 'Crear una clase',
    description: 'Con este botón das de alta una clase nueva: nombre, tipo, fecha, hora y aforo.',
  },
  {
    id: 'admin-classes-calendar',
    screen: 'AdminClasses',
    targetId: 'admin-classes-calendar',
    title: 'Calendario de clases',
    description: 'Toca un día para ver sus clases y gestionarlas. "+ Seleccionar días" te deja marcar varias y eliminarlas de golpe.',
  },
  {
    id: 'admin-card-usuarios',
    screen: 'AdminDashboard',
    targetId: 'admin-card-usuarios',
    title: 'Usuarios',
    description: 'Lista de todos los socios: edítalos, asígnales un plan, marca su cuota como pagada o elimínalos si ya no vienen. Vamos a echar un vistazo.',
  },
  {
    id: 'admin-users-search',
    screen: 'AdminUsers',
    targetId: 'admin-users-search',
    title: 'Buscar usuarios',
    description: 'Busca por nombre o email. En cada usuario verás su plan y el estado de su cuota.',
  },
  {
    id: 'admin-users-actions',
    screen: 'AdminUsers',
    targetId: 'admin-users-actions',
    title: 'Gestiona cada usuario',
    description: 'Edita sus datos, asígnale una plantilla de clases, llámale, o marca/deshaz el pago de su cuota — todo desde aquí.',
  },
  {
    id: 'admin-card-planes',
    screen: 'AdminDashboard',
    targetId: 'admin-card-planes',
    title: 'Planes',
    description: 'Las tarifas del gimnasio: precio, clases al mes, periodicidad de pago y categoría. Vamos a verlo.',
  },
  {
    id: 'admin-create-plan',
    screen: 'AdminPlans',
    targetId: 'admin-create-plan',
    title: 'Crear un plan',
    description: 'Da de alta una nueva tarifa: precio, clases al mes, periodicidad y categoría (puedes crear categorías nuevas si hace falta).',
  },
  {
    id: 'admin-plans-list',
    screen: 'AdminPlans',
    targetId: 'admin-plans-list',
    title: 'Tus planes',
    description: 'Agrupados por categoría. Toca cualquiera para editar su precio, sus clases al mes o desactivarlo.',
  },
  {
    id: 'admin-card-entrenos',
    screen: 'AdminDashboard',
    targetId: 'admin-card-entrenos',
    title: 'Entrenos',
    description: 'Prepara la sesión del día para todos, o asigna un entreno concreto a un usuario en particular. Vamos a verlo.',
  },
  {
    id: 'admin-workout-tabs',
    screen: 'AdminWorkout',
    targetId: 'admin-workout-tabs',
    title: 'Gestión de entrenos',
    description: '"Sesión" prepara el entreno del día para todos. "Clase" te enseña quién viene hoy a cada clase. "Usuarios" te deja asignar un entreno a una persona en concreto.',
  },
  {
    id: 'admin-workout-add',
    screen: 'AdminWorkout',
    targetId: 'admin-workout-add',
    title: 'Añade ejercicios a la sesión',
    description: 'Elige uno de tu biblioteca reutilizable o crea uno nuevo. Puedes agruparlos en bloques (Calentamiento, WOD...) y editarlos o borrarlos después.',
  },
  {
    id: 'admin-card-vista-usuario',
    screen: 'AdminDashboard',
    targetId: 'admin-card-vista-usuario',
    title: 'Vista usuario',
    description: 'Te enseña la app tal cual la ve un socio, por si necesitas comprobar algo desde su perspectiva.',
  },
  {
    id: 'admin-stats',
    screen: 'AdminDashboard',
    targetId: 'admin-stats',
    title: 'Vista rápida',
    description: 'Clases de hoy, reservas, usuarios totales y ocupación media, de un vistazo. El botón de al lado refresca los datos.',
  },
  {
    id: 'admin-outro',
    screen: 'AdminDashboard',
    targetId: null,
    title: '¡Listo!',
    description: 'Ya conoces las herramientas principales. Vuelve a abrir este tutorial cuando quieras tocando el "?" de arriba.',
  },
];
