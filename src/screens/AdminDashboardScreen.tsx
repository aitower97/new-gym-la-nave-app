import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    CalendarIcon,
    ClipboardIcon,
    CreditCardIcon,
    LogoutIcon,
    RefreshIcon,
    ShieldIcon,
    UsersIcon,
    WavesIcon,
} from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, isTablet, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { DashboardStats, getDashboardStats, getTodayUpcomingClasses } from '../utils/adminStats';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'>;
  route: RouteProp<RootStackParamList, 'AdminDashboard'>;
};

export default function AdminDashboardScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<DashboardStats>({
    classesToday: 0,
    totalBookings: 0,
    totalUsers: 0,
    occupancyRate: 0,
  });
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadDashboardData();
    });

    return unsubscribe;
  }, [navigation]);

  async function loadDashboardData() {
    try {
      setLoading(true);
      
      const [statsData, classesData] = await Promise.all([
        getDashboardStats(),
        getTodayUpcomingClasses(),
      ]);

      setStats(statsData);
      setUpcomingClasses(classesData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.navigate('Welcome');
  };

  function deleteAccount() {
    Alert.alert(
      'Eliminar cuenta',
      '¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer. Todos tus datos serán eliminados permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error('No user found');

              await supabase.from('bookings').delete().eq('user_id', user.id);
              await supabase.from('booking_templates').delete().eq('user_id', user.id);
              
              const { error } = await supabase.from('profiles').delete().eq('id', user.id);
              if (error) throw error;

              await supabase.auth.signOut();

              Alert.alert('Cuenta eliminada', 'Tu cuenta ha sido eliminada correctamente');
              navigation.navigate('Login');
            } catch (error: any) {
              Alert.alert('Error', `No se pudo eliminar la cuenta: ${error.message}`);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <View style={styles.headerLeft}>
          <Image
            source={require('../../assets/logo-white.jpeg')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.title}>Administración</Text>
            <Text style={styles.subtitle}>La Nave Strength Center</Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.btnPressed]}
          onPress={async () => {
            await supabase.auth.signOut();
            navigation.navigate('Login');
          }}
        >
          <LogoutIcon size={scale(18)} color={Colors.textMuted} />
        </Pressable>
      </View>

      {/* Welcome banner */}
      <View style={styles.welcomeCard}>
        <View style={styles.welcomeIconBox}>
          <ShieldIcon size={scale(28)} color={Colors.blue400} strokeWidth={1.5} />
        </View>
        <View style={styles.welcomeText}>
          <Text style={styles.welcomeTitle}>Hola, {name || email.split('@')[0]}</Text>
          <Text style={styles.welcomeSub}>Panel de gestión del gimnasio</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Menu Grid */}
        <View style={styles.menuGrid}>
          <Pressable
            style={({ pressed }) => [styles.menuCard, styles.menuCardBlue, pressed && styles.menuCardPressed]}
            onPress={() => navigation.navigate('AdminTemplates')}
          >
            <View style={styles.menuIconBox}>
              <ClipboardIcon size={scale(24)} color={Colors.blue400} />
            </View>
            <Text style={styles.menuTitle}>Plantillas</Text>
            <Text style={styles.menuSubtitle}>Reservas automáticas</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuCard, styles.menuCardAmber, pressed && styles.menuCardPressed]}
            onPress={() => navigation.navigate('AdminClasses')}
          >
            <View style={[styles.menuIconBox, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
              <CalendarIcon size={scale(24)} color="#F59E0B" />
            </View>
            <Text style={styles.menuTitle}>Clases</Text>
            <Text style={styles.menuSubtitle}>Crear y gestionar</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuCard, styles.menuCardGreen, pressed && styles.menuCardPressed]}
            onPress={() => navigation.navigate('AdminUsers')}
          >
            <View style={[styles.menuIconBox, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
              <UsersIcon size={scale(24)} color="#10B981" />
            </View>
            <Text style={styles.menuTitle}>Usuarios</Text>
            <Text style={styles.menuSubtitle}>Gestión de miembros</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuCard, styles.menuCardPurple, pressed && styles.menuCardPressed]}
            onPress={() => navigation.navigate('AdminPlans')}
          >
            <View style={[styles.menuIconBox, { backgroundColor: 'rgba(139,92,246,0.12)' }]}>
              <CreditCardIcon size={scale(24)} color="#A78BFA" />
            </View>
            <Text style={styles.menuTitle}>Planes</Text>
            <Text style={styles.menuSubtitle}>Tarifas y membresías</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.menuCard, styles.menuCardTeal, pressed && styles.menuCardPressed]}
            onPress={() => navigation.navigate('Home', { email, name, isAdmin: true })}
          >
            <View style={[styles.menuIconBox, { backgroundColor: 'rgba(20,184,166,0.12)' }]}>
              <WavesIcon size={scale(24)} color="#2DD4BF" />
            </View>
            <Text style={styles.menuTitle}>Vista usuario</Text>
            <Text style={styles.menuSubtitle}>Ver como miembro</Text>
          </Pressable>
        </View>

        {/* Stats Preview */}
        <View style={styles.statsSection}>
          <View style={styles.statsSectionHeader}>
            <Text style={styles.statsTitle}>Vista Rápida</Text>
            <Pressable
              style={({ pressed }) => [styles.refreshBtn, pressed && styles.btnPressed]}
              onPress={loadDashboardData}
            >
              <RefreshIcon size={scale(16)} color={Colors.textMuted} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.blue500} />
            </View>
          ) : (
            <>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{stats.classesToday}</Text>
                  <Text style={styles.statLabel}>Clases hoy</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{stats.totalBookings}</Text>
                  <Text style={styles.statLabel}>Reservas hoy</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{stats.totalUsers}</Text>
                  <Text style={styles.statLabel}>Usuarios</Text>
                </View>
              </View>

              <View style={styles.occupancyCard}>
                <View style={styles.occupancyHeader}>
                  <Text style={styles.occupancyLabel}>Ocupación promedio hoy</Text>
                  <Text style={styles.occupancyText}>{stats.occupancyRate}%</Text>
                </View>
                <View style={styles.occupancyBarContainer}>
                  <View
                    style={[
                      styles.occupancyBar,
                      {
                        width: `${stats.occupancyRate}%`,
                        backgroundColor:
                          stats.occupancyRate >= 80 ? Colors.danger :
                          stats.occupancyRate >= 60 ? Colors.warning :
                          Colors.success,
                      },
                    ]}
                  />
                </View>
              </View>

              {upcomingClasses.length > 0 && (
                <View style={styles.upcomingSection}>
                  <Text style={styles.upcomingTitle}>Próximas clases</Text>
                  {upcomingClasses.map((cls) => {
                    const booked = cls.bookings?.length || 0;
                    const capacity = cls.max_spots;
                    const percentage = Math.round((booked / capacity) * 100);

                    return (
                      <View key={cls.id} style={styles.upcomingClass}>
                        <View style={styles.upcomingClassLeft}>
                          <Text style={styles.upcomingTime}>
                            {cls.class_time.slice(0, 5)}
                          </Text>
                          <Text style={styles.upcomingName}>{cls.name}</Text>
                        </View>
                        <View style={styles.upcomingClassRight}>
                          <Text style={styles.upcomingCount}>
                            {booked}/{capacity}
                          </Text>
                          <View style={styles.upcomingDots}>
                            {Array.from({ length: 4 }).map((_, i) => (
                              <View
                                key={i}
                                style={[
                                  styles.upcomingDot,
                                  {
                                    backgroundColor:
                                      i < Math.round((percentage / 100) * 4)
                                        ? percentage >= 80 ? Colors.danger
                                          : percentage >= 60 ? Colors.warning
                                          : Colors.success
                                        : Colors.card,
                                  },
                                ]}
                              />
                            ))}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Zona de peligro</Text>
          <Pressable
            style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.8 }]}
            onPress={deleteAccount}
          >
            <Text style={styles.deleteButtonText}>Eliminar Cuenta</Text>
          </Pressable>
        </View>

        <View style={{ height: insets.bottom + scale(24) }} />
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingBottom: scale(16),
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  headerLogo: {
    width: scale(36),
    height: scale(36),
    borderRadius: Radius.sm,
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: moderateScale(12),
    color: Colors.textMuted,
    fontWeight: '500',
  },
  logoutBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.7,
  },
  refreshBtn: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  welcomeCard: {
    margin: scale(16),
    padding: scale(16),
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.borderBlue,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(14),
  },
  welcomeIconBox: {
    width: scale(48),
    height: scale(48),
    borderRadius: Radius.md,
    backgroundColor: 'rgba(37,99,235,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeHello: {
    fontSize: moderateScale(24),
  },
  welcomeText: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: scale(2),
  },
  welcomeSub: {
    fontSize: moderateScale(13),
    color: Colors.textSecondary,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: scale(16),
    gap: scale(12),
    marginTop: scale(8),
  },
  menuCard: {
    width: isTablet ? '30%' : '47%',
    padding: scale(16),
    borderRadius: Radius.xl,
    borderWidth: 1,
    minHeight: scale(110),
    gap: scale(6),
  },
  menuCardBlue: {
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderColor: 'rgba(59,130,246,0.25)',
  },
  menuCardAmber: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  menuCardGreen: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  menuCardPurple: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderColor: 'rgba(139,92,246,0.25)',
  },
  menuCardTeal: {
    backgroundColor: 'rgba(20,184,166,0.08)',
    borderColor: 'rgba(20,184,166,0.25)',
  },
  menuCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  menuIconBox: {
    width: scale(40),
    height: scale(40),
    borderRadius: Radius.md,
    backgroundColor: 'rgba(37,99,235,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(4),
  },
  menuTitle: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  menuSubtitle: {
    fontSize: moderateScale(11),
    color: Colors.textMuted,
  },
  statsSection: {
    marginTop: scale(20),
    paddingHorizontal: scale(16),
  },
  statsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(12),
  },
  statsTitle: {
    fontSize: moderateScale(16),
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  loadingContainer: {
    paddingVertical: scale(40),
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: scale(10),
  },
  statCard: {
    flex: 1,
    paddingVertical: scale(14),
    paddingHorizontal: scale(10),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: moderateScale(26),
    fontWeight: '800',
    color: Colors.blue400,
    marginBottom: scale(2),
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: moderateScale(10),
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'center',
  },
  occupancyCard: {
    marginTop: scale(12),
    padding: scale(16),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  occupancyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(10),
  },
  occupancyLabel: {
    fontSize: moderateScale(13),
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  occupancyBarContainer: {
    height: scale(8),
    backgroundColor: Colors.card,
    borderRadius: scale(4),
    overflow: 'hidden',
  },
  occupancyBar: {
    height: '100%',
    borderRadius: scale(4),
  },
  occupancyText: {
    fontSize: moderateScale(18),
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  upcomingSection: {
    marginTop: scale(20),
  },
  upcomingTitle: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: scale(10),
  },
  upcomingClass: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: scale(12),
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginBottom: scale(8),
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  upcomingClassLeft: {
    flex: 1,
    gap: scale(2),
  },
  upcomingTime: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: Colors.blue400,
  },
  upcomingName: {
    fontSize: moderateScale(13),
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  upcomingClassRight: {
    alignItems: 'flex-end',
    gap: scale(4),
  },
  upcomingCount: {
    fontSize: moderateScale(12),
    color: Colors.textMuted,
  },
  upcomingDots: {
    flexDirection: 'row',
    gap: scale(4),
  },
  upcomingDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
  },
  dangerZone: {
    marginTop: scale(24),
    marginHorizontal: scale(16),
    paddingTop: scale(20),
    paddingHorizontal: scale(16),
    paddingBottom: scale(16),
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,68,68,0.2)',
  },
  dangerTitle: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: 'rgba(239,68,68,0.8)',
    marginBottom: scale(12),
  },
  deleteButton: {
    backgroundColor: '#DC2626',
    paddingVertical: scale(14),
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: moderateScale(15),
    fontWeight: '700',
    color: '#fff',
  },
});
