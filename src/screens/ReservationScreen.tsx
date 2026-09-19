import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  InteractionManager,
  ScrollView,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WavesIcon } from '../components/Icons';
import { ClassCard, ContextBar, DaySelector, EmptyState, ScreenHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, scale as s } from '../theme';
import { ClassWithBookings, RootStackParamList, User } from '../types/navigation';
import { isUserAdmin } from '../utils/auth';
import { createNotification, createNotificationsForUsers } from '../utils/notifications';
import { checkBookingAllowed } from '../utils/planEnforcement';
import { WaitlistEntry, checkCanJoinWaitlist, getMyWaitlistEntry, joinWaitlist, leaveWaitlist } from '../utils/waitlist';
import { toDateStr } from '../utils/planPayments';
import { DEFAULT_CUTOFF_HOURS, getBookingCutoffHours, getUnlockDate, isWithinCutoff } from '../utils/bookingSettings';
import { useTutorialTarget } from '../tutorial/TutorialContext';
import { getPublicName } from '../utils/user';
import { classTypeColorMap, DEFAULT_CLASS_TYPE_COLOR, getClassTypes } from '../utils/classTypes';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Reservation'>;
  route: RouteProp<RootStackParamList, 'Reservation'>;
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

// ─── MAIN SCREEN ─────────────────────────────────────────────────────
export default function ReservationScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassWithBookings[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [cutoffHours, setCutoffHours] = useState(DEFAULT_CUTOFF_HOURS);
  const [typeColors, setTypeColors] = useState<Record<string, string>>({});
  // Solo puede haber una: la base impide estar en dos listas a la vez.
  const [miEspera, setMiEspera] = useState<WaitlistEntry | null>(null);

  const daysScrollRef = useRef<ScrollView>(null);
  const currentDayIndexRef = useRef<number>(-1);
  const classListRef = useTutorialTarget('reservation-class-list');
  const daySelectorRef = useTutorialTarget('reservation-day-selector');

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
      isUserAdmin().then((admin) => { if (isMounted) setIsAdmin(admin); });
      getBookingCutoffHours().then((hours) => { if (isMounted) setCutoffHours(hours); });
      getClassTypes().then((data) => { if (isMounted) setTypeColors(classTypeColorMap(data)); }).catch(() => {});
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
  }, [selectedDate, userId, isAdmin, cutoffHours]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userId) loadClasses();
    });
    return unsubscribe;
  }, [navigation, userId, selectedDate, isAdmin]);

  async function loadClasses() {
    try {
      setLoading(true);
      // toDateStr usa año/mes/día LOCALES del día elegido en el selector —
      // toISOString() convierte a UTC antes de recortar la fecha, y en
      // España (UTC+1/+2) eso desplaza medianoche local al día ANTERIOR: se
      // pedían las clases del día equivocado (p. ej. tocar "sábado" traía
      // las clases reales del viernes, un día real con clases).
      const dateStr = toDateStr(selectedDate);
      const { data: classesData, error } = await supabase
        .from('classes').select('*').eq('class_date', dateStr).order('class_time');
      if (error) throw error;
      if (!classesData || classesData.length === 0) { setClasses([]); setLoading(false); return; }

      const classIds = classesData.map(c => c.id);
      // Roster público: todos ven apodo + foto de los apuntados (vista que solo
      // expone datos públicos). Nunca nombre completo/email/teléfono.
      const { data: rosterData, error: rosterError } = await supabase
        .from('class_roster')
        .select('class_id, user_id, username, avatar_url')
        .in('class_id', classIds);
      if (rosterError) throw rosterError;

      // El admin ve además nombre completo y email (la RLS de profiles se lo
      // permite); el resto de usuarios no reciben esos campos.
      const fullById: Record<string, { full_name: string | null; email: string | null }> = {};
      if (isAdmin) {
        const userIds = Array.from(new Set((rosterData || []).map((r: any) => r.user_id)));
        if (userIds.length > 0) {
          const { data: fullData } = await supabase
            .from('profiles').select('id, full_name, email').in('id', userIds);
          (fullData || []).forEach((p: any) => { fullById[p.id] = { full_name: p.full_name, email: p.email }; });
        }
      }

      const now = new Date();
      const classesWithBookings: ClassWithBookings[] = classesData.map(cls => {
        const classBookings = (rosterData || []).filter((r: any) => r.class_id === cls.id);
        const bookedUsers: User[] = classBookings.map((r: any) => ({
          id: r.user_id,
          name: getPublicName(r),
          avatar: r.avatar_url || null,
          fullName: fullById[r.user_id]?.full_name || null,
          email: fullById[r.user_id]?.email || null,
        }));
        const isBookedByMe = classBookings.some((r: any) => r.user_id === userId);
        const classDateTime = new Date(`${cls.class_date}T${cls.class_time}`);
        const isFinished = classDateTime < now;
        const isFull = classBookings.length >= cls.max_spots;
        let status: 'available' | 'full' | 'finished' = 'available';
        if (isFinished) status = 'finished';
        else if (isFull) status = 'full';
        // El admin siempre ve las clases desbloqueadas (gestiona sin la restricción de antelación).
        const unlockAt = !isAdmin && !isFinished && isWithinCutoff(cls.class_date, cls.class_time, cutoffHours, now)
          ? getUnlockDate(cls.class_date, cls.class_time, cutoffHours).toISOString()
          : null;
        return { ...cls, bookedUsers, status, isBookedByMe, unlockAt };
      });
      setClasses(classesWithBookings);
      if (userId && !isAdmin) setMiEspera(await getMyWaitlistEntry(userId));
    } catch (error: any) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  }

  /** Apuntarse o salir de la lista de espera de una clase llena. */
  async function handleWaitlist(classId: string, className: string, classTime: string) {
    try {
      if (miEspera?.classId === classId) {
        await leaveWaitlist(userId, classId);
        setMiEspera(null);
        Alert.alert('Fuera de la lista', 'Ya no estás en la lista de espera de esta clase.');
        await loadClasses();
        return;
      }

      const check = await checkCanJoinWaitlist(userId, classId);
      if (!check.allowed) {
        Alert.alert('No puedes apuntarte', check.reason);
        return;
      }

      await joinWaitlist(userId, classId);
      await loadClasses();
      Alert.alert(
        'Estás en la lista de espera',
        `${className} - ${classTime.slice(0, 5)}

Si alguien cancela, entrarás automáticamente y te avisaremos. No hace falta que estés pendiente.`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleBook(classId: string, className: string, classTime: string) {
    if (isAdmin) { Alert.alert('Modo administrador', 'No puedes reservar desde la vista de administrador.'); return; }
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
          const check = await checkBookingAllowed(userId, classItem.class_date, classItem.class_time);
          if (!check.allowed) {
            Alert.alert('No se puede reservar', check.reason);
            return;
          }
          Alert.alert('Cambiar reserva', `Ya tienes reserva a las ${existingBooking.class_time.slice(0, 5)}.\n\n¿Quieres cambiar a las ${classTime.slice(0, 5)}?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Cambiar', onPress: async () => {
                try {
                  const { error: deleteError } = await supabase.from('bookings').delete().eq('class_id', existingBooking.id).eq('user_id', userId);
                  if (deleteError) throw deleteError;
                  const { error: insertError } = await supabase.from('bookings').insert({ class_id: classId, user_id: userId });
                  if (insertError) throw insertError;
                  Alert.alert('¡Cambiado!', `Reserva movida a las ${classTime.slice(0, 5)}`);
                  await loadClasses();
                } catch (error: any) {
                  Alert.alert('Error', error.message);
                  await loadClasses();
                }
              }
            },
          ]);
        } else {
          const check = await checkBookingAllowed(userId, classItem.class_date, classItem.class_time);
          if (!check.allowed) {
            Alert.alert('No se puede reservar', check.reason);
            return;
          }
          const { error } = await supabase.from('bookings').insert({ class_id: classId, user_id: userId });
          if (error) throw error;
          // Si la reserva sale de la prueba gratuita conviene decirlo: si no,
          // el socio gasta su única clase sin saber que lo era.
          if (check.freeTrial) {
            Alert.alert(
              '¡Reservado! Esta es tu clase de prueba',
              `${className} - ${classTime.slice(0, 5)}

Es tu clase gratuita. Si no puedes venir, cancélala antes de que empiece y la recuperas.`
            );
          } else {
            Alert.alert('¡Reservado!', `${className} - ${classTime.slice(0, 5)}`);
          }
          await loadClasses();
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  async function handleDeleteClass(classId: string) {
    try {
      const classItem = classes.find(c => c.id === classId);
      const affectedUserIds = classItem?.bookedUsers.map(u => u.id) || [];

      const { data: bookings } = await supabase.from('bookings').select('id').eq('class_id', classId);
      if (bookings && bookings.length > 0) {
        await supabase.from('bookings').delete().in('id', bookings.map(b => b.id));
      }
      const { error } = await supabase.from('classes').delete().eq('id', classId);
      if (error) throw error;

      if (affectedUserIds.length > 0 && classItem) {
        const date = new Date(classItem.class_date + 'T00:00:00');
        const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        createNotificationsForUsers(affectedUserIds, {
          type: 'class_cancelled',
          title: 'Clase cancelada',
          message: `La clase de ${classItem.class_type} del ${formattedDate} a las ${classItem.class_time.slice(0, 5)} ha sido cancelada.`,
          classId,
        });
      }

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

      const classItem = classes.find(c => c.id === classId);
      if (classItem) {
        const date = new Date(classItem.class_date + 'T00:00:00');
        const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        createNotification({
          userId: targetUserId,
          type: 'booking_removed',
          title: 'Reserva cancelada',
          message: `El administrador ha cancelado tu reserva en la clase de ${classItem.class_type} del ${formattedDate} a las ${classItem.class_time.slice(0, 5)}.`,
          classId,
        });
      }

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

  const dateLabel = `${DAY_NAMES[selectedDate.getDay()]} ${selectedDate.getDate()} · ${selectedDate.toLocaleDateString('es-ES', { month: 'long' })}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0f1a' }}>
      <View style={{ flex: 1, backgroundColor: '#0a0f1a', alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Header - componente migrado */}
        <ScreenHeader
          title={isAdmin ? 'Clases del día' : 'Reservar Clases'}
          subtitle={isAdmin ? 'Vista de entrenador' : 'Encuentra tu próximo entrenamiento'}
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        {/* Days selector - componente migrado */}
        <View ref={daySelectorRef} collapsable={false}>
          <DaySelector
            ref={daysScrollRef}
            days={WEEK_DAYS}
            selectedDate={selectedDate}
            onSelect={handleDayPress}
            dayWidth={dayWidth}
          />
        </View>

        {/* Context bar - componente migrado, con pulso animado */}
        <ContextBar dateLabel={dateLabel} count={classes.length} loading={loading} />

        {/* Timeline */}
        <View ref={classListRef} collapsable={false} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1, paddingTop: 20, paddingLeft: 8, paddingRight: 20 }} showsVerticalScrollIndicator={false}>
          {loading && classes.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : classes.length === 0 ? (
            <EmptyState
              icon={<WavesIcon size={s(36)} color={Colors.textMuted} strokeWidth={1.5} />}
              title="Día de descanso"
              subtitle="No hay clases programadas"
            />
          ) : (
            classes.map((classItem, index) => (
              <Animated.View
                key={classItem.id}
                entering={FadeInDown.delay(index * 60).duration(320).springify()}
                style={{ flexDirection: 'row', gap: 0, marginBottom: 16 }}
              >
                <View style={{ width: 52, flexShrink: 0, alignItems: 'center', paddingTop: 2 }}>
                  <Animated.Text
                    style={{
                      fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.4)',
                      letterSpacing: -0.3, fontFamily: 'monospace',
                    }}
                  >
                    {classItem.class_time.slice(0, 5)}
                  </Animated.Text>
                  {index < classes.length - 1 && (
                    <View style={{ width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 8, borderRadius: 1 }} />
                  )}
                </View>

                <ClassCard
                  classItem={classItem}
                  isExpanded={expandedId === classItem.id}
                  isAdmin={isAdmin}
                  classes={classes}
                  accentColor={typeColors[classItem.name] ?? DEFAULT_CLASS_TYPE_COLOR}
                  onToggle={() => setExpandedId(expandedId === classItem.id ? null : classItem.id)}
                  onBook={() => handleBook(classItem.id, classItem.name, classItem.class_time)}
                  waitlistPosition={miEspera?.classId === classItem.id ? miEspera.position : null}
                  onWaitlist={isAdmin ? undefined : () => handleWaitlist(classItem.id, classItem.name, classItem.class_time)}
                  onAddUser={() => navigation.navigate('AdminClassPreBook', { classId: classItem.id })}
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
              </Animated.View>
            ))
          )}
          <View style={{ height: insets.bottom + 100 }} />
        </ScrollView>
        </View>
      </View>
    </View>
  );
}
