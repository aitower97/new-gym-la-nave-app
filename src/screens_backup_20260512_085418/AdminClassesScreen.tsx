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
import { CalendarIcon, ChevronLeftIcon, TrashIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import {
  ClassWithBookings,
  DAY_NAMES,
  getClassesByMonth,
  getMonthDays,
  groupClassesByDate,
  MONTH_NAMES,
} from '../utils/adminClasses';
import { createNotificationsForUsers } from '../utils/notifications';


type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminClasses'>;
};

export default function AdminClassesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [classes, setClasses] = useState<ClassWithBookings[]>([]);
  const [classesByDate, setClassesByDate] = useState<Record<string, ClassWithBookings[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Modo selección
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectWholeDays, setSelectWholeDays] = useState(true); // true = días enteros, false = por hora
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadClasses();
  }, [currentYear, currentMonth]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadClasses();
      exitSelectionMode();
    });
    return unsubscribe;
  }, [navigation, currentYear, currentMonth]);

  async function loadClasses() {
    try {
      setLoading(true);
      const data = await getClassesByMonth(currentYear, currentMonth);
      setClasses(data);
      setClassesByDate(groupClassesByDate(data));
    } catch (error) {
      console.error('Error loading classes:', error);
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
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
    setSelectedDate(null);
  }

  function goToToday() {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(null);
  }

  function toggleSelectionMode() {
    if (selectionMode) {
      exitSelectionMode();
    } else {
      setSelectionMode(true);
      setSelectedClasses(new Set());
      setExpandedDates(new Set());
      setSelectedDate(null);
    }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedClasses(new Set());
    setExpandedDates(new Set());
    setSelectWholeDays(true);
  }

  function toggleSelectMode() {
    setSelectWholeDays(!selectWholeDays);
    setSelectedClasses(new Set());
    setExpandedDates(new Set());
  }

  function handleDayPress(dateStr: string) {
    const dayClasses = classesByDate[dateStr] || [];
    
    if (selectWholeDays) {
      // Modo día entero: seleccionar/deseleccionar todas las clases del día
      const newSelection = new Set(selectedClasses);
      const allSelected = dayClasses.every(cls => newSelection.has(cls.id));
      
      if (allSelected) {
        dayClasses.forEach(cls => newSelection.delete(cls.id));
      } else {
        dayClasses.forEach(cls => newSelection.add(cls.id));
      }
      
      setSelectedClasses(newSelection);
    } else {
      // Modo por hora: expandir/contraer para mostrar clases
      const newExpanded = new Set(expandedDates);
      if (newExpanded.has(dateStr)) {
        newExpanded.delete(dateStr);
      } else {
        newExpanded.add(dateStr);
      }
      setExpandedDates(newExpanded);
    }
  }

  function toggleClassSelection(classId: string) {
    const newSelection = new Set(selectedClasses);
    if (newSelection.has(classId)) {
      newSelection.delete(classId);
    } else {
      newSelection.add(classId);
    }
    setSelectedClasses(newSelection);
  }

  async function handleDeleteSelected() {
    const count = selectedClasses.size;
    
    if (count === 0) {
      Alert.alert('Error', 'No has seleccionado ninguna clase');
      return;
    }

    const affectedClasses = classes.filter(cls => selectedClasses.has(cls.id));
    const totalBookings = affectedClasses.reduce((sum, cls) => sum + (cls.bookings?.length || 0), 0);

    Alert.alert(
      'Confirmar eliminación',
      `¿Eliminar ${count} clase${count > 1 ? 's' : ''}?\n\n${totalBookings} usuario${totalBookings !== 1 ? 's' : ''} afectado${totalBookings !== 1 ? 's' : ''}.\n\nEsta acción NO se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: confirmDeleteSelected,
        },
      ]
    );
  }

  async function confirmDeleteSelected() {
    try {
      setDeleting(true);
      const classIds = Array.from(selectedClasses);
      const affectedClasses = classes.filter(cls => selectedClasses.has(cls.id));

      // Obtener todos los usuarios afectados
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('user_id, class_id, classes(class_type, class_date, class_time)')
        .in('class_id', classIds);

      const userIdsSet = new Set<string>();
      (bookingsData || []).forEach(b => {
        if (b.user_id) userIdsSet.add(b.user_id);
      });
      const affectedUserIds = Array.from(userIdsSet);

      // Eliminar reservas
      const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .in('class_id', classIds);

      if (bookingsError) throw bookingsError;

      // Eliminar clases
      const { error: classesError } = await supabase
        .from('classes')
        .delete()
        .in('id', classIds);

      if (classesError) throw classesError;

      // Enviar notificaciones
      if (affectedUserIds.length > 0) {
        await createNotificationsForUsers(affectedUserIds, {
          type: 'class_cancelled',
          title: 'Clases canceladas',
          message: `Se han cancelado ${classIds.length} clase${classIds.length > 1 ? 's' : ''} en las que estabas inscrito. Revisa tu calendario.`,
        });
      }

      // Log de acción admin
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'bulk_delete_classes',
          target_type: 'class',
          details: {
            deleted_count: classIds.length,
            class_ids: classIds,
            notifications_sent: affectedUserIds.length,
          },
        });
      }

      Alert.alert(
        '¡Listo! ✅',
        `${classIds.length} clase${classIds.length > 1 ? 's' : ''} eliminada${classIds.length > 1 ? 's' : ''} correctamente`
      );

      exitSelectionMode();
      loadClasses();
    } catch (error: any) {
      console.error('Error deleting classes:', error);
      Alert.alert('Error', error.message || 'No se pudieron eliminar las clases');
    } finally {
      setDeleting(false);
    }
  }

  const monthDays = getMonthDays(currentYear, currentMonth);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Gestión de Clases</Text>
          <Text style={styles.subtitle}>
            {selectionMode ? `${selectedClasses.size} seleccionada${selectedClasses.size !== 1 ? 's' : ''}` : 'Calendario mensual'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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

        {/* Botones: Volver a hoy + Seleccionar días */}
        <View style={styles.actionsRow}>
          <Pressable onPress={goToToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>↻ Volver a hoy</Text>
          </Pressable>
          
          <Pressable
            onPress={toggleSelectionMode}
            style={[styles.selectBtn, selectionMode && styles.selectBtnActive]}
          >
            <Text style={[styles.selectBtnText, selectionMode && styles.selectBtnTextActive]}>
              {selectionMode ? '✕ Cancelar' : '+ Seleccionar días'}
            </Text>
          </Pressable>
        </View>

        {/* Toggle: Días enteros / Por hora */}
        {selectionMode && (
          <View style={styles.modeToggle}>
            <Pressable
              style={[styles.modeBtn, selectWholeDays && styles.modeBtnActive]}
              onPress={() => setSelectWholeDays(true)}
            >
              <Text style={[styles.modeBtnText, selectWholeDays && styles.modeBtnTextActive]}>
                Días enteros
              </Text>
            </Pressable>
            <Pressable
              style={[styles.modeBtn, !selectWholeDays && styles.modeBtnActive]}
              onPress={() => setSelectWholeDays(false)}
            >
              <Text style={[styles.modeBtnText, !selectWholeDays && styles.modeBtnTextActive]}>
                Por hora
              </Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <>
            {/* Calendar Grid */}
            <View style={styles.calendar}>
              {/* Day Names Header */}
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
                  const dayClasses = classesByDate[dateStr] || [];
                  const hasClasses = dayClasses.length > 0;
                  
                  const isToday = 
                    day === today.getDate() && 
                    currentMonth === today.getMonth() && 
                    currentYear === today.getFullYear();

                  const isSelected = selectedDate === dateStr;
                  const isExpanded = expandedDates.has(dateStr);
                  
                  const hasSelectedClasses = selectionMode && dayClasses.some(cls => selectedClasses.has(cls.id));
                  const allClassesSelected = selectionMode && dayClasses.length > 0 && dayClasses.every(cls => selectedClasses.has(cls.id));

                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.dayCell,
                        isToday && styles.dayCellToday,
                        isSelected && !selectionMode && styles.dayCellSelected,
                        hasSelectedClasses && styles.dayCellHasSelection,
                        isExpanded && styles.dayCellExpanded,
                      ]}
                      onPress={() => {
                        if (selectionMode && hasClasses) {
                          handleDayPress(dateStr);
                        } else if (!selectionMode) {
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
                        {selectionMode && hasClasses && selectWholeDays && (
                          <View style={[
                            styles.selectionCheckbox,
                            allClassesSelected && styles.selectionCheckboxActive,
                          ]}>
                            {allClassesSelected && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                        )}
                        {selectionMode && hasClasses && !selectWholeDays && (
                          <View style={styles.expandIndicator}>
                            <Text style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</Text>
                          </View>
                        )}
                      </View>
                      {hasClasses && !selectionMode && (
                        <View style={styles.classIndicators}>
                          {dayClasses.slice(0, 3).map((cls) => {
                            const booked = cls.bookings?.length || 0;
                            const capacity = cls.max_spots;
                            const percentage = (booked / capacity) * 100;
                            
                            const color = 
                              percentage >= 100 ? '#EF4444' : 
                              percentage >= 80 ? '#F59E0B' : 
                              '#10B981';

                            return (
                              <View
                                key={cls.id}
                                style={[styles.classDot, { backgroundColor: color }]}
                              />
                            );
                          })}
                          {dayClasses.length > 3 && (
                            <Text style={styles.moreIndicator}>+{dayClasses.length - 3}</Text>
                          )}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Clases expandidas (modo por hora) */}
            {selectionMode && !selectWholeDays && (
              <View style={styles.expandedClassesSection}>
                {Array.from(expandedDates).map(dateStr => {
                  const dayClasses = classesByDate[dateStr] || [];
                  const date = new Date(dateStr + 'T00:00:00');
                  
                  if (dayClasses.length === 0) return null;
                  
                  return (
                    <View key={dateStr} style={styles.expandedDay}>
                      <Text style={styles.expandedDayTitle}>
                        {date.toLocaleDateString('es-ES', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                        })}
                      </Text>
                      {dayClasses.map(cls => {
                        const isSelected = selectedClasses.has(cls.id);
                        const booked = cls.bookings?.length || 0;
                        
                        return (
                          <Pressable
                            key={cls.id}
                            style={[
                              styles.expandedClassCard,
                              isSelected && styles.expandedClassCardSelected,
                            ]}
                            onPress={() => toggleClassSelection(cls.id)}
                          >
                            <View style={styles.expandedClassInfo}>
                              <Text style={styles.expandedClassTime}>
                                {cls.class_time.slice(0, 5)}
                              </Text>
                              <Text style={styles.expandedClassName}>{cls.name}</Text>
                              {booked > 0 && (
                                <Text style={styles.expandedClassBookings}>
                                  {booked} reserva{booked > 1 ? 's' : ''}
                                </Text>
                              )}
                            </View>
                            <View style={[
                              styles.classCheckbox,
                              isSelected && styles.classCheckboxActive,
                            ]}>
                              {isSelected && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Selected Day Classes (solo en modo normal) */}
            {!selectionMode && selectedDate && classesByDate[selectedDate] && (
              <View style={styles.selectedDaySection}>
                <Text style={styles.selectedDayTitle}>
                  Clases del {new Date(selectedDate + 'T00:00:00').getDate()} de {MONTH_NAMES[currentMonth]}
                </Text>
                {classesByDate[selectedDate].map((cls) => {
                  const booked = cls.bookings?.length || 0;
                  const capacity = cls.max_spots;
                  const percentage = Math.round((booked / capacity) * 100);

                  return (
                    <Pressable
                      key={cls.id}
                      style={styles.classCard}
                      onPress={() => navigation.navigate('AdminClassDetail', { classId: cls.id })}
                    >
                      <View style={styles.classCardLeft}>
                        <Text style={styles.classTime}>{cls.class_time.slice(0, 5)}</Text>
                        <Text style={styles.className}>{cls.name}</Text>
                      </View>
                      <View style={styles.classCardRight}>
                        <Text style={styles.classOccupancy}>{booked}/{capacity}</Text>
                        <View style={styles.classOccupancyBar}>
                          <View 
                            style={[
                              styles.classOccupancyFill,
                              {
                                width: `${percentage}%`,
                                backgroundColor: 
                                  percentage >= 100 ? '#EF4444' :
                                  percentage >= 80 ? '#F59E0B' :
                                  '#10B981'
                              }
                            ]}
                          />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Summary */}
            {!selectionMode && (
              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  Total: {classes.length} clases este mes
                </Text>
              </View>
            )}

            <View style={{ height: 80 }} />
          </>
        )}
      </ScrollView>

      {/* Botón flotante (solo en modo normal) */}
      {!selectionMode && (
        <Pressable
          style={styles.fabButton}
          onPress={() => navigation.navigate('AdminCreateClass', { initialDate: undefined })}
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      )}

      {/* Botón eliminar (modo selección) */}
      {selectionMode && (
        <View style={styles.deleteButtonContainer}>
          <Pressable
            style={[
              styles.deleteButton,
              (selectedClasses.size === 0 || deleting) && styles.deleteButtonDisabled,
            ]}
            onPress={handleDeleteSelected}
            disabled={selectedClasses.size === 0 || deleting}
          >
            <Text style={styles.deleteButtonText}>
              {deleting
                ? 'Eliminando...'
                : selectedClasses.size === 0
                ? 'Selecciona clases para eliminar'
                : `Eliminar ${selectedClasses.size} clase${selectedClasses.size > 1 ? 's' : ''}`}
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
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
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
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
    justifyContent: 'flex-end',
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
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 12,
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderColor: '#3B82F6',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  modeBtnTextActive: {
    color: '#3B82F6',
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
    aspectRatio: 0.85,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  dayCellHasSelection: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: '#EF4444',
    borderWidth: 2,
  },
  dayCellExpanded: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  dayCellContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  dayNumberToday: {
    color: '#3B82F6',
    fontWeight: 'bold',
    fontSize: 17,
  },
  dayNumberSelected: {
    color: '#fff',
    fontSize: 17,
  },
  selectionCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCheckboxActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  expandIndicator: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIcon: {
    fontSize: 10,
    color: '#3B82F6',
    fontWeight: 'bold',
  },
  checkmark: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  classIndicators: {
    flexDirection: 'row',
    gap: 3,
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  moreIndicator: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: 'bold',
  },
  expandedClassesSection: {
    marginHorizontal: 20,
    marginTop: 16,
  },
  expandedDay: {
    marginBottom: 20,
  },
  expandedDayTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  expandedClassCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 6,
  },
  expandedClassCardSelected: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: '#EF4444',
  },
  expandedClassInfo: {
    flex: 1,
  },
  expandedClassTime: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 2,
  },
  expandedClassName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  expandedClassBookings: {
    fontSize: 11,
    color: '#F59E0B',
  },
  classCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classCheckboxActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  selectedDaySection: {
    marginHorizontal: 20,
    marginTop: 24,
  },
  selectedDayTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  classCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  classCardLeft: {
    flex: 1,
  },
  classTime: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 4,
  },
  className: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
  classCardRight: {
    alignItems: 'flex-end',
    minWidth: 80,
  },
  classOccupancy: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  classOccupancyBar: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  classOccupancyFill: {
    height: '100%',
    borderRadius: 2,
  },
  summary: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
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