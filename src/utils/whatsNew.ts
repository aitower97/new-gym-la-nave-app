/**
 * whatsNew.ts — Qué novedades enseñar y recordar que ya se vieron.
 * Contenido en src/content/releaseNotes.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RELEASE_NOTES, ReleaseNote } from '../content/releaseNotes';

const SEEN_KEY = 'whats_new_seen_id';

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

export async function loadWhatsNew(isAdmin: boolean, accountCreatedAt: Date | null) {
  let seen: string | null = null;
  try { seen = await AsyncStorage.getItem(SEEN_KEY); } catch { /* sin almacenamiento: se enseña */ }
  return pickWhatsNew(RELEASE_NOTES, seen, isAdmin, accountCreatedAt);
}

export async function markWhatsNewSeen(id: string): Promise<void> {
  try { await AsyncStorage.setItem(SEEN_KEY, id); } catch { /* no crítico */ }
}
