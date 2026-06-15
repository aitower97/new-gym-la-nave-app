import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  InteractionManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ChevronLeftIcon, TrashIcon, WavesIcon, XIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, scale } from '../theme';
import { ClassWithBookings, RootStackParamList, User } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  route: RouteProp<RootStackParamList, 'Home'>;
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const TYPE_CONFIG = {
  'CROSS TRAINING': { accent: '#3B82F6' },
  'POWERLIFTING': { accent: '#F59E0B' },
  'HALTEROFILIA': { accent: '#EF4444' },
  'OPEN BOX': { accent: '#10B981' },
};

function getOccupancyColor(booked: number, capacity: number): string {
  const ratio = booked / capacity;
  if (ratio >= 1) return '#EF4444';
  if (ratio >= 0.7) return '#F59E0B';
  return '#10B981';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function generateWeekDays(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = -30; i <= 60; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push(date);
  }
  return days;
}

const WEEK_DAYS = generateWeekDays();


const NAVE_PATH = "M494.411835,379.396088 C498.245880,374.650574 501.846252,370.174988 505.863617,365.180969 C511.306396,371.815338 516.358826,377.893463 521.325195,384.041046 C546.672546,415.417389 571.994141,446.814392 597.331604,478.198700 C615.148315,500.267395 633.000427,522.307556 650.741272,544.437073 C651.883911,545.862366 652.812134,547.944458 652.818237,549.724487 C652.933289,583.557068 652.895752,617.390137 652.874207,651.223145 C652.873901,651.655457 652.669312,652.087585 652.315979,653.486023 C646.567871,646.244568 641.252686,639.593445 635.988281,632.902405 C631.571045,627.288330 627.445679,621.424072 622.750549,616.055908 C619.375427,612.196838 617.686707,608.279602 617.909241,603.037048 C618.297668,593.887024 618.222595,584.700317 617.863098,575.547729 C617.774658,573.295593 616.393127,570.436768 614.656494,569.024597 C608.272583,563.833557 601.489319,559.133606 593.911255,553.552856 C593.911255,572.471069 593.911255,590.295959 593.911255,609.254944 C590.194824,606.935913 587.405273,605.275574 584.697144,603.491638 C572.621460,595.536743 560.508362,587.635437 548.571838,579.476074 C546.720825,578.210754 544.956665,575.890015 544.438232,573.746399 C539.058228,551.499268 534.043762,529.164124 528.726807,506.901367 C522.019165,478.815460 515.131958,450.772339 508.291473,422.718292 C507.893341,421.085541 507.219910,419.519928 506.674622,417.923065 C506.218018,417.909668 505.761414,417.896301 505.304810,417.882904 C504.699005,419.429199 503.897400,420.928772 503.515839,422.528503 C491.464996,473.052979 479.469910,523.590698 467.371582,574.103760 C466.980255,575.737671 465.953156,577.668152 464.620026,578.558838 C449.705536,588.523560 434.673553,598.312500 419.660919,608.130005 C419.423065,608.285583 419.030304,608.204407 418.126099,608.287048 C418.126099,590.390259 418.126099,572.543762 418.126099,553.427917 C409.867767,559.472595 402.500214,564.687683 395.401001,570.245605 C394.286591,571.118103 394.012604,573.541565 393.992279,575.255493 C393.871796,585.420593 394.027283,595.589294 393.872803,605.753418 C393.841827,607.790039 393.429352,610.240906 392.248901,611.774109 C381.815369,625.325500 371.170868,638.714539 360.573456,652.139465 C360.309143,652.474243 359.869598,652.670654 358.943634,653.345947 C358.943634,649.714050 358.943481,646.611450 358.943665,643.508789 C358.945465,612.842285 358.876465,582.175415 359.072906,551.510132 C359.090118,548.827515 360.216553,545.648132 361.894958,543.555237 C390.038086,508.461029 418.351654,473.503571 446.626373,438.514923 C462.477905,418.899353 478.327606,399.282349 494.411835,379.396088 Z";

function NaveAvatar({ size }: { size: number }) {
  const scale = size / 340;   // el logo ocupa ~340px del viewBox 1024
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1a2535',
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <Svg
        width={size}
        height={size}
        viewBox="280 280 450 370"
      >
        <Path d={NAVE_PATH} fill="rgba(255,255,255,0.6)" />
      </Svg>
    </View>
  );
}

function UserAvatar({ uri, name, size }: { uri: string | null; name: string; size: number }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2,
                 borderWidth: 2, borderColor: '#0f1623' }}
      />
    );
  }
  return <NaveAvatar size={size} />;
}

export default function HomeScreen({ navigation, route }: Props) {
  const { email, name, isAdmin = false } = route.params;
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassWithBookings[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  
  const daysScrollRef = useRef<ScrollView>(null);
  const currentDayIndexRef = useRef<number>(-1);
  
  const { width: screenWidth } = Dimensions.get('window');
  const dayWidth = (screenWidth - 40) / 7;

  // Calcular índice de hoy
  const todayIndex = (() => {
    const today = new Date().toDateString();
    return WEEK_DAYS.findIndex(d => d.toDateString() === today);
  })();

  // Función de scroll que NO causa re-renders
  const performScroll = (dayIndex: number, animated: boolean) => {
    if (!daysScrollRef.current || dayIndex === -1) return;
    
    const scrollX = (dayIndex * dayWidth) - (screenWidth / 2) + (dayWidth / 2);
    daysScrollRef.current.scrollTo({
      x: Math.max(0, scrollX),
      animated,
    });
    
    currentDayIndexRef.current = dayIndex;
  };

  // Inicialización: userId + scroll a hoy
  useEffect(() => {
    let isMounted = true;

    async function initialize() {
      // 1. Obtener userId
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;
      
      if (user) {
        setUserId(user.id);
      }

      // 2. Esperar a que la UI esté lista
      InteractionManager.runAfterInteractions(() => {
        if (!isMounted) return;
        
        // Scroll a hoy después de que todo esté renderizado
        setTimeout(() => {
          if (isMounted) {
            performScroll(todayIndex, false);
          }
        }, 100);
      });
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, []); // Solo al montar

  // Cargar clases cuando cambia la fecha seleccionada
  useEffect(() => {
    if (userId) {
      loadClasses();
    }
  }, [selectedDate, userId]);

  async function loadClasses() {
    try {
      setLoading(true);
      
      const dateStr = selectedDate.toISOString().split('T')[0];
      
      const { data: classesData, error: classesError } = await supabase
        .from('classes')
        .select('*')
        .eq('class_date', dateStr)
        .order('class_time');

      if (classesError) throw classesError;

      if (!classesData || classesData.length === 0) {
        setClasses([]);
        setLoading(false);
        return;
      }

      const classIds = classesData.map(c => c.id);
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          class_id,
          user_id,
          profiles:user_id (
            id,
            full_name,
            email,
            avatar_url
          )
        `)
        .in('class_id', classIds);

      if (bookingsError) throw bookingsError;

      const now = new Date();
      const classesWithBookings: ClassWithBookings[] = classesData.map(cls => {
        const classBookings = bookingsData?.filter(b => b.class_id === cls.id) || [];
        
        const bookedUsers: User[] = classBookings.map((booking: any) => ({
          id: booking.profiles.id,
          name: booking.profiles.full_name || booking.profiles.email.split('@')[0],
          avatar: booking.profiles.avatar_url || null,
        }));

        const isBookedByMe = classBookings.some((b: any) => b.user_id === userId);
        
        const classDateTime = new Date(`${cls.class_date}T${cls.class_time}`);
        const isFinished = classDateTime < now;
        const isFull = classBookings.length >= cls.max_spots;
        
        let status: 'available' | 'full' | 'finished' = 'available';
        if (isFinished) status = 'finished';
        else if (isFull) status = 'full';

        return {
          ...cls,
          bookedUsers,
          status,
          isBookedByMe,
        };
      });

      setClasses(classesWithBookings);
      setLoading(false);
    } catch (error: any) {
      console.error('Error loading classes:', error);
      setLoading(false);
    }
  }

  async function handleBook(classId: string, className: string, classTime: string) {
    const classItem = classes.find(c => c.id === classId);
    if (!classItem) return;

    try {
      if (classItem.isBookedByMe) {
        // Cancelar reserva actual
        const { error } = await supabase
          .from('bookings')
          .delete()
          .eq('class_id', classId)
          .eq('user_id', userId);

        if (error) throw error;

        Alert.alert('Cancelado', 'Reserva cancelada');
        await loadClasses();
      } else {
        // Verificar si ya tiene reserva ese día
        const existingBooking = classes.find(c => c.isBookedByMe);
        
        if (existingBooking) {
          // Ya tiene reserva → Preguntar si quiere cambiar
          Alert.alert(
            'Cambiar reserva',
            `Ya tienes reserva a las ${existingBooking.class_time.slice(0, 5)}.\n\n¿Quieres cambiar a las ${classTime.slice(0, 5)}?`,
            [
              {
                text: 'Cancelar',
                style: 'cancel',
              },
              {
                text: 'Cambiar',
                onPress: async () => {
                  try {
                    // Operación atómica: cancelar + reservar
                    // 1. Cancelar reserva anterior
                    const { error: deleteError } = await supabase
                      .from('bookings')
                      .delete()
                      .eq('class_id', existingBooking.id)
                      .eq('user_id', userId);

                    if (deleteError) throw deleteError;

                    // 2. Crear nueva reserva
                    const { error: insertError } = await supabase
                      .from('bookings')
                      .insert({
                        class_id: classId,
                        user_id: userId,
                      });

                    if (insertError) throw insertError;

                    Alert.alert(
                      '¡Cambiado! ✅', 
                      `Reserva movida a las ${classTime.slice(0, 5)}`
                    );
                    
                    await loadClasses();
                  } catch (error: any) {
                    Alert.alert('Error', error.message);
                    // Si falla, recargar para ver estado real
                    await loadClasses();
                  }
                },
              },
            ]
          );
        } else {
          // No tiene reserva → Reservar directamente
          const { error } = await supabase
            .from('bookings')
            .insert({
              class_id: classId,
              user_id: userId,
            });

          if (error) throw error;

          Alert.alert('¡Reservado! 💪', `${className} - ${classTime.slice(0, 5)}`);
          await loadClasses();
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
      console.error(error);
    }
  }

  async function handleDeleteClass(classId: string) {
    try {
      // Con RLS: borrar reservas requiere hacerlo una a una con el id
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('class_id', classId);

      if (bookings && bookings.length > 0) {
        await supabase
          .from('bookings')
          .delete()
          .in('id', bookings.map(b => b.id));
      }

      const { error } = await supabase.from('classes').delete().eq('id', classId);
      if (error) throw error;
      Alert.alert('Eliminada', 'Clase eliminada correctamente');
      loadClasses();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleRemoveUser(classId: string, targetUserId: string) {
    try {
      // 1. Buscar el id de la reserva concreta
      const { data: booking, error: fetchError } = await supabase
        .from('bookings')
        .select('id')
        .eq('class_id', classId)
        .eq('user_id', targetUserId)
        .single();

      if (fetchError || !booking) {
        Alert.alert('Error', 'No se encontró la reserva');
        return;
      }

      // 2. Borrar por id (puede pasar RLS si la política lo permite por id)
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', booking.id);

      if (error) throw error;

      // 3. Verificar que se borró (RLS silencioso)
      const { data: check } = await supabase
        .from('bookings')
        .select('id')
        .eq('id', booking.id)
        .maybeSingle();

      if (check) {
        // Sigue existiendo — RLS bloqueó. Necesita política admin en Supabase.
        Alert.alert(
          'Sin permisos',
          'La política de seguridad de Supabase impide al admin borrar reservas ajenas.\n\nEn el dashboard de Supabase, ve a Authentication → Policies → bookings → añade política DELETE para admins.'
        );
        return;
      }

      loadClasses();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  const handleDayPress = (date: Date, index: number) => {    setSelectedDate(date);
    setExpandedId(null);
    
    // Scroll inmediato sin esperar
    performScroll(index, true);
  };

  if (!userId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
      {/* Header con botón volver */}
      <View style={[styles.header, { paddingTop: insets.top + scale(10) }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{isAdmin ? 'Clases del día' : 'Reservar Clases'}</Text>
          <Text style={styles.headerSubtitle}>{isAdmin ? 'Vista de entrenador' : 'Encuentra tu próximo entrenamiento'}</Text>
        </View>
      </View>

      <View style={styles.daysRow}>
        <ScrollView 
          ref={daysScrollRef}
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.daysContent}
        >
          {WEEK_DAYS.map((date, i) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const isToday = date.toDateString() === new Date().toDateString();
            const letter = DAY_LETTERS[date.getDay()];
            const num = date.getDate();
            
            return (
              <Pressable
                key={i}
                style={[
                  styles.dayBtn, 
                  { width: dayWidth - 4 },
                  isToday && styles.dayBtnToday,
                  isSelected && styles.dayBtnActive,
                ]}
                onPress={() => handleDayPress(date, i)}
              >
                <Text style={[styles.dayLetter, isSelected && styles.dayLetterActive]}>
                  {letter}
                </Text>
                <Text style={[styles.dayNum, isSelected && styles.dayNumActive]}>
                  {num}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.contextBar}>
        <Text style={styles.contextDate}>
          {DAY_NAMES[selectedDate.getDay()]} {selectedDate.getDate()} · {selectedDate.toLocaleDateString('es-ES', { month: 'long' })}
        </Text>
        <Text style={styles.contextCount}>
          {loading ? '...' : `${classes.length} ${classes.length === 1 ? 'clase' : 'clases'}`}
        </Text>
      </View>

      <ScrollView 
        style={styles.timeline}
        showsVerticalScrollIndicator={false}
      >
        {loading && classes.length === 0 ? (
          <View style={[styles.emptyState, { paddingTop: 40 }]}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <WavesIcon size={scale(36)} color={Colors.textMuted} strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>Día de descanso</Text>
            <Text style={styles.emptyText}>No hay clases programadas</Text>
          </View>
        ) : (
          classes.map((classItem, index) => {
            const isExpanded = expandedId === classItem.id;
            const isBooked = classItem.isBookedByMe || false;
            const isFull = classItem.status === 'full';
            const isFinished = classItem.status === 'finished';
            const hasBookingToday = classes.some(c => c.isBookedByMe);
            const config = TYPE_CONFIG[classItem.name as keyof typeof TYPE_CONFIG] || TYPE_CONFIG['CROSS TRAINING'];
            const occColor = getOccupancyColor(classItem.bookedUsers.length, classItem.max_spots);
            const free = classItem.max_spots - classItem.bookedUsers.length;

            return (
              <View key={classItem.id} style={styles.timelineRow}>
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{classItem.class_time.slice(0, 5)}</Text>
                  {index < classes.length - 1 && (
                    <View style={styles.timeLine} />
                  )}
                </View>

                <Pressable
                  style={[
                    styles.classCard,
                    isExpanded && styles.classCardExpanded,
                    { borderLeftColor: config.accent },
                  ]}
                  onPress={() => setExpandedId(isExpanded ? null : classItem.id)}
                >
                  {/* Top row */}
                  <View style={styles.cardTopWrapper}>
                    <View style={styles.cardTop}>
                      <View style={styles.cardLeft}>
                        <View style={styles.cardTitle}>
                          <Text style={styles.cardName}>{classItem.name}</Text>
                          <View style={styles.statusDot}>
                            <View style={[styles.dot, { backgroundColor: occColor }]} />
                            <Text style={styles.statusText}>
                              {isFull ? 'Completa' : `${free} ${free === 1 ? 'plaza' : 'plazas'}`}
                            </Text>
                          </View>
                        </View>
                        
                        <View style={styles.avatarStack}>
                          {classItem.bookedUsers.slice(0, 5).map((user, i) => (
                            <UserAvatar
                              key = {user.id}
                              uri = { user.avatar }
                              name = { user.name }
                              size = { 28 }
                            />
                          ))}
                          {classItem.bookedUsers.length > 5 && (
                            <Text style={styles.avatarExtra}>
                              +{classItem.bookedUsers.length - 5}
                            </Text>
                          )}
                        </View>

                        <View style={styles.occBar}>
                          <View 
                            style={[
                              styles.occFill, 
                              { 
                                width: `${(classItem.bookedUsers.length / classItem.max_spots) * 100}%`,
                                backgroundColor: occColor 
                              }
                            ]} 
                          />
                        </View>
                      </View>

                      <View style={styles.cardRight}>
                        {isAdmin ? (
                          <Pressable
                            style={styles.adminDeleteBtn}
                            onPress={(e) => {
                              e.stopPropagation();
                              Alert.alert(
                                'Eliminar clase',
                                `¿Eliminar ${classItem.name} (${classItem.class_time.slice(0,5)})? Se cancelarán todas las reservas.`,
                                [
                                  { text: 'Cancelar', style: 'cancel' },
                                  { text: 'Eliminar', style: 'destructive', onPress: () => handleDeleteClass(classItem.id) },
                                ]
                              );
                            }}
                          >
                            <TrashIcon size={scale(18)} color="#EF4444" strokeWidth={2} />
                          </Pressable>
                        ) : (
                          !isFinished && (
                            <Pressable 
                              style={[
                                styles.quickBookBtn,
                                isBooked && styles.quickBookBtnBooked,
                                isFull && !isBooked && styles.quickBookBtnFull,
                                !isBooked && !isFull && hasBookingToday && styles.quickBookBtnChange,
                              ]}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleBook(classItem.id, classItem.name, classItem.class_time);
                              }}
                              disabled={isFull && !isBooked}
                            >
                              <Text style={styles.quickBookIcon}>
                                {isBooked ? '✓' : isFull ? '⊘' : hasBookingToday ? '↻' : '+'}
                              </Text>
                            </Pressable>
                          )
                        )}
                      </View>
                    </View>

                    {/* Badge FUERA de cardTop */}
                    {!isAdmin && isBooked && (
                        <Pressable 
                          style={({ pressed }) => [
                            styles.cancelBadgeBtn,
                            pressed && styles.cancelBadgeBtnPressed,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleBook(classItem.id, classItem.name, classItem.class_time);
                          }}
                        >
                          <Text style={styles.cancelBadgeText}>Cancelar reserva</Text>
                        </Pressable>
                      )}
                  </View>

                  {isExpanded && (
                    <View style={styles.expandedContent}>
                      <View style={styles.photosGrid}>
                        {classItem.bookedUsers.map((user) => (
                          <View key={user.id} style={styles.photoItem}>
                            <View style={{ position: 'relative' }}>
                              <UserAvatar 
                                uri = { user.avatar }
                                name = { user.name }
                                size = {80}
                              />
                              {isAdmin && (
                                <Pressable
                                  style={styles.removeUserBtn}
                                  onPress={() => {
                                    Alert.alert(
                                      'Quitar usuario',
                                      `¿Quitar a ${user.name} de esta clase?`,
                                      [
                                        { text: 'Cancelar', style: 'cancel' },
                                        { text: 'Quitar', style: 'destructive', onPress: () => handleRemoveUser(classItem.id, user.id) },
                                      ]
                                    );
                                  }}
                                >
                                  <XIcon size={scale(10)} color="#fff" strokeWidth={3} />
                                </Pressable>
                              )}
                            </View>
                            <Text style={styles.photoName} numberOfLines={1}>
                              {user.name}
                            </Text>
                          </View>
                        ))}
                        {Array.from({ length: free }).map((_, i) => (
                          <View key={`empty-${i}`} style={styles.photoItem}>
                            <View style={styles.photoEmpty}>
                              <Text style={styles.photoEmptyIcon}>+</Text>
                            </View>
                            <Text style={styles.photoName}>Libre</Text>
                          </View>
                        ))}
                      </View>

                      <View style={styles.stats}>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Capacidad</Text>
                          <Text style={styles.statValue}>{classItem.max_spots}</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Ocupación</Text>
                          <Text style={styles.statValue}>
                            {Math.round((classItem.bookedUsers.length / classItem.max_spots) * 100)}%
                          </Text>
                        </View>
                        <View style={styles.statItem}>
                          <Text style={styles.statLabel}>Plazas libres</Text>
                          <Text style={styles.statValue}>{free}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
    </View>
  );
}

// ... (mantén TODOS los estilos exactamente iguales)

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  daysRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  daysContent: {
    paddingHorizontal: 20,
    gap: 4,
    paddingVertical: 8,
  },
  dayBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  dayBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  dayBtnToday: {
    borderColor: '#F59E0B',
    borderWidth: 2,
  },
  dayLetter: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.25)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dayLetterActive: {
    color: 'rgba(255,255,255,0.6)',
  },
  dayNum: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
  },
  dayNumActive: {
    color: '#3B82F6',
  },
  contextBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  contextDate: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '500',
  },
  contextCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'monospace',
  },
  timeline: {
    flex: 1,
    paddingTop: 20,
    paddingLeft: 8,
    paddingRight: 20,
    paddingBottom: 100,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 0,
    marginBottom: 16,
  },
  timeColumn: {
    width: 52,
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 2,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: -0.3,
    fontFamily: 'monospace',
  },
  timeLine: {
    width: 2,
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 8,
    borderRadius: 1,
  },
  classCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 18,
    borderLeftWidth: 3,
  },
  classCardExpanded: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 4,
    paddingRight: 10,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 12,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#0f1623',
  },
  avatarExtra: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0, // ← No se comprime
    marginLeft: 8, // ← Se queda a la derecha
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  occBar: {
    width: '100%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 10,
    marginBottom: 10,  // ← AÑADIR espacio después
    overflow: 'hidden',
  },
  occFill: {
    height: '100%',
    borderRadius: 2,
  },
  cardRight: {
    gap: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  quickBookBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  quickBookBtnBooked: {
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
  },
  quickBookBtnFull: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowOpacity: 0,
  },
  quickBookIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  expandedContent: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  photoItem: {
    width: '30%',
    alignItems: 'center',
  },
  photoImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 6,
  },
  photoEmpty: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  photoEmptyIcon: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.2)',
  },
  photoName: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    color: '#fff',
    fontWeight: '700',
  },
  bookButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  bookButtonBooked: {
    backgroundColor: '#EF4444',
  },
  bookButtonChange: {
    backgroundColor: '#F59E0B',
  },
  bookButtonFull: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  bookButtonContainer: {
    alignItems: 'center',
    gap: 6,
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyIconBox: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.2)',
  },
  emptyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.2)',
    marginTop: 4,
  },
  cancelBadgeBtn: {
    backgroundColor: '#EF4444',  // Rojo para cancelar
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cancelBadgeBtnPressed: {
    backgroundColor: '#DC2626',
    opacity: 0.9,
  },
  cancelBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickBookBtnChange: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  adminDeleteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeUserBtn: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  cardTopWrapper: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  scrollView: {
    flex: 1,
  },
});