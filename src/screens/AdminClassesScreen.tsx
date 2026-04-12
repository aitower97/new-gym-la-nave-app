import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RootStackParamList } from '../types/navigation';
import {
  ClassWithBookings,
  DAY_NAMES,
  getClassesByMonth,
  getMonthDays,
  groupClassesByDate,
  MONTH_NAMES,
} from '../utils/adminClasses';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminClasses'>;
};

export default function AdminClassesScreen({ navigation }: Props) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [classes, setClasses] = useState<ClassWithBookings[]>([]);
  const [classesByDate, setClassesByDate] = useState<Record<string, ClassWithBookings[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadClasses();
  }, [currentYear, currentMonth]);

  // Recargar cuando vuelvas de crear clase
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadClasses();
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

  const monthDays = getMonthDays(currentYear, currentMonth);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Gestión de Clases</Text>
          <Text style={styles.subtitle}>Calendario mensual</Text>
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

        {/* Today Button */}
        <View style={styles.todayBtnContainer}>
          <Pressable onPress={goToToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>↻ Volver a hoy</Text>
          </Pressable>
        </View>

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

                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.dayCell,
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                      onPress={() => setSelectedDate(isSelected ? null : dateStr)}
                    >
                      <Text style={[
                        styles.dayNumber,
                        isToday && styles.dayNumberToday,
                        isSelected && styles.dayNumberSelected,
                      ]}>
                        {day}
                      </Text>
                      {hasClasses && (
                        <View style={styles.classIndicators}>
                          {dayClasses.slice(0, 3).map((cls, i) => {
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

            {/* Selected Day Classes */}
            {selectedDate && classesByDate[selectedDate] && (
              <View style={styles.selectedDaySection}>
                <Text style={styles.selectedDayTitle}>
                  Clases del {new Date(selectedDate + 'T00:00:00').getDate()} de {MONTH_NAMES[currentMonth]}
                </Text>
                {classesByDate[selectedDate].map((cls) => {
                  const booked = cls.bookings?.length || 0;
                  const capacity = cls.max_spots;
                  const percentage = Math.round((booked / capacity) * 100);

                  return (
                    <View key={cls.id} style={styles.classCard}>
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
                    </View>
                  );
                })}
              </View>
            )}

            {/* Summary */}
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                Total: {classes.length} clases este mes
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Botón flotante FUERA del ScrollView */}
      <Pressable
        style={styles.fabButton}
        onPress={() => {
          console.log('FAB pressed');
          navigation.navigate('AdminCreateClass', { initialDate: undefined });
        }}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
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
  todayBtnContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    alignItems: 'flex-end',
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
  dayNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 6,
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
});