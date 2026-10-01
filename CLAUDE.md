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

eas update --branch preview     # Ship JS-only changes to installed preview builds (~1 min)
eas update --channel production --environment production --message "..."  # Hotfix to store installs (bug fixes only)
```

All three profiles receive over-the-air updates (`expo-updates`, `runtimeVersion` policy `fingerprint`); `production` uses the `production` channel since 1.18.0 (store builds before that have no channel and never get OTA). Production OTA is for **bug fixes only** — features still ship through the stores: publish from an up-to-date `main`, test the same change on `preview` first, and always pass `--environment production` so the bundle gets the production EAS env vars (Supabase, Sentry).

An OTA update lands on the *next* app launch — the first open downloads it in the background, the second one runs it. Anything touching native code still needs a rebuild; the fingerprint policy refuses to serve JS to a binary it does not match.

**Releases**: `main` is protected (changes only through a pull request), so the CI bot can no longer commit the version bump. Before opening the PR from `develop`, run `npm run bump` (minor for `feat`, patch for `fix`, from the commits since the last tag) and commit `app.json`; `pr-check.yml` fails if the version equals the last tag. On merge, `production.yml` only tags `vX.Y.Z` and builds.

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

26 tables in `public`, all with RLS enabled:

- **Users & access**: `profiles`, `user_roles`, `admin_actions`
- **Classes & booking**: `classes`, `class_types`, `bookings`, `booking_templates` (a member can have several, each with optional `valid_from`/`valid_until`; for each day the one starting latest wins — `src/utils/templatePeriods.ts`, duplicated in `smart-action`; a dated template with no classes is stored as one marker row with `class_type = ''`), `class_waitlist`, `waitlist_moves` (someone moved in from a waitlist, pending their keep/go-back answer; read-only for clients), `booking_cancellations` (log of deleted bookings, written only by the `trg_log_booking_cancellation` trigger; admin-read only)
- **Plans & billing**: `membership_plans`, `user_memberships`, `plan_payments`, `plan_adjustments`
- **Training**: `workout_exercises`, `workout_logs`, `workout_notes`, `exercise_library`, `bodyweight_logs` — RPE is `numeric(3,1)` in 0.5 steps plus an optional `*_max` for ranges ("RPE 7/8"); parse/format/estimate in `src/utils/rpe.ts` (a range counts as its midpoint for e1RM)
- **Other**: `app_content` (admin-editable texts/images: Welcome slides and member menu cards; public read, admin write; images in the public `app-content` bucket; defaults and merge in `src/utils/appContentModel.ts`), `notifications`, `notification_templates`, `push_tokens`, `app_versions`, `app_settings` (`booking_cutoff_hours`, `latest_app_version`), `keepalive_ping` (dummy table for the keep-alive workflow; RLS on with no policies on purpose — only `service_role` touches it)

`class_roster` is a view, not a table: it is deliberately `security_invoker = off` so members can see who else is booked into a class while exposing only `username` and `avatar_url`. It is scoped to `class_date` between −30 and +60 days, matching `generateWeekDays()` in `ReservationScreen`. Supabase's linter flags it as an error; that is expected — see `20260919121817_hardening_seguridad_rls.sql`.

**Time zones**: Postgres, Deno edge functions and the crons run in **UTC**; the gym is in Europe/Madrid (UTC+1/+2). In SQL use `(now() AT TIME ZONE 'Europe/Madrid')::date` for "today" and `(class_date + class_time) AT TIME ZONE 'Europe/Madrid'` for class instants; in edge functions use a Madrid-local date, never `toISOString().split('T')[0]`. Quotas and payments are evaluated for the **class's** period, not today's (month-end bookings reach into the next month). Exception on purpose: `plan_assigned_at::date` stays UTC — it keys the bono window and `plan_adjustments` (see `src/utils/bonoWindow.ts`).

**Booking rules live in the database**: `can_user_book` (plan, payment, quota, `app_settings.max_classes_per_day` — default 2 — and the `booking_cutoff_hours` window) and `promote_from_waitlist` (trigger on booking delete: first eligible in the queue enters; `class_waitlist.keep_both` decides whether someone who already has a class that day gets both or is moved; nobody is promoted within 2 h of the class). Members can be in several waitlists at once.

**Waitlist moves** (`20260930120000_waitlist_move_then_ask.sql`): when the first in the queue already has another class that day, `fill_waitlist_vacancy` moves them straight away (their old spot is released immediately) and records a `waitlist_moves` row. The app asks afterwards (`WaitlistMoveModal`, mounted in `App.tsx`): keep, go back, or keep both — via `resolve_waitlist_move`; going back only works if the old class still has room. The join-time "switch or both?" question is gone (only old app versions can still send `keep_both = true`). A previous design that held the spot for 20 minutes (`20260929120000_waitlist_offers.sql`) was dropped as too forced.

**Attendance** (`20261001120000_class_attendance.sql`): `bookings.attended` (true/false/null = unmarked), set only by an admin through `set_attendance`, from class start on. Everyone counts as attended by default (null = came); the admin only taps ✗ for no-shows, under each attendee in the expanded `ClassCard` on the Reservas screen (replacing the remove badge) and in the class detail screen. The first ✗ on a booking for a class in the last 2 days notifies the member once (`absence_notified_at`), using the built-in rule `class_absence` in `notification_templates` (editable or switchable off from the Notifications panel; variables `{{clase}}`, `{{hora}}` plus the usual ones). `last_attendance*` ignore no-shows.

**Capacity is enforced in the database** by `trg_enforce_class_capacity` (bookings, demo accounts excluded) for members; admins and session-less callers (crons, edge functions) skip it — `smart-action` counts capacity itself.

**Demo accounts** (`profiles.is_demo`, for Google Play / App Store reviewers): behave as a normal member for themselves but are invisible to everyone else — hidden from `class_roster` (except to themselves) and `class_waitlist_public`, not counted for capacity (`can_join_waitlist`, `promote_from_waitlist`) and barred from waitlists. Only an admin can flip the flag (`trg_prevent_self_demo_flag_change`). See `20260927140000_demo_accounts.sql`.

### Edge Functions

Six Deno functions in `supabase/functions/`, all with `verify_jwt` on:

- `create-user/` — admin-only user creation: `auth.admin.createUser` plus `profiles` and `user_roles` rows
- `delete-user/` — full purge: user-owned rows across tables, avatar files in Storage, then `auth.admin.deleteUser`
- `send-email/` — admin-only: emails the given `userIds` through Resend (`RESEND_API_KEY` secret)
- `payment-reminders/` — invoked by the `payment-reminders-daily` cron (09:00 UTC); reads `plan_payments`/`profiles`, writes `notifications` and pushes via `push_tokens`
- `smart-action/` — invoked by the `apply-templates-daily` cron (02:00 UTC); turns `booking_templates` into real `bookings` for the next 14 days (well before the 48 h booking window opens), respecting capacity, quota/payment and one-off cancellations (a member who cancelled a specific class is not re-booked into it; later weeks still apply). Body `{"dry_run": true}` returns what it would book without writing

- `shrink-avatars/` — invoked by the `shrink-avatars-hourly` cron (minute 15), one request per avatar over 60 KB uploaded in the last day; rewrites it in place as a 256×256 JPEG (magick-wasm, JPEG decoded pre-scaled to fit the CPU limit). Avatars at camera size were ~850 MB/day of cached egress on the free plan's 5.5 GB/month

The crons (`apply-templates-daily`, `payment-reminders-daily`, `shrink-avatars-hourly`, and `notification-rules-daily` — 10:00 UTC, runs `run_notification_rules()` in SQL) live in `cron.job`; all but `notification-rules-daily` call the functions through `net.http_post` (`pg_net`). None of them is part of any schema dump.

### Migrations

`supabase/migrations/` is a historical record, **not a replayable history** — do not run `supabase db push` against an empty project expecting the database back. Several files are marked `⚠️ OBSOLETA — NO EJECUTAR` and are literally unrunnable (`20260620_rls_policies.sql` uses `CREATE POLICY IF NOT EXISTS`, which is not valid Postgres). Only some are registered in `supabase_migrations.schema_migrations`. Recovery goes through the encrypted dump — see `docs/RESTORE.md`, and `docs/BACKUP-SETUP.md` for the pending setup work.

### Styling

Dual system: **NativeWind** (Tailwind CSS via `className` prop, configured in `tailwind.config.js` + `babel.config.js` with `nativewind` preset) plus a **theme module** (`src/theme.ts`) that exports `Colors`, `Fonts`, `Typography`, `Spacing`, `Radius`, `Shadows`, and responsive scaling functions (`scale`, `verticalScale`, `moderateScale`). Base design is iPhone 14 Pro (390×844). Tablet detection at 768pt width.

Font: Oswald (400/600/700) for headings and labels; system font for body text. Font scaling is globally disabled.

### What's new

"Novedades" pop-up after an update: entries in `src/content/releaseNotes.ts` (newest first; members see `member`, admins see `admin` then `member`), shown once per device, never to accounts created after the entry's date. Opened from `MainMenuScreen` / `AdminDashboardScreen`. **Add an entry with every store release or OTA that users would notice.** Keep lines short — one idea each, no explanations; the owner wants less text across the app.

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
