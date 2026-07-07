# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"La Nave" — a React Native gym management app built with Expo SDK 54. Two user roles: **members** book classes, track workouts, and manage profiles; **admins** manage classes, users, plans, and view dashboard stats. Backend is Supabase (auth, Postgres, edge functions). The app targets iOS and Android with a dark-themed UI.

## Development Commands

```bash
npx expo start                  # Start dev server (Expo Go or dev client)
npx expo start --android        # Start on Android
npx expo start --ios            # Start on iOS
npx expo start --web            # Start web version
eas build --profile development # Build dev client
eas build --profile preview     # Build preview APK (internal distribution)
eas build --profile production  # Build production bundle
```

There is no test suite or linter configured.

The `postinstall` script runs `patch-node-modules.js` which patches `react-native-screens` to avoid top-level `Platform.OS` evaluation issues.

## Architecture

### Navigation

Single native stack navigator (`src/navigation/AppNavigator.tsx`) with all routes defined in `RootStackParamList` (`src/types/navigation.ts`). No tab navigator — the main menu screen acts as a hub. Auth flow: `Welcome → Login/Register → MainMenu`. User email/name are passed as route params through the stack.

### Backend — Supabase

- Client initialized in `src/lib/supabase.ts` using env vars `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Auth sessions persisted via `expo-secure-store` (`src/lib/secureStorage.ts`, adapter with chunking for values >2048 bytes)
- Role-based access: `user_roles` table checked via `src/utils/auth.ts` (`isUserAdmin()`, `getUserRole()`)
- Membership plans: `membership_plans` + `user_memberships` tables, queried in `src/utils/auth.ts` (`getActivePlan()`, `hasActivePlan()`)
- RLS is enabled on all tables; policies enforce user/admin access at the database level

### Key Supabase Tables

`profiles`, `classes`, `bookings`, `user_roles`, `notifications`, `membership_plans`, `user_memberships`, `push_tokens`, `workout_exercises`, `workout_logs`

### Edge Functions

`supabase/functions/send-push-notification/` — Deno function that queries `push_tokens` and sends via Expo Push API.

### Styling

Dual system: **NativeWind** (Tailwind CSS via `className` prop, configured in `tailwind.config.js` + `babel.config.js` with `nativewind` preset) plus a **theme module** (`src/theme.ts`) that exports `Colors`, `Fonts`, `Typography`, `Spacing`, `Radius`, `Shadows`, and responsive scaling functions (`scale`, `verticalScale`, `moderateScale`). Base design is iPhone 14 Pro (390×844). Tablet detection at 768pt width.

Font: Oswald (400/600/700) for headings and labels; system font for body text. Font scaling is globally disabled.

### UI Components

Barrel-exported from `src/components/ui/index.ts`. Import as:
```ts
import { Button, Input, BackButton } from '../components/ui';
```

### Push Notifications

`src/utils/pushNotifications.ts` handles Expo push token registration and direct sending via Expo Push API. `src/utils/notifications.ts` manages in-app notification records in Supabase and triggers push delivery. Android notification channel configured on app start.

### Validation

Zod schemas in `src/utils/validation.ts` — used for auth forms, profile updates, and class creation. `validateData()` returns first error message; `validateOrAlert()` shows a native Alert on failure.

### Error Handling

`ErrorBoundary` component wraps the entire app. Sentry integration is stubbed out (`src/lib/sentry.ts`) — functions are no-ops pending DSN configuration.

## Language

The app UI and code comments are in **Spanish**. Variable names and API calls use English. Supabase column names are in English.
