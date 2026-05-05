import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BellIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChevronRightIcon,
  LogoutIcon,
  UserIcon,
} from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { getUnreadCount } from '../utils/notifications';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;
  route: RouteProp<RootStackParamList, 'MainMenu'>;
};

export default function MainMenuScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalBookings: 0,
    thisWeek: 0,
  });

  useEffect(() => {
    loadUserData();
    loadStats();
    loadUnreadCount();
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
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async function loadStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count: total } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(today);
      const daysUntilSunday = 7 - today.getDay();
      endOfWeek.setDate(today.getDate() + daysUntilSunday);
      endOfWeek.setHours(23, 59, 59, 999);

      const { count: week } = await supabase
        .from('bookings')
        .select('*, classes!inner(*)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('classes.class_date', today.toISOString().split('T')[0])
        .lte('classes.class_date', endOfWeek.toISOString().split('T')[0]);

      setStats({
        totalBookings: total || 0,
        thisWeek: week || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const displayName = name || email.split('@')[0];

  return (
    <View style={styles.container}>
      {/* Ambient glow effects */}
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <Pressable
          style={styles.avatarBtn}
          onPress={() => navigation.navigate('Profile', { email, name })}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>
                {displayName[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.avatarOnline} />
        </Pressable>

        <View style={styles.headerCenter}>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={() => navigation.navigate('Notifications')}
          >
            <BellIcon size={scale(20)} color={Colors.textSecondary} />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
            onPress={async () => {
              await supabase.auth.signOut();
              navigation.navigate('Login');
            }}
          >
            <LogoutIcon size={scale(20)} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Brand + Stats Row */}
      <View style={styles.brandStatsRow}>
        <View style={styles.brandBadge}>
          <Image
            source={require('../../assets/icon.png')}
            style={styles.brandLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.brandName}>LA NAVE</Text>
            <Text style={styles.brandSub}>STRENGTH CENTER</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.thisWeek}</Text>
            <Text style={styles.statLbl}>Esta semana</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.totalBookings}</Text>
            <Text style={styles.statLbl}>Total clases</Text>
          </View>
        </View>
      </View>

      {/* Action Cards */}
      <View style={styles.cards}>
        {/* Primary card */}
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardPrimary, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('Home', { email, name })}
        >
          <View style={styles.cardIconBox}>
            <CalendarIcon size={scale(26)} color="#fff" />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Reservar Clases</Text>
            <Text style={styles.cardSubtitle}>Encuentra tu próximo entrenamiento</Text>
          </View>
          <ChevronRightIcon size={scale(20)} color="rgba(255,255,255,0.6)" />
        </Pressable>

        {/* Secondary cards */}
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardSecondary, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('MyClasses', { email, name })}
        >
          <View style={[styles.cardIconBox, styles.cardIconBoxSecondary]}>
            <CalendarCheckIcon size={scale(22)} color={Colors.blue400} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitleSecondary}>Mis Clases</Text>
            <Text style={styles.cardSubtitle}>Ver calendario de reservas</Text>
          </View>
          <ChevronRightIcon size={scale(20)} color={Colors.textMuted} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.card, styles.cardSecondary, pressed && styles.cardPressed]}
          onPress={() => navigation.navigate('Profile', { email, name })}
        >
          <View style={[styles.cardIconBox, styles.cardIconBoxSecondary]}>
            <UserIcon size={scale(22)} color={Colors.blue400} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitleSecondary}>Mi Perfil</Text>
            <Text style={styles.cardSubtitle}>Edita tu información personal</Text>
          </View>
          <ChevronRightIcon size={scale(20)} color={Colors.textMuted} />
        </Pressable>
      </View>

      {/* Bottom safe area padding */}
      <View style={{ height: insets.bottom + scale(16) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: scale(280),
    height: scale(280),
    borderRadius: scale(140),
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -100,
    left: -60,
    width: scale(300),
    height: scale(300),
    borderRadius: scale(150),
    backgroundColor: 'rgba(59,130,246,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingBottom: scale(16),
    gap: scale(12),
  },
  avatarBtn: {
    position: 'relative',
  },
  avatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    borderWidth: 2,
    borderColor: Colors.blue500,
  },
  avatarPlaceholder: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: Colors.blue700,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.blue500,
  },
  avatarInitial: {
    fontSize: moderateScale(20),
    fontWeight: '800',
    color: '#fff',
  },
  avatarOnline: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: scale(12),
    height: scale(12),
    borderRadius: scale(6),
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  headerCenter: {
    flex: 1,
    gap: scale(1),
  },
  greeting: {
    fontSize: moderateScale(13),
    color: Colors.textMuted,
    fontWeight: '500',
  },
  userName: {
    fontSize: moderateScale(20),
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: scale(8),
  },
  iconBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    opacity: 0.7,
    backgroundColor: Colors.surfaceElevated,
  },
  badge: {
    position: 'absolute',
    top: scale(4),
    right: scale(4),
    minWidth: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(3),
  },
  badgeText: {
    fontSize: moderateScale(9),
    fontWeight: '800',
    color: '#fff',
  },
  brandStatsRow: {
    marginHorizontal: scale(20),
    marginBottom: scale(20),
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: scale(16),
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  brandLogo: {
    width: scale(36),
    height: scale(36),
    borderRadius: Radius.sm,
  },
  brandName: {
    fontSize: moderateScale(13),
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  brandSub: {
    fontSize: moderateScale(9),
    fontWeight: '600',
    color: Colors.blue400,
    letterSpacing: 1.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  statItem: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: moderateScale(22),
    fontWeight: '800',
    color: Colors.blue400,
    letterSpacing: -0.5,
  },
  statLbl: {
    fontSize: moderateScale(10),
    color: Colors.textMuted,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: scale(28),
    backgroundColor: Colors.border,
  },
  cards: {
    flex: 1,
    paddingHorizontal: scale(20),
    gap: scale(12),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.xl,
    padding: scale(18),
    borderWidth: 1,
    gap: scale(14),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  cardPrimary: {
    backgroundColor: Colors.blue600,
    borderColor: Colors.blue500,
    shadowColor: Colors.blue700,
    shadowOpacity: 0.4,
  },
  cardSecondary: {
    backgroundColor: Colors.surface,
    borderColor: Colors.cardBorder,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  cardIconBox: {
    width: scale(48),
    height: scale(48),
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconBoxSecondary: {
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  cardBody: {
    flex: 1,
    gap: scale(3),
  },
  cardTitle: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.2,
  },
  cardTitleSecondary: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: moderateScale(13),
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
  },
});

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;
  route: RouteProp<RootStackParamList, 'MainMenu'>;
};

const { width } = Dimensions.get('window');

export default function MainMenuScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalBookings: 0,
    thisWeek: 0,
  });

  useEffect(() => {
    loadUserData();
    loadStats();
    loadUnreadCount();
  }, []);

  useEffect(() => {
    // Recargar al volver a la pantalla
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
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async function loadStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Total de reservas
      const { count: total } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Reservas de esta semana (de hoy en adelante hasta fin de semana)
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Inicio del día de hoy
      
      // Fin de esta semana (domingo)
      const endOfWeek = new Date(today);
      const daysUntilSunday = 7 - today.getDay(); // Si hoy es domingo (0), será 7
      endOfWeek.setDate(today.getDate() + daysUntilSunday);
      endOfWeek.setHours(23, 59, 59, 999);
      
      const { count: week } = await supabase
        .from('bookings')
        .select('*, classes!inner(*)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('classes.class_date', today.toISOString().split('T')[0])
        .lte('classes.class_date', endOfWeek.toISOString().split('T')[0]);

      setStats({
        totalBookings: total || 0,
        thisWeek: week || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const displayName = name || email.split('@')[0];

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <View style={styles.gradientContainer}>
        <View style={styles.gradientCircle1} />
        <View style={styles.gradientCircle2} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Pressable 
            style={styles.avatarContainer}
            onPress={() => navigation.navigate('Profile', { email, name })}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {displayName[0].toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{displayName}</Text>
          </View>
        </View>

        {/* Botón de notificaciones */}
        <Pressable
          style={styles.notificationsBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <BellIcon size={scale(20)} color={Colors.textSecondary} />
          {unreadCount > 0 && (
            <View style={styles.notificationsBadge}>
              <Text style={styles.notificationsBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </Pressable>

        <Pressable 
          style={styles.logoutBtn}
          onPress={async () => {
            await supabase.auth.signOut();
            navigation.navigate('Login');
          }}
        >
          <Text style={styles.logoutIcon}>⎋</Text>
        </Pressable>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.thisWeek}</Text>
          <Text style={styles.statLabel}>Esta semana</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalBookings}</Text>
          <Text style={styles.statLabel}>Total clases</Text>
        </View>
      </View>

      {/* Main Action Cards */}
      <View style={styles.actionsContainer}>
        {/* Reservar Clases Card */}
        <Pressable 
          style={({ pressed }) => [
            styles.actionCard,
            styles.actionCardPrimary,
            pressed && styles.actionCardPressed,
          ]}
          onPress={() => navigation.navigate('Home', { email, name })}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <CalendarIcon size={scale(24)} color={Colors.blue400} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Reservar Clases</Text>
              <Text style={styles.cardSubtitle}>
                Encuentra tu próximo entrenamiento
              </Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </Pressable>

        {/* Mis Clases Card */}
        <Pressable 
          style={({ pressed }) => [
            styles.actionCard,
            styles.actionCardSecondary,
            pressed && styles.actionCardPressed,
          ]}
          onPress={() => navigation.navigate('MyClasses', { email, name })}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <CalendarCheckIcon size={scale(24)} color={Colors.blue400} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Mis Clases</Text>
              <Text style={styles.cardSubtitle}>
                Ver calendario de reservas
              </Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </Pressable>

        {/* Mi Perfil Card */}
        <Pressable 
          style={({ pressed }) => [
            styles.actionCard,
            styles.actionCardSecondary,
            pressed && styles.actionCardPressed,
          ]}
          onPress={() => navigation.navigate('Profile', { email, name })}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <UserIcon size={scale(24)} color={Colors.blue400} />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Mi Perfil</Text>
              <Text style={styles.cardSubtitle}>
                Edita tu información personal
              </Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>La Nave Strength Center</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  gradientContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(59,130,246,0.1)',
    opacity: 0.5,
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -150,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(245,158,11,0.08)',
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#3B82F6',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#3B82F6',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  greetingContainer: {
    gap: 4,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.5,
  },
  notificationsBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationsBtnIcon: {
    fontSize: 24,
  },
  notificationsBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  notificationsBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  logoutIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  actionsContainer: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  actionCard: {
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
  },
  actionCardPrimary: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  actionCardSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 28,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  cardArrow: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});