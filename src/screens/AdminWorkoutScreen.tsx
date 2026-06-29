import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarbellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  SearchIcon,
  UsersIcon,
} from '../components/Icons';
import { Avatar, SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { getDisplayName } from '../utils/user';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminWorkout'>;
};

interface ClassWithUsers {
  id: string;
  name: string;
  class_time: string;
  class_type: string;
  bookings: Array<{
    user_id: string;
    profiles: { id: string; username: string | null; full_name: string | null; email: string; avatar_url: string | null };
  }>;
}

interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

function UserRow({ user, onPress, index }: {
  user: { id: string; displayName: string; email?: string; avatarUrl: string | null };
  onPress: () => void;
  index: number;
}) {
  const pressScale = useSharedValue(1);
  const shadowOp = useSharedValue(0.08);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    shadowOpacity: shadowOp.value,
  }));

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(Math.min(index * 40, 400)).springify()}
      style={[animStyle, {
        borderRadius: Radius.md,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
        marginBottom: scale(8),
      }]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          pressScale.value = withSpring(0.97, { damping: 14, stiffness: 300 });
          shadowOp.value = withTiming(0.2, { duration: 120 });
        }}
        onPressOut={() => {
          pressScale.value = withSpring(1, { damping: 12, stiffness: 200 });
          shadowOp.value = withTiming(0.08, { duration: 280 });
        }}
        style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: Radius.md,
          padding: scale(14),
          borderWidth: 1, borderColor: Colors.cardBorder,
          gap: scale(12),
        }}
      >
        <Avatar uri={user.avatarUrl} size={scale(40)} index={index} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
            {user.displayName}
          </Text>
          {user.email && (
            <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>
              {user.email}
            </Text>
          )}
        </View>
        <BarbellIcon size={scale(18)} color={Colors.blue400} />
        <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

function ClassCard({ cls, isExpanded, onToggle, onUserPress }: {
  cls: ClassWithUsers;
  isExpanded: boolean;
  onToggle: () => void;
  onUserPress: (userId: string, userName: string) => void;
}) {
  const pressScale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const users = cls.bookings || [];

  return (
    <Animated.View style={[animStyle, {
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: isExpanded ? Colors.blue500 + '40' : Colors.cardBorder,
      marginBottom: scale(12),
      overflow: 'hidden',
    }]}>
      <Pressable
        onPress={onToggle}
        onPressIn={() => { pressScale.value = withSpring(0.97, { damping: 14, stiffness: 300 }); }}
        onPressOut={() => { pressScale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        style={{
          flexDirection: 'row', alignItems: 'center',
          padding: scale(16), gap: scale(12),
        }}
      >
        <View style={{
          width: scale(48), height: scale(44),
          borderRadius: Radius.md,
          backgroundColor: isExpanded ? 'rgba(59,130,246,0.15)' : 'rgba(100,100,120,0.08)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: moderateScale(12), fontWeight: '800', color: isExpanded ? Colors.blue400 : Colors.textSecondary }} numberOfLines={1}>
            {cls.class_time.slice(0, 5)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
            {cls.name}
          </Text>
          <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
            {users.length} usuario{users.length !== 1 ? 's' : ''} reservado{users.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {/* Avatars stack */}
        {users.length > 0 && (
          <View style={{ flexDirection: 'row', marginRight: scale(4) }}>
            {users.slice(0, 3).map((b, i) => (
              <View key={b.user_id} style={{ marginLeft: i > 0 ? -scale(10) : 0 }}>
                <Avatar uri={b.profiles?.avatar_url} size={scale(28)} index={i} />
              </View>
            ))}
            {users.length > 3 && (
              <View style={{
                width: scale(28), height: scale(28), borderRadius: scale(14),
                backgroundColor: Colors.blue500, marginLeft: -scale(10),
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: Colors.background,
              }}>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: '#fff' }}>
                  +{users.length - 3}
                </Text>
              </View>
            )}
          </View>
        )}
        <ChevronRightIcon size={scale(18)} color={Colors.textMuted} />
      </Pressable>

      {isExpanded && (
        <View style={{
          borderTopWidth: 1, borderTopColor: Colors.border,
          paddingHorizontal: scale(16), paddingBottom: scale(12),
        }}>
          {users.length === 0 ? (
            <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, paddingVertical: scale(16), textAlign: 'center' }}>
              No hay usuarios en esta clase
            </Text>
          ) : (
            users.map((booking, j) => {
              const profile = booking.profiles;
              const displayName = profile ? getDisplayName(profile) : 'Usuario';
              return (
                <Pressable
                  key={booking.user_id}
                  onPress={() => onUserPress(booking.user_id, displayName)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: scale(12),
                    borderBottomWidth: j < users.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.border,
                    gap: scale(12),
                  }}
                >
                  <Avatar uri={profile?.avatar_url} size={scale(36)} index={j} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                      {displayName}
                    </Text>
                  </View>
                  <BarbellIcon size={scale(18)} color={Colors.blue400} />
                  <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </Animated.View>
  );
}

export default function AdminWorkoutScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'class' | 'users'>('class');
  const [loading, setLoading] = useState(true);

  const [todayClasses, setTodayClasses] = useState<ClassWithUsers[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    loadTodayClasses();
  }, []);

  async function loadTodayClasses() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('classes')
        .select(`
          id, name, class_time, class_type,
          bookings ( user_id, profiles:user_id ( id, username, full_name, email, avatar_url ) )
        `)
        .eq('class_date', today)
        .order('class_time');

      if (error) throw error;
      setTodayClasses((data as any) || []);

      if (data && data.length > 0) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let closest: string | null = null;
        let closestDiff = Infinity;
        for (const cls of data) {
          const [h, m] = cls.class_time.split(':').map(Number);
          const diff = Math.abs(h * 60 + m - currentMinutes);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = cls.id;
          }
        }
        if (closest) setExpandedClassId(closest);
      }
    } catch (error) {
      console.error('Error loading today classes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllUsers() {
    if (allUsers.length > 0) return;
    try {
      setLoadingUsers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, avatar_url')
        .order('full_name');

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleTabChange(newTab: 'class' | 'users') {
    setTab(newTab);
    if (newTab === 'users') loadAllUsers();
  }

  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.full_name?.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q)
    );
  });

  function navigateToUserWorkout(userId: string, userName: string) {
    navigation.navigate('AdminUserWorkout', { userId, userName });
  }

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
              Entrenamientos
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Registrar pesos por usuario
            </Text>
          </View>
        </Animated.View>

        {/* Tabs */}
        <View style={{
          flexDirection: 'row', marginHorizontal: scale(20), marginTop: scale(16),
          backgroundColor: Colors.card, borderRadius: Radius.md,
          borderWidth: 1, borderColor: Colors.cardBorder, padding: scale(3),
        }}>
          <SpringPressable onPress={() => handleTabChange('class')} style={{ flex: 1 }}>
            <View style={{
              paddingVertical: scale(10), borderRadius: Radius.sm,
              backgroundColor: tab === 'class' ? 'rgba(59,130,246,0.15)' : 'transparent',
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: scale(6),
            }}>
              <ClockIcon size={scale(16)} color={tab === 'class' ? Colors.blue400 : Colors.textMuted} />
              <Text style={{
                fontSize: moderateScale(13), fontWeight: '700',
                color: tab === 'class' ? Colors.blue400 : Colors.textMuted,
              }}>
                Clase actual
              </Text>
            </View>
          </SpringPressable>
          <SpringPressable onPress={() => handleTabChange('users')} style={{ flex: 1 }}>
            <View style={{
              paddingVertical: scale(10), borderRadius: Radius.sm,
              backgroundColor: tab === 'users' ? 'rgba(59,130,246,0.15)' : 'transparent',
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: scale(6),
            }}>
              <UsersIcon size={scale(16)} color={tab === 'users' ? Colors.blue400 : Colors.textMuted} />
              <Text style={{
                fontSize: moderateScale(13), fontWeight: '700',
                color: tab === 'users' ? Colors.blue400 : Colors.textMuted,
              }}>
                Todos los usuarios
              </Text>
            </View>
          </SpringPressable>
        </View>

        {/* Content */}
        {tab === 'class' ? (
          loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.blue500} />
            </View>
          ) : todayClasses.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
              <BarbellIcon size={scale(48)} color={Colors.textMuted} />
              <Text style={{ fontSize: moderateScale(18), fontWeight: '700', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                Sin clases hoy
              </Text>
              <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
                No hay clases programadas para hoy
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            >
              {todayClasses.map((cls, i) => (
                <Animated.View
                  key={cls.id}
                  entering={FadeInDown.duration(350).delay(i * 80).springify()}
                >
                  <ClassCard
                    cls={cls}
                    isExpanded={expandedClassId === cls.id}
                    onToggle={() => setExpandedClassId(expandedClassId === cls.id ? null : cls.id)}
                    onUserPress={navigateToUserWorkout}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          )
        ) : (
          <View style={{ flex: 1 }}>
            {/* Search bar */}
            <View style={{
              marginHorizontal: scale(20), marginTop: scale(16),
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: Colors.inputBg,
              borderWidth: 1, borderColor: Colors.inputBorder,
              borderRadius: Radius.md, paddingHorizontal: scale(12),
              gap: scale(8),
            }}>
              <SearchIcon size={scale(18)} color={Colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar por nombre o email..."
                placeholderTextColor={Colors.placeholder}
                autoCapitalize="none"
                style={{
                  flex: 1, height: scale(44),
                  fontSize: moderateScale(14),
                  color: Colors.textPrimary,
                }}
              />
            </View>

            {loadingUsers ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.blue500} />
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredUsers.length === 0 ? (
                  <Text style={{ fontSize: moderateScale(14), color: Colors.textMuted, textAlign: 'center', paddingTop: scale(40) }}>
                    {searchQuery ? 'Sin resultados' : 'No hay usuarios'}
                  </Text>
                ) : (
                  filteredUsers.map((user, i) => {
                    const displayName = getDisplayName(user);
                    return (
                      <UserRow
                        key={user.id}
                        user={{
                          id: user.id,
                          displayName,
                          email: user.email,
                          avatarUrl: user.avatar_url,
                        }}
                        onPress={() => navigateToUserWorkout(user.id, displayName)}
                        index={i}
                      />
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </View>
  );
}
