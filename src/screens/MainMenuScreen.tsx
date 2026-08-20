import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
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
  QuestionIcon,
  UserIcon,
} from '../components/Icons';
import { Card } from '../components/ui/Card';
import { TodayWorkoutWidget } from '../components/widgets/TodayWorkoutWidget';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale as s } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useTutorial, useTutorialTarget } from '../tutorial/TutorialContext';
import { getUnreadCount } from '../utils/notifications';
import { TodayWorkoutAccess, getTodayWorkoutAccess } from '../utils/workoutAccess';

const WORKOUT_POPUP_SEEN_KEY = 'workout_popup_last_seen_date';
const AVATAR_REMINDER_SEEN_KEY = 'avatar_reminder_seen';



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
            {(displayName[0] || '?').toUpperCase()}
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
  const { start: startTutorial } = useTutorial();
  const tutorialAutoStartCheckedRef = useRef(false);
  const cardReservarRef = useTutorialTarget('menu-card-reservar');
  const cardMisClasesRef = useTutorialTarget('menu-card-mis-clases');
  const cardProgresoRef = useTutorialTarget('menu-card-progreso');
  const cardPerfilRef = useTutorialTarget('menu-card-perfil');
  const bellRef = useTutorialTarget('menu-bell');
  const todayWidgetRef = useTutorialTarget('menu-today-widget');
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalBookings: 0, thisWeek: 0 });
  const [todayWorkoutExercises, setTodayWorkoutExercises] = useState<string[]>([]);
  const [todayWorkoutLoggedCount, setTodayWorkoutLoggedCount] = useState(0);
  const [todayWorkoutLoading, setTodayWorkoutLoading] = useState(true);
  const [todayAccess, setTodayAccess] = useState<TodayWorkoutAccess | null>(null);
  const [showWorkoutPopup, setShowWorkoutPopup] = useState(false);
  const [showAvatarReminder, setShowAvatarReminder] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadAllData);
    return unsubscribe;
  }, [navigation]);

  async function loadAllData() {
    try {
      // getSession() usa caché local — sin llamada de red al servidor de auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      const uid = session.user.id;

      // Fecha local (misma que usa WorkoutScreen y el builder del admin) — con
      // toISOString() cerca de medianoche en España cae en el día UTC anterior
      // o siguiente y desincroniza stats/popup del resto de la pantalla.
      const toLocalDateStr = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const todayStr = toLocalDateStr(new Date());
      const startOfWeek = new Date(); startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + (7 - startOfWeek.getDay()));
      const endOfWeekStr = toLocalDateStr(endOfWeek);
      const sessionTodayStr = todayStr;

      const [profileRes, totalRes, weekRes, unread, access] = await Promise.all([
        supabase.from('profiles').select('avatar_url, username, full_name, has_seen_tutorial').eq('id', uid).single(),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('bookings')
          .select('*, classes!inner(*)', { count: 'exact', head: true })
          .eq('user_id', uid)
          .gte('classes.class_date', todayStr)
          .lte('classes.class_date', endOfWeekStr),
        getUnreadCount(),
        getTodayWorkoutAccess(uid, sessionTodayStr),
      ]);
      setTodayAccess(access);

      // No se cargan (ni se guardan en estado) los nombres de los ejercicios
      // hasta que la sesión esté desbloqueada — evita el spoiler del WOD.
      const workoutRes = access.isUnlocked
        ? await supabase.from('workout_exercises').select('id, name').eq('is_active', true)
          .eq('session_date', sessionTodayStr)
          .or(`user_id.is.null,user_id.eq.${uid}`)
          .order('sort_order')
        : { data: [] as { id: string; name: string }[] };

      if (profileRes.data?.avatar_url) setAvatarUrl(profileRes.data.avatar_url);
      if (profileRes.data) {
        const dn = profileRes.data.username || profileRes.data.full_name;
        if (dn) setProfileDisplayName(dn);
      }

      // Apodo elegido en el registro: se guarda en la metadata del usuario y,
      // la primera vez que entra, lo volcamos a profiles.username (si está vacío).
      const metaUsername = (session.user.user_metadata as any)?.username;
      if (metaUsername && !profileRes.data?.username) {
        const { error: unameErr } = await supabase
          .from('profiles')
          .update({ username: metaUsername })
          .eq('id', uid);
        if (!unameErr) setProfileDisplayName(metaUsername);
      }
      setStats({ totalBookings: totalRes.count || 0, thisWeek: weekRes.count || 0 });
      setUnreadCount(unread);

      const exerciseRows = workoutRes.data || [];
      const exerciseNames = exerciseRows.map((e: any) => e.name);
      setTodayWorkoutExercises(exerciseNames);

      if (exerciseRows.length > 0) {
        const exerciseIds = exerciseRows.map((e: any) => e.id);
        const { data: logsData } = await supabase
          .from('workout_logs')
          .select('exercise_id')
          .eq('user_id', uid)
          .eq('date', sessionTodayStr)
          .in('exercise_id', exerciseIds);
        setTodayWorkoutLoggedCount(new Set((logsData || []).map((l: any) => l.exercise_id)).size);
      } else {
        setTodayWorkoutLoggedCount(0);
      }

      let willShowWorkoutPopup = false;
      if (exerciseNames.length > 0) {
        const lastSeen = await AsyncStorage.getItem(WORKOUT_POPUP_SEEN_KEY);
        if (lastSeen !== todayStr) {
          willShowWorkoutPopup = true;
          setShowWorkoutPopup(true);
          await AsyncStorage.setItem(WORKOUT_POPUP_SEEN_KEY, todayStr);
        }
      }

      // Primer acceso: recordar añadir foto de perfil (solo una vez, y si no
      // hay avatar). No lo mostramos a la vez que el pop-up de entreno.
      let willShowAvatarReminder = false;
      if (!willShowWorkoutPopup && !profileRes.data?.avatar_url) {
        const avatarReminderSeen = await AsyncStorage.getItem(AVATAR_REMINDER_SEEN_KEY);
        if (!avatarReminderSeen) {
          willShowAvatarReminder = true;
          setShowAvatarReminder(true);
          await AsyncStorage.setItem(AVATAR_REMINDER_SEEN_KEY, '1');
        }
      }

      // Tutorial automático solo la primera vez, y nunca a la vez que otro
      // pop-up de bienvenida — se comprueba una sola vez por sesión de la app.
      if (!tutorialAutoStartCheckedRef.current) {
        tutorialAutoStartCheckedRef.current = true;
        if (!profileRes.data?.has_seen_tutorial && !willShowWorkoutPopup && !willShowAvatarReminder) {
          setTimeout(() => startTutorial(), 700);
        }
      }
    } catch (e) {
      console.error('Error loading main menu:', e);
    } finally {
      setTodayWorkoutLoading(false);
    }
  }

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 13) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const displayName = profileDisplayName || name || email.split('@')[0];

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
            <IconButton onPress={() => startTutorial()}>
              <QuestionIcon size={s(20)} color={Colors.textSecondary} />
            </IconButton>

            <View ref={bellRef} collapsable={false}>
              <IconButton
                onPress={() => navigation.navigate('Notifications')}
                badge={unreadCount}
              >
                <BellIcon size={s(20)} color={Colors.textSecondary} />
              </IconButton>
            </View>

            <IconButton onPress={async () => {
              await supabase.auth.signOut();
              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
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
        <Animated.View entering={FadeInDown.delay(200).duration(400).springify()}>
          <View ref={todayWidgetRef} collapsable={false} style={{ marginHorizontal: s(20), marginBottom: s(12) }}>
            <TodayWorkoutWidget
              exercises={todayWorkoutExercises}
              loggedCount={todayWorkoutLoggedCount}
              access={todayAccess}
              isLoading={todayWorkoutLoading}
              onPress={() => navigation.navigate('Workout', {})}
              onReserve={() => navigation.navigate('Reservation', { email, name })}
              onUnlock={loadAllData}
            />
          </View>
        </Animated.View>

        {/* Cards */}
        <View style={{ flex: 1, paddingHorizontal: s(20), gap: s(12) }}>
          <Animated.View entering={FadeInDown.delay(160).duration(400).springify()}>
            <View ref={cardReservarRef} collapsable={false}>
              <Card
                variant="primary"
                onPress={() => navigation.navigate('Reservation', { email, name })}
                icon={<CalendarIcon size={s(26)} color="#fff" />}
                title="Reservar Clases"
                subtitle="Encuentra tu próximo entrenamiento"
                rightElement={<ChevronRightIcon size={s(20)} color="rgba(255,255,255,0.5)" />}
                image={require('../../assets/gym/card-reservar.png')}
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(220).duration(400).springify()}>
            <View ref={cardMisClasesRef} collapsable={false}>
              <Card
                variant="secondary"
                onPress={() => navigation.navigate('MyClasses', { email, name })}
                icon={<CalendarCheckIcon size={s(22)} color={Colors.blue400} />}
                title="Mis Clases"
                subtitle="Ver calendario de reservas"
                rightElement={<ChevronRightIcon size={s(20)} color={Colors.textMuted} />}
                image={require('../../assets/gym/card-misclases.png')}
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(280).duration(400).springify()}>
            <View ref={cardProgresoRef} collapsable={false}>
              <Card
                variant="secondary"
                onPress={() => navigation.navigate('WorkoutProgress', { email, name })}
                icon={<BarbellIcon size={s(22)} color={Colors.blue400} />}
                title="Progreso y Ejercicios"
                subtitle="Estadísticas y calculadora %1RM"
                rightElement={<ChevronRightIcon size={s(20)} color={Colors.textMuted} />}
                image={require('../../assets/gym/card-progreso.png')}
              />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(340).duration(400).springify()}>
            <View ref={cardPerfilRef} collapsable={false}>
              <Card
                variant="secondary"
                onPress={() => navigation.navigate('Profile', { email, name })}
                icon={<UserIcon size={s(22)} color={Colors.blue400} />}
                title="Mi Perfil"
                subtitle="Edita tu información personal"
                rightElement={<ChevronRightIcon size={s(20)} color={Colors.textMuted} />}
                image={require('../../assets/gym/card-perfil.png')}
              />
            </View>
          </Animated.View>
        </View>

        <View style={{ height: insets.bottom + s(16) }} />
      </View>

      {/* Pop-up: entreno de hoy */}
      <Modal
        transparent
        visible={showWorkoutPopup}
        animationType="fade"
        onRequestClose={() => setShowWorkoutPopup(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: s(24) }}>
          <View style={{
            width: '100%', maxWidth: 340,
            backgroundColor: '#0d1929',
            borderRadius: Radius.xl,
            borderWidth: 1, borderColor: Colors.cardBorder,
            padding: s(24),
            alignItems: 'center',
          }}>
            <View style={{
              width: s(56), height: s(56), borderRadius: s(28),
              backgroundColor: 'rgba(59,130,246,0.15)',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: s(16),
            }}>
              <BarbellIcon size={s(28)} color={Colors.blue400} />
            </View>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginBottom: s(8), textAlign: 'center' }}>
              Hoy toca entrenar
            </Text>
            <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', marginBottom: s(20), lineHeight: moderateScale(20) }}>
              {todayWorkoutExercises.join(', ')}
            </Text>
            <Pressable
              onPress={() => {
                setShowWorkoutPopup(false);
                navigation.navigate('Workout', {});
              }}
              style={{
                width: '100%',
                backgroundColor: Colors.blue500,
                borderRadius: Radius.md,
                paddingVertical: s(14),
                alignItems: 'center',
                marginBottom: s(10),
              }}
            >
              <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#fff' }}>
                Ver entreno
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowWorkoutPopup(false)}
              style={{ paddingVertical: s(8) }}
            >
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textMuted }}>
                Ahora no
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Pop-up: recordatorio de foto de perfil (primer acceso) */}
      <Modal
        transparent
        visible={showAvatarReminder}
        animationType="fade"
        onRequestClose={() => setShowAvatarReminder(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: s(24) }}>
          <View style={{
            width: '100%', maxWidth: 340,
            backgroundColor: '#0d1929',
            borderRadius: Radius.xl,
            borderWidth: 1, borderColor: Colors.cardBorder,
            padding: s(24),
            alignItems: 'center',
          }}>
            <View style={{
              width: s(56), height: s(56), borderRadius: s(28),
              backgroundColor: 'rgba(59,130,246,0.15)',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: s(16),
            }}>
              <UserIcon size={s(28)} color={Colors.blue400} />
            </View>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginBottom: s(8), textAlign: 'center' }}>
              Añade tu foto de perfil
            </Text>
            <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', marginBottom: s(20), lineHeight: moderateScale(20) }}>
              Ponle cara a tu apodo para que el resto te reconozca en las clases. Es opcional y puedes hacerlo cuando quieras.
            </Text>
            <Pressable
              onPress={() => {
                setShowAvatarReminder(false);
                navigation.navigate('Profile', { email, name });
              }}
              style={{
                width: '100%',
                backgroundColor: Colors.blue500,
                borderRadius: Radius.md,
                paddingVertical: s(14),
                alignItems: 'center',
                marginBottom: s(10),
              }}
            >
              <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#fff' }}>
                Añadir foto
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowAvatarReminder(false)}
              style={{ paddingVertical: s(8) }}
            >
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textMuted }}>
                Ahora no
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
