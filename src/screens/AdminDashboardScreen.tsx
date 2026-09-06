import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarbellIcon,
  BellIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ClipboardIcon,
  CreditCardIcon,
  LogoutIcon,
  QuestionIcon,
  RefreshIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { ADMIN_TUTORIAL_STEPS } from '../tutorial/tutorialSteps';
import { useTutorial, useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { DashboardStats, getDashboardStats, getTodayUpcomingClasses } from '../utils/adminStats';
import { AdminFeaturedCard, AdminMenuCard, DashboardHeader, OccupancyBar, SpringPressable, StatCard, UpcomingClassRow } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'>;
  route: RouteProp<RootStackParamList, 'AdminDashboard'>;
};

function DangerButton({ onPress, label }: { onPress: () => void; label: string }) {
  const scaleVal = useSharedValue(1);
  const glowOp = useSharedValue(0.35);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleVal.value }],
    shadowOpacity: glowOp.value,
  }));

  return (
    <Animated.View style={[btnStyle, {
      borderRadius: 12,
      backgroundColor: '#DC2626',
      shadowColor: '#EF4444',
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 16,
      elevation: 8,
    }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scaleVal.value = withSpring(0.95, { damping: 12, stiffness: 280 });
          glowOp.value = withSpring(0.7, { damping: 12, stiffness: 280 });
        }}
        onPressOut={() => {
          scaleVal.value = withSpring(1, { damping: 8, stiffness: 150 });
          glowOp.value = withSpring(0.35, { damping: 8, stiffness: 150 });
        }}
        style={{
          backgroundColor: '#DC2626',
          paddingVertical: scale(16),
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <Text style={{
          fontSize: moderateScale(15),
          fontWeight: '800',
          color: '#fff',
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function AdminDashboardScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const { start: startTutorial } = useTutorial();
  const tutorialAutoStartCheckedRef = useRef(false);
  const cardClasesRef = useTutorialTarget('admin-card-clases');
  const cardUsuariosRef = useTutorialTarget('admin-card-usuarios');
  const cardPlanesRef = useTutorialTarget('admin-card-planes');
  const cardEntrenosRef = useTutorialTarget('admin-card-entrenos');
  const cardVistaUsuarioRef = useTutorialTarget('admin-card-vista-usuario');
  const statsRef = useTutorialTarget('admin-stats');
  // Las 5 cards y la sección de estadísticas viven en el mismo ScrollView —
  // si la pantalla ya estaba en la pila con scroll (popTo la reutiliza tal
  // cual) o "Vista rápida" queda por debajo de lo visible en pantallas
  // bajas, cualquiera de los dos podría quedar tapado/fuera de vista.
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  // Red de seguridad para las 5, no solo la primera: en pantallas pequeñas
  // las últimas cards del grid podrían quedar justo por debajo de lo
  // visible incluso partiendo de scroll 0.
  useTutorialScrollAction('admin-card-clases', scrollToTop);
  useTutorialScrollAction('admin-card-usuarios', scrollToTop);
  useTutorialScrollAction('admin-card-planes', scrollToTop);
  useTutorialScrollAction('admin-card-entrenos', scrollToTop);
  useTutorialScrollAction('admin-card-vista-usuario', scrollToTop);
  useTutorialScrollAction('admin-stats', () => scrollRef.current?.scrollToEnd({ animated: true }));
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

  useEffect(() => {
    if (tutorialAutoStartCheckedRef.current) return;
    tutorialAutoStartCheckedRef.current = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      const { data } = await supabase.from('profiles').select('has_seen_tutorial').eq('id', uid).single();
      if (!data?.has_seen_tutorial) {
        setTimeout(() => startTutorial(ADMIN_TUTORIAL_STEPS), 700);
      }
    })();
  }, []);

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
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
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
              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            } catch (error: any) {
              Alert.alert('Error', `No se pudo eliminar la cuenta: ${error.message}`);
            }
          },
        },
      ]
    );
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH, backgroundColor: Colors.background }}>
        <DashboardHeader
          title="Administración"
          subtitle="La Nave Strength Center"
          topInset={insets.top}
          rightElement={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), flexShrink: 0 }}>
              <SpringPressable
                onPress={() => navigation.navigate('AdminNotifications')}
                style={{
                  width: scale(36), height: scale(36),
                  borderRadius: scale(18),
                  backgroundColor: Colors.card,
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <BellIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={2} />
              </SpringPressable>
              <SpringPressable
                onPress={() => startTutorial(ADMIN_TUTORIAL_STEPS)}
                style={{
                  width: scale(36), height: scale(36),
                  borderRadius: scale(18),
                  backgroundColor: Colors.card,
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <QuestionIcon size={scale(18)} color={Colors.textSecondary} />
              </SpringPressable>
              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: scale(6),
                  paddingHorizontal: scale(12),
                  paddingVertical: scale(8),
                  borderRadius: scale(10),
                  borderWidth: 1,
                  borderColor: pressed ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)',
                  backgroundColor: pressed ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
                })}
              >
                <LogoutIcon size={scale(16)} color="#EF4444" strokeWidth={2} />
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: '#EF4444' }}>
                  Salir
                </Text>
              </Pressable>
            </View>
          }
          logo={
            <View style={{
              width: scale(46), height: scale(46),
              borderRadius: Radius.md,
              backgroundColor: '#ffffff',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(59,130,246,0.25)',
            }}>
              <Image
                source={require('../../assets/logo-white.jpeg')}
                style={{ width: scale(36), height: scale(36) }}
                resizeMode="contain"
              />
            </View>
          }
        />

        <Animated.View
          entering={FadeIn.duration(350)}
          style={{
            margin: scale(16),
            padding: scale(16),
            backgroundColor: 'rgba(37,99,235,0.1)',
            borderRadius: Radius.xl,
            borderWidth: 1,
            borderColor: Colors.borderBlue,
            flexDirection: 'row',
            alignItems: 'center',
            gap: scale(14),
          }}
        >
          <View style={{
            width: scale(48), height: scale(48),
            borderRadius: Radius.md,
            backgroundColor: 'rgba(37,99,235,0.15)',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ShieldIcon size={scale(28)} color={Colors.blue400} strokeWidth={1.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(2) }}>
              Hola, {name || email.split('@')[0]}
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary }}>
              Panel de gestión del gimnasio
            </Text>
          </View>
        </Animated.View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View ref={cardVistaUsuarioRef} collapsable={false} style={{ paddingHorizontal: scale(16), marginTop: scale(8) }}>
            <AdminFeaturedCard
              icon={<CalendarCheckIcon size={scale(28)} color={Colors.blue400} strokeWidth={1.5} />}
              title="Reservas"
              subtitle="Reservar y ver clases como socio"
              onPress={() => navigation.navigate('Reservation', { email, name })}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: scale(16), gap: scale(12), marginTop: scale(12) }}>
            <View ref={cardClasesRef} collapsable={false} style={{ width: '47%' }}>
              <AdminMenuCard
                variant="bronze"
                icon={<CalendarIcon size={scale(28)} color="#C9A66B" />}
                title="Clases"
                subtitle="Crear y gestionar"
                onPress={() => navigation.navigate('AdminClasses')}
                index={0}
              />
            </View>
            <View ref={cardUsuariosRef} collapsable={false} style={{ width: '47%' }}>
              <AdminMenuCard
                variant="steel"
                icon={<UsersIcon size={scale(28)} color="#9CA3C4" />}
                title="Usuarios"
                subtitle="Gestión y plantillas"
                onPress={() => navigation.navigate('AdminUsers')}
                index={1}
              />
            </View>
            <View ref={cardPlanesRef} collapsable={false} style={{ width: '47%' }}>
              <AdminMenuCard
                variant="oxide"
                icon={<CreditCardIcon size={scale(28)} color="#C08272" />}
                title="Planes"
                subtitle="Tarifas y membresías"
                onPress={() => navigation.navigate('AdminPlans')}
                index={2}
              />
            </View>
            <View ref={cardEntrenosRef} collapsable={false} style={{ width: '47%' }}>
              <AdminMenuCard
                variant="slate"
                icon={<BarbellIcon size={scale(28)} color="#6FA8A3" />}
                title="Entrenos"
                subtitle="Pesos por usuario"
                onPress={() => navigation.navigate('AdminWorkout')}
                index={3}
              />
            </View>
          </View>

          {/* Stats Preview */}
          <View ref={statsRef} collapsable={false} style={{ marginTop: scale(20), paddingHorizontal: scale(16) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(12) }}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary }}>
                Vista Rápida
              </Text>
              <Animated.View entering={FadeIn.duration(300).delay(80)}>
                <Pressable
                  onPress={loadDashboardData}
                  style={{
                    width: scale(36), height: scale(36),
                    borderRadius: scale(18),
                    backgroundColor: Colors.card,
                    borderWidth: 1,
                    borderColor: Colors.cardBorder,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <RefreshIcon size={scale(16)} color={Colors.textMuted} />
                </Pressable>
              </Animated.View>
            </View>

            {loading ? (
              <View style={{ paddingVertical: scale(40), alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.blue500} />
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: scale(10) }}>
                  <StatCard number={stats.classesToday} label="Clases hoy" index={0} icon={<CalendarIcon size={scale(16)} color={Colors.blue400} />} />
                  <StatCard number={stats.totalBookings} label="Reservas hoy" index={1} icon={<ClipboardIcon size={scale(16)} color={Colors.blue400} />} />
                  <StatCard number={stats.totalUsers} label="Usuarios" index={2} icon={<UsersIcon size={scale(16)} color={Colors.blue400} />} />
                </View>

                <OccupancyBar label="Ocupación promedio hoy" percentage={stats.occupancyRate} />

                {upcomingClasses.length > 0 && (
                  <View style={{ marginTop: scale(20) }}>
                    <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(10) }}>
                      Próximas clases
                    </Text>
                    {upcomingClasses.map((cls, i) => {
                      const booked = cls.bookings?.length || 0;
                      const capacity = cls.max_spots;
                      return (
                        <UpcomingClassRow
                          key={cls.id}
                          time={cls.class_time.slice(0, 5)}
                          name={cls.name}
                          booked={booked}
                          capacity={capacity}
                          index={i}
                        />
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>

          {/* Danger Zone */}
          <Animated.View
            entering={FadeIn.duration(300).delay(120)}
            style={{
              marginTop: scale(28),
              marginHorizontal: scale(16),
              padding: scale(20),
              backgroundColor: 'rgba(239,68,68,0.06)',
              borderRadius: Radius.xl,
              borderWidth: 1,
              borderColor: 'rgba(239,68,68,0.15)',
            }}
          >
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: scale(8),
              marginBottom: scale(16),
            }}>
              <View style={{
                width: scale(6), height: scale(6),
                borderRadius: scale(3),
                backgroundColor: Colors.danger,
              }} />
              <Text style={{
                fontSize: moderateScale(13),
                fontWeight: '700',
                color: Colors.danger,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}>
                Zona de peligro
              </Text>
            </View>
            <DangerButton onPress={deleteAccount} label="Eliminar Cuenta" />
          </Animated.View>

          <View style={{ height: insets.bottom + scale(24) }} />
        </ScrollView>
      </View>
    </View>
  );
}
