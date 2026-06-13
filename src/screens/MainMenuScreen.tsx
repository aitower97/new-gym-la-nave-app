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
    <View style={styles.outerContainer}>
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
            source={require('../../assets/logo-white.jpeg')}
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
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
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
