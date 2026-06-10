import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, scale } from '../theme';
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
  };
}

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

  useEffect(() => {
    loadMyBookings();
  }, [currentYear, currentMonth]);

  async function loadMyBookings() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Primer día del mes (01 del mes)
      const firstDay = new Date(currentYear, currentMonth, 1);
      firstDay.setHours(0, 0, 0, 0);

      // Último día del mes
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      lastDay.setHours(23, 59, 59, 999);


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
        .eq('user_id', user.id)
        .gte('classes.class_date', firstDay.toISOString().split('T')[0])
        .lte('classes.class_date', lastDay.toISOString().split('T')[0]);
      if (error) throw error;

      const validBookings = (data || []).filter(
        (b): b is MyBooking => b.classes !== null
      );

      setBookings(validBookings);

      // Agrupar por fecha (solo 1 por día)
      const grouped: Record<string, MyBooking> = {};
      validBookings.forEach(booking => {
        grouped[booking.classes.class_date] = booking;
      });


      setBookingsByDate(grouped);
    } catch (error: any) {
      console.error('❌ [MyClasses] Error loading bookings:', error);
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

      Alert.alert('✅ Reserva cancelada', 'Tu reserva ha sido cancelada correctamente');
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
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: confirmCancelMultiple,
        },
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
        '✅ Reservas canceladas',
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

  const monthDays = getMonthDays(currentYear, currentMonth);
  const hasBookings = Object.keys(bookingsByDate).length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Mis Clases</Text>
          <Text style={styles.subtitle}>
            {selectionMode 
              ? `${selectedBookings.size} seleccionada${selectedBookings.size !== 1 ? 's' : ''}`
              : 'Tus reservas del mes'
            }
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Month Navigation */}
        <View style={styles.monthNav}>
          <Pressable onPress={goToPreviousMonth} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>←</Text>
          </Pressable>
          
          <Text style={styles.monthTitle}>
            {MONTH_NAMES[currentMonth]} {currentYear}
          </Text>

          <Pressable onPress={goToNextMonth} style={styles.monthBtn}>
            <Text style={styles.monthBtnText}>→</Text>
          </Pressable>
        </View>

        {/* Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <Pressable onPress={goToToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>↻ Volver a hoy</Text>
          </Pressable>
          
          {/* Botón Seleccionar SIEMPRE visible si hay bookings */}
          {hasBookings && (
            <Pressable
              onPress={toggleSelectionMode}
              style={[styles.selectBtn, selectionMode && styles.selectBtnActive]}
            >
              <Text style={[styles.selectBtnText, selectionMode && styles.selectBtnTextActive]}>
                {selectionMode ? '✕ Cancelar' : 'Seleccionar'}
              </Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <>
            {/* Calendar */}
            <View style={styles.calendar}>
              {/* Day Names */}
              <View style={styles.dayNamesRow}>
                {DAY_NAMES.map((day) => (
                  <View key={day} style={styles.dayNameCell}>
                    <Text style={styles.dayNameText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Days Grid */}
              <View style={styles.daysGrid}>
                {monthDays.map((day, index) => {
                  if (day === null) {
                    return <View key={`empty-${index}`} style={styles.dayCell} />;
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
                    <Pressable
                      key={day}
                      style={[
                        styles.dayCell,
                        isToday && styles.dayCellToday,
                        isSelected && !selectionMode && styles.dayCellSelected,
                        hasBooking && styles.dayCellWithBooking,
                        selectionMode && selectedBookings.has(dateStr) && styles.dayCellSelectedMultiple,
                      ]}
                      onPress={() => {
                        if (!hasBooking) return;
                        
                        if (selectionMode) {
                          toggleBookingSelection(dateStr);
                        } else {
                          setSelectedDate(isSelected ? null : dateStr);
                        }
                      }}
                    >
                      <View style={styles.dayCellContent}>
                        <Text style={[
                          styles.dayNumber,
                          isToday && styles.dayNumberToday,
                          isSelected && !selectionMode && styles.dayNumberSelected,
                        ]}>
                          {day}
                        </Text>
                        {selectionMode && hasBooking && (
                          <View style={[
                            styles.selectionCheckbox,
                            selectedBookings.has(dateStr) && styles.selectionCheckboxActive,
                          ]}>
                            {selectedBookings.has(dateStr) && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                        )}
                      </View>
                      {hasBooking && !selectionMode && (
                        <View style={styles.bookingIndicator}>
                          <Text style={styles.bookingTime}>
                            {booking.classes.class_time.slice(0, 5)}
                          </Text>
                          <View style={styles.bookingDot} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Selected Day Detail */}
            {!selectionMode && selectedDate && bookingsByDate[selectedDate] && (
              <View style={styles.detailSection}>
                <Text style={styles.detailTitle}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-ES', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </Text>
                
                {(() => {
                  const booking = bookingsByDate[selectedDate];
                  return (
                    <View style={styles.detailCard}>
                      <Text style={styles.detailTime}>
                        {booking.classes.class_time.slice(0, 5)}
                      </Text>
                      <Text style={styles.detailType}>
                        {booking.classes.class_type}
                      </Text>
                      <Pressable 
                        style={[styles.cancelBtn, canceling && styles.cancelBtnDisabled]}
                        onPress={() => handleCancelSingle(booking.id, booking.classes.class_type)}
                        disabled={canceling}
                      >
                        <Text style={styles.cancelBtnText}>
                          {canceling ? 'Cancelando...' : 'Cancelar reserva'}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Empty State */}
            {!hasBookings && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconBox}>
                  <CalendarIcon size={scale(32)} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyTitle}>Sin clases este mes</Text>
                <Text style={styles.emptyText}>
                  No tienes ninguna clase reservada
                </Text>
                <Pressable
                  style={styles.emptyBtn}
                  onPress={() => navigation.navigate('Home', route.params)}
                >
                  <Text style={styles.emptyBtnText}>Reservar clases</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Botón eliminar múltiple */}
      {selectionMode && (
        <View style={styles.deleteButtonContainer}>
          <Pressable
            style={[
              styles.deleteButton,
              (selectedBookings.size === 0 || canceling) && styles.deleteButtonDisabled,
            ]}
            onPress={handleCancelMultiple}
            disabled={selectedBookings.size === 0 || canceling}
          >
            <Text style={styles.deleteButtonText}>
              {canceling
                ? 'Cancelando...'
                : selectedBookings.size === 0
                ? 'Selecciona clases'
                : `Cancelar ${selectedBookings.size} reserva${selectedBookings.size > 1 ? 's' : ''}`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
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
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  scrollView: {
    flex: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  monthBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtnText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: 'bold',
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  todayBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  todayBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  selectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  selectBtnActive: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  selectBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  selectBtnTextActive: {
    color: '#EF4444',
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  calendar: {
    marginHorizontal: 12,
    marginTop: 8,
  },
  dayNamesRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayNameCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  dayCellToday: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  dayCellSelected: {
    backgroundColor: 'rgba(59,130,246,0.25)',
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  dayCellWithBooking: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  dayCellSelectedMultiple: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  dayCellContent: {
    alignItems: 'center',
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 2,
  },
  dayNumberToday: {
    color: '#3B82F6',
  },
  dayNumberSelected: {
    color: '#fff',
  },
  selectionCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  selectionCheckboxActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  checkmark: {
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  bookingIndicator: {
    alignItems: 'center',
  },
  bookingTime: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
    marginBottom: 2,
  },
  bookingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  detailSection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  detailCard: {
    padding: 20,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  detailTime: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 8,
  },
  detailType: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  cancelBtn: {
    padding: 14,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
  },
  cancelBtnDisabled: {
    opacity: 0.5,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#EF4444',
  },
  emptyState: {
    paddingVertical: 80,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
  },
  emptyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButtonContainer: {
    padding: 20,
    paddingBottom: 30,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  deleteButton: {
    padding: 18,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
});