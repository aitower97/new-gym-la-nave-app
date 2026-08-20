import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon, EditIcon, PhoneIcon, RefreshIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { ActionButton, Avatar, CategoryDot, FAB, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { categoryColor, categoryLabel } from '../utils/planCategories';
import { getDisplayName } from '../utils/user';
import { BillingPeriod, getCurrentPeriodStart, isGraceExpired, markPaymentReceived, revertPaymentReceived, toDateStr } from '../utils/planPayments';

type PaymentBadge = 'paid' | 'pending' | 'blocked' | null;

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
  plan_id: string | null;
  plan_name: string | null;
  plan_category: string | null;
  payment_status: PaymentBadge;
  plan_billing_period: BillingPeriod | null;
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

  async function loadUsers() {
    try {
      setLoading(true);

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, phone, role, avatar_url, plan_id')
        .order('full_name');

      if (error) throw error;

      const { data: plansData } = await supabase
        .from('membership_plans')
        .select('id, name, category, billing_period');

      const planMap = new Map((plansData || []).map(p => [p.id, p.name]));
      const planCategoryMap = new Map((plansData || []).map(p => [p.id, p.category]));
      const planBillingMap = new Map((plansData || []).map(p => [p.id, p.billing_period as BillingPeriod]));

      const userIds = (profiles || []).map(p => p.id);
      const { data: paymentsData } = userIds.length
        ? await supabase.from('plan_payments').select('user_id, period_start').in('user_id', userIds)
        : { data: [] as { user_id: string; period_start: string }[] };
      const paidSet = new Set((paymentsData || []).map(p => `${p.user_id}|${p.period_start}`));

      const now = new Date();

      const usersWithTemplates = await Promise.all(
        (profiles || []).map(async (user) => {
          const { count } = await supabase
            .from('booking_templates')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_active', true);

          let payment_status: PaymentBadge = null;
          if (user.plan_id) {
            const billingPeriod = planBillingMap.get(user.plan_id);
            if (billingPeriod && billingPeriod !== 'daily') {
              const periodStart = getCurrentPeriodStart(billingPeriod, now);
              const paid = paidSet.has(`${user.id}|${toDateStr(periodStart)}`);
              payment_status = paid ? 'paid' : isGraceExpired(periodStart, now) ? 'blocked' : 'pending';
            }
          }

          return {
            ...user,
            template_count: count || 0,
            plan_name: user.plan_id ? (planMap.get(user.plan_id) || null) : null,
            plan_category: user.plan_id ? (planCategoryMap.get(user.plan_id) || null) : null,
            plan_billing_period: user.plan_id ? (planBillingMap.get(user.plan_id) || null) : null,
            payment_status,
          };
        })
      );

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
              const periodStart = getCurrentPeriodStart(user.plan_billing_period!);
              const newStatus: PaymentBadge = isGraceExpired(periodStart) ? 'blocked' : 'pending';
              setUsers(prev => prev.map(u => u.id === user.id ? { ...u, payment_status: newStatus } : u));
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

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

        {/* Search */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(80).springify()}
          style={{ paddingHorizontal: scale(20), paddingVertical: scale(14) }}
        >
          <View ref={searchRef} collapsable={false} style={{
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
                        <Avatar uri={user.avatar_url} size={scale(44)} index={i} />
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(3) }} numberOfLines={1}>
                          {getDisplayName(user)}
                        </Text>
                        <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(8) }} numberOfLines={1}>
                          {user.email}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: scale(6), flexWrap: 'wrap' }}>
                          <View style={{
                            alignSelf: 'flex-start',
                            backgroundColor: user.role === 'admin' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.1)',
                            borderWidth: 1,
                            borderColor: user.role === 'admin' ? Colors.borderBlue : 'rgba(16,185,129,0.25)',
                            paddingHorizontal: scale(10), paddingVertical: scale(4),
                            borderRadius: Radius.sm,
                          }}>
                            <Text style={{
                              fontSize: moderateScale(11), fontWeight: '700',
                              color: user.role === 'admin' ? Colors.blue400 : '#10B981',
                            }}>
                              {user.role === 'admin' ? 'Admin' : 'Usuario'}
                            </Text>
                          </View>
                          <View style={{
                            alignSelf: 'flex-start',
                            backgroundColor: 'rgba(59,130,246,0.1)',
                            borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
                            paddingHorizontal: scale(10), paddingVertical: scale(4),
                            borderRadius: Radius.sm,
                          }}>
                            <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.blue400 }}>
                              {user.template_count === 0
                                ? 'Sin plantilla'
                                // Cada plantilla activa es 1 clase semanal recurrente
                                // → ×4 semanas para estimar el total mensual.
                                : `${user.template_count * 4} clases/mes`}
                            </Text>
                          </View>
                          {user.plan_name && (() => {
                            const color = categoryColor(user.plan_category || 'gym');
                            return (
                              <View style={{
                                alignSelf: 'flex-start',
                                backgroundColor: color + '1F',
                                borderWidth: 1, borderColor: color + '40',
                                paddingHorizontal: scale(10), paddingVertical: scale(5),
                                borderRadius: Radius.sm,
                                gap: scale(2),
                              }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                                  <CategoryDot color={color} size="sm" />
                                  <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color }}>
                                    {user.plan_name}
                                  </Text>
                                </View>
                                {user.plan_category && (
                                  <Text style={{ fontSize: moderateScale(9), fontWeight: '600', color, opacity: 0.7 }}>
                                    {categoryLabel(user.plan_category)}
                                  </Text>
                                )}
                              </View>
                            );
                          })()}
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
