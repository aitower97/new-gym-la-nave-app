import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarCheckIcon, CalendarIcon, TrashIcon } from '../components/Icons';
import { Button, EmptyState, ScreenHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, scale as s } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { DAY_NAMES, getMonthDays, MONTH_NAMES } from '../utils/adminClasses';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MyClasses'>;
  route: RouteProp<RootStackParamList, 'MyClasses'>;
};

interface MyBooking {
  id: string;
  class_id: string;
  classes: {
    id: string;
    name: string;
    class_type: string;
    class_date: string;
    class_time: string;
    max_spots: number;
  }[] | null;
}

const CLASS_TYPE_COLORS: Record<string, string> = {
  'CROSS TRAINING': '#3B82F6',
  'POWERLIFTING': '#F59E0B',
  'HALTEROFILIA': '#EF4444',
  'OPEN BOX': '#10B981',
};

function getClassColor(classType: string): string {
  return CLASS_TYPE_COLORS[classType] || '#3B82F6';
}

// ─── DayCell component (module-level for stable identity in .map) ────────────

function DayCell({
  day,
  isToday,
  isSelected,
  hasBooking,
  isSelectionMode,
  isChecked,
  bookingTime,
  onPress,
}: {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  hasBooking: boolean;
  isSelectionMode: boolean;
  isChecked: boolean;
  bookingTime?: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withSpring(isChecked ? 1 : 0, { damping: 12, stiffness: 250 });
  }, [isChecked]);

  const cellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const pressIn = () => {
    if (!hasBooking && !isToday) return;
    scale.value = withSpring(0.88, { damping: 14, stiffness: 300 });
  };

  const pressOut = () => {
    scale.value = withSpring(1, { damping: 10, stiffness: 200 });
  };

  return (
    <Animated.View style={[cellStyle, { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={!hasBooking && !isToday}
        style={{ flex: 1 }}
      >
        <View style={[{
          flex: 1,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: isSelected
            ? '#3B82F6'
            : isToday
            ? 'rgba(59,130,246,0.3)'
            : 'transparent',
          backgroundColor: isSelected
            ? 'rgba(59,130,246,0.25)'
            : isToday
            ? 'rgba(59,130,246,0.1)'
            : hasBooking
            ? 'rgba(16,185,129,0.06)'
            : 'transparent',
        }]}>
          <View style={{ alignItems: 'center', gap: 1 }}>
            <Text style={{
              fontSize: s(15),
              fontWeight: isToday || isSelected ? '800' : '600',
              color: isSelected
                ? '#fff'
                : isToday
                ? '#60A5FA'
                : hasBooking
                ? 'rgba(255,255,255,0.85)'
                : 'rgba(255,255,255,0.35)',
            }}>
              {day}
            </Text>

            {isSelectionMode && hasBooking && (
              <Animated.View style={[checkStyle, {
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: isChecked ? '#EF4444' : 'rgba(255,255,255,0.25)',
                backgroundColor: isChecked ? '#EF4444' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }]}>
                {isChecked && (
                  <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>
                )}
              </Animated.View>
            )}

            {!isSelectionMode && hasBooking && bookingTime && (
              <Text style={{
                fontSize: 8,
                fontWeight: '700',
                color: '#10B981',
                letterSpacing: -0.3,
              }}>
                {bookingTime}
              </Text>
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MyClassesScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, MyBooking>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [canceling, setCanceling] = useState(false);

  const monthLabel = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  const monthDays = getMonthDays(currentYear, currentMonth);
  const hasBookings = Object.keys(bookingsByDate).length > 0;

  // Track previous month label for animation key
  const prevMonthLabelRef = useRef(monthLabel);
  const monthChanged = monthLabel !== prevMonthLabelRef.current;
  if (monthChanged) prevMonthLabelRef.current = monthLabel;

  useEffect(() => {
    loadMyBookings();
  }, [currentYear, currentMonth]);

  async function loadMyBookings() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const firstDayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      const lastDayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          class_id,
          classes (
            id,
            name,
            class_type,
            class_date,
            class_time,
            max_spots
          )
        `)
        .eq('user_id', user.id);

      if (error) throw error;

      const normalized = (data || []).map(b => ({
        ...b,
        classes: b.classes
          ? (Array.isArray(b.classes) ? b.classes : [b.classes])
          : [],
      }));

      const validBookings = normalized.filter(b => {
        if (!b.classes || b.classes.length === 0) return false;
        const date = b.classes[0].class_date;
        return date >= firstDayStr && date <= lastDayStr;
      }) as MyBooking[];

      setBookings(validBookings);

      const grouped: Record<string, MyBooking> = {};
      validBookings.forEach(booking => {
        if (booking.classes && booking.classes.length > 0) {
          grouped[booking.classes[0].class_date] = booking;
        }
      });

      setBookingsByDate(grouped);
    } catch (error: any) {
      console.error('Error loading bookings:', error);
    } finally {
      setLoading(false);
    }
  }

  function goToPreviousMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
    setSelectedDate(null);
    setSelectionMode(false);
    setSelectedBookings(new Set());
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(null);
    setSelectionMode(false);
    setSelectedBookings(new Set());
  }

  function goToToday() {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(null);
    setSelectionMode(false);
    setSelectedBookings(new Set());
  }

  function toggleSelectionMode() {
    setSelectionMode(!selectionMode);
    setSelectedBookings(new Set());
    setSelectedDate(null);
  }

  function toggleBookingSelection(dateStr: string) {
    const newSelection = new Set(selectedBookings);
    if (newSelection.has(dateStr)) {
      newSelection.delete(dateStr);
    } else {
      newSelection.add(dateStr);
    }
    setSelectedBookings(newSelection);
  }

  async function handleCancelSingle(bookingId: string, className: string) {
    Alert.alert(
      'Cancelar reserva',
      `¿Estás seguro de que quieres cancelar tu reserva de ${className}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: () => confirmCancelSingle(bookingId),
        },
      ]
    );
  }

  async function confirmCancelSingle(bookingId: string) {
    try {
      setCanceling(true);
      const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId);

      if (error) throw error;

      Alert.alert('Reserva cancelada', 'Tu reserva ha sido cancelada correctamente');
      setSelectedDate(null);
      await loadMyBookings();
    } catch (error: any) {
      console.error('Error canceling booking:', error);
      Alert.alert('Error', 'No se pudo cancelar la reserva');
    } finally {
      setCanceling(false);
    }
  }

  async function handleCancelMultiple() {
    const count = selectedBookings.size;
    if (count === 0) {
      Alert.alert('Error', 'No has seleccionado ninguna clase');
      return;
    }
    Alert.alert(
      'Cancelar reservas',
      `¿Cancelar ${count} reserva${count > 1 ? 's' : ''}?`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: confirmCancelMultiple },
      ]
    );
  }

  async function confirmCancelMultiple() {
    try {
      setCanceling(true);
      const bookingIds = Array.from(selectedBookings).map(
        dateStr => bookingsByDate[dateStr].id
      );
      const { error } = await supabase
        .from('bookings')
        .delete()
        .in('id', bookingIds);

      if (error) throw error;

      Alert.alert(
        'Reservas canceladas',
        `${bookingIds.length} reserva${bookingIds.length > 1 ? 's' : ''} cancelada${bookingIds.length > 1 ? 's' : ''} correctamente`
      );
      setSelectionMode(false);
      setSelectedBookings(new Set());
      await loadMyBookings();
    } catch (error: any) {
      console.error('Error canceling bookings:', error);
      Alert.alert('Error', 'No se pudieron cancelar las reservas');
    } finally {
      setCanceling(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0f1a' }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        <ScreenHeader
          title="Mis Clases"
          subtitle={
            selectionMode
              ? `${selectedBookings.size} seleccionada${selectedBookings.size !== 1 ? 's' : ''}`
              : 'Tus reservas del mes'
          }
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Month Navigation */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: s(20),
            paddingTop: s(16),
            paddingBottom: s(10),
          }}>
            <Pressable
              onPress={goToPreviousMonth}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', lineHeight: 20 }}>←</Text>
            </Pressable>

            <Animated.View
              key={monthLabel}
              entering={FadeInDown.duration(200).springify()}
              style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}
            >
              <Text style={{
                fontSize: s(20),
                fontWeight: '800',
                color: '#fff',
                letterSpacing: -0.3,
              }}>
                {MONTH_NAMES[currentMonth]}
              </Text>
              <Text style={{
                fontSize: s(14),
                fontWeight: '600',
                color: 'rgba(255,255,255,0.35)',
              }}>
                {currentYear}
              </Text>
            </Animated.View>

            <Pressable
              onPress={goToNextMonth}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: pressed ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', lineHeight: 20 }}>→</Text>
            </Pressable>
          </View>

          {/* Action Buttons */}
          <View style={{
            flexDirection: 'row',
            paddingHorizontal: s(20),
            paddingBottom: s(10),
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
          }}>
            <Pressable
              onPress={goToToday}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 7,
                backgroundColor: pressed ? 'rgba(59,130,246,0.25)' : 'rgba(59,130,246,0.12)',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: 'rgba(59,130,246,0.25)',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#60A5FA', letterSpacing: 0.3 }}>
                ← Volver a hoy
              </Text>
            </Pressable>

            {hasBookings && (
              <Pressable
                onPress={toggleSelectionMode}
                style={({ pressed }) => ({
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  backgroundColor: selectionMode
                    ? 'rgba(239,68,68,0.15)'
                    : pressed
                    ? 'rgba(255,255,255,0.12)'
                    : 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: selectionMode
                    ? 'rgba(239,68,68,0.25)'
                    : 'rgba(255,255,255,0.08)',
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: selectionMode ? '#EF4444' : 'rgba(255,255,255,0.65)',
                  letterSpacing: 0.3,
                }}>
                  {selectionMode ? '✕ Cancelar selección' : 'Seleccionar'}
                </Text>
              </Pressable>
            )}
          </View>

          {loading ? (
            <View style={{ paddingVertical: 60, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : (
            <>
              {/* Calendar */}
              <View style={{ marginHorizontal: s(8), marginTop: s(4) }}>
                <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                  {DAY_NAMES.map(day => (
                    <View key={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: '700',
                        color: 'rgba(255,255,255,0.3)',
                        textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                        {day}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {monthDays.map((day, index) => {
                    if (day === null) {
                      return <View key={`e-${index}`} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }} />;
                    }

                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const booking = bookingsByDate[dateStr];
                    const hasBooking = !!booking;

                    const isToday =
                      day === today.getDate() &&
                      currentMonth === today.getMonth() &&
                      currentYear === today.getFullYear();

                    const isSelected = selectedDate === dateStr;

                    return (
                      <DayCell
                        key={day}
                        day={day}
                        isToday={isToday}
                        isSelected={isSelected}
                        hasBooking={hasBooking}
                        isSelectionMode={selectionMode}
                        isChecked={selectedBookings.has(dateStr)}
                        bookingTime={booking?.classes?.[0]?.class_time.slice(0, 5)}
                        onPress={() => {
                          if (!hasBooking) return;
                          if (selectionMode) {
                            toggleBookingSelection(dateStr);
                          } else {
                            setSelectedDate(isSelected ? null : dateStr);
                          }
                        }}
                      />
                    );
                  })}
                </View>
              </View>

              {/* Selected Day Detail */}
              {!selectionMode && selectedDate && bookingsByDate[selectedDate] && (
                <Animated.View
                  entering={FadeInDown.duration(300).springify()}
                  style={{ marginHorizontal: s(20), marginTop: s(20) }}
                >
                  <Text style={{
                    fontSize: s(14),
                    fontWeight: '700',
                    color: 'rgba(255,255,255,0.6)',
                    marginBottom: s(10),
                    textTransform: 'capitalize',
                    letterSpacing: 0.3,
                  }}>
                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </Text>

                  {(() => {
                    const booking = bookingsByDate[selectedDate];
                    const classInfo = booking.classes?.[0];
                    const accentColor = getClassColor(classInfo?.class_type || '');

                    return (
                      <LinearGradient
                        colors={[accentColor + '18', accentColor + '06']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderRadius: 18,
                          padding: s(20),
                          borderWidth: 1,
                          borderColor: accentColor + '25',
                        }}
                      >
                        {/* Time row */}
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
                          <Text style={{
                            fontSize: s(28),
                            fontWeight: '800',
                            color: accentColor,
                            letterSpacing: -0.5,
                          }}>
                            {classInfo?.class_time.slice(0, 5)}
                          </Text>
                          <Text style={{
                            fontSize: s(12),
                            fontWeight: '600',
                            color: 'rgba(255,255,255,0.25)',
                          }}>
                            {classInfo?.name}
                          </Text>
                        </View>

                        {/* Class type badge */}
                        <View style={{
                          alignSelf: 'flex-start',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          borderRadius: 8,
                          backgroundColor: accentColor + '20',
                          marginTop: s(8),
                          marginBottom: s(16),
                        }}>
                          <Text style={{
                            fontSize: s(11),
                            fontWeight: '700',
                            color: accentColor,
                            letterSpacing: 1,
                            textTransform: 'uppercase',
                          }}>
                            {classInfo?.class_type}
                          </Text>
                        </View>

                        <Button
                          label={canceling ? 'Cancelando...' : 'Cancelar reserva'}
                          onPress={() => handleCancelSingle(
                            booking.id,
                            classInfo?.class_type || ''
                          )}
                          disabled={canceling}
                          loading={canceling}
                          variant="danger"
                          size="sm"
                        />
                      </LinearGradient>
                    );
                  })()}
                </Animated.View>
              )}

              {/* Empty State */}
              {!hasBookings && (
                <View style={{ marginTop: s(20) }}>
                  <EmptyState
                    icon={
                      <CalendarCheckIcon size={s(32)} color={Colors.textMuted} strokeWidth={1.5} />
                    }
                    title="Sin reservas este mes"
                    subtitle="Reserva una clase para verla aquí"
                  />
                  <View style={{ paddingHorizontal: s(40) }}>
                    <Button
                      label="Reservar clases"
                      onPress={() => navigation.navigate('Reservation', route.params)}
                      size="md"
                    />
                  </View>
                </View>
              )}
            </>
          )}

          <View style={{ height: insets.bottom + (selectionMode ? 100 : 40) }} />
        </ScrollView>

        {/* Multi-select Delete Bar */}
        {selectionMode && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              paddingHorizontal: s(20),
              paddingTop: s(12),
              paddingBottom: insets.bottom + s(16),
              backgroundColor: '#0a0f1a',
              borderTopWidth: 1,
              borderTopColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <Pressable
              onPress={handleCancelMultiple}
              disabled={selectedBookings.size === 0 || canceling}
              style={({ pressed }) => ({
                opacity: (selectedBookings.size === 0 || canceling) ? 0.4 : pressed ? 0.85 : 1,
                borderRadius: 14,
                overflow: 'hidden',
              })}
            >
              <LinearGradient
                colors={['#DC2626', '#991b1b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingVertical: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                <TrashIcon size={18} color="#fff" strokeWidth={2.5} />
                <Text style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: '#fff',
                  letterSpacing: 0.5,
                }}>
                  {canceling
                    ? 'Cancelando...'
                    : selectedBookings.size === 0
                    ? 'Selecciona clases'
                    : `Cancelar ${selectedBookings.size} reserva${selectedBookings.size > 1 ? 's' : ''}`}
                </Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

      </View>
    </View>
  );
}
