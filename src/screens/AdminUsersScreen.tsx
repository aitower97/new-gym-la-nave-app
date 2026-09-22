import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon, EditIcon, FilterIcon, PhoneIcon, RefreshIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { ActionButton, Avatar, CategoryDot, FAB, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { categoryColor, categoryLabel } from '../utils/planCategories';
import { ClassQuotaStatus, getClassQuotaStatusBulk } from '../utils/planEnforcement';
import { getDisplayName } from '../utils/user';
import { BillingPeriod, getCurrentPeriodStart, getPaymentBlockGraceDays, getPreviousPeriodStart, isGraceExpired, markPaymentReceived, revertPaymentReceived, toDateStr } from '../utils/planPayments';

type PaymentBadge = 'paid' | 'pending' | 'blocked' | null;
type SortMode = 'created_at' | 'name' | 'plan';

interface PlanOption {
  id: string;
  name: string;
  category: string | null;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUsers'>;
};

interface User {
  id: string;
  username: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  template_count: number;
  template_not_required: boolean;
  plan_id: string | null;
  plan_name: string | null;
  plan_category: string | null;
  payment_status: PaymentBadge;
  plan_billing_period: BillingPeriod | null;
  created_at: string;
  /** null si el plan no tiene límite de clases o no hay nada que contar. */
  quota: ClassQuotaStatus | null;
}

export default function AdminUsersScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const searchRef = useTutorialTarget('admin-users-search');
  const firstUserActionsRef = useTutorialTarget('admin-users-actions');
  const scrollRef = useRef<ScrollView>(null);
  useTutorialScrollAction('admin-users-actions', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [markingPaymentFor, setMarkingPaymentFor] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('created_at');
  const [filterCategory, setFilterCategory] = useState<string | 'all'>('all');
  const [filterPaymentStatus, setFilterPaymentStatus] = useState<PaymentBadge | 'all'>('all');
  /** 'none' = sin plan asignado. */
  const [filterPlanId, setFilterPlanId] = useState<string | 'all' | 'none'>('all');

  useEffect(() => {
    loadUsers();
    supabase.auth.getSession().then(({ data }) => setOwnUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadUsers();
    });
    return unsubscribe;
  }, [navigation]);

  /** Igual que planPayments.getPaymentStatus, pero en local a partir de un set de pagos ya cargado en bloque. */
  function computeBadge(
    billingPeriod: BillingPeriod,
    userId: string,
    createdAt: string,
    paidSet: Set<string>,
    graceDays: number,
    now = new Date()
  ): PaymentBadge {
    const periodStart = getCurrentPeriodStart(billingPeriod, now);
    const paid = paidSet.has(`${userId}|${toDateStr(periodStart)}`);
    if (paid) return 'paid';
    let blocked = isGraceExpired(periodStart, now, graceDays);
    if (!blocked) {
      const prevStart = getPreviousPeriodStart(billingPeriod, periodStart);
      // Solo fecha, sin hora — created_at lleva la hora real de alta, y
      // comparado tal cual contra la medianoche de prevStart excluía a quien
      // se diera de alta el día 1 del periodo anterior salvo a las 00:00 en punto.
      const since = new Date(createdAt);
      const sinceDateOnly = new Date(since.getFullYear(), since.getMonth(), since.getDate());
      if (sinceDateOnly <= prevStart && !paidSet.has(`${userId}|${toDateStr(prevStart)}`)) {
        blocked = true;
      }
    }
    return blocked ? 'blocked' : 'pending';
  }

  async function loadUsers() {
    try {
      setLoading(true);

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, phone, role, avatar_url, plan_id, plan_assigned_at, created_at, template_not_required')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Sin filtrar por is_active: un socio puede tener asignado un plan que
      // el admin haya desactivado después — su nombre/categoría debe seguir
      // mostrándose. El filtro "PLAN" de abajo sí se limita a los activos
      // (no tiene sentido dejar filtrar por un plan que ya no se ofrece).
      const { data: plansData } = await supabase
        .from('membership_plans')
        .select('id, name, category, billing_period, is_active, classes_per_month, validity_days')
        .order('name');

      setPlans((plansData || []).filter(p => p.is_active).map(p => ({ id: p.id, name: p.name, category: p.category })));

      const planMap = new Map((plansData || []).map(p => [p.id, p.name]));
      const planCategoryMap = new Map((plansData || []).map(p => [p.id, p.category]));
      const planBillingMap = new Map((plansData || []).map(p => [p.id, p.billing_period as BillingPeriod]));

      const userIds = (profiles || []).map(p => p.id);
      const { data: paymentsData } = userIds.length
        ? await supabase.from('plan_payments').select('user_id, period_start').in('user_id', userIds)
        : { data: [] as { user_id: string; period_start: string }[] };
      const paidSet = new Set((paymentsData || []).map(p => `${p.user_id}|${p.period_start}`));

      const now = new Date();
      const graceDays = await getPaymentBlockGraceDays();

      // Cupo de todos los socios en una sola consulta, no una por socio.
      const quotaMap = await getClassQuotaStatusBulk(
        (profiles || []).map(p => ({ id: p.id, plan_id: p.plan_id, plan_assigned_at: (p as any).plan_assigned_at ?? null })),
        (plansData || []).map(p => ({
          id: p.id,
          classes_per_month: (p as any).classes_per_month ?? null,
          is_active: p.is_active,
          billing_period: p.billing_period as BillingPeriod,
          validity_days: (p as any).validity_days ?? null,
        }))
      );

      // Plantillas activas de todos los socios en una sola consulta. Antes se
      // contaban una por una dentro del map: 54 viajes a la base cada vez que
      // se abría la pantalla, para un dato que cabe en una consulta.
      const { data: templatesData } = userIds.length
        ? await supabase.from('booking_templates').select('user_id').in('user_id', userIds).eq('is_active', true)
        : { data: [] as { user_id: string }[] };

      const templateCounts = new Map<string, number>();
      for (const t of (templatesData || [])) {
        templateCounts.set(t.user_id, (templateCounts.get(t.user_id) || 0) + 1);
      }

      const usersWithTemplates = (profiles || []).map((user) => {
          let payment_status: PaymentBadge = null;
          if (user.plan_id) {
            const billingPeriod = planBillingMap.get(user.plan_id);
            if (billingPeriod && billingPeriod !== 'daily' && billingPeriod !== 'once') {
              payment_status = computeBadge(billingPeriod, user.id, user.created_at, paidSet, graceDays, now);
            }
          }

          return {
            ...user,
            template_count: templateCounts.get(user.id) || 0,
            plan_name: user.plan_id ? (planMap.get(user.plan_id) || null) : null,
            plan_category: user.plan_id ? (planCategoryMap.get(user.plan_id) || null) : null,
            plan_billing_period: user.plan_id ? (planBillingMap.get(user.plan_id) || null) : null,
            payment_status,
            quota: quotaMap.get(user.id) || null,
          };
      });

      setUsers(usersWithTemplates);
    } catch (error: any) {
      console.error('Error loading users:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPayment(user: User) {
    if (!ownUserId || !user.plan_billing_period) return;
    try {
      setMarkingPaymentFor(user.id);
      await markPaymentReceived(user.id, user.plan_billing_period, ownUserId);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, payment_status: 'paid' } : u));
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setMarkingPaymentFor(null);
    }
  }

  function handleRevertPayment(user: User) {
    if (!user.plan_billing_period) return;
    Alert.alert(
      'Deshacer pago',
      `¿Quitar el pago registrado de "${user.full_name || user.email}" para este periodo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Deshacer', style: 'destructive', onPress: async () => {
            try {
              setMarkingPaymentFor(user.id);
              await revertPaymentReceived(user.id, user.plan_billing_period!);
              await loadUsers();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setMarkingPaymentFor(null);
            }
          },
        },
      ]
    );
  }

  const filteredUsers = users
    .filter(user =>
      (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (filterCategory === 'all' || user.plan_category === filterCategory) &&
      (filterPaymentStatus === 'all' || user.payment_status === filterPaymentStatus) &&
      (filterPlanId === 'all' || (filterPlanId === 'none' ? !user.plan_id : user.plan_id === filterPlanId))
    )
    .sort((a, b) => {
      if (sortMode === 'name') return getDisplayName(a).localeCompare(getDisplayName(b));
      if (sortMode === 'plan') return (a.plan_name || '').localeCompare(b.plan_name || '');
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // registro: más reciente primero
    });

  const availableCategories = Array.from(new Set(plans.map(p => p.category).filter((c): c is string => !!c)));

  const activeFilterCount = (filterCategory !== 'all' ? 1 : 0) + (filterPaymentStatus !== 'all' ? 1 : 0) + (filterPlanId !== 'all' ? 1 : 0);

  const userCount = users.filter(u => u.role === 'user').length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

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
            borderBottomWidth: 1, borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <SpringPressable onPress={() => navigation.goBack()} style={{
            width: scale(40), height: scale(40),
            borderRadius: scale(20),
            backgroundColor: Colors.card,
            borderWidth: 1, borderColor: Colors.cardBorder,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </SpringPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              Usuarios
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              {userCount} usuarios · {adminCount} admins
            </Text>
          </View>
        </Animated.View>

        {/* Search + filtros */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(80).springify()}
          style={{ paddingHorizontal: scale(20), paddingTop: scale(14), paddingBottom: showFilters ? scale(10) : scale(14) }}
        >
          <View style={{ flexDirection: 'row', gap: scale(10) }}>
            <View ref={searchRef} collapsable={false} style={{
              flex: 1,
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: Colors.inputBg,
              borderRadius: Radius.md,
              borderWidth: 1, borderColor: Colors.inputBorder,
              paddingHorizontal: scale(14),
              height: scale(48),
              gap: scale(10),
            }}>
              <SearchIcon size={scale(16)} color={Colors.placeholder} />
              <TextInput
                style={{ flex: 1, fontSize: scale(15), color: Colors.textPrimary }}
                placeholder="Buscar por nombre o email..."
                placeholderTextColor={Colors.placeholder}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
            <SpringPressable
              onPress={() => setShowFilters(v => !v)}
              style={{
                width: scale(48), height: scale(48),
                borderRadius: Radius.md,
                backgroundColor: showFilters || activeFilterCount > 0 ? 'rgba(59,130,246,0.15)' : Colors.inputBg,
                borderWidth: 1, borderColor: showFilters || activeFilterCount > 0 ? Colors.blue500 : Colors.inputBorder,
              }}
            >
              <View style={{ width: scale(48), height: scale(48), alignItems: 'center', justifyContent: 'center' }}>
                <FilterIcon size={scale(18)} color={showFilters || activeFilterCount > 0 ? Colors.blue500 : Colors.textSecondary} strokeWidth={2} />
                {activeFilterCount > 0 && (
                  <View style={{
                    position: 'absolute', top: scale(6), right: scale(6),
                    width: scale(8), height: scale(8), borderRadius: scale(4),
                    backgroundColor: Colors.blue500,
                  }} />
                )}
              </View>
            </SpringPressable>
          </View>

          {showFilters && (
            // maxHeight + scroll propio: con muchos planes activos (chips de
            // "PLAN" pueden ocupar varias filas) el panel podía crecer más
            // que la pantalla y dejar la lista de usuarios (que vive fuera,
            // en su propio ScrollView) con cero altura visible, sin forma de
            // hacer scroll hasta las últimas secciones del panel tampoco.
            <Animated.View entering={FadeInDown.duration(250).springify()} style={{ marginTop: scale(16), maxHeight: scale(320) }}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: scale(16) }}>
              <View>
                <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted, marginBottom: scale(8) }}>
                  ORDENAR POR
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  {([
                    { value: 'created_at', label: 'Registro' },
                    { value: 'name', label: 'A-Z' },
                    { value: 'plan', label: 'Plan' },
                  ] as { value: SortMode; label: string }[]).map(opt => (
                    <SpringPressable
                      key={opt.value}
                      onPress={() => setSortMode(opt.value)}
                      style={{
                        paddingHorizontal: scale(14), paddingVertical: scale(8),
                        borderRadius: Radius.sm, borderWidth: 1,
                        backgroundColor: sortMode === opt.value ? 'rgba(59,130,246,0.2)' : Colors.card,
                        borderColor: sortMode === opt.value ? Colors.blue500 : Colors.cardBorder,
                      }}
                    >
                      <Text style={{
                        fontSize: moderateScale(13), fontWeight: '600',
                        color: sortMode === opt.value ? Colors.blue500 : Colors.textMuted,
                      }}>
                        {opt.label}
                      </Text>
                    </SpringPressable>
                  ))}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted, marginBottom: scale(8) }}>
                  CATEGORÍA
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  <SpringPressable
                    onPress={() => setFilterCategory('all')}
                    style={{
                      paddingHorizontal: scale(14), paddingVertical: scale(8),
                      borderRadius: Radius.sm, borderWidth: 1,
                      backgroundColor: filterCategory === 'all' ? 'rgba(59,130,246,0.2)' : Colors.card,
                      borderColor: filterCategory === 'all' ? Colors.blue500 : Colors.cardBorder,
                    }}
                  >
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: filterCategory === 'all' ? Colors.blue500 : Colors.textMuted }}>
                      Todos
                    </Text>
                  </SpringPressable>
                  {availableCategories.map(cat => {
                    const color = categoryColor(cat);
                    const isActive = filterCategory === cat;
                    return (
                      <SpringPressable
                        key={cat}
                        onPress={() => setFilterCategory(cat)}
                        style={{
                          paddingHorizontal: scale(14), paddingVertical: scale(8),
                          borderRadius: Radius.sm, borderWidth: 1,
                          backgroundColor: isActive ? `${color}33` : Colors.card,
                          borderColor: isActive ? color : Colors.cardBorder,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                          <CategoryDot color={color} size="sm" />
                          <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: isActive ? color : Colors.textMuted }}>
                            {categoryLabel(cat)}
                          </Text>
                        </View>
                      </SpringPressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted, marginBottom: scale(8) }}>
                  PLAN
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  <SpringPressable
                    onPress={() => setFilterPlanId('all')}
                    style={{
                      paddingHorizontal: scale(14), paddingVertical: scale(8),
                      borderRadius: Radius.sm, borderWidth: 1,
                      backgroundColor: filterPlanId === 'all' ? 'rgba(59,130,246,0.2)' : Colors.card,
                      borderColor: filterPlanId === 'all' ? Colors.blue500 : Colors.cardBorder,
                    }}
                  >
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: filterPlanId === 'all' ? Colors.blue500 : Colors.textMuted }}>
                      Todos
                    </Text>
                  </SpringPressable>
                  <SpringPressable
                    onPress={() => setFilterPlanId('none')}
                    style={{
                      paddingHorizontal: scale(14), paddingVertical: scale(8),
                      borderRadius: Radius.sm, borderWidth: 1,
                      backgroundColor: filterPlanId === 'none' ? 'rgba(245,158,11,0.2)' : Colors.card,
                      borderColor: filterPlanId === 'none' ? Colors.warning : Colors.cardBorder,
                    }}
                  >
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: filterPlanId === 'none' ? Colors.warning : Colors.textMuted }}>
                      Sin plan
                    </Text>
                  </SpringPressable>
                  {plans.map(plan => {
                    const isActive = filterPlanId === plan.id;
                    const color = categoryColor(plan.category || '');
                    return (
                      <SpringPressable
                        key={plan.id}
                        onPress={() => setFilterPlanId(plan.id)}
                        style={{
                          paddingHorizontal: scale(14), paddingVertical: scale(8),
                          borderRadius: Radius.sm, borderWidth: 1,
                          backgroundColor: isActive ? `${color}33` : Colors.card,
                          borderColor: isActive ? color : Colors.cardBorder,
                        }}
                      >
                        <Text numberOfLines={1} style={{ maxWidth: scale(160), fontSize: moderateScale(13), fontWeight: '600', color: isActive ? color : Colors.textMuted }}>
                          {plan.name}
                        </Text>
                      </SpringPressable>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted, marginBottom: scale(8) }}>
                  ESTADO DE PAGO
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  {([
                    { value: 'all', label: 'Todos', color: Colors.textMuted },
                    { value: 'paid', label: 'Pagado', color: '#22C55E' },
                    { value: 'pending', label: 'Pendiente', color: '#F59E0B' },
                    { value: 'blocked', label: 'Bloqueado', color: '#EF4444' },
                  ] as { value: PaymentBadge | 'all'; label: string; color: string }[]).map(opt => {
                    const isActive = filterPaymentStatus === opt.value;
                    return (
                      <SpringPressable
                        key={String(opt.value)}
                        onPress={() => setFilterPaymentStatus(opt.value)}
                        style={{
                          paddingHorizontal: scale(14), paddingVertical: scale(8),
                          borderRadius: Radius.sm, borderWidth: 1,
                          backgroundColor: isActive ? `${opt.color}33` : Colors.card,
                          borderColor: isActive ? opt.color : Colors.cardBorder,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                          {opt.value !== 'all' && <CategoryDot color={opt.color} size="sm" />}
                          <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: isActive ? opt.color : Colors.textMuted }}>
                            {opt.label}
                          </Text>
                        </View>
                      </SpringPressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            </Animated.View>
          )}
        </Animated.View>

        {/* List */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: scale(12) }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
            <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary }}>Cargando usuarios...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredUsers.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: scale(80) }}>
                <View style={{
                  width: scale(72), height: scale(72),
                  borderRadius: scale(36),
                  backgroundColor: Colors.card,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: scale(16),
                }}>
                  <SearchIcon size={scale(32)} color={Colors.textDisabled} strokeWidth={1.5} />
                </View>
                <Text style={{ fontSize: moderateScale(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(8) }}>
                  No hay usuarios
                </Text>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', lineHeight: scale(20), paddingHorizontal: scale(40) }}>
                  {searchQuery ? 'No se encontraron resultados' : 'Todavía no hay usuarios registrados'}
                </Text>
              </View>
            ) : (
              filteredUsers.map((user, i) => (
                <Animated.View
                  key={user.id}
                  entering={FadeInDown.duration(350).delay(120 + i * 60).springify()}
                  style={{
                    backgroundColor: Colors.card,
                    borderRadius: Radius.lg,
                    padding: scale(16),
                    marginBottom: scale(10),
                    borderWidth: 1, borderColor: Colors.cardBorder,
                    overflow: 'hidden',
                  }}
                >
                  <SpringPressable
                    onPress={() => (navigation as any).navigate('AdminEditUser', { userId: user.id })}
                    style={{}}
                  >
                    {/* Row: avatar + info */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(14) }}>
                      <View style={{ marginRight: scale(12) }}>
                        <Avatar uri={user.avatar_url} size={scale(44)} index={i} name={user.full_name || user.username} />
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(3) }} numberOfLines={1}>
                          {getDisplayName(user)}
                        </Text>
                        <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(8) }} numberOfLines={1}>
                          {user.email}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: scale(6), flexWrap: 'wrap' }}>
                          {/* Insignias neutras (rol, plantilla, plan): mismo tamaño y
                              color para todas — solo el estado de pago, más abajo, lleva
                              color, porque es lo único que de verdad requiere destacar
                              a golpe de vista al escanear la lista. */}
                          {user.role === 'admin' && (
                            <View style={{
                              alignSelf: 'flex-start',
                              backgroundColor: 'rgba(59,130,246,0.12)',
                              borderWidth: 1, borderColor: Colors.borderBlue,
                              paddingHorizontal: scale(10), paddingVertical: scale(5),
                              borderRadius: Radius.sm,
                            }}>
                              <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.blue400 }}>
                                Admin
                              </Text>
                            </View>
                          )}
                          <View style={{
                            alignSelf: 'flex-start',
                            backgroundColor: 'rgba(255,255,255,0.06)',
                            borderWidth: 1, borderColor: Colors.cardBorder,
                            paddingHorizontal: scale(10), paddingVertical: scale(5),
                            borderRadius: Radius.sm,
                          }}>
                            <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textSecondary }}>
                              {user.template_count === 0
                                ? (user.template_not_required ? 'No requiere' : 'Sin plantilla')
                                // Cada plantilla activa es 1 clase semanal recurrente
                                // → ×4 semanas para estimar el total mensual.
                                : `${user.template_count * 4} clases/mes`}
                            </Text>
                          </View>
                          {user.plan_name && (
                            <View style={{
                              alignSelf: 'flex-start',
                              maxWidth: scale(160), flexShrink: 1,
                              backgroundColor: 'rgba(255,255,255,0.06)',
                              borderWidth: 1, borderColor: Colors.cardBorder,
                              paddingHorizontal: scale(10), paddingVertical: scale(5),
                              borderRadius: Radius.sm,
                            }}>
                              <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textSecondary }} numberOfLines={1}>
                                {user.plan_name}
                              </Text>
                            </View>
                          )}
                          {user.payment_status && (() => {
                            const color = user.payment_status === 'paid' ? '#22C55E' : user.payment_status === 'blocked' ? '#EF4444' : '#F59E0B';
                            const label = user.payment_status === 'paid' ? 'Pagado' : user.payment_status === 'blocked' ? 'Bloqueado' : 'Pago pendiente';
                            return (
                              <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: scale(6),
                                alignSelf: 'flex-start',
                                backgroundColor: color + '1F',
                                borderWidth: 1, borderColor: color + '40',
                                paddingHorizontal: scale(10), paddingVertical: scale(5),
                                borderRadius: Radius.sm,
                              }}>
                                <CategoryDot color={color} size="sm" />
                                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color }}>
                                  {label}
                                </Text>
                              </View>
                            );
                          })()}
                          {user.quota && (() => {
                            // Mismo criterio de color que el widget del socio
                            // (ClassQuotaWidget): agotado en rojo, quedando
                            // poco en ámbar, el resto en azul.
                            const { remaining, total } = user.quota;
                            const low = remaining <= Math.max(1, Math.round(total * 0.15));
                            const color = remaining === 0 ? '#EF4444' : low ? '#F59E0B' : '#3B82F6';
                            return (
                              <View style={{
                                flexDirection: 'row', alignItems: 'center', gap: scale(6),
                                alignSelf: 'flex-start',
                                backgroundColor: color + '1F',
                                borderWidth: 1, borderColor: color + '40',
                                paddingHorizontal: scale(10), paddingVertical: scale(5),
                                borderRadius: Radius.sm,
                              }}>
                                <CategoryDot color={color} size="sm" />
                                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color }}>
                                  {remaining === 0 ? 'Sin clases' : `${remaining} de ${total}`}
                                </Text>
                              </View>
                            );
                          })()}
                        </View>
                      </View>
                    </View>
                  </SpringPressable>

                  {/* Actions */}
                  <View
                    ref={i === 0 ? firstUserActionsRef : undefined}
                    collapsable={false}
                    style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: scale(8), gap: scale(10) }}
                  >
                    <View style={{ minWidth: scale(95), flexGrow: 1 }}>
                      <ActionButton
                        icon={<EditIcon size={scale(14)} color={Colors.blue400} strokeWidth={1.5} />}
                        label="Editar"
                        onPress={() => (navigation as any).navigate('AdminEditUser', { userId: user.id })}
                      />
                    </View>
                    {user.role === 'user' && (
                      <View style={{ minWidth: scale(95), flexGrow: 1 }}>
                        <ActionButton
                          icon={<CalendarIcon size={scale(14)} color={Colors.blue400} strokeWidth={1.5} />}
                          label="Plantilla"
                          onPress={() => (navigation as any).navigate('AdminUserTemplates', { userId: user.id })}
                        />
                      </View>
                    )}
                    {user.phone && (
                      <View style={{ minWidth: scale(95), flexGrow: 1 }}>
                        <ActionButton
                          icon={<PhoneIcon size={scale(14)} color={Colors.blue400} strokeWidth={1.5} />}
                          label="Llamar"
                          onPress={() => Linking.openURL(`tel:${user.phone!.replace(/\s/g, '')}`)}
                        />
                      </View>
                    )}
                    {user.payment_status && user.payment_status !== 'paid' && (
                      <View style={{ minWidth: scale(95), flexGrow: 1 }}>
                        <SpringPressable
                          onPress={() => handleMarkPayment(user)}
                          disabled={markingPaymentFor === user.id}
                          style={{
                            flex: 1,
                            backgroundColor: 'rgba(34,197,94,0.15)',
                            borderRadius: Radius.md,
                            borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
                            opacity: markingPaymentFor === user.id ? 0.6 : 1,
                          }}
                        >
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            minHeight: scale(32),
                            gap: scale(4), paddingVertical: scale(8), paddingHorizontal: scale(12),
                          }}>
                            {markingPaymentFor === user.id ? (
                              <ActivityIndicator size="small" color="#22C55E" />
                            ) : (
                              <>
                                <CategoryDot color="#22C55E" size="sm" />
                                <Text style={{ color: '#22C55E', fontSize: moderateScale(12), fontWeight: '700' }}>
                                  Marcar pagado
                                </Text>
                              </>
                            )}
                          </View>
                        </SpringPressable>
                      </View>
                    )}
                    {user.payment_status === 'paid' && (
                      <View style={{ minWidth: scale(95), flexGrow: 1 }}>
                        <SpringPressable
                          onPress={() => handleRevertPayment(user)}
                          disabled={markingPaymentFor === user.id}
                          style={{
                            flex: 1,
                            backgroundColor: Colors.background,
                            borderRadius: Radius.md,
                            borderWidth: 1, borderColor: Colors.cardBorder,
                            opacity: markingPaymentFor === user.id ? 0.6 : 1,
                          }}
                        >
                          <View style={{
                            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                            minHeight: scale(32),
                            gap: scale(4), paddingVertical: scale(8), paddingHorizontal: scale(12),
                          }}>
                            {markingPaymentFor === user.id ? (
                              <ActivityIndicator size="small" color={Colors.textSecondary} />
                            ) : (
                              <>
                                <RefreshIcon size={scale(14)} color={Colors.textSecondary} strokeWidth={1.5} />
                                <Text style={{ color: Colors.textSecondary, fontSize: moderateScale(12), fontWeight: '700' }}>
                                  Deshacer pago
                                </Text>
                              </>
                            )}
                          </View>
                        </SpringPressable>
                      </View>
                    )}
                  </View>
                </Animated.View>
              ))
            )}
          </ScrollView>
        )}

        <FAB onPress={() => (navigation as any).navigate('AdminEditUser', {})} />
      </View>
    </View>
  );
}
