import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { isUserAdmin } from '../utils/auth';
import { getCached, setCached } from '../utils/screenCache';

// Ya comprobado en esta sesión: las demás pantallas del admin se pintan sin
// esperar otra consulta a user_roles. Se borra al cerrar sesión con el resto
// del caché (clearScreenCache). Los datos los protege igualmente la RLS.
const ADMIN_VERIFIED_KEY = 'admin-verified';

export function useRequireAdmin(navigation: { goBack: () => void }) {
  const [verified, setVerified] = useState(() => getCached<boolean>(ADMIN_VERIFIED_KEY) === true);

  useEffect(() => {
    if (verified) return;
    let mounted = true;
    isUserAdmin().then((isAdmin) => {
      if (!mounted) return;
      if (!isAdmin) {
        Alert.alert('Acceso denegado', 'No tienes permisos de administrador');
        navigation.goBack();
      } else {
        setCached(ADMIN_VERIFIED_KEY, true);
        setVerified(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  return verified;
}
