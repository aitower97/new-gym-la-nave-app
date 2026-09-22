import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { BackHandler, Linking, Text, View } from 'react-native';
import { RefreshIcon } from './Icons';
import { Button } from './ui';
import { Colors, Radius, moderateScale, scale } from '../theme';
import { getAppVersionConfig, shouldBlockForUpdate } from '../utils/appVersion';

/**
 * Bloqueo obligatorio de la app cuando la versión instalada queda por debajo
 * de la mínima admitida (app_versions.minimum_version) — no se puede cerrar
 * ni saltar con el botón atrás. Vive en App.tsx como hermano de
 * AppNavigator, igual que TutorialOverlay — se comprueba una vez al
 * arrancar, sin depender de que el usuario esté logueado. Misma fuente para
 * iOS y Android (antes iOS comprobaba contra la API pública de Apple y
 * Android contra app_settings; con minimum_version separado de
 * latest_version ya no hace falta forzar siempre la última).
 */
export function UpdateAvailableModal() {
  const [required, setRequired] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version;
    if (!currentVersion) return;
    let isMounted = true;

    getAppVersionConfig().then((config) => {
      if (!isMounted) return;
      if (shouldBlockForUpdate(currentVersion, config)) {
        setStoreUrl(config!.store_url);
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

  if (!required || !storeUrl) return null;

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
