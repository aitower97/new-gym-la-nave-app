import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClockIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { Button, ScreenHeader, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { getBookingCutoffHours, setBookingCutoffHours } from '../utils/bookingSettings';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminBookingSettings'>;
};

const PRESETS = [12, 24, 48, 72];

export default function AdminBookingSettingsScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hours, setHours] = useState<number>(48);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    getBookingCutoffHours().then((h) => {
      setHours(h);
      if (!PRESETS.includes(h)) setCustomText(String(h));
      setLoading(false);
    });
  }, []);

  function selectPreset(h: number) {
    setHours(h);
    setCustomText('');
  }

  function onCustomChange(text: string) {
    const digits = text.replace(/[^0-9]/g, '');
    setCustomText(digits);
    const n = parseInt(digits, 10);
    if (Number.isFinite(n) && n > 0) setHours(n);
  }

  async function handleSave() {
    if (!hours || hours <= 0) {
      Alert.alert('Valor no válido', 'La antelación mínima debe ser mayor que 0 horas.');
      return;
    }
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await setBookingCutoffHours(hours, user.id);
      await supabase.from('admin_actions').insert({
        admin_id: user.id,
        action_type: 'update_booking_cutoff',
        target_type: 'app_settings',
        target_id: 'booking_cutoff_hours',
        details: { hours },
      });
      Alert.alert('Guardado', `Las reservas de las clases se abrirán ${hours}h antes de empezar.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Antelación de reserva"
          subtitle="Cuánto antes se abren las clases"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : (
          <View style={{ flex: 1, paddingHorizontal: scale(20), paddingTop: scale(20) }}>
            <Animated.View entering={FadeInDown.duration(350).springify()} style={{ gap: scale(10) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                <ClockIcon size={scale(16)} color={Colors.blue500} strokeWidth={2} />
                <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                  Los usuarios no podrán reservar (ni ver como disponible) una clase hasta que falten menos de estas horas para que empiece.
                </Text>
              </View>
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }}>
                Esto no afecta a las reservas que hagas tú como admin para un usuario — esas siempre están permitidas, con cualquier antelación.
              </Text>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(350).delay(100).springify()}
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginTop: scale(24) }}
            >
              {PRESETS.map((h) => {
                const selected = hours === h && customText === '';
                return (
                  <SpringPressable
                    key={h}
                    onPress={() => selectPreset(h)}
                    style={{
                      minWidth: scale(72), alignItems: 'center',
                      paddingVertical: scale(14), paddingHorizontal: scale(16),
                      borderRadius: Radius.md, borderWidth: 1,
                      backgroundColor: selected ? 'rgba(59,130,246,0.15)' : Colors.card,
                      borderColor: selected ? Colors.blue500 : Colors.cardBorder,
                    }}
                  >
                    <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: selected ? Colors.blue500 : Colors.textPrimary }}>
                      {h}h
                    </Text>
                  </SpringPressable>
                );
              })}
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(350).delay(180).springify()} style={{ marginTop: scale(20) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(8) }}>
                O un valor personalizado (horas)
              </Text>
              <TextInput
                value={customText}
                onChangeText={onCustomChange}
                placeholder="Ej: 36"
                placeholderTextColor={Colors.placeholder}
                keyboardType="number-pad"
                style={{
                  fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary,
                  backgroundColor: Colors.card, borderWidth: 1,
                  borderColor: customText !== '' ? Colors.blue500 : Colors.cardBorder,
                  borderRadius: Radius.md, padding: scale(14),
                }}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(350).delay(240).springify()} style={{ marginTop: scale(20) }}>
              <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted }}>
                Valor actual configurado: <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>{hours}h</Text> de antelación mínima.
              </Text>
            </Animated.View>
          </View>
        )}

        <View style={{ paddingHorizontal: scale(20), paddingTop: scale(16), paddingBottom: insets.bottom + scale(16), borderTopWidth: 1, borderTopColor: Colors.border }}>
          <Button
            label="Guardar"
            onPress={handleSave}
            loading={saving}
            disabled={saving || loading}
            variant="primary"
            size="lg"
          />
        </View>
      </View>
    </View>
  );
}
