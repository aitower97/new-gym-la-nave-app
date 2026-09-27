import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from './auth';
import { AppContent, AppContentRow, DEFAULT_APP_CONTENT, mergeAppContent, toAppContentRows } from './appContentModel';

/**
 * Contenido editable desde el admin (textos de la portada, tarjetas del menú).
 *
 * Orden de carga: memoria → copia guardada en el móvil → red. Así la portada
 * sale al instante con lo último conocido y se actualiza sola si el admin
 * cambió algo. La copia sí va a disco (a diferencia de screenCache): aquí no
 * hay datos personales, solo textos e imágenes públicos del gimnasio.
 */

const STORAGE_KEY = 'app_content_v1';
let memory: AppContent | null = null;
let inflight: Promise<AppContent> | null = null;
const listeners = new Set<(c: AppContent) => void>();

function publish(content: AppContent) {
  memory = content;
  listeners.forEach(l => l(content));
}

async function readStored(): Promise<AppContent | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? mergeAppContent(JSON.parse(raw) as AppContentRow[]) : null;
  } catch {
    return null;
  }
}

/** Pide el contenido a la base y lo publica. Una sola petición aunque la pidan varias pantallas. */
export function refreshAppContent(): Promise<AppContent> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.from('app_content').select('key, value');
      if (error || !data) return memory ?? DEFAULT_APP_CONTENT;
      const content = mergeAppContent(data);
      publish(content);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
      // Descargar ya las imágenes nuevas para que las tarjetas no salgan vacías un instante
      Object.values(content.menuCards).forEach(c => { if (c.imageUrl) Image.prefetch(c.imageUrl).catch(() => {}); });
      return content;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Contenido para pintar: nunca vacío (lo original si no hay nada). */
export function useAppContent(): AppContent {
  const [content, setContent] = useState<AppContent>(memory ?? DEFAULT_APP_CONTENT);

  useEffect(() => {
    let alive = true;
    const listener = (c: AppContent) => { if (alive) setContent(c); };
    listeners.add(listener);
    if (!memory) {
      readStored().then(stored => { if (alive && stored && !memory) setContent(stored); });
    }
    refreshAppContent();
    return () => { alive = false; listeners.delete(listener); };
  }, []);

  return content;
}

/** Admin: guarda todo el contenido. Lo publica al momento en esta sesión. */
export async function saveAppContent(content: AppContent): Promise<void> {
  const user = await getCurrentUser();
  const rows = toAppContentRows(content).map(r => ({
    key: r.key,
    value: r.value,
    updated_at: new Date().toISOString(),
    updated_by: user?.id ?? null,
  }));
  const { error } = await supabase.from('app_content').upsert(rows, { onConflict: 'key' });
  if (error) throw error;
  publish(mergeAppContent(rows));
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rows)).catch(() => {});
}

/** Admin: sube una imagen al bucket app-content y devuelve su URL pública. */
export async function uploadContentImage(uri: string, slot: string): Promise<string> {
  const ext = (uri.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const safeExt = ['jpg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  // Nombre nuevo en cada subida: una URL nueva evita que los móviles sigan
  // enseñando la imagen anterior desde su caché
  const path = `${slot}/${Date.now()}.${safeExt}`;

  // Mismo patrón que el avatar (ProfileScreen): en React Native el Blob no
  // tiene arrayBuffer(), hay que pasarlo por Response
  const response = await fetch(uri);
  const blob = await response.blob();
  const arrayBuffer = await new Response(blob).arrayBuffer();
  const { error } = await supabase.storage.from('app-content').upload(path, arrayBuffer, {
    contentType: safeExt === 'png' ? 'image/png' : safeExt === 'webp' ? 'image/webp' : 'image/jpeg',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('app-content').getPublicUrl(path).data.publicUrl;
}
