# La Nave Strength Center — App Móvil

## 📋 Contexto del proyecto

App de gestión de gimnasio y reserva de clases, desarrollada como trabajo de cliente para un gimnasio (box de CrossTraining/Halterofilia/Powerlifting) en Madrid. Publicada en iOS App Store y Google Play.

- **Desarrollador:** Aitor Arrocha Martínez
- **Cuenta de stores:** `kingstower97`
- **Plataformas:** iOS App Store (publicada) + Google Play (en fase de testing cerrado)

---

## 🛠 Stack técnico

| Área | Tecnología |
|---|---|
| Framework | React Native con Expo (Expo SDK reciente, New Architecture habilitada) |
| Lenguaje | TypeScript |
| Backend | Supabase (Auth + Postgres + Edge Functions + RLS) |
| Navegación | React Navigation (Native Stack) |
| Animaciones | React Native Reanimated 4.x (requiere New Architecture, sin Expo Go, requiere development build) |
| Estilos | Sin StyleSheet — estilos inline + NativeWind en progreso de migración |
| Iconos | SVG custom en `src/components/Icons.tsx` |
| Imágenes/gradientes | `expo-linear-gradient` |
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

---

## 📁 Estructura de carpetas

```
src/
├── components/
│   ├── Icons.tsx                 # Iconos SVG custom (BellIcon, CalendarIcon, TrashIcon, XIcon, WavesIcon, etc.)
│   ├── ui/                       # Sistema de diseño reutilizable (EN MIGRACIÓN ACTIVA)
│   │   ├── index.ts               # Barrel export — REVISAR SIEMPRE que todo lo usado esté exportado
│   │   ├── Button.tsx             # Botón con gradiente + shimmer + spring
│   │   ├── Input.tsx              # Input con focus animado (interpolateColor)
│   │   ├── BackButton.tsx         # Botón volver circular con spring
│   │   ├── BookButton.tsx         # Botón reserva clase (book/booked/change/full/cancel)
│   │   ├── Card.tsx               # Card genérica con gradiente (usada en MainMenu)
│   │   ├── ClassCard.tsx          # Card de clase reservable (gradiente + spring + shadow dinámica)
│   │   ├── Avatar.tsx             # Avatar usuario o placeholder logo La Nave (con FadeIn escalonado)
│   │   ├── DaySelector.tsx        # Selector horizontal de días (forwardRef a ScrollView)
│   │   ├── ContextBar.tsx         # Barra fecha + contador clases (con pulso animado)
│   │   ├── EmptyState.tsx         # Estado vacío genérico (icono flotante)
│   │   ├── ScreenHeader.tsx       # Header con BackButton + título + subtítulo
│   │   ├── BrandHeader.tsx        # Logo + "LA NAVE STRENGTH CENTER"
│   │   └── WelcomeSlide.tsx       # Slide del carrusel de bienvenida
│   └── widgets/
│       ├── NextClassWidget.tsx    # Countdown próxima clase reservada (recibe datos como prop, NO hace fetch propio)
│       └── WorkoutNotesWidget.tsx # Widget compacto resumen notas del día (en MainMenu)
├── screens/
│   ├── WelcomeScreen.tsx
│   ├── LoginScreen.tsx            # Migrada a componentes ui/
│   ├── RegisterScreen.tsx         # ⚠️ PENDIENTE migrar a componentes ui/ (sigue con StyleSheet)
│   ├── MainMenuScreen.tsx         # Migrada — incluye NextClassWidget + WorkoutNotesWidget
│   ├── ReservationScreen.tsx      # Renombrada desde HomeScreen — 100% migrada a componentes ui/
│   ├── WorkoutNotesScreen.tsx     # Pantalla completa de notas con selector de fecha
│   ├── ProfileScreen.tsx
│   ├── AdminDashboardScreen.tsx
│   ├── AdminTemplatesScreen.tsx / AdminClassesScreen.tsx / AdminUsersScreen.tsx / etc.
│   └── screens_backup_20260512_085418/  # Backup de un intento revertido de fix SafeAreaView
├── lib/
│   └── supabase.ts                # Cliente Supabase
├── theme.ts                       # Colors, scale, moderateScale, MAX_CONTENT_WIDTH, Radius
├── types/
│   └── navigation.ts              # RootStackParamList + tipos ClassWithBookings, User, etc.
└── utils/
    ├── auth.ts                    # isUserAdmin()
    ├── validation.ts               # Schemas Zod (loginSchema, registerSchema, validateOrAlert)
    └── notifications.ts            # getUnreadCount()
```

---

## 🎨 Sistema de diseño (`components/ui/`)

### Principios establecidos en este proyecto
1. **Todo componente visual reutilizable vive en `components/ui/`**, nunca inline duplicado en screens.
2. **Gradientes con `expo-linear-gradient`**, nunca colores planos en botones/cards principales.
3. **Animaciones con Reanimated** (`useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming`), nunca `Animated` de React Native core.
4. **Spring values calibrados** para que se sientan naturales, ni bruscos ni imperceptibles:
   - Botones grandes: `scale 0.94`, `damping: 12, stiffness: 280`
   - Cards: `scale 0.982`, `damping: 16, stiffness: 320, mass: 0.6`
   - Botones pequeños (BackButton, IconButton): `scale 0.88`, `damping: 14, stiffness: 300`
5. **`index.ts` SIEMPRE debe exportar todo lo que se usa** — un import roto desde el barrel causa `TypeError: Cannot read property 'displayName' of undefined` y crashea toda la screen.

### ⚠️ Bug histórico importante — hooks de Reanimated dentro de `.map()`
Causó un crash real: `useSharedValue`/`useAnimatedStyle` **no se pueden usar de forma segura dentro de un componente definido como función anidada dentro de otro componente** (ej. `function ClassCard(...)` declarado dentro de `ReservationScreen.tsx`), porque React lo recrea en cada render del padre y rompe las reglas de hooks al iterar con `.map()`.
**Solución aplicada:** cada componente con hooks de Reanimated debe vivir en su **propio archivo** en `components/ui/`, con identidad estable entre renders. Una vez extraído así, es seguro usarlo dentro de `.map()`.

### Paleta de gradientes establecida
```js
primary:  ['#2563EB', '#1741b5']   // azul — acción principal
booked:   ['#059669', '#047857']   // verde — ya reservado
change:   ['#D97706', '#B45309']   // ámbar — cambiar reserva
danger:   ['#DC2626', '#991b1b']   // rojo — eliminar/peligro
cancel:   ['rgba(220,38,38,0.18)', 'rgba(185,28,28,0.12)']  // rojo sutil — cancelar (NO rojo sólido)
```

### Colores de acento por tipo de clase (en `ClassCard`)
```js
'CROSS TRAINING': '#3B82F6'  // azul
'POWERLIFTING':   '#F59E0B'  // ámbar
'HALTEROFILIA':   '#EF4444'  // rojo
'OPEN BOX':       '#10B981'  // verde
```

---

## 🗄 Esquema de Supabase

### Tablas principales
```sql
-- classes
id, name, class_date, class_time, max_spots, class_type

-- bookings
id, class_id (FK→classes), user_id (FK→auth.users)

-- profiles
id (FK→auth.users), email, full_name, phone, birth_date, avatar_url, created_at, updated_at

-- workout_notes (creada en esta fase de desarrollo)
CREATE TABLE workout_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE workout_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notes" ON workout_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX workout_notes_user_date ON workout_notes(user_id, date DESC);
```

### RLS conocido como limitante
La política RLS actual **no permite que un admin borre reservas de otros usuarios** directamente. `handleRemoveUser` en `ReservationScreen` lo detecta y avisa al admin que necesita añadir una policy DELETE específica para admins en el dashboard de Supabase. **Pendiente de resolver.**

### Edge Function
- `delete-user` — borra bookings, templates, profile, y hace `supabase.auth.signOut()`. Implementada para cumplir el requisito 5.1.1 de Apple (borrado de cuenta in-app).

---

## 🧭 Navegación (`types/navigation.ts`)

```typescript
export type RootStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Register: undefined;
  MainMenu: { email: string; name?: string };
  Reservation: { email: string; name?: string; isAdmin?: boolean };  // renombrada desde "Home"
  Profile: { email: string; name?: string };
  AdminDashboard: { email: string; name?: string };
  AdminTemplates: undefined;
  AdminClasses: undefined;
  AdminUsers: undefined;
  AdminPlans: undefined;
  AdminCreateClass: { initialDate?: string };
  AdminCreateRecurringClass: undefined;
  AdminClassDetail: { classId: string };
  AdminEditClass: { classId: string };
  Notifications: undefined;
  MyClasses: { email: string; name?: string };
  AdminClassPreBook: { classId: string };
  AdminUserTemplates: { userId: string };
  WorkoutNotes: undefined;
};

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

export interface User {
  id: string;
  name: string;
  avatar: string | null;
}
```

> ⚠️ **Importante:** la ruta se llama `Reservation`, NO `Home`. Si encuentras referencias a `Home` en código antiguo o backups, son del nombre previo a la migración — hay que actualizarlas a `Reservation`.

---

## 🐛 Bugs conocidos / pendientes

1. **SafeAreaView en Android** — los botones de navegación del sistema se superponen con el contenido de la app. Hay un intento de fix automatizado que se revirtió (backup en `src/screens_backup_20260512_085418`) porque rompió imports al aplicarse. **Pendiente de resolver con cuidado, sin scripts automáticos masivos.**
2. **RLS de admin en bookings** — ver sección Supabase arriba.
3. **`RegisterScreen.tsx`** sigue con `StyleSheet` tradicional, no migrado al sistema `ui/` (a diferencia de `LoginScreen` que sí está migrado).

---

## 📱 Estado de publicación

### iOS App Store
- App publicada (`La Nave Strength Center`, App Apple ID `6768556827`).
- Rechazos resueltos:
  - **2.3.6 Age Rating** → cambiado de "Age Assurance: Yes" a None.
  - **5.1.1 Account Deletion** → implementado borrado in-app vía Edge Function `delete-user`.
- Apple revisó en iPad Air (M2) pese a `supportsTablet: false` — se proporcionaron cuentas de prueba separadas (member `review@lanave.com` y admin).
- Privacy policy hosteada en Netlify Drop (la anterior en Tiiny.host expiró).
- **Versión actual subida: `1.1.0`** (bump desde `1.0.1` tras rechazo `ITMS-90062`/`ITMS-90186` por intentar repetir versión ya aprobada). Con tantos cambios de UI en curso se decidió minor bump en vez de patch.

### Google Play
- Cuenta de desarrollador nueva → requiere fase de **closed testing**: mínimo 12 testers con la app instalada 14 días continuos antes de acceso a producción.
- Icono actualizado: triángulo blanco sobre azul `#185DBE` (`android-icon-foreground.png`).

---

## 🎯 Líneas de trabajo abiertas / próximos pasos

1. **Terminar migración visual a `components/ui/`** en pantallas que aún no la tienen (`RegisterScreen` es la principal pendiente).
2. **Resolver bug de SafeAreaView en Android** sin reventar imports otra vez.
3. **Conceder policy RLS de DELETE para admins** en `bookings` desde el dashboard de Supabase.
4. **Completar el closed testing de Google Play** (faltan testers para llegar a 12 × 14 días).
5. **Exploración de diseño "Timeline Social"** (descartada de momento, pero documentada): un rediseño alternativo de la pantalla de reservas inspirado en timeline vertical tipo agenda, con avatares apilados estilo "GitHub contributors" en vez de grid, pensado para diferenciarse visualmente de competidores directos (WodBuster, BoxMagic). Hay un prototipo React funcional generado en una sesión anterior si se quiere retomar esta dirección.

---

## 🧩 Convenciones de código del proyecto

- **TypeScript estricto**, tipado explícito en props de componentes.
- **Sin `StyleSheet.create`** en componentes nuevos — todo estilo inline u objetos de estilo por archivo (excepción: código heredado aún no migrado).
- `scale` de `theme.ts` se importa habitualmente como `scale as s` para evitar colisión de nombres con `useSharedValue` locales llamados `scale`.
- Componentes `ui/` documentan su uso con un comentario JSDoc al inicio del archivo mostrando ejemplos de invocación.
- Confirmaciones destructivas (eliminar clase, quitar usuario, eliminar nota) siempre vía `Alert.alert` con opción `cancel` + `destructive`.
- Idioma de la UI: **español** (España) en todos los textos visibles al usuario.
