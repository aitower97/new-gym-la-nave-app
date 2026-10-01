import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Modal, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { Button } from './ui';
import { Colors, Radius, moderateScale, scale } from '../theme';
import { getAppVersionConfig } from '../utils/appVersion';
import { isVersionBelow } from '../utils/appVersionCompare';

/**
 * Banner opcional cuando hay actualización disponible pero no obligatoria
 * (latest_version > versión instalada, pero >= minimum_version).
 * Se muestra una sola vez por sesión y se puede cerrar.
 */
export function UpdateOptionalModal() {
  const [visible, setVisible] = useState(false);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    const currentVersion = Constants.expoConfig?.version;
    if (!currentVersion) return;

    getAppVersionConfig().then((config) => {
      if (!config) return;
      // Mostrar si latest_version es mayor y no es actualización obligatoria
      const isLaterAvailable = isVersionBelow(currentVersion, config.latest_version);
      const isNotRequired = !isVersionBelow(currentVersion, config.minimum_version);

      if (isLaterAvailable && isNotRequired) {
        setStoreUrl(config.store_url);
        setVisible(true);
      }
    });
  }, []);

  if (!visible || !storeUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: scale(20),
      }}>
        <View style={{
          backgroundColor: Colors.card,
          borderRadius: Radius.lg,
          padding: scale(24),
          maxWidth: scale(320),
          gap: scale(16),
        }}>
          <View style={{ alignItems: 'center', gap: scale(12) }}>
            <View style={{
              width: scale(56),
              height: scale(56),
              borderRadius: scale(28),
              backgroundColor: 'rgba(59,130,246,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bell size={scale(28)} color={Colors.blue500} strokeWidth={2} />
            </View>
            <Text style={{
              fontSize: moderateScale(18),
              fontWeight: '700',
              color: Colors.textPrimary,
              textAlign: 'center',
            }}>
              Actualización disponible
            </Text>
            <Text style={{
              fontSize: moderateScale(13),
              color: Colors.textSecondary,
              textAlign: 'center',
              lineHeight: moderateScale(19),
            }}>
              Hay una nueva versión de la app con mejoras y correcciones.
            </Text>
          </View>

          <View style={{ gap: scale(8) }}>
            <Button
              label="Actualizar"
              onPress={() => {
                Linking.openURL(storeUrl);
                setVisible(false);
              }}
              size="sm"
              fullWidth
            />
            <Button
              label="Ahora no"
              onPress={() => setVisible(false)}
              variant="outline"
              size="sm"
              fullWidth
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
