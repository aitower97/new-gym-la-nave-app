# La Nave Strength Center — App Móvil

## Contexto del proyecto

App de gestión de gimnasio y reserva de clases, desarrollada como trabajo de cliente para un gimnasio (box de CrossTraining/Halterofilia/Powerlifting) en Madrid. Publicada en iOS App Store y Google Play.

- **Desarrollador:** Aitor Arrocha Martínez
- **Cuenta de stores:** `kingstower97`
- **Plataformas:** iOS App Store (publicada) + Google Play (en fase de testing cerrado)

---

## Stack técnico

| Área | Tecnología |
|---|---|
| Framework | React Native con Expo SDK 54 (New Architecture habilitada) |
| Lenguaje | TypeScript (strict) |
| Backend | Supabase (Auth + Postgres + Edge Functions + RLS) |
| Navegación | React Navigation (Native Stack) |
| Animaciones | React Native Reanimated 4.x (requiere New Architecture, sin Expo Go, requiere development build) |
| Estilos | NativeWind (Tailwind CSS) + theme module (`src/theme.ts`) con escalado responsivo |
| Iconos | SVG custom en `src/components/Icons.tsx` |
| Imágenes/gradientes | `expo-linear-gradient` |
| Validación | Zod |
| Notificaciones push | Expo Notifications + Expo Push API |
| Build/CI | EAS Build + EAS Submit |
| Safe areas | `react-native-safe-area-context` |

### Configuración crítica de Reanimated
```json
// app.json
{
  "expo": {
    "newArchEnabled": true
  }
}
```
- No requiere plugin de babel (se quitó).
- **No funciona en Expo Go** — siempre usar development build instalado vía TestFlight o `eas build --profile development`.

### Postinstall patch
`patch-node-modules.js` parchea `react-native-screens` para evitar evaluación top-level de `Platform.OS`. Se ejecuta automáticamente con `npm install`.

---

## Estructura de carpetas

```
src/
├── components/
│   ├── ErrorBoundary.tsx            # Error boundary global (Sentry stubbed, pendiente DSN)
│   ├── Icons.tsx                    # Iconos SVG custom
│   ├── ScreenWrapper.tsx
│   ├── ui/                          # Sistema de diseño reutilizable
│   │   ├── index.ts                  # Barrel export — REVISAR SIEMPRE que todo lo usado esté exportado
│   │   ├── Button.tsx, Input.tsx, BackButton.tsx, BookButton.tsx
│   │   ├── Card.tsx, ClassCard.tsx, ClassCardRow.tsx
│   │   ├── Avatar.tsx, BrandHeader.tsx, AuthTitle.tsx
│   │   ├── DaySelector.tsx, MonthNavigator.tsx, CalendarGrid.tsx
│   │   ├── ContextBar.tsx, EmptyState.tsx, ScreenHeader.tsx, ScreenWrapper.tsx
│   │   ├── FormCard.tsx, FormFooterLink.tsx
│   │   ├── DashboardHeader.tsx, AdminMenuCard.tsx, StatCard.tsx
│   │   ├── OccupancyBar.tsx, UpcomingClassRow.tsx, WelcomeCard.tsx
│   │   ├── SpringPressable.tsx, ActionButton.tsx, FAB.tsx
│   │   └── WelcomeSlide.tsx
│   ├── plans/
│   │   └── PlanCard.tsx              # Card de plan de membresía
│   └── widgets/
│       ├── NextClassWidget.tsx       # Countdown próxima clase (recibe datos como prop, NO hace fetch)
│       └── TodayWorkoutWidget.tsx    # Widget sesión de hoy: countdown de desbloqueo + progreso de registro
├── screens/
│   ├── WelcomeScreen.tsx
│   ├── LoginScreen.tsx
│   ├── RegisterScreen.tsx            # Migrada a componentes ui/
│   ├── MainMenuScreen.tsx            # Hub principal — incluye NextClassWidget + TodayWorkoutWidget
│   ├── ReservationScreen.tsx         # Reservas de clases (renombrada desde HomeScreen)
│   ├── MyClassesScreen.tsx           # Clases reservadas del usuario
│   ├── ProfileScreen.tsx
│   ├── NotificationsScreen.tsx
│   ├── WorkoutScreen.tsx             # Registro de pesos/ejercicios del día (notas ahora por ejercicio, no globales)
│   ├── WorkoutHistoryScreen.tsx      # Historial de entrenamientos
│   ├── AdminDashboardScreen.tsx
│   ├── AdminClassesScreen.tsx        # Calendario de clases (vista mes)
│   ├── AdminClassDetailScreen.tsx
│   ├── AdminCreateClassScreen.tsx
│   ├── AdminCreateRecurringClassScreen.tsx
│   ├── AdminEditClassScreen.tsx
│   ├── AdminClassPreBookScreen.tsx
│   ├── AdminUsersScreen.tsx
│   ├── AdminEditUserScreen.tsx       # Crear/editar usuario (sin userId = crear nuevo)
│   ├── AdminUserTemplatesScreen.tsx
│   ├── AdminPlansScreen.tsx          # CRUD de planes de membresía
│   └── AdminPlanFormScreen.tsx       # Formulario crear/editar plan
├── lib/
│   ├── supabase.ts                   # Cliente Supabase (env vars EXPO_PUBLIC_SUPABASE_*)
│   ├── secureStorage.ts              # Adapter SecureStore con chunking para valores >2048 bytes
│   └── sentry.ts                     # Sentry stubbed (no-ops pendiente DSN)
├── theme.ts                          # Colors, Fonts, Typography, Spacing, Radius, Shadows, scale()
├── types/
│   ├── navigation.ts                 # RootStackParamList + ClassWithBookings, User, ClassSession
│   └── database.ts                   # Database interface + ProfileRow, ClassRow, BookingRow, MembershipPlan, etc.
├── data/
│   └── mockClasses.ts
└── utils/
    ├── auth.ts                       # isUserAdmin(), getUserRole(), hasActivePlan(), getActivePlan()
    ├── validation.ts                 # Schemas Zod (login, register, profile, class)
    ├── notifications.ts              # CRUD notificaciones en Supabase + trigger push
    ├── pushNotifications.ts          # Registro token Expo, envío push via Expo Push API
    ├── adminClasses.ts               # getClassesByMonth(), agrupar clases por fecha
    └── adminStats.ts                 # getDashboardStats() (clases hoy, reservas, usuarios, ocupación)
```

---

## Sistema de diseño (`components/ui/`)

### Principios establecidos
1. **Todo componente visual reutilizable vive en `components/ui/`**, nunca inline duplicado en screens.
2. **Gradientes con `expo-linear-gradient`**, nunca colores planos en botones/cards principales.
3. **Animaciones con Reanimated** (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming`), nunca `Animated` de React Native core.
4. **Spring values calibrados** para que se sientan naturales:
   - Botones grandes: `scale 0.94`, `damping: 12, stiffness: 280`
   - Cards: `scale 0.982`, `damping: 16, stiffness: 320, mass: 0.6`
   - Botones pequeños (BackButton, IconButton): `scale 0.88`, `damping: 14, stiffness: 300`
5. **`index.ts` SIEMPRE debe exportar todo lo que se usa** — un import roto desde el barrel causa `TypeError: Cannot read property 'displayName' of undefined` y crashea toda la screen.

### Bug histórico importante — hooks de Reanimated dentro de `.map()`
Causó un crash real: `useSharedValue`/`useAnimatedStyle` **no se pueden usar dentro de un componente definido como función anidada dentro de otro componente**, porque React lo recrea en cada render del padre y rompe las reglas de hooks al iterar con `.map()`.
**Solución aplicada:** cada componente con hooks de Reanimated debe vivir en su **propio archivo** en `components/ui/`, con identidad estable entre renders.

### Paleta de gradientes
```js
primary:  ['#2563EB', '#1741b5']   // azul — acción principal
booked:   ['#059669', '#047857']   // verde — ya reservado
change:   ['#D97706', '#B45309']   // ámbar — cambiar reserva
danger:   ['#DC2626', '#991b1b']   // rojo — eliminar/peligro
cancel:   ['rgba(220,38,38,0.18)', 'rgba(185,28,28,0.12)']  // rojo sutil — cancelar
```

### Colores de acento por tipo de clase (en `ClassCard`)
```js
'CROSS TRAINING': '#3B82F6'  // azul
'POWERLIFTING':   '#F59E0B'  // ámbar
'HALTEROFILIA':   '#EF4444'  // rojo
'OPEN BOX':       '#10B981'  // verde
```

---

## Esquema de Supabase

### Tablas principales
```sql
-- profiles
id, email, full_name, phone, birth_date, avatar_url, role ('user'|'admin'), plan_id (FK→membership_plans), created_at, updated_at

-- classes
id, name, class_date, class_time, max_spots (default 10), class_type, created_at

-- bookings
id, class_id (FK→classes), user_id (FK→auth.users), created_at

-- user_roles
id, user_id, role ('user'|'admin'), created_at, updated_at

-- notifications
id, user_id, title, message, type ('class_cancelled'|'class_modified'|'reminder'|'general'), read, class_id, created_at

-- membership_plans
id, name, description, price, currency, category, billing_period, classes_per_week (null=ilimitado), is_active, sort_order, created_at, updated_at

-- user_memberships
id, user_id, plan_id (FK→membership_plans), start_date, end_date, is_active, created_at, updated_at

-- push_tokens
id, user_id (UNIQUE, FK→profiles), token, platform, created_at, updated_at

-- workout_exercises
id, name, day_of_week (0-6), description, sort_order, is_active, created_at, updated_at

-- workout_logs
id, user_id (FK→profiles), exercise_id (FK→workout_exercises), date, weight, reps, notes, created_at
-- UNIQUE(user_id, exercise_id, date)

-- workout_notes
id, user_id (FK→auth.users), class_id (FK→classes), date, content, created_at, updated_at
```

### RLS
RLS habilitado en todas las tablas. Los usuarios ven/editan sus propios datos. Los admins tienen acceso de lectura a todos los perfiles, logs y bookings. `workout_exercises` es legible por todos, gestionable solo por admins.

### Edge Functions
- `send-push-notification` — función Deno que consulta `push_tokens` por user IDs y envía via Expo Push API.
- `delete-user` — borra bookings, templates, profile y cierra sesión. Implementada para cumplir requisito 5.1.1 de Apple (borrado de cuenta in-app). Referenciada en `ProfileScreen`.

---

## Navegación (`types/navigation.ts`)

```typescript
export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  MainMenu: { email: string; name?: string };
  Reservation: { email: string; name?: string; isAdmin?: boolean };
  Profile: { email: string; name?: string };
  AdminDashboard: { email: string; name?: string };
  AdminTemplates: undefined;
  AdminClasses: undefined;
  AdminUsers: undefined;
  AdminPlans: undefined;
  AdminPlanForm: { planId?: string };
  AdminCreateClass: { initialDate?: string };
  AdminCreateRecurringClass: undefined;
  AdminClassDetail: { classId: string };
  AdminEditClass: { classId: string };
  Notifications: undefined;
  MyClasses: { email: string; name?: string };
  AdminClassPreBook: { classId: string };
  AdminUserTemplates: { userId: string };
  AdminEditUser: { userId?: string };       // sin userId = crear nuevo usuario
  Workout: { email?: string; name?: string };
  WorkoutHistory: { email?: string; name?: string; exerciseId?: string };
};
```

> **Importante:** la ruta se llama `Reservation`, NO `Home`. Si encuentras referencias a `Home` en código antiguo, hay que actualizarlas a `Reservation`.

---

## Push Notifications

Sistema completo de notificaciones push:
1. Al iniciar la app, `App.tsx` registra el token Expo y lo guarda en `push_tokens` (`pushNotifications.ts`)
2. `notifications.ts` crea registros en la tabla `notifications` y envía push vía `sendPushNotifications()`
3. `sendPushNotifications()` consulta tokens de los usuarios destino y llama a la Expo Push API directamente desde el cliente
4. Edge function `send-push-notification` disponible como alternativa server-side

---

## Estado de publicación

### iOS App Store
- App publicada (`La Nave Strength Center`, App Apple ID `6768556827`).
- Rechazos resueltos: 2.3.6 Age Rating, 5.1.1 Account Deletion.
- Apple revisó en iPad Air (M2) pese a `supportsTablet: false` — se proporcionaron cuentas de prueba separadas.
- **Versión actual: `1.1.0`**

### Google Play
- Cuenta de desarrollador nueva → requiere fase de **closed testing**: mínimo 12 testers con la app instalada 14 días continuos antes de acceso a producción.

---

## Bugs conocidos / pendientes

1. **SafeAreaView en Android** — los botones de navegación del sistema se superponen con el contenido. Pendiente de resolver.
2. **Sentry** — SDK instalado y cableado (`initSentry` en `App.tsx`, `ErrorBoundary`, `identifyUser`/`clearUser` en el listener de auth), pero sigue en no-op hasta rellenar `EXPO_PUBLIC_SENTRY_DSN` en `.env` (local) y como secreto de EAS (builds). Falta crear el proyecto en sentry.io y pegar el DSN.

---

## Convenciones de código

- **TypeScript estricto**, tipado explícito en props de componentes.
- **NativeWind** para estilos nuevos. Estilos inline con objetos del theme module como alternativa. Sin `StyleSheet.create` en código nuevo.
- `scale` de `theme.ts` se importa como `scale as s` para evitar colisión con `useSharedValue` locales.
- Confirmaciones destructivas (eliminar clase, quitar usuario, etc.) siempre vía `Alert.alert` con opción `cancel` + `destructive`.
- Idioma de la UI: **español** (España). Variables y API en inglés.
- Import de UI components desde el barrel: `import { Button, Input } from '../components/ui';`
