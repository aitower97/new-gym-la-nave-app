import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarCheckIcon, TrashIcon } from '../components/Icons';
import { Button, EmptyState, MonthNavigator, ScreenHeader, SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
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

function chunkAndPad(arr: (number | null)[], size: number): (number | null)[][] {
  const rows: (number | null)[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    rows.push(arr.slice(i, i + size));
  }
  const last = rows[rows.length - 1];
  if (last && last.length < size) {
    while (last.length < size) last.push(null);
  }
  return rows;
}

// ─── DayCell component ────────────────────────────────────────────────────────

function DayCell({
  day,
  isToday,
  isSelected,
  hasBooking,
  isSelectionMode,
  isChecked,
  bookingTime,
  bookingType,
  onPress,
}: {
  day: number;
  isToday: boolean;
  isSelected: boolean;
  hasBooking: boolean;
  isSelectionMode: boolean;
  isChecked: boolean;
  bookingTime?: string;
  bookingType?: string;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);
  const dotColor = hasBooking ? getClassColor(bookingType || '') : 'transparent';

  const bgColor = isSelected
    ? 'rgba(59,130,246,0.25)'
    : isChecked
    ? 'rgba(239,68,68,0.15)'
    : isToday
    ? 'rgba(59,130,246,0.15)'
    : 'transparent';

  const borderColor = isSelected || isToday
    ? Colors.blue500
    : isChecked
    ? Colors.danger
    : 'rgba(255,255,255,0.05)';

  const textColor = isSelected || isToday
    ? Colors.blue500
    : isChecked
    ? Colors.danger
    : hasBooking
    ? 'rgba(255,255,255,0.85)'
    : 'rgba(255,255,255,0.35)';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={!hasBooking && !isToday}
      style={{
        flex: 1,
        aspectRatio: 0.85,
        paddingTop: 6,
        paddingHorizontal: 2,
        alignItems: 'center',
        justifyContent: 'flex-start',
        overflow: 'hidden',
        backgroundColor: bgColor,
        borderWidth: 1,
        borderColor,
        borderRadius: 8,
        opacity: pressed ? 0.7 : 1,
      }}
    >
      <Text numberOfLines={1} style={{
        fontSize: 15,
        fontWeight: isToday || isSelected ? '800' : '700',
        color: textColor,
      }}>
        {day}
      </Text>

      {isSelectionMode && hasBooking && (
        <View style={{
          width: 16, height: 16, borderRadius: 8,
          borderWidth: 2, marginTop: 4,
          borderColor: isChecked ? Colors.danger : 'rgba(255,255,255,0.3)',
          backgroundColor: isChecked ? Colors.danger : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {isChecked && (
            <Text style={{ fontSize: 9, color: '#fff', fontWeight: '900' }}>✓</Text>
          )}
        </View>
      )}

      {!isSelectionMode && hasBooking && (
        <View style={{ alignItems: 'center', marginTop: 4, gap: 2 }}>
          <View style={{
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: dotColor,
          }} />
          {bookingTime && (
            <Text style={{
              fontSize: 8, fontWeight: '700',
              color: dotColor, letterSpacing: -0.3,
            }}>
              {bookingTime}
            </Text>
          )}
        </View>
      )}
    </Pressable>
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

  const monthDays = getMonthDays(currentYear, currentMonth);
  const calendarRows = chunkAndPad(monthDays, 7);
  const hasBookings = Object.keys(bookingsByDate).length > 0;

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
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
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
          {/* Month Navigation - reutilizando MonthNavigator del admin */}
          <MonthNavigator
            month={MONTH_NAMES[currentMonth]}
            year={currentYear}
            onPrev={goToPreviousMonth}
            onNext={goToNextMonth}
          />

          {/* Action Buttons */}
          <Animated.View
            entering={FadeInDown.duration(350).delay(120).springify()}
            style={{
              flexDirection: 'row',
              paddingHorizontal: scale(20),
              paddingBottom: scale(12),
              gap: scale(8),
              justifyContent: 'flex-end',
            }}
          >
            <SpringPressable
              onPress={goToToday}
              style={{
                paddingHorizontal: scale(16), paddingVertical: scale(8),
                backgroundColor: 'rgba(59,130,246,0.15)', borderRadius: scale(20),
                borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
              }}
            >
              <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.blue500 }}>
                ↻ Volver a hoy
              </Text>
            </SpringPressable>

            {hasBookings && (
              <SpringPressable
                onPress={toggleSelectionMode}
                style={{
                  paddingHorizontal: scale(16), paddingVertical: scale(8),
                  borderRadius: scale(20), borderWidth: 1,
                  backgroundColor: selectionMode ? 'rgba(239,68,68,0.2)' : Colors.card,
                  borderColor: selectionMode ? 'rgba(239,68,68,0.3)' : Colors.cardBorder,
                }}
              >
                <Text style={{
                  fontSize: moderateScale(12), fontWeight: '600',
                  color: selectionMode ? Colors.danger : Colors.textSecondary,
                }}>
                  {selectionMode ? '✕ Cancelar' : 'Seleccionar'}
                </Text>
              </SpringPressable>
            )}
          </Animated.View>

          {loading ? (
            <View style={{ paddingVertical: scale(60), alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.blue500} />
            </View>
          ) : (
            <>
              {/* Calendar Grid - mismo estilo que CalendarGrid admin */}
              <Animated.View entering={FadeInDown.duration(400).delay(180).springify()}>
                <View style={{ flexDirection: 'row' }}>
                  {DAY_NAMES.map(day => (
                    <View key={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                      <Text style={{
                        fontSize: 12, fontWeight: '700',
                        color: Colors.textMuted,
                      }}>
                        {day}
                      </Text>
                    </View>
                  ))}
                </View>

                {calendarRows.map((row, rowIdx) => (
                  <View
                    key={`row-${rowIdx}`}
                    style={{
                      flexDirection: 'row',
                      borderBottomWidth: rowIdx < calendarRows.length - 1 ? 1 : 0,
                      borderBottomColor: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    {row.map((day, colIdx) => {
                      const globalIdx = rowIdx * 7 + colIdx;
                      if (day === null) {
                        return <View key={`e-${globalIdx}`} style={{ flex: 1, aspectRatio: 0.85 }} />;
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
                          bookingType={booking?.classes?.[0]?.class_type}
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
                ))}
              </Animated.View>

              {/* Selected Day Detail */}
              {!selectionMode && selectedDate && bookingsByDate[selectedDate] && (
                <Animated.View
                  entering={FadeInDown.duration(300).springify()}
                  style={{ marginHorizontal: scale(20), marginTop: scale(20) }}
                >
                  <Text style={{
                    fontSize: moderateScale(14),
                    fontWeight: '700',
                    color: 'rgba(255,255,255,0.6)',
                    marginBottom: scale(10),
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
                      <View style={{
                        backgroundColor: Colors.card,
                        borderRadius: Radius.lg,
                        borderWidth: 1,
                        borderColor: accentColor + '30',
                        borderLeftWidth: 3,
                        borderLeftColor: accentColor,
                        overflow: 'hidden',
                      }}>
                        <LinearGradient
                          colors={[accentColor + '12', 'transparent']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{ padding: scale(20) }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: scale(10), marginBottom: scale(4) }}>
                            <Text style={{
                              fontSize: moderateScale(28),
                              fontWeight: '800',
                              color: accentColor,
                              letterSpacing: -0.5,
                            }}>
                              {classInfo?.class_time.slice(0, 5)}
                            </Text>
                            <Text style={{
                              fontSize: moderateScale(12),
                              fontWeight: '600',
                              color: Colors.textMuted,
                            }}>
                              {classInfo?.name}
                            </Text>
                          </View>

                          <View style={{
                            alignSelf: 'flex-start',
                            paddingHorizontal: scale(10),
                            paddingVertical: scale(4),
                            borderRadius: Radius.sm,
                            backgroundColor: accentColor + '20',
                            marginTop: scale(8),
                            marginBottom: scale(16),
                          }}>
                            <Text style={{
                              fontSize: moderateScale(11),
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
                      </View>
                    );
                  })()}
                </Animated.View>
              )}

              {/* Stats / Summary */}
              {!selectionMode && hasBookings && (
                <Animated.View
                  entering={FadeInDown.duration(400).delay(300).springify()}
                  style={{
                    marginHorizontal: scale(20), marginTop: scale(24), padding: scale(16),
                    backgroundColor: Colors.card, borderRadius: Radius.md, alignItems: 'center',
                    borderWidth: 1, borderColor: Colors.cardBorder,
                  }}
                >
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600' }}>
                    {Object.keys(bookingsByDate).length} reserva{Object.keys(bookingsByDate).length !== 1 ? 's' : ''} este mes
                  </Text>
                </Animated.View>
              )}

              {/* Empty State */}
              {!hasBookings && (
                <View style={{ marginTop: scale(20) }}>
                  <EmptyState
                    icon={
                      <CalendarCheckIcon size={scale(32)} color={Colors.textMuted} strokeWidth={1.5} />
                    }
                    title="Sin reservas este mes"
                    subtitle="Reserva una clase para verla aquí"
                  />
                  <View style={{ paddingHorizontal: scale(40) }}>
                    <Button
                      label="Reservar clases"
                      onPress={() => navigation.navigate('Reservation', route.params)}
                      size="md"
                    />
                  </View>
                </View>
              )}

              <View style={{ height: scale(80) }} />
            </>
          )}
        </ScrollView>

        {/* Multi-select Delete Bar */}
        {selectionMode && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              padding: scale(20),
              paddingBottom: insets.bottom + scale(20),
              backgroundColor: Colors.background,
              borderTopWidth: 1,
              borderTopColor: Colors.border,
            }}
          >
            <SpringPressable
              onPress={handleCancelMultiple}
              disabled={selectedBookings.size === 0 || canceling}
              style={{
                padding: scale(18), borderRadius: Radius.md, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: scale(8),
                opacity: (selectedBookings.size === 0 || canceling) ? 0.5 : 1,
                backgroundColor: selectedBookings.size > 0 ? Colors.danger : Colors.card,
                shadowColor: Colors.danger, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
              }}
            >
              <TrashIcon size={18} color="#fff" strokeWidth={2.5} />
              <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: '#fff' }}>
                {canceling
                  ? 'Cancelando...'
                  : selectedBookings.size === 0
                  ? 'Selecciona reservas'
                  : `Cancelar ${selectedBookings.size} reserva${selectedBookings.size > 1 ? 's' : ''}`}
              </Text>
            </SpringPressable>
          </Animated.View>
        )}

      </View>
    </View>
  );
}
