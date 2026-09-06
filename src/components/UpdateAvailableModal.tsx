import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { BackHandler, Linking, Platform, Text, View } from 'react-native';
import { RefreshIcon } from './Icons';
import { Button } from './ui';
import { Colors, Radius, moderateScale, scale } from '../theme';
import { ANDROID_STORE_URL, IOS_STORE_URL, getLatestAndroidVersion, getLatestIosVersion, isVersionBelow } from '../utils/appVersion';

/**
 * Bloqueo obligatorio de la app cuando la versión instalada queda por debajo
 * de la última publicada en la tienda — no se puede cerrar ni saltar con el
 * botón atrás. Vive en App.tsx como hermano de AppNavigator, igual que
 * TutorialOverlay — se comprueba una vez al arrancar, sin depender de que el
 * usuario esté logueado. En iOS se comprueba solo contra la API pública de
 * Apple; en Android, contra un valor que mantiene el developer a mano en
 * Supabase (Google no tiene un equivalente público gratuito).
 */
export function UpdateAvailableModal() {
  const [required, setRequired] = useState(false);

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version;
    if (!currentVersion) return;
    let isMounted = true;

    const check = Platform.OS === 'ios'
      ? getLatestIosVersion()
      : getLatestAndroidVersion().catch(() => null);

    check.then((latestVersion) => {
      if (isMounted && latestVersion && isVersionBelow(currentVersion, latestVersion)) {
        setRequired(true);
      }
    });

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!required) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [required]);

  if (!required) return null;

  const storeUrl = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;

  return (
    <View style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: Colors.background,
      alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: scale(32),
      zIndex: 999999, elevation: 999,
    }}>
      <View style={{
        width: scale(72), height: scale(72), borderRadius: scale(36),
        backgroundColor: 'rgba(59,130,246,0.15)',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: scale(24),
      }}>
        <RefreshIcon size={scale(34)} color={Colors.blue500} strokeWidth={2} />
      </View>
      <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginBottom: scale(10) }}>
        Actualización necesaria
      </Text>
      <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(28), lineHeight: moderateScale(20) }}>
        Hay una nueva versión de La Nave disponible. Actualiza la app para seguir usándola.
      </Text>
      <Button
        label="Actualizar ahora"
        onPress={() => Linking.openURL(storeUrl)}
        variant="primary"
        size="lg"
      />
    </View>
  );
}
