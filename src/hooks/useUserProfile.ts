import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../utils/auth';
import { getCached, setCached } from '../utils/screenCache';

interface CachedProfile {
  avatarUrl: string | null;
  userId: string;
  fullName: string;
  email: string;
}

const CACHE_KEY = 'user-profile';

/**
 * Usuario de la sesión para las cabeceras. Lo último visto sale al instante
 * desde el caché de pantallas (se borra al cerrar sesión): sin él, cada
 * pantalla arrancaba sin userId, esperaba a la sesión y al perfil, y la foto
 * aparecía de golpe a mitad de la animación de entrada.
 */
export function useUserProfile() {
  const [profile, setProfile] = useState<CachedProfile>(
    () => getCached<CachedProfile>(CACHE_KEY) ?? { avatarUrl: null, userId: '', fullName: '', email: '' },
  );

  useEffect(() => {
    let active = true;
    async function load() {
      const user = await getCurrentUser();
      if (!user || !active) return;
      const base = getCached<CachedProfile>(CACHE_KEY);
      if (!base || base.userId !== user.id) {
        setProfile({ avatarUrl: null, fullName: '', userId: user.id, email: user.email || '' });
      }
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, username, full_name')
        .eq('id', user.id)
        .single();
      if (!active || !data) return;
      const next: CachedProfile = {
        userId: user.id,
        email: user.email || '',
        avatarUrl: data.avatar_url,
        fullName: data.username || data.full_name || '',
      };
      setCached(CACHE_KEY, next);
      // Sin cambios, sin repintar
      setProfile((prev) => (
        prev.userId === next.userId && prev.avatarUrl === next.avatarUrl
          && prev.fullName === next.fullName && prev.email === next.email ? prev : next
      ));
    }
    load();
    return () => { active = false; };
  }, []);

  return profile;
}
