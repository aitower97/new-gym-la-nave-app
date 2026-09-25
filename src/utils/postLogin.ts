import type { User } from '@supabase/supabase-js';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { isUserAdmin } from './auth';
import { needsProfileCompletion } from './profileCompletion';

// Solo hace falta navigate/replace; así vale el navigation de cualquier pantalla.
type Nav = Pick<NativeStackNavigationProp<RootStackParamList>, 'navigate' | 'replace'>;

/**
 * A dónde va un usuario recién autenticado (login, login social o sesión
 * restaurada): admin → panel; socio sin consentimiento → CompleteProfile;
 * resto → menú. Un solo sitio para que ninguna entrada se salte el alta.
 */
export async function goHomeAfterLogin(navigation: Nav, user: User, mode: 'navigate' | 'replace' = 'navigate', appleName?: string) {
  const admin = await isUserAdmin();
  // Sin desestructurar navigation.replace/navigate: necesitan su `this`.
  const go = <K extends 'CompleteProfile' | 'AdminDashboard' | 'MainMenu'>(name: K, params: RootStackParamList[K]) => {
    if (mode === 'replace') navigation.replace(name as any, params as any);
    else navigation.navigate(name as any, params as any);
  };

  if (needsProfileCompletion(user, admin)) {
    go('CompleteProfile', { appleName });
    return;
  }
  go(admin ? 'AdminDashboard' : 'MainMenu', {
    email: user.email || '',
    name: user.user_metadata?.full_name,
  });
}
