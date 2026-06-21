import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { isUserAdmin } from '../utils/auth';

export function useRequireAdmin(navigation: { goBack: () => void }) {
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let mounted = true;
    isUserAdmin().then((isAdmin) => {
      if (!mounted) return;
      if (!isAdmin) {
        Alert.alert('Acceso denegado', 'No tienes permisos de administrador');
        navigation.goBack();
      } else {
        setVerified(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  return verified;
}
