-- ============================================================================
-- FIX: push_tokens le faltaba la restricción UNIQUE(user_id) — 2026-07-08
--
-- La migración 20260620_create_push_tokens.sql ya declaraba
-- `UNIQUE(user_id)`, pero usaba `CREATE TABLE IF NOT EXISTS` y la tabla ya
-- existía en producción (creada antes, a mano) con una restricción distinta:
-- `UNIQUE(user_id, token)`. El `IF NOT EXISTS` hizo que esa migración nunca
-- llegara a aplicar la restricción correcta.
--
-- Sin UNIQUE(user_id), el upsert de la app
-- (`src/utils/pushNotifications.ts` → `.upsert(..., { onConflict: 'user_id' })`)
-- fallaba siempre con el error de Postgres 42P10 ("no unique or exclusion
-- constraint matching the ON CONFLICT specification"), impidiendo guardar
-- el token de notificaciones push de cualquier usuario.
--
-- Verificado antes de aplicar: no había ningún user_id con más de una fila
-- en push_tokens, así que el cambio de restricción es seguro sin necesidad
-- de deduplicar datos primero.
-- ============================================================================

ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_user_id_token_key;

ALTER TABLE push_tokens
  ADD CONSTRAINT push_tokens_user_id_key UNIQUE (user_id);
