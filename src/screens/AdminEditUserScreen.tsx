import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronLeftIcon, TrashIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { Avatar, Button, CategoryDot, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { categoryColor, categoryLabel } from '../utils/planCategories';
import { BillingPeriod, PaymentStatus, getBonoWindow, getPaymentStatus, markPaymentReceived, parseDateStr, revertPaymentReceived } from '../utils/planPayments';
import { ClassQuotaStatus, estimateTemplateFit, getClassQuotaStatus } from '../utils/planEnforcement';
import { formatPlanPrice } from '../utils/planPrice';

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
  classes_per_month: number | null;
  validity_days: number | null;
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
  const [originalPlanId, setOriginalPlanId] = useState<string | null>(null);
  const [planAssignedAt, setPlanAssignedAt] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Fecha de inicio editable: un bono puede haber empezado antes de que el
  // socio se diera de alta en la app.
  const [fechaInicio, setFechaInicio] = useState('');
  const [cupo, setCupo] = useState<ClassQuotaStatus | null>(null);
  const [ajustes, setAjustes] = useState<{ id: string; used_delta: number; reason: string; created_at: string }[]>([]);
  const [filtroAjustes, setFiltroAjustes] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [cantidadAjuste, setCantidadAjuste] = useState('1');
  const [ajustando, setAjustando] = useState(false);
  const [templateNotRequired, setTemplateNotRequired] = useState(false);
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
      .select('id, name, price, currency, category, billing_period, classes_per_month, validity_days')
      .eq('is_active', true)
      .order('sort_order');
    setPlans(plansData || []);
  }

  /**
   * Si el usuario tiene una plantilla de reservas fijas activa, comprueba que
   * el ritmo semanal de esa plantilla quepa en el cupo del plan que se le va
   * a asignar — el cupo mensual si es recurrente, o el total fijo del bono
   * repartido en su ventana de validez si es un bono. Sin esto, un cambio de
   * plan a uno más pequeño (o un bono corto) deja la plantilla reservando de
   * más sin que el admin se entere hasta que el socio se encuentra con el
   * cupo agotado.
   */
  async function checkTemplateQuotaMismatch(plan: PlanOption): Promise<{ weeklyCount: number } & ReturnType<typeof estimateTemplateFit>> {
    if (!userId) return { mismatched: false, weeklyCount: 0, demand: 0, totalLabel: '' };
    const { count } = await supabase
      .from('booking_templates')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);
    const weeklyCount = count ?? 0;
    return { weeklyCount, ...estimateTemplateFit(weeklyCount, plan) };
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

  /** Cupo vigente y ajustes de ese mismo periodo. */
  async function cargarCupo() {
    if (!userId) return;
    setCupo(await getClassQuotaStatus(userId));

    const { data: periodo } = await supabase.rpc('quota_period_start', { p_user_id: userId });
    if (!periodo) { setAjustes([]); return; }

    const { data } = await supabase
      .from('plan_adjustments')
      .select('id, used_delta, reason, created_at')
      .eq('user_id', userId)
      .eq('period_start', periodo)
      .order('created_at', { ascending: false });
    setAjustes(data || []);
  }

  /**
   * Registra un ajuste en vez de tocar un contador: un número que cambia sin
   * explicación no sirve el día que el socio pregunte por qué le faltan clases.
   */
  async function aplicarAjuste(signo: 1 | -1) {
    const motivo = motivoAjuste.trim();
    if (!motivo) {
      Alert.alert('Falta el motivo', 'Escribe por qué ajustas las clases. Queda registrado y es lo que explica el cambio si el socio reclama.');
      return;
    }

    const cantidad = parseInt(cantidadAjuste, 10);
    if (!Number.isFinite(cantidad) || cantidad < 1) {
      Alert.alert('Cantidad no válida', 'Indica cuántas clases quieres ajustar (1 o más).');
      return;
    }
    // Tope de cordura: un ajuste de tres cifras casi seguro es un dedazo, y
    // deshacerlo obliga a otro ajuste igual de grande en sentido contrario.
    if (cantidad > 99) {
      Alert.alert('Cantidad demasiado alta', 'Como mucho 99 clases de una vez. Si de verdad hacen falta más, hazlo en varios ajustes.');
      return;
    }
    const delta = signo * cantidad;
    try {
      setAjustando(true);
      const { data: periodo } = await supabase.rpc('quota_period_start', { p_user_id: userId });
      if (!periodo) {
        Alert.alert('Sin plan', 'Este socio no tiene un plan con cupo de clases, así que no hay nada que ajustar.');
        return;
      }
      const { error } = await supabase.from('plan_adjustments').insert({
        user_id: userId,
        period_start: periodo,
        used_delta: delta,
        reason: motivo,
        created_by: ownUserId,
      });
      if (error) throw error;
      setMotivoAjuste('');
      setCantidadAjuste('1');
      await cargarCupo();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setAjustando(false);
    }
  }

  function borrarAjuste(a: { id: string; reason: string }) {
    Alert.alert('Borrar ajuste', `¿Borrar "${a.reason}"? El cupo del socio se recalcula al momento.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.from('plan_adjustments').delete().eq('id', a.id);
            if (error) throw error;
            await cargarCupo();
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  }

  async function loadUser() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, plan_id, created_at, plan_assigned_at, avatar_url, template_not_required')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');
        setRole(data.role || 'user');
        setPlanId(data.plan_id);
        setOriginalPlanId(data.plan_id);
        setPlanAssignedAt(data.plan_assigned_at);
        setFechaInicio(data.plan_assigned_at ? String(data.plan_assigned_at).slice(0, 10) : '');
        setMemberSince(data.created_at);
        setAvatarUrl(data.avatar_url);
        setTemplateNotRequired(data.template_not_required || false);
      }

      await loadPlans();
      await cargarCupo();
    } catch (error: any) {
      Alert.alert('Error', error.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(skipTemplateCheck = false) {
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'El nombre no puede estar vacío');
      return;
    }
    if (isCreating) {
      if (!email.trim()) { Alert.alert('Campo requerido', 'El email es obligatorio'); return; }
      if (!password.trim()) { Alert.alert('Campo requerido', 'La contraseña es obligatoria'); return; }
      if (password.length < 6) { Alert.alert('Error', 'La contraseña debe tener al menos 6 caracteres'); return; }
    }

    if (!isCreating && !skipTemplateCheck && planId) {
      const selectedPlan = plans.find(p => p.id === planId);
      if (selectedPlan) {
        const { mismatched, weeklyCount, demand, totalLabel } = await checkTemplateQuotaMismatch(selectedPlan);
        if (mismatched) {
          Alert.alert(
            'La plantilla no encaja con este plan',
            `Este usuario tiene una plantilla fija de ${weeklyCount} clase${weeklyCount !== 1 ? 's' : ''} por semana (~${demand} en total), pero "${selectedPlan.name}" solo permite ${totalLabel}. La plantilla seguirá reservando de más hasta que la ajustes.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Ir a la plantilla', onPress: () => navigation.navigate('AdminUserTemplates' as any, { userId } as any) },
              { text: 'Guardar de todas formas', style: 'destructive', onPress: () => handleSave(true) },
            ]
          );
          return;
        }
      }
    }

    try {
      setSaving(true);

      if (isCreating) {
        // Vía Edge Function con service role, NO supabase.auth.signUp() del
        // cliente: signUp() en una sesión ya iniciada (la del propio admin)
        // la reemplaza por la del usuario recién creado, dejando al admin
        // fuera de su cuenta en su dispositivo sin avisar. Mismo patrón que
        // handleDeleteUser más abajo.
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/create-user`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: email.trim(),
              password,
              full_name: fullName.trim(),
              role,
              plan_id: planId,
            }),
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo crear el usuario');

        Alert.alert('Creado', 'Usuario creado correctamente');
        navigation.goBack();
      } else {
        // La fecha de asignación solo se actualiza si el plan realmente
        // cambió — re-guardar sin tocar el plan no debe alargar la validez
        // de un bono ya en curso.
        const planChanged = planId !== originalPlanId;
        const { data, error } = await supabase
          .from('profiles')
          .update({
            full_name: fullName.trim(),
            role,
            plan_id: planId,
            template_not_required: templateNotRequired,
            // Si el admin escribió una fecha, manda esa. Si no, solo se toca
            // cuando cambia el plan: volver a guardar sin más no debe alargar
            // la validez de un bono ya en curso.
            //
            // 'T00:00:00Z' explícito, no 'T00:00:00' a secas: sin la Z, el
            // constructor de Date interpreta la hora como LOCAL, no UTC — en
            // España (UTC+1/+2) eso desplazaba la fecha guardada un día hacia
            // atrás (19 sept tecleado → 18 sept 22:00 UTC guardado), la misma
            // familia de bug que getBonoWindow() (src/utils/bonoWindow.ts):
            // Postgres calcula plan_assigned_at::date en sesión UTC, así que
            // si aquí se guarda desplazado, todo el cupo del bono se calcula
            // mal desde el primer día.
            ...(fechaInicio.trim()
              ? { plan_assigned_at: new Date(`${fechaInicio.trim()}T00:00:00Z`).toISOString() }
              : planChanged ? { plan_assigned_at: planId ? new Date().toISOString() : null } : {}),
          })
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
            <Avatar uri={avatarUrl} size={80} />
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
                                  {formatPlanPrice(p.price, '€', 0)}
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

          {/* Fecha de inicio del plan. En bonos es lo que marca desde cuándo
              corre la validez, así que hace falta poder retrasarla: alguien
              pudo empezar el bono antes de que le dieras de alta aquí. */}
          {!isCreating && !!planId && (
            <Animated.View entering={FadeInDown.duration(400).delay(300).springify()} style={{ marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary, marginBottom: scale(8) }}>
                Fecha de inicio del plan
              </Text>
              <TextInput
                value={fechaInicio}
                onChangeText={setFechaInicio}
                placeholder="2026-09-01"
                placeholderTextColor={Colors.placeholder}
                style={{
                  fontSize: moderateScale(15), fontWeight: '600', color: Colors.textPrimary,
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, padding: scale(14),
                }}
              />
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(6) }}>
                Formato AAAA-MM-DD. En un bono marca desde cuándo cuentan los días de validez; en planes mensuales no afecta al cupo, que va por mes natural.
              </Text>
            </Animated.View>
          )}

          {/* Ajuste de clases. Existe porque la realidad no siempre pasa por la
              app: alguien viene sin apuntarse, o se apunta y no se borra. */}
          {!isCreating && !!cupo && (
            <Animated.View entering={FadeInDown.duration(400).delay(310).springify()} style={{ marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary, marginBottom: scale(8) }}>
                Clases de este periodo
              </Text>

              <View style={{
                padding: scale(14), backgroundColor: Colors.card,
                borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: scale(14) }}>
                  {[
                    { label: 'Usadas', value: cupo.used },
                    { label: 'Total', value: cupo.total },
                    { label: 'Quedan', value: cupo.remaining },
                  ].map(({ label, value }) => (
                    <View key={label} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(2) }}>{label}</Text>
                      <Text style={{
                        fontSize: moderateScale(20), fontWeight: '800',
                        color: label === 'Quedan' && value === 0 ? '#EF4444' : Colors.textPrimary,
                      }}>{value}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(10) }}>
                  <View style={{ width: scale(76) }}>
                    <TextInput
                      value={cantidadAjuste}
                      onChangeText={(t) => setCantidadAjuste(t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={Colors.placeholder}
                      style={{
                        fontSize: moderateScale(16), fontWeight: '700', textAlign: 'center',
                        color: Colors.textPrimary,
                        backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                        borderRadius: Radius.sm, padding: scale(12),
                      }}
                    />
                  </View>
                  <TextInput
                    value={motivoAjuste}
                    onChangeText={setMotivoAjuste}
                    placeholder="Motivo (ej: vino sin apuntarse)"
                    placeholderTextColor={Colors.placeholder}
                    style={{
                      flex: 1,
                      fontSize: moderateScale(14), color: Colors.textPrimary,
                      backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                      borderRadius: Radius.sm, padding: scale(12),
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: scale(10) }}>
                  {([
                    { etiqueta: 'Quitar', signo: 1 as const, color: '#EF4444' },
                    { etiqueta: 'Devolver', signo: -1 as const, color: '#22C55E' },
                  ]).map(({ etiqueta, signo, color }) => (
                    <SpringPressable key={signo} style={{ flex: 1 }} onPress={() => aplicarAjuste(signo)} disabled={ajustando}>
                      <View style={{
                        paddingVertical: scale(11), alignItems: 'center',
                        backgroundColor: color + '1F', borderWidth: 1, borderColor: color + '55',
                        borderRadius: Radius.sm, opacity: ajustando ? 0.5 : 1,
                      }}>
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color }}>
                          {etiqueta} {cantidadAjuste || '1'} {(parseInt(cantidadAjuste, 10) || 1) === 1 ? 'clase' : 'clases'}
                        </Text>
                      </View>
                    </SpringPressable>
                  ))}
                </View>

                {ajustes.length > 0 && (
                  <View style={{ marginTop: scale(14), paddingTop: scale(12), borderTopWidth: 1, borderTopColor: Colors.cardBorder }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(8) }}>
                      <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textMuted }}>
                        AJUSTES DE ESTE PERIODO ({ajustes.length})
                      </Text>
                    </View>

                    {ajustes.length > 4 && (
                      <TextInput
                        value={filtroAjustes}
                        onChangeText={setFiltroAjustes}
                        placeholder="Filtrar por motivo..."
                        placeholderTextColor={Colors.placeholder}
                        style={{
                          fontSize: moderateScale(12), color: Colors.textPrimary,
                          backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                          borderRadius: Radius.sm, paddingHorizontal: scale(10), paddingVertical: scale(8),
                          marginBottom: scale(8),
                        }}
                      />
                    )}

                    {(() => {
                      const filtrados = filtroAjustes.trim()
                        ? ajustes.filter(a => a.reason.toLowerCase().includes(filtroAjustes.trim().toLowerCase()))
                        : ajustes;

                      if (filtrados.length === 0) {
                        return (
                          <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, textAlign: 'center', paddingVertical: scale(8) }}>
                            Ningún ajuste coincide con "{filtroAjustes}"
                          </Text>
                        );
                      }

                      // Acotado con scroll propio en vez de dejar crecer la
                      // pantalla sin límite — un bono de 90 días puede acumular
                      // muchos ajustes sueltos.
                      return (
                        <ScrollView
                          style={{ maxHeight: scale(220) }}
                          nestedScrollEnabled
                          showsVerticalScrollIndicator={filtrados.length > 5}
                        >
                          {filtrados.map((a) => (
                            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(8) }}>
                              <Text style={{
                                fontSize: moderateScale(12), fontWeight: '800', minWidth: scale(26),
                                color: a.used_delta > 0 ? '#EF4444' : '#22C55E',
                              }}>
                                {a.used_delta > 0 ? `-${a.used_delta}` : `+${-a.used_delta}`}
                              </Text>
                              <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, flex: 1 }} numberOfLines={1}>
                                {a.reason}
                              </Text>
                              <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>
                                {new Date(a.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                              </Text>
                              <SpringPressable onPress={() => borrarAjuste(a)} style={{ padding: scale(4) }}>
                                <TrashIcon size={scale(13)} color={Colors.danger} strokeWidth={2} />
                              </SpringPressable>
                            </View>
                          ))}
                        </ScrollView>
                      );
                    })()}
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* No todos los socios necesitan una plantilla semanal fija (ej.
              usuarios de sala) — sin esta marca, el resumen del panel de
              admin los cuenta como "pendientes" sin serlo de verdad. */}
          {!isCreating && (
            <Animated.View entering={FadeInDown.duration(400).delay(320).springify()}>
              <SpringPressable onPress={() => setTemplateNotRequired(v => !v)}>
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: scale(12),
                  padding: scale(14),
                  backgroundColor: Colors.card,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: templateNotRequired ? Colors.blue500 : Colors.cardBorder,
                }}>
                  <View style={{
                    width: scale(22), height: scale(22), borderRadius: scale(6),
                    borderWidth: 2,
                    borderColor: templateNotRequired ? Colors.blue500 : Colors.cardBorder,
                    backgroundColor: templateNotRequired ? Colors.blue500 : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                    marginTop: scale(1),
                  }}>
                    {templateNotRequired && <CheckIcon size={scale(14)} color="#fff" strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textPrimary }}>
                      No necesita plantilla semanal
                    </Text>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textSecondary, marginTop: scale(2) }}>
                      Ej. usuarios de sala. No aparecerá en el aviso de "sin plantilla" del panel de admin.
                    </Text>
                  </View>
                </View>
              </SpringPressable>
            </Animated.View>
          )}

          {/* Vencimiento del bono (planes no recurrentes) */}
          {!isCreating && planId && (() => {
            const selectedPlan = plans.find(p => p.id === planId);
            if (!selectedPlan || selectedPlan.billing_period !== 'once' || selectedPlan.validity_days == null) return null;

            // Si se ha cambiado de plan pero aún no se ha guardado, la fecha
            // de asignación real será "ahora" al guardar (ver handleSave) —
            // no la que hubiera en profiles de antes, que corresponde al
            // plan anterior y daría una vista previa incorrecta.
            const planChangedSincePreview = planId !== originalPlanId;
            const windowStart = planChangedSincePreview ? new Date() : (planAssignedAt ? new Date(planAssignedAt) : null);

            if (!windowStart) {
              return (
                <Animated.View entering={FadeInDown.duration(400).delay(320).springify()} style={{ gap: scale(6) }}>
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
                    Vencimiento del bono
                  </Text>
                  <View style={{
                    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                    borderRadius: Radius.md, padding: scale(14),
                  }}>
                    <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }}>
                      Sin fecha de asignación registrada todavía — se fijará al guardar.
                    </Text>
                  </View>
                </Animated.View>
              );
            }

            const { end } = getBonoWindow(windowStart, selectedPlan.validity_days);
            const daysLeft = Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
            const expired = !planChangedSincePreview && daysLeft <= 0;
            const statusLabel = expired ? 'Caducado' : daysLeft <= 7 ? 'Caduca pronto' : 'Vigente';
            const dotColor = expired ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#22C55E';

            return (
              <Animated.View entering={FadeInDown.duration(400).delay(320).springify()} style={{ gap: scale(6) }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
                  Vencimiento del bono
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'flex-start', gap: scale(8),
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, padding: scale(14),
                }}>
                  <CategoryDot color={dotColor} size="md" />
                  <View style={{ flex: 1, gap: scale(4) }}>
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}>
                      {statusLabel}
                    </Text>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
                      {expired
                        ? `Caducó el ${end.toLocaleDateString('es-ES')}.`
                        : `Caduca el ${end.toLocaleDateString('es-ES')} (quedan ${daysLeft} día${daysLeft !== 1 ? 's' : ''})${planChangedSincePreview ? ' — se fijará al guardar' : ''}.`}
                    </Text>
                  </View>
                </View>
              </Animated.View>
            );
          })()}

          {/* Estado de pago del periodo actual (planes recurrentes) */}
          {!isCreating && planId && plans.find(p => p.id === planId)?.billing_period !== 'once' && (
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
              onPress={() => handleSave()}
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
