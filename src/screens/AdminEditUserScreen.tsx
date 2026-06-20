import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarCheckIcon, ChevronLeftIcon, DumbbellIcon, LightningIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { Avatar, Button, SpringPressable } from '../components/ui';

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; accent: string; bg: string }> = {
  gym: {
    label: 'Sala de Gym',
    icon: <DumbbellIcon size={14} color="#3B82F6" strokeWidth={2.5} />,
    accent: '#3B82F6',
    bg: 'rgba(59,130,246,0.12)',
  },
  classes: {
    label: 'Clases',
    icon: <CalendarCheckIcon size={14} color="#A78BFA" strokeWidth={2.5} />,
    accent: '#A78BFA',
    bg: 'rgba(139,92,246,0.12)',
  },
  both: {
    label: 'Gym + Clases',
    icon: <LightningIcon size={14} color="#10B981" strokeWidth={2.5} />,
    accent: '#10B981',
    bg: 'rgba(16,185,129,0.12)',
  },
};

interface PlanOption {
  id: string;
  name: string;
  price: number;
  currency: string;
  category: string;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminEditUser'>;
  route: RouteProp<RootStackParamList, 'AdminEditUser'>;
};

export default function AdminEditUserScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [planId, setPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  const backScale = useSharedValue(1);

  const backAnim = useAnimatedStyle(() => ({ transform: [{ scale: backScale.value }] }));

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, plan_id')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        setRole(data.role || 'user');
        setPlanId(data.plan_id);
      }

      const { data: plansData } = await supabase
        .from('membership_plans')
        .select('id, name, price, currency, category')
        .eq('is_active', true)
        .order('sort_order');

      setPlans(plansData || []);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'El nombre no puede estar vacío');
      return;
    }

    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), role, plan_id: planId })
        .eq('id', userId)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        Alert.alert('Error', 'No se pudo actualizar. Probablemente falta la política RLS en Supabase. Revisa la consola.');
        return;
      }
      Alert.alert('Guardado', 'Perfil actualizado correctamente');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.blue500} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + scale(12),
            paddingBottom: scale(16),
            paddingHorizontal: scale(20),
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <Animated.View style={[backAnim]}>
            <Pressable
              onPress={() => navigation.goBack()}
              onPressIn={() => { backScale.value = withSpring(0.88, { damping: 14, stiffness: 300 }); }}
              onPressOut={() => { backScale.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
              style={({ pressed }) => ({
                width: scale(40), height: scale(40),
                borderRadius: scale(20),
                backgroundColor: Colors.card,
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              Editar Usuario
            </Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={{ padding: scale(20), gap: scale(20) }} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(100).springify()}
            style={{ alignItems: 'center', paddingVertical: scale(16) }}
          >
            <Avatar uri={null} size={80} />
          </Animated.View>

          {/* Name */}
          <Animated.View entering={FadeInDown.duration(400).delay(150).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Nombre completo
            </Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre del usuario"
              placeholderTextColor={Colors.placeholder}
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(16),
                height: scale(50),
                fontSize: moderateScale(15),
                color: Colors.textPrimary,
              }}
            />
          </Animated.View>

          {/* Email (read-only) */}
          <Animated.View entering={FadeInDown.duration(400).delay(200).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Email
            </Text>
            <View style={{
              backgroundColor: Colors.card,
              borderWidth: 1, borderColor: Colors.cardBorder,
              borderRadius: Radius.md,
              paddingHorizontal: scale(16),
              height: scale(50),
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: moderateScale(15), color: Colors.textMuted }}>{email}</Text>
            </View>
          </Animated.View>

          {/* Role toggle */}
          <Animated.View entering={FadeInDown.duration(400).delay(250).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Rol
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(10) }}>
              <SpringPressable
                onPress={() => setRole('user')}
                style={{
                  flex: 1,
                  paddingVertical: scale(14),
                  borderRadius: Radius.md,
                  backgroundColor: role === 'user' ? Colors.blue500 : Colors.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: moderateScale(14),
                  fontWeight: '700',
                  color: role === 'user' ? '#fff' : Colors.textMuted,
                }}>
                  Usuario
                </Text>
              </SpringPressable>
              <SpringPressable
                onPress={() => setRole('admin')}
                style={{
                  flex: 1,
                  paddingVertical: scale(14),
                  borderRadius: Radius.md,
                  backgroundColor: role === 'admin' ? Colors.blue500 : Colors.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontSize: moderateScale(14),
                  fontWeight: '700',
                  color: role === 'admin' ? '#fff' : Colors.textMuted,
                }}>
                  Admin
                </Text>
              </SpringPressable>
            </View>
          </Animated.View>

          {/* Plan asignado */}
          <Animated.View entering={FadeInDown.duration(400).delay(300).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Plan asignado
            </Text>
            {plans.length === 0 ? (
              <ActivityIndicator size="small" color={Colors.blue500} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <View style={{ gap: scale(16) }}>
                {/* Sin plan chip */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  <SpringPressable
                    onPress={() => setPlanId(null)}
                    style={{
                      paddingHorizontal: scale(14), paddingVertical: scale(10),
                      borderRadius: Radius.sm, borderWidth: 1,
                      backgroundColor: planId === null ? 'rgba(59,130,246,0.2)' : Colors.card,
                      borderColor: planId === null ? Colors.blue500 : Colors.cardBorder,
                    }}
                  >
                    <Text style={{
                      fontSize: moderateScale(12), fontWeight: '600',
                      color: planId === null ? Colors.blue500 : Colors.textMuted,
                    }}>Sin plan</Text>
                  </SpringPressable>
                </View>

                {(['gym', 'classes', 'both'] as const).map((cat) => {
                  const catPlans = plans.filter(p => p.category === cat);
                  if (catPlans.length === 0) return null;
                  const catConfig = CATEGORY_CONFIG[cat];
                  return (
                    <View key={cat} style={{ gap: scale(8) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                        {catConfig.icon}
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                          {catConfig.label}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                        {catPlans.map((p) => {
                          const isSelected = planId === p.id;
                          return (
                            <SpringPressable
                              key={p.id}
                              onPress={() => setPlanId(p.id)}
                              style={{
                                paddingHorizontal: scale(14), paddingVertical: scale(10),
                                borderRadius: Radius.sm, borderWidth: 1,
                                backgroundColor: isSelected ? catConfig.bg : Colors.card,
                                borderColor: isSelected ? catConfig.accent : Colors.cardBorder,
                              }}
                            >
                              <View style={{ alignItems: 'center' }}>
                                <Text style={{
                                  fontSize: moderateScale(12), fontWeight: '600',
                                  color: isSelected ? catConfig.accent : Colors.textMuted,
                                }}>
                                  {p.name}
                                </Text>
                                <Text style={{
                                  fontSize: moderateScale(10), fontWeight: '700',
                                  color: isSelected ? catConfig.accent : Colors.textMuted,
                                  marginTop: scale(2),
                                }}>
                                  {Number(p.price).toFixed(0)}€
                                </Text>
                              </View>
                            </SpringPressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </Animated.View>

          {/* Save button */}
          <Animated.View entering={FadeInDown.duration(400).delay(350).springify()} style={{ marginTop: scale(12) }}>
            <Button
              label="Guardar Cambios"
              onPress={handleSave}
              loading={saving}
              disabled={saving}
              variant="primary"
              size="lg"
            />
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
}
