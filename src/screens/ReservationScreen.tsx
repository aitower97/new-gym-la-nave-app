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
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { TrashIcon, WavesIcon, XIcon } from '../components/Icons';
import { BackButton, BookButton } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, moderateScale, scale as s } from '../theme';
import { ClassWithBookings, RootStackParamList, User } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Reservation'>;
  route: RouteProp<RootStackParamList, 'Reservation'>;
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const TYPE_CONFIG = {
  'CROSS TRAINING': { accent: '#3B82F6' },
  'POWERLIFTING':   { accent: '#F59E0B' },
  'HALTEROFILIA':   { accent: '#EF4444' },
  'OPEN BOX':       { accent: '#10B981' },
};

function getOccupancyColor(booked: number, capacity: number): string {
  const ratio = booked / capacity;
  if (ratio >= 1) return '#EF4444';
  if (ratio >= 0.7) return '#F59E0B';
  return '#10B981';
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
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#1a2535',
      borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <Svg width={size} height={size} viewBox="280 280 450 370">
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
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#0f1623' }}
      />
    );
  }
  return <NaveAvatar size={size} />;
}

// ─── CLASS CARD - sin hooks de animación (están en BookButton) ────────
function ClassCard({ classItem, isExpanded, isAdmin, userId, classes, onToggle, onBook, onDelete, onRemoveUser }: {
  classItem: ClassWithBookings;
  isExpanded: boolean;
  isAdmin: boolean;
  userId: string;
  classes: ClassWithBookings[];
  onToggle: () => void;
  onBook: () => void;
  onDelete: () => void;
  onRemoveUser: (userId: string) => void;
}) {
  const isBooked = classItem.isBookedByMe || false;
  const isFull = classItem.status === 'full';
  const isFinished = classItem.status === 'finished';
  const hasBookingToday = classes.some(c => c.isBookedByMe);
  const config = TYPE_CONFIG[classItem.name as keyof typeof TYPE_CONFIG] || TYPE_CONFIG['CROSS TRAINING'];
  const occColor = getOccupancyColor(classItem.bookedUsers.length, classItem.max_spots);
  const free = classItem.max_spots - classItem.bookedUsers.length;
  const bookType = isBooked ? 'booked' : isFull ? 'full' : hasBookingToday ? 'change' : 'book';

  return (
    <View style={{ flex: 1 }}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => ({
          flex: 1,
          backgroundColor: pressed || isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          borderRadius: 14,
          padding: 18,
          borderLeftWidth: 3,
          borderLeftColor: config.accent,
          opacity: pressed ? 0.95 : 1,
        })}
      >
        {/* Top row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            {/* Nombre + plazas */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingRight: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3, textTransform: 'uppercase', flexShrink: 1 }}>
                {classItem.name}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: occColor }} />
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                  {isFull ? 'Completa' : `${free} ${free === 1 ? 'plaza' : 'plazas'}`}
                </Text>
              </View>
            </View>

            {/* Avatares */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 12 }}>
              {classItem.bookedUsers.slice(0, 5).map((user) => (
                <UserAvatar key={user.id} uri={user.avatar} name={user.name} size={28} />
              ))}
              {classItem.bookedUsers.length > 5 && (
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>
                  +{classItem.bookedUsers.length - 5}
                </Text>
              )}
            </View>

            {/* Barra ocupación */}
            <View style={{ width: '100%', height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 10, marginBottom: 10, overflow: 'hidden' }}>
              <View style={{ height: '100%', borderRadius: 2, backgroundColor: occColor, width: `${(classItem.bookedUsers.length / classItem.max_spots) * 100}%` }} />
            </View>
          </View>

          {/* Botón derecha */}
          <View style={{ alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
            {isAdmin ? (
              <Pressable
                onPress={(e) => { e.stopPropagation(); onDelete(); }}
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <TrashIcon size={s(18)} color="#EF4444" strokeWidth={2} />
              </Pressable>
            ) : !isFinished ? (
              <BookButton type={bookType} onPress={onBook} />
            ) : null}
          </View>
        </View>

        {/* Botón cancelar reserva */}
        {!isAdmin && isBooked && (
          <BookButton type="cancel" onPress={onBook} label="Cancelar reserva" />
        )}

        {/* Expanded */}
        {isExpanded && (
          <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              {classItem.bookedUsers.map((user) => (
                <View key={user.id} style={{ width: '30%', alignItems: 'center' }}>
                  <View style={{ position: 'relative' }}>
                    <UserAvatar uri={user.avatar} name={user.name} size={80} />
                    {isAdmin && (
                      <Pressable
                        onPress={() => onRemoveUser(user.id)}
                        style={{
                          position: 'absolute', top: -4, right: -4,
                          width: 18, height: 18, borderRadius: 9,
                          backgroundColor: '#EF4444',
                          alignItems: 'center', justifyContent: 'center', zIndex: 10,
                        }}
                      >
                        <XIcon size={s(10)} color="#fff" strokeWidth={3} />
                      </Pressable>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center', marginTop: 6 }} numberOfLines={1}>
                    {user.name}
                  </Text>
                </View>
              ))}
              {Array.from({ length: free }).map((_, i) => (
                <View key={`empty-${i}`} style={{ width: '30%', alignItems: 'center' }}>
                  <View style={{
                    width: '100%', aspectRatio: 1, borderRadius: 12,
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
                    borderStyle: 'dashed',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                  }}>
                    <Text style={{ fontSize: 24, color: 'rgba(255,255,255,0.2)' }}>+</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center' }}>Libre</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
              {[
                { label: 'Capacidad', value: classItem.max_spots },
                { label: 'Ocupación', value: `${Math.round((classItem.bookedUsers.length / classItem.max_spots) * 100)}%` },
                { label: 'Plazas libres', value: free },
              ].map(({ label, value }) => (
                <View key={label} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginBottom: 4 }}>{label}</Text>
                  <Text style={{ fontSize: 18, color: '#fff', fontWeight: '700' }}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────
export default function ReservationScreen({ navigation, route }: Props) {
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

  const todayIndex = (() => {
    const today = new Date().toDateString();
    return WEEK_DAYS.findIndex(d => d.toDateString() === today);
  })();

  const performScroll = (dayIndex: number, animated: boolean) => {
    if (!daysScrollRef.current || dayIndex === -1) return;
    const scrollX = (dayIndex * dayWidth) - (screenWidth / 2) + (dayWidth / 2);
    daysScrollRef.current.scrollTo({ x: Math.max(0, scrollX), animated });
    currentDayIndexRef.current = dayIndex;
  };

  useEffect(() => {
    let isMounted = true;
    async function initialize() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (user) setUserId(user.id);
      InteractionManager.runAfterInteractions(() => {
        if (!isMounted) return;
        setTimeout(() => { if (isMounted) performScroll(todayIndex, false); }, 100);
      });
    }
    initialize();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (userId) loadClasses();
  }, [selectedDate, userId]);

  async function loadClasses() {
    try {
      setLoading(true);
      const dateStr = selectedDate.toISOString().split('T')[0];
      const { data: classesData, error } = await supabase
        .from('classes').select('*').eq('class_date', dateStr).order('class_time');
      if (error) throw error;
      if (!classesData || classesData.length === 0) { setClasses([]); setLoading(false); return; }

      const classIds = classesData.map(c => c.id);
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`id, class_id, user_id, profiles:user_id (id, full_name, email, avatar_url)`)
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
        return { ...cls, bookedUsers, status, isBookedByMe };
      });
      setClasses(classesWithBookings);
    } catch (error: any) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleBook(classId: string, className: string, classTime: string) {
    const classItem = classes.find(c => c.id === classId);
    if (!classItem) return;
    try {
      if (classItem.isBookedByMe) {
        const { error } = await supabase.from('bookings').delete().eq('class_id', classId).eq('user_id', userId);
        if (error) throw error;
        Alert.alert('Cancelado', 'Reserva cancelada');
        await loadClasses();
      } else {
        const existingBooking = classes.find(c => c.isBookedByMe);
        if (existingBooking) {
          Alert.alert('Cambiar reserva', `Ya tienes reserva a las ${existingBooking.class_time.slice(0, 5)}.\n\n¿Quieres cambiar a las ${classTime.slice(0, 5)}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Cambiar', onPress: async () => {
                try {
                  const { error: deleteError } = await supabase.from('bookings').delete().eq('class_id', existingBooking.id).eq('user_id', userId);
                  if (deleteError) throw deleteError;
                  const { error: insertError } = await supabase.from('bookings').insert({ class_id: classId, user_id: userId });
                  if (insertError) throw insertError;
                  Alert.alert('¡Cambiado! ✅', `Reserva movida a las ${classTime.slice(0, 5)}`);
                  await loadClasses();
                } catch (error: any) {
                  Alert.alert('Error', error.message);
                  await loadClasses();
                }
              }
            },
          ]);
        } else {
          const { error } = await supabase.from('bookings').insert({ class_id: classId, user_id: userId });
          if (error) throw error;
          Alert.alert('¡Reservado! 💪', `${className} - ${classTime.slice(0, 5)}`);
          await loadClasses();
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleDeleteClass(classId: string) {
    try {
      const { data: bookings } = await supabase.from('bookings').select('id').eq('class_id', classId);
      if (bookings && bookings.length > 0) {
        await supabase.from('bookings').delete().in('id', bookings.map(b => b.id));
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
      const { data: booking, error: fetchError } = await supabase.from('bookings').select('id').eq('class_id', classId).eq('user_id', targetUserId).single();
      if (fetchError || !booking) { Alert.alert('Error', 'No se encontró la reserva'); return; }
      const { error } = await supabase.from('bookings').delete().eq('id', booking.id);
      if (error) throw error;
      const { data: check } = await supabase.from('bookings').select('id').eq('id', booking.id).maybeSingle();
      if (check) { Alert.alert('Sin permisos', 'La política de seguridad impide borrar reservas ajenas.'); return; }
      loadClasses();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  const handleDayPress = (date: Date, index: number) => {
    setSelectedDate(date);
    setExpandedId(null);
    performScroll(index, true);
  };

  if (!userId) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0f1a', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0f1a' }}>
      <View style={{ flex: 1, backgroundColor: '#0a0f1a', alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(350).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + s(12),
            paddingBottom: s(16),
            paddingHorizontal: s(20),
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.07)',
            gap: s(12),
          }}
        >
          <BackButton onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: '#fff' }}>
              {isAdmin ? 'Clases del día' : 'Reservar Clases'}
            </Text>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
              {isAdmin ? 'Vista de entrenador' : 'Encuentra tu próximo entrenamiento'}
            </Text>
          </View>
        </Animated.View>

        {/* Days scroll */}
        <View style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
          <ScrollView
            ref={daysScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 4, paddingVertical: 8 }}
          >
            {WEEK_DAYS.map((date, i) => {
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <Pressable
                  key={i}
                  style={{
                    width: dayWidth - 4,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: 'center',
                    backgroundColor: isSelected ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                    borderWidth: isToday && !isSelected ? 2 : 1,
                    borderColor: isSelected ? 'rgba(59,130,246,0.3)' : isToday ? '#F59E0B' : 'rgba(255,255,255,0.05)',
                  }}
                  onPress={() => handleDayPress(date, i)}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {DAY_LETTERS[date.getDay()]}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: isSelected ? '#3B82F6' : 'rgba(255,255,255,0.5)' }}>
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Context bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>
            {DAY_NAMES[selectedDate.getDay()]} {selectedDate.getDate()} · {selectedDate.toLocaleDateString('es-ES', { month: 'long' })}
          </Text>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            {loading ? '...' : `${classes.length} ${classes.length === 1 ? 'clase' : 'clases'}`}
          </Text>
        </View>

        {/* Timeline */}
        <ScrollView style={{ flex: 1, paddingTop: 20, paddingLeft: 8, paddingRight: 20 }} showsVerticalScrollIndicator={false}>
          {loading && classes.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : classes.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20, gap: 8 }}>
              <View style={{ width: s(72), height: s(72), borderRadius: s(36), backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                <WavesIcon size={s(36)} color={Colors.textMuted} strokeWidth={1.5} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.2)' }}>Día de descanso</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>No hay clases programadas</Text>
            </View>
          ) : (
            classes.map((classItem, index) => (
              <View key={classItem.id} style={{ flexDirection: 'row', gap: 0, marginBottom: 16 }}>
                <View style={{ width: 52, flexShrink: 0, alignItems: 'center', paddingTop: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: -0.3, fontFamily: 'monospace' }}>
                    {classItem.class_time.slice(0, 5)}
                  </Text>
                  {index < classes.length - 1 && (
                    <View style={{ width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 8, borderRadius: 1 }} />
                  )}
                </View>

                <ClassCard
                  classItem={classItem}
                  isExpanded={expandedId === classItem.id}
                  isAdmin={isAdmin}
                  userId={userId}
                  classes={classes}
                  onToggle={() => setExpandedId(expandedId === classItem.id ? null : classItem.id)}
                  onBook={() => handleBook(classItem.id, classItem.name, classItem.class_time)}
                  onDelete={() => Alert.alert(
                    'Eliminar clase',
                    `¿Eliminar ${classItem.name} (${classItem.class_time.slice(0, 5)})? Se cancelarán todas las reservas.`,
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Eliminar', style: 'destructive', onPress: () => handleDeleteClass(classItem.id) },
                    ]
                  )}
                  onRemoveUser={(uid) => Alert.alert(
                    'Quitar usuario',
                    '¿Quitar a este usuario de la clase?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Quitar', style: 'destructive', onPress: () => handleRemoveUser(classItem.id, uid) },
                    ]
                  )}
                />
              </View>
            ))
          )}
          <View style={{ height: insets.bottom + 100 }} />
        </ScrollView>
      </View>
    </View>
  );
}
