import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarCheckIcon, CalendarIcon, ChevronLeftIcon, DumbbellIcon, EditIcon, LightningIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { ActionButton, Avatar, FAB, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUsers'>;
};

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  template_count: number;
  plan_id: string | null;
  plan_name: string | null;
  plan_category: string | null;
}

export default function AdminUsersScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsers();
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
        .select('id, full_name, email, role, avatar_url, plan_id')
        .order('full_name');

      if (error) throw error;

      const { data: plansData } = await supabase
        .from('membership_plans')
        .select('id, name, category');

      const planMap = new Map((plansData || []).map(p => [p.id, p.name]));
      const planCategoryMap = new Map((plansData || []).map(p => [p.id, p.category]));

      const usersWithTemplates = await Promise.all(
        (profiles || []).map(async (user) => {
          const { count } = await supabase
            .from('booking_templates')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_active', true);

          return {
            ...user,
            template_count: count || 0,
            plan_name: user.plan_id ? (planMap.get(user.plan_id) || null) : null,
            plan_category: user.plan_id ? (planCategoryMap.get(user.plan_id) || null) : null,
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

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const userCount = users.filter(u => u.role === 'user').length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  const PLAN_CATEGORY_STYLES: Record<string, { bg: string; border: string; color: string; label: string; icon: React.ReactNode }> = {
    gym: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', color: '#3B82F6', label: 'Sala Gym', icon: <DumbbellIcon size={12} color="#3B82F6" strokeWidth={2.5} /> },
    classes: { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', color: '#A78BFA', label: 'Clases', icon: <CalendarCheckIcon size={12} color="#A78BFA" strokeWidth={2.5} /> },
    both: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', color: '#10B981', label: 'Gym+Clases', icon: <LightningIcon size={12} color="#10B981" strokeWidth={2.5} /> },
  };

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
          <View style={{
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
                          {user.full_name || 'Sin nombre'}
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
                                : `${user.template_count} plantilla${user.template_count > 1 ? 's' : ''}`}
                            </Text>
                          </View>
                          {user.plan_name && (() => {
                            const ps = PLAN_CATEGORY_STYLES[user.plan_category || ''] || { bg: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)', color: '#A78BFA', label: 'Plan', icon: null };
                            return (
                              <View style={{
                                alignSelf: 'flex-start',
                                backgroundColor: ps.bg,
                                borderWidth: 1, borderColor: ps.border,
                                paddingHorizontal: scale(10), paddingVertical: scale(5),
                                borderRadius: Radius.sm,
                                gap: scale(2),
                              }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
                                  {ps.icon}
                                  <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: ps.color }}>
                                    {user.plan_name}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: moderateScale(9), fontWeight: '600', color: ps.color, opacity: 0.7 }}>
                                  {ps.label}
                                </Text>
                              </View>
                            );
                          })()}
                        </View>
                      </View>
                    </View>
                  </SpringPressable>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: scale(10) }}>
                    <ActionButton
                      icon={<EditIcon size={scale(14)} color={Colors.blue400} strokeWidth={1.5} />}
                      label="Editar"
                      onPress={() => (navigation as any).navigate('AdminEditUser', { userId: user.id })}
                    />
                    {user.role === 'user' && (
                      <ActionButton
                        icon={<CalendarIcon size={scale(14)} color={Colors.blue400} strokeWidth={1.5} />}
                        label="Plantilla"
                        onPress={() => (navigation as any).navigate('AdminUserTemplates', { userId: user.id })}
                      />
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
