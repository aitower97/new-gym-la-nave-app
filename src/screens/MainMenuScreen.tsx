import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarbellIcon,
  BellIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChevronRightIcon,
  LogoutIcon,
  UserIcon,
} from '../components/Icons';
import { Card } from '../components/ui/Card';
import { NextClassWidget } from '../components/widgets/NextClassWidget';
import { WorkoutNotesWidget } from '../components/widgets/WorkoutNotesWidget';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale as s } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { getUnreadCount } from '../utils/notifications';



type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;
  route: RouteProp<RootStackParamList, 'MainMenu'>;
};

// ─── STAT CARD ANIMADA ────────────────────────────────────────────────
function StatNumber({ value }: { value: number }) {
  const displayRef = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const steps = 20;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(current));
      }
    }, 40);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: Colors.blue400, letterSpacing: -0.5 }}>
      {display}
    </Text>
  );
}

// ─── AVATAR CON PULSE ONLINE ─────────────────────────────────────────
function AvatarWithPulse({ avatarUrl, displayName, onPress }: {
  avatarUrl: string | null;
  displayName: string;
  onPress: () => void;
}) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.8, { duration: 1200 }),
        withTiming(1, { duration: 0 })
      ), -1, false
    );
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1200 }),
        withTiming(0.6, { duration: 0 })
      ), -1, false
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const btnScale = useSharedValue(1);
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  return (
    <Animated.View style={btnStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => btnScale.value = withSpring(0.92, { damping: 14, stiffness: 300 })}
        onPressOut={() => btnScale.value = withSpring(1, { damping: 12, stiffness: 200 })}
        style={{ position: 'relative' }}
      >
        <View style={{
          width: s(48), height: s(48),
          borderRadius: s(24),
          backgroundColor: Colors.blue700,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 2, borderColor: Colors.blue500,
          overflow: 'hidden',
        }}>
          <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: '#fff' }}>
            {displayName[0].toUpperCase()}
          </Text>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ position: 'absolute', width: '100%', height: '100%' }}
              fadeDuration={200}
            />
          ) : null}
        </View>

        {/* Online dot con pulse */}
        <View style={{ position: 'absolute', bottom: 1, right: 1 }}>
          <Animated.View style={[pulseStyle, {
            position: 'absolute',
            width: s(12), height: s(12),
            borderRadius: s(6),
            backgroundColor: Colors.success,
          }]} />
          <View style={{
            width: s(12), height: s(12),
            borderRadius: s(6),
            backgroundColor: Colors.success,
            borderWidth: 2, borderColor: Colors.background,
          }} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── ICON BUTTON ANIMADO ─────────────────────────────────────────────
function IconButton({ onPress, children, badge }: {
  onPress: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        onPressIn={() => scale.value = withSpring(0.88, { damping: 14, stiffness: 300 })}
        onPressOut={() => scale.value = withSpring(1, { damping: 12, stiffness: 200 })}
        style={{
          width: s(40), height: s(40),
          borderRadius: s(20),
          backgroundColor: Colors.card,
          borderWidth: 1, borderColor: Colors.cardBorder,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {children}
        {badge && badge > 0 ? (
          <View style={{
            position: 'absolute', top: s(4), right: s(4),
            minWidth: s(16), height: s(16),
            borderRadius: s(8),
            backgroundColor: Colors.danger,
            alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: s(3),
          }}>
            <Text style={{ fontSize: moderateScale(9), fontWeight: '800', color: '#fff' }}>
              {badge > 9 ? '9+' : badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────
export default function MainMenuScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalBookings: 0, thisWeek: 0 });
  const [nextClass, setNextClass] = useState<{
    name: string;
    class_date: string;
    class_time: string;
  } | null>(null);
  const [nextClassLoading, setNextClassLoading] = useState(true);

  useEffect(() => {
    loadUserData();
    loadStats();
    loadUnreadCount();
    loadNextClass();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadUserData();
      loadStats();
      loadUnreadCount();
    });
    return unsubscribe;
  }, [navigation]);

  async function loadUnreadCount() {
    const count = await getUnreadCount();
    setUnreadCount(count);
  }

  async function loadUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles').select('avatar_url').eq('id', user.id).single();
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async function loadStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count: total } = await supabase
        .from('bookings').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
      endOfWeek.setHours(23, 59, 59, 999);
      const { count: week } = await supabase
        .from('bookings').select('*, classes!inner(*)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('classes.class_date', today.toISOString().split('T')[0])
        .lte('classes.class_date', endOfWeek.toISOString().split('T')[0]);
      setStats({ totalBookings: total || 0, thisWeek: week || 0 });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async function loadNextClass() {
      try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;
          const todayStr = new Date().toISOString().split('T')[0];
          const { data } = await supabase
              .from('bookings')
              .select('classes(name, class_date, class_time)')
              .eq('user_id', user.id)
              .gte('classes.class_date', todayStr)
              .limit(5);

          if (!data) return;
          const now = new Date();
          const upcoming = data
              .map((b: any) => b.classes)
              .filter(Boolean)
              .filter((cls: any) => {
                  const d = new Date(`${cls.class_date}T${cls.class_time}`);
                  return d > now;
              })
              .sort((a: any, b: any) =>
                  new Date(`${a.class_date}T${a.class_time}`).getTime() -
                  new Date(`${b.class_date}T${b.class_time}`).getTime()
              );
          if (upcoming[0]) setNextClass(upcoming[0]);
      } catch (e) {}
      finally { setNextClassLoading(false); }
  }

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 13) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const displayName = name || email.split('@')[0];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Ambient glows */}
        <View style={{
          position: 'absolute', top: -80, right: -80,
          width: s(280), height: s(280), borderRadius: s(140),
          backgroundColor: 'rgba(37,99,235,0.1)',
        }} />
        <View style={{
          position: 'absolute', bottom: -100, left: -60,
          width: s(300), height: s(300), borderRadius: s(150),
          backgroundColor: 'rgba(59,130,246,0.05)',
        }} />

        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingHorizontal: s(20),
            paddingTop: insets.top + s(12),
            paddingBottom: s(16),
            gap: s(12),
          }}
        >
          <AvatarWithPulse
            avatarUrl={avatarUrl}
            displayName={displayName}
            onPress={() => navigation.navigate('Profile', { email, name })}
          />

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, fontWeight: '500' }}>
              {getGreeting()},
            </Text>
            <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 }} numberOfLines={1}>
              {displayName}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: s(8) }}>
            <IconButton
              onPress={() => navigation.navigate('Notifications')}
              badge={unreadCount}
            >
              <BellIcon size={s(20)} color={Colors.textSecondary} />
            </IconButton>

            <IconButton onPress={async () => {
              await supabase.auth.signOut();
              navigation.navigate('Login');
            }}>
              <LogoutIcon size={s(20)} color={Colors.textMuted} />
            </IconButton>
          </View>
        </Animated.View>

        {/* Brand + Stats */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(400).springify()}
          style={{
            marginHorizontal: s(20), marginBottom: s(20),
            backgroundColor: Colors.surface,
            borderRadius: Radius.xl, padding: s(16),
            borderWidth: 1, borderColor: Colors.cardBorder,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(10) }}>
            <Image
              source={require('../../assets/logo-white.jpeg')}
              style={{ width: s(36), height: s(36), borderRadius: Radius.sm }}
              resizeMode="contain"
            />
            <View>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '900', color: Colors.textPrimary, letterSpacing: 2 }}>
                LA NAVE
              </Text>
              <Text style={{ fontSize: moderateScale(9), fontWeight: '600', color: Colors.blue400, letterSpacing: 1.5 }}>
                STRENGTH CENTER
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(12) }}>
            <View style={{ alignItems: 'center' }}>
              <StatNumber value={stats.thisWeek} />
              <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted, fontWeight: '600' }}>
                Esta semana
              </Text>
            </View>
            <View style={{ width: 1, height: s(28), backgroundColor: Colors.border }} />
            <View style={{ alignItems: 'center' }}>
              <StatNumber value={stats.totalBookings} />
              <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted, fontWeight: '600' }}>
                Total clases
              </Text>
            </View>
          </View>
        </Animated.View>
        
        {/* Widgets */}
        <Animated.View entering={FadeInDown.delay(140).duration(400).springify()}>
          <NextClassWidget nextClass={nextClass} isLoading={nextClassLoading} />
        </Animated.View>

        {/* Cards */}
        <View style={{ flex: 1, paddingHorizontal: s(20), gap: s(12) }}>
          <Animated.View entering={FadeInDown.delay(160).duration(400).springify()}>
            <Card
              variant="primary"
              onPress={() => navigation.navigate('Reservation', { email, name })}
              icon={<CalendarIcon size={s(26)} color="#fff" />}
              title="Reservar Clases"
              subtitle="Encuentra tu próximo entrenamiento"
              rightElement={<ChevronRightIcon size={s(20)} color="rgba(255,255,255,0.5)" />}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(400).springify()}>
            <Card
              variant="secondary"
              onPress={() => navigation.navigate('MyClasses', { email, name })}
              icon={<CalendarCheckIcon size={s(22)} color={Colors.blue400} />}
              title="Mis Clases"
              subtitle="Ver calendario de reservas"
              rightElement={<ChevronRightIcon size={s(20)} color={Colors.textMuted} />}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(400).springify()}>
            <Card
              variant="secondary"
              onPress={() => navigation.navigate('Workout', {})}
              icon={<BarbellIcon size={s(22)} color={Colors.blue400} />}
              title="Entrenamiento"
              subtitle="Registra tu entrenamiento diario"
              rightElement={<ChevronRightIcon size={s(20)} color={Colors.textMuted} />}
            />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(340).duration(400).springify()}>
            <Card
              variant="secondary"
              onPress={() => navigation.navigate('Profile', { email, name })}
              icon={<UserIcon size={s(22)} color={Colors.blue400} />}
              title="Mi Perfil"
              subtitle="Edita tu información personal"
              rightElement={<ChevronRightIcon size={s(20)} color={Colors.textMuted} />}
            />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(180).duration(400).springify()}>
          <WorkoutNotesWidget
            onPress={() => navigation.navigate('WorkoutNotes')}
          />
        </Animated.View>

        <View style={{ height: insets.bottom + s(16) }} />
      </View>
    </View>
  );
}
