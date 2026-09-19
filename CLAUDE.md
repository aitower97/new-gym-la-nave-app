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

Tests run with `npm test` (Jest + ts-jest, config in `jest.config.js`). Coverage is currently a single file: `src/__tests__/validation.test.ts`. If Jest aborts with `Preset ts-jest not found`, `node_modules` is stale — run `npm install`.

No linter or formatter is configured.

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

19 tables in `public`, all with RLS enabled:

- **Users & access**: `profiles`, `user_roles`, `admin_actions`
- **Classes & booking**: `classes`, `class_types`, `bookings`, `booking_templates`
- **Plans & billing**: `membership_plans`, `user_memberships`, `plan_payments`
- **Training**: `workout_exercises`, `workout_logs`, `workout_notes`, `exercise_library`, `bodyweight_logs`
- **Other**: `notifications`, `push_tokens`, `app_settings` (`booking_cutoff_hours`, `latest_app_version`), `keepalive_ping` (dummy table for the keep-alive workflow; RLS on with no policies on purpose — only `service_role` touches it)

`class_roster` is a view, not a table: it is deliberately `security_invoker = off` so members can see who else is booked into a class while exposing only `username` and `avatar_url`. It is scoped to `class_date` between −30 and +60 days, matching `generateWeekDays()` in `ReservationScreen`. Supabase's linter flags it as an error; that is expected — see `20260919121817_hardening_seguridad_rls.sql`.

### Edge Functions

Four Deno functions in `supabase/functions/`, all with `verify_jwt` on:

- `create-user/` — admin-only user creation: `auth.admin.createUser` plus `profiles` and `user_roles` rows
- `delete-user/` — full purge: user-owned rows across tables, avatar files in Storage, then `auth.admin.deleteUser`
- `payment-reminders/` — invoked by the `payment-reminders-daily` cron (09:00 UTC); reads `plan_payments`/`profiles`, writes `notifications` and pushes via `push_tokens`
- `smart-action/` — invoked by the `apply-weekly-templates` cron (Sun 23:00 UTC); turns `booking_templates` into real `bookings`

Both crons live in `cron.job` and call the functions through `net.http_post` (`pg_net`), so they are **not** part of any schema dump.

### Migrations

`supabase/migrations/` is a historical record, **not a replayable history** — do not run `supabase db push` against an empty project expecting the database back. Several files are marked `⚠️ OBSOLETA — NO EJECUTAR` and are literally unrunnable (`20260620_rls_policies.sql` uses `CREATE POLICY IF NOT EXISTS`, which is not valid Postgres). Only some are registered in `supabase_migrations.schema_migrations`. Recovery goes through the encrypted dump — see `docs/RESTORE.md`, and `docs/BACKUP-SETUP.md` for the pending setup work.

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

`ErrorBoundary` component wraps the entire app and reports caught errors to Sentry. Sentry (`@sentry/react-native`) is wired in `src/lib/sentry.ts`, initialized in `App.tsx`, and tied to auth state (`identifyUser`/`clearUser` on sign-in/out) — but every function is a silent no-op until `EXPO_PUBLIC_SENTRY_DSN` is set (locally in `.env`, and as an EAS secret for builds).

## Language

The app UI and code comments are in **Spanish**. Variable names and API calls use English. Supabase column names are in English.
