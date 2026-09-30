/**
 * whatsNew.ts — Qué novedades enseñar y recordar que ya se vieron.
 * Contenido en src/content/releaseNotes.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RELEASE_NOTES, ReleaseNote } from '../content/releaseNotes';

// Por usuario, no por móvil: si en el mismo móvil entra el admin y luego un
// socio (o al revés), cada uno ve sus novedades.
const seenKey = (userId: string) => `whats_new_seen_id:${userId}`;

export interface WhatsNewSection {
  title: string | null;
  items: string[];
}

/**
 * Secciones a enseñar, o null si no toca: ya vista, cuenta creada después de
 * la nota, o sin nada para este rol.
 */
export function pickWhatsNew(
  notes: ReleaseNote[],
  seenId: string | null,
  isAdmin: boolean,
  accountCreatedAt: Date | null,
): { note: ReleaseNote; sections: WhatsNewSection[] } | null {
  const note = notes[0];
  if (!note || note.id === seenId) return null;
  if (accountCreatedAt && accountCreatedAt >= new Date(`${note.date}T00:00:00`)) return null;

  const sections: WhatsNewSection[] = isAdmin
    ? [
        { title: 'Para ti', items: note.admin },
        { title: 'Para los socios', items: note.member },
      ].filter((s) => s.items.length > 0)
    : note.member.length > 0 ? [{ title: null, items: note.member }] : [];

  return sections.length > 0 ? { note, sections } : null;
}

export async function loadWhatsNew(userId: string, isAdmin: boolean, accountCreatedAt: Date | null) {
  let seen: string | null = null;
  try { seen = await AsyncStorage.getItem(seenKey(userId)); } catch { /* sin almacenamiento: se enseña */ }
  return pickWhatsNew(RELEASE_NOTES, seen, isAdmin, accountCreatedAt);
}

export async function markWhatsNewSeen(userId: string, id: string): Promise<void> {
  try { await AsyncStorage.setItem(seenKey(userId), id); } catch { /* no crítico */ }
}
