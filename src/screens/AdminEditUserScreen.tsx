import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, TrashIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { Avatar, Button, CategoryDot, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { categoryColor, categoryLabel } from '../utils/planCategories';
import { BillingPeriod, PaymentStatus, getPaymentStatus, markPaymentReceived, parseDateStr, revertPaymentReceived } from '../utils/planPayments';

const MONTH_NAMES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function formatPeriodLabel(periodStartStr: string, billingPeriod: BillingPeriod): string {
  const d = parseDateStr(periodStartStr);
  if (billingPeriod === 'yearly') return `${d.getFullYear()}`;
  if (billingPeriod === 'quarterly') return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return `${MONTH_NAMES_ES[d.getMonth()]} ${d.getFullYear()}`;
}

interface PlanOption {
  id: string;
  name: string;
  price: number;
  currency: string;
  category: string;
  billing_period: BillingPeriod;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminEditUser'>;
  route: RouteProp<RootStackParamList, 'AdminEditUser'>;
};

export default function AdminEditUserScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const { userId } = route.params;
  const insets = useSafeAreaInsets();
  const isCreating = !userId;

  const [loading, setLoading] = useState(!isCreating);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [planId, setPlanId] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [markingPayment, setMarkingPayment] = useState(false);
  const [markingArrears, setMarkingArrears] = useState(false);

  useEffect(() => {
    if (!isCreating) loadUser();
    else loadPlans();
    // getSession() usa caché local — sin llamada de red, evita que el
    // botón de borrar parpadee visible un instante antes de ocultarse.
    supabase.auth.getSession().then(({ data }) => setOwnUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (isCreating || !planId) { setPaymentStatus(null); return; }
    const selectedPlan = plans.find(p => p.id === planId);
    if (!selectedPlan) return;
    loadPaymentStatus(selectedPlan.billing_period);
  }, [planId, plans]);

  async function loadPlans() {
    const { data: plansData } = await supabase
      .from('membership_plans')
      .select('id, name, price, currency, category, billing_period')
      .eq('is_active', true)
      .order('sort_order');
    setPlans(plansData || []);
  }

  async function loadPaymentStatus(billingPeriod: BillingPeriod) {
    if (!userId) return;
    try {
      setLoadingPayment(true);
      const status = await getPaymentStatus(userId, billingPeriod, new Date(), memberSince);
      setPaymentStatus(status);
    } finally {
      setLoadingPayment(false);
    }
  }

  async function handleMarkPayment(billingPeriod: BillingPeriod) {
    if (!userId || !ownUserId) return;
    try {
      setMarkingPayment(true);
      await markPaymentReceived(userId, billingPeriod, ownUserId);
      await loadPaymentStatus(billingPeriod);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setMarkingPayment(false);
    }
  }

  async function handleMarkArrearsPayment(billingPeriod: BillingPeriod, arrearsPeriodStart: string) {
    if (!userId || !ownUserId) return;
    try {
      setMarkingArrears(true);
      await markPaymentReceived(userId, billingPeriod, ownUserId, parseDateStr(arrearsPeriodStart));
      await loadPaymentStatus(billingPeriod);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setMarkingArrears(false);
    }
  }

  function handleRevertPayment(billingPeriod: BillingPeriod) {
    Alert.alert(
      'Deshacer pago',
      `¿Quitar el pago registrado de "${fullName || email || 'este usuario'}" para este periodo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deshacer', style: 'destructive', onPress: async () => {
            if (!userId) return;
            try {
              setMarkingPayment(true);
              await revertPaymentReceived(userId, billingPeriod);
              await loadPaymentStatus(billingPeriod);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setMarkingPayment(false);
            }
          },
        },
      ]
    );
  }

  async function loadUser() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, plan_id, created_at')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        setRole(data.role || 'user');
        setPlanId(data.plan_id);
        setMemberSince(data.created_at);
      }

      await loadPlans();
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
    if (isCreating) {
      if (!email.trim()) { Alert.alert('Campo requerido', 'El email es obligatorio'); return; }
      if (!password.trim()) { Alert.alert('Campo requerido', 'La contraseña es obligatoria'); return; }
      if (password.length < 6) { Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres'); return; }
    }

    try {
      setSaving(true);

      if (isCreating) {
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (signUpError) throw signUpError;
        if (!authData.user) throw new Error('No se pudo crear el usuario');

        const { error: profileError } = await supabase.from('profiles').insert({
          id: authData.user.id,
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          plan_id: planId,
        });
        if (profileError) throw profileError;

        Alert.alert('Creado', 'Usuario creado correctamente');
        navigation.goBack();
      } else {
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
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteUser() {
    if (!userId) return;
    Alert.alert(
      'Eliminar usuario',
      `¿Eliminar a "${fullName || email || 'este usuario'}"? Se borrarán sus reservas, entrenos y todos sus datos permanentemente. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              const { data: { session } } = await supabase.auth.getSession();
              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ userId }),
                }
              );
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Error al eliminar usuario');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

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
          <SpringPressable onPress={() => navigation.goBack()}>
            <View style={{
              width: scale(40), height: scale(40),
              borderRadius: scale(20),
              backgroundColor: Colors.card,
              borderWidth: 1, borderColor: Colors.cardBorder,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
            </View>
          </SpringPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              {isCreating ? 'Nuevo Usuario' : 'Editar Usuario'}
            </Text>
          </View>
          {!isCreating && userId !== ownUserId && (
            <SpringPressable onPress={handleDeleteUser} disabled={deleting || saving} style={{
              width: scale(40), height: scale(40),
              borderRadius: scale(20),
              backgroundColor: 'rgba(239,68,68,0.12)',
              borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <TrashIcon size={scale(18)} color="#EF4444" />
            </SpringPressable>
          )}
        </Animated.View>

        <ScrollView contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(20), gap: scale(20) }} keyboardShouldPersistTaps="handled">
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

          {/* Email */}
          <Animated.View entering={FadeInDown.duration(400).delay(200).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Email {isCreating ? '*' : ''}
            </Text>
            {isCreating ? (
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="email@ejemplo.com"
                placeholderTextColor={Colors.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
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
            ) : (
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
            )}
          </Animated.View>

          {/* Teléfono — solo visible para admins (RLS lo restringe a nivel de BD) */}
          {!isCreating && (
            <Animated.View entering={FadeInDown.duration(400).delay(210).springify()} style={{ gap: scale(6) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
                Teléfono
              </Text>
              <View style={{
                backgroundColor: Colors.card,
                borderWidth: 1, borderColor: Colors.cardBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(16),
                height: scale(50),
                justifyContent: 'center',
              }}>
                <Text style={{ fontSize: moderateScale(15), color: phone ? Colors.textMuted : Colors.textDisabled }}>
                  {phone || 'No proporcionado'}
                </Text>
              </View>
            </Animated.View>
          )}

          {isCreating && (
            <Animated.View entering={FadeInDown.duration(400).delay(225).springify()} style={{ gap: scale(6) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
                Contraseña *
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={Colors.placeholder}
                secureTextEntry
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
          )}

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

                {Array.from(new Set(plans.map(p => p.category))).map((cat) => {
                  const catPlans = plans.filter(p => p.category === cat);
                  if (catPlans.length === 0) return null;
                  const accent = categoryColor(cat);
                  const bg = accent + '1F';
                  return (
                    <View key={cat} style={{ gap: scale(8) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                        <CategoryDot color={accent} />
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
                          {categoryLabel(cat)}
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
                                backgroundColor: isSelected ? bg : Colors.card,
                                borderColor: isSelected ? accent : Colors.cardBorder,
                              }}
                            >
                              <View style={{ alignItems: 'center' }}>
                                <Text style={{
                                  fontSize: moderateScale(12), fontWeight: '600',
                                  color: isSelected ? accent : Colors.textMuted,
                                }}>
                                  {p.name}
                                </Text>
                                <Text style={{
                                  fontSize: moderateScale(10), fontWeight: '700',
                                  color: isSelected ? accent : Colors.textMuted,
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

          {/* Estado de pago del periodo actual */}
          {!isCreating && planId && (
            <Animated.View entering={FadeInDown.duration(400).delay(320).springify()} style={{ gap: scale(6) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
                Estado de pago (periodo actual)
              </Text>
              {loadingPayment || !paymentStatus ? (
                <ActivityIndicator size="small" color={Colors.blue500} style={{ alignSelf: 'flex-start' }} />
              ) : !paymentStatus.applies ? (
                <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted }}>
                  Este plan no requiere cuota periódica.
                </Text>
              ) : (
                <>
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, padding: scale(14), gap: scale(10),
                }}>
                  <View style={{ flex: 1, gap: scale(4) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <CategoryDot color={paymentStatus.paid ? '#22C55E' : paymentStatus.graceExpired ? '#EF4444' : '#F59E0B'} size="md" />
                      <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}>
                        {paymentStatus.paid ? 'Pagado' : paymentStatus.graceExpired ? 'Bloqueado — sin pagar' : 'Pendiente'}
                      </Text>
                    </View>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
                      {paymentStatus.paid
                        ? 'Cuota de este periodo registrada.'
                        : paymentStatus.graceExpired
                          ? 'No podrá reservar clases hasta que se marque el pago.'
                          : 'Puede reservar hasta el día 5 sin pago registrado.'}
                    </Text>
                  </View>
                  {!paymentStatus.paid ? (
                    <SpringPressable
                      onPress={() => {
                        const selectedPlan = plans.find(p => p.id === planId);
                        if (selectedPlan) handleMarkPayment(selectedPlan.billing_period);
                      }}
                      disabled={markingPayment}
                      style={{
                        minWidth: scale(120), minHeight: scale(38),
                        alignItems: 'center', justifyContent: 'center',
                        paddingHorizontal: scale(14), paddingVertical: scale(10),
                        borderRadius: Radius.sm,
                        backgroundColor: 'rgba(34,197,94,0.15)',
                        borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)',
                        opacity: markingPayment ? 0.6 : 1,
                      }}
                    >
                      {markingPayment ? (
                        <ActivityIndicator size="small" color="#22C55E" />
                      ) : (
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: '#22C55E', textAlign: 'center' }}>
                          Marcar pagado
                        </Text>
                      )}
                    </SpringPressable>
                  ) : (
                    <SpringPressable
                      onPress={() => {
                        const selectedPlan = plans.find(p => p.id === planId);
                        if (selectedPlan) handleRevertPayment(selectedPlan.billing_period);
                      }}
                      disabled={markingPayment}
                      style={{
                        minWidth: scale(120), minHeight: scale(38),
                        alignItems: 'center', justifyContent: 'center',
                        paddingHorizontal: scale(14), paddingVertical: scale(10),
                        borderRadius: Radius.sm,
                        backgroundColor: Colors.background,
                        borderWidth: 1, borderColor: Colors.cardBorder,
                        opacity: markingPayment ? 0.6 : 1,
                      }}
                    >
                      {markingPayment ? (
                        <ActivityIndicator size="small" color={Colors.textSecondary} />
                      ) : (
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' }}>
                          Deshacer pago
                        </Text>
                      )}
                    </SpringPressable>
                  )}
                </View>
                {paymentStatus.arrearsPeriodStart && (() => {
                  const selectedPlan = plans.find(p => p.id === planId);
                  if (!selectedPlan) return null;
                  const arrearsPeriodStart = paymentStatus.arrearsPeriodStart;
                  return (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
                      borderRadius: Radius.md, padding: scale(12), gap: scale(10),
                    }}>
                      <Text style={{ flex: 1, fontSize: moderateScale(11), color: Colors.textSecondary }}>
                        También debe el periodo de {formatPeriodLabel(arrearsPeriodStart, selectedPlan.billing_period)}. Por eso no tiene margen este mes.
                      </Text>
                      <SpringPressable
                        onPress={() => handleMarkArrearsPayment(selectedPlan.billing_period, arrearsPeriodStart)}
                        disabled={markingArrears}
                        style={{
                          minWidth: scale(90), minHeight: scale(34),
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: scale(10), paddingVertical: scale(8),
                          borderRadius: Radius.sm,
                          backgroundColor: 'rgba(34,197,94,0.15)',
                          borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)',
                          opacity: markingArrears ? 0.6 : 1,
                        }}
                      >
                        {markingArrears ? (
                          <ActivityIndicator size="small" color="#22C55E" />
                        ) : (
                          <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: '#22C55E', textAlign: 'center' }}>
                            Marcar pagado
                          </Text>
                        )}
                      </SpringPressable>
                    </View>
                  );
                })()}
                </>
              )}
            </Animated.View>
          )}

          {/* Save button */}
          <Animated.View entering={FadeInDown.duration(400).delay(350).springify()} style={{ marginTop: scale(12) }}>
            <Button
              label={isCreating ? 'Crear Usuario' : 'Guardar Cambios'}
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
