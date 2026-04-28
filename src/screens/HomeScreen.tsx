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
import { supabase } from '../lib/supabase';
import { ClassWithBookings, RootStackParamList, User } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
  route: RouteProp<RootStackParamList, 'Home'>;
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const TYPE_CONFIG = {
  'CROSS TRAINING': { accent: '#3B82F6', icon: '⚡' },
  'POWERLIFTING': { accent: '#F59E0B', icon: '🏋️' },
  'HALTEROFILIA': { accent: '#EF4444', icon: '🔴' },
  'OPEN BOX': { accent: '#10B981', icon: '🟢' },
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

export default function HomeScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
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
          avatar: booking.profiles.avatar_url || `https://i.pravatar.cc/80?u=${booking.profiles.id}`,
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

  const handleDayPress = (date: Date, index: number) => {
    setSelectedDate(date);
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
    <View style={styles.container}>
      {/* Header con botón volver */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Reservar Clases</Text>
          <Text style={styles.headerSubtitle}>Encuentra tu próximo entrenamiento</Text>
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
            <Text style={styles.emptyIcon}>🏖</Text>
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
                            <Image
                              key={user.id}
                              source={{ uri: user.avatar }}
                              style={[styles.avatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 5 - i }]}
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
                        {!isFinished && (
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
                        )}
                      </View>
                    </View>

                    {/* Badge FUERA de cardTop, ocupa todo el ancho */}
                    {isBooked && (
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
                            <Image 
                              source={{ uri: user.avatar }} 
                              style={styles.photoImage}
                            />
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
  );
}

// ... (mantén TODOS los estilos exactamente iguales)

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
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
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
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
  quickBookBtnChange: {  // ← NUEVO
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  cardTopWrapper: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
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
  },
  backIcon: {
    fontSize: 24,
    color: '#fff',
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