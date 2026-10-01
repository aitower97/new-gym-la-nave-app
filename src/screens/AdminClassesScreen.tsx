import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClockIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import {
  ClassWithBookings,
  getClassesByMonth,
  getMonthDays,
  groupClassesByDate,
  MONTH_NAMES,
} from '../utils/adminClasses';
import { createNotificationsForUsers } from '../utils/notifications';
import {
  CalendarGrid,
  ClassCardRow,
  FAB,
  MonthNavigator,
  SkeletonCalendar,
  SpringPressable,
} from '../components/ui';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { useRefreshOnReturn, useTransitionDone } from '../hooks/useScreenTransition';
import { useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { getCurrentUser } from '../utils/auth';
import { getCached, setCached } from '../utils/screenCache';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminClasses'>;
};

const monthKey = (year: number, month: number) => `admin-classes:${year}-${month}`;

export default function AdminClassesScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const createClassRef = useTutorialTarget('admin-create-class');
  const calendarRef = useTutorialTarget('admin-classes-calendar');
  const bookingSettingsRef = useTutorialTarget('admin-booking-settings');
  const scrollRef = useRef<ScrollView>(null);
  useTutorialScrollAction('admin-classes-calendar', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  // Lo último que se vio de cada mes sale al instante; la red lo refresca detrás.
  const cachedMonth = getCached<ClassWithBookings[]>(monthKey(today.getFullYear(), today.getMonth()));
  const [classes, setClasses] = useState<ClassWithBookings[]>(cachedMonth ?? []);
  const [classesByDate, setClassesByDate] = useState<Record<string, ClassWithBookings[]>>(
    cachedMonth ? groupClassesByDate(cachedMonth) : {}
  );
  const [loading, setLoading] = useState(!cachedMonth);
  // Si se cambia de mes rápido, la respuesta de un mes anterior no pisa al actual
  const loadSeqRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectWholeDays, setSelectWholeDays] = useState(true);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadClasses(); }, [currentYear, currentMonth]);

  // Al volver (al abrir ya carga el efecto de arriba), tras la animación
  useRefreshOnReturn(navigation, () => {
    loadClasses();
    exitSelectionMode();
  });
  // El calendario del mes no se pinta mientras la pantalla entra
  const transitionDone = useTransitionDone(navigation);

  async function loadClasses() {
    const seq = ++loadSeqRef.current;
    const key = monthKey(currentYear, currentMonth);
    const cached = getCached<ClassWithBookings[]>(key);
    if (cached) {
      setClasses(cached);
      setClassesByDate(groupClassesByDate(cached));
      setLoading(false);
    } else {
      setClasses([]);
      setClassesByDate({});
      setLoading(true);
    }
    try {
      const data = await getClassesByMonth(currentYear, currentMonth);
      if (seq !== loadSeqRef.current) return;
      setClasses(data);
      setClassesByDate(groupClassesByDate(data));
      setCached(key, data);
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  function goToPreviousMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else { setCurrentMonth(currentMonth - 1); }
    setSelectedDate(null);
  }

  function goToNextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else { setCurrentMonth(currentMonth + 1); }
    setSelectedDate(null);
  }

  function goToToday() {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setSelectedDate(null);
  }

  function toggleSelectionMode() {
    if (selectionMode) exitSelectionMode();
    else { setSelectionMode(true); setSelectedClasses(new Set()); setExpandedDates(new Set()); setSelectedDate(null); }
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedClasses(new Set());
    setExpandedDates(new Set());
    setSelectWholeDays(true);
  }

  function handleDayPress(dateStr: string) {
    const dayClasses = classesByDate[dateStr] || [];
    if (selectWholeDays) {
      const newSelection = new Set(selectedClasses);
      const allSelected = dayClasses.every(cls => newSelection.has(cls.id));
      dayClasses.forEach(cls => allSelected ? newSelection.delete(cls.id) : newSelection.add(cls.id));
      setSelectedClasses(newSelection);
    } else {
      const newExpanded = new Set(expandedDates);
      newExpanded.has(dateStr) ? newExpanded.delete(dateStr) : newExpanded.add(dateStr);
      setExpandedDates(newExpanded);
    }
  }

  function toggleClassSelection(classId: string) {
    const newSelection = new Set(selectedClasses);
    newSelection.has(classId) ? newSelection.delete(classId) : newSelection.add(classId);
    setSelectedClasses(newSelection);
  }

  async function handleDeleteSelected() {
    const count = selectedClasses.size;
    if (count === 0) { Alert.alert('Error', 'No has seleccionado ninguna clase'); return; }

    const affectedClasses = classes.filter(cls => selectedClasses.has(cls.id));
    const totalBookings = affectedClasses.reduce((sum, cls) => sum + (cls.bookings?.length || 0), 0);

    Alert.alert(
      'Confirmar eliminación',
      `¿Eliminar ${count} clase${count > 1 ? 's' : ''}?\n\n${totalBookings} usuario${totalBookings !== 1 ? 's' : ''} afectado${totalBookings !== 1 ? 's' : ''}. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: confirmDeleteSelected },
      ]
    );
  }

  async function confirmDeleteSelected() {
    try {
      setDeleting(true);
      const classIds = Array.from(selectedClasses);

      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('user_id, class_id, classes(class_type, class_date, class_time)')
        .in('class_id', classIds);

      const userIdsSet = new Set<string>();
      (bookingsData || []).forEach(b => { if (b.user_id) userIdsSet.add(b.user_id); });
      const affectedUserIds = Array.from(userIdsSet);

      const { error: bookingsError } = await supabase.from('bookings').delete().in('class_id', classIds);
      if (bookingsError) throw bookingsError;

      const { error: classesError } = await supabase.from('classes').delete().in('id', classIds);
      if (classesError) throw classesError;

      if (affectedUserIds.length > 0) {
        await createNotificationsForUsers(affectedUserIds, {
          type: 'class_cancelled',
          title: 'Clases canceladas',
          message: `Se han cancelado ${classIds.length} clase${classIds.length > 1 ? 's' : ''} tuyas. Revisa tu calendario.`,
        });
      }

      const user = await getCurrentUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'bulk_delete_classes',
          target_type: 'class',
          details: { deleted_count: classIds.length, class_ids: classIds, notifications_sent: affectedUserIds.length },
        });
      }

      Alert.alert('¡Listo! ✅', `${classIds.length} clase${classIds.length > 1 ? 's' : ''} eliminada${classIds.length > 1 ? 's' : ''} correctamente`);
      exitSelectionMode();
      // El caché del mes aún tiene las clases borradas: quitarlas ya, para que
      // no reaparezcan un instante mientras llega la recarga
      setCached(monthKey(currentYear, currentMonth), classes.filter(c => !classIds.includes(c.id)));
      loadClasses();
    } catch (error: any) {
      console.error('Error deleting classes:', error);
      Alert.alert('Error', error.message || 'No se pudieron eliminar las clases');
    } finally {
      setDeleting(false);
    }
  }

  const monthDays = getMonthDays(currentYear, currentMonth);

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Gestión de Clases"
          subtitle={selectionMode ? `${selectedClasses.size} seleccionada${selectedClasses.size !== 1 ? 's' : ''}` : 'Calendario mensual'}
          onBack={() => navigation.goBack()}
          topInset={insets.top}
          rightElement={
            <View ref={bookingSettingsRef} collapsable={false}>
            <SpringPressable
              onPress={() => navigation.navigate('AdminBookingSettings')}
              style={{
                width: scale(40), height: scale(40),
                borderRadius: scale(20),
                backgroundColor: Colors.card,
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ClockIcon size={scale(22)} color={Colors.textSecondary} strokeWidth={2} />
            </SpringPressable>
            </View>
          }
        />

        <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <MonthNavigator
            month={MONTH_NAMES[currentMonth]}
            year={currentYear}
            onPrev={goToPreviousMonth}
            onNext={goToNextMonth}
          />

          <Animated.View
            entering={FadeInDown.duration(350).delay(120).springify()}
            style={{
              flexDirection: 'row', paddingHorizontal: scale(20), paddingBottom: scale(12),
              gap: scale(8), justifyContent: 'flex-end',
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
                {selectionMode ? '✕ Cancelar' : '+ Seleccionar días'}
              </Text>
            </SpringPressable>
          </Animated.View>

          {selectionMode && (
            <Animated.View
              entering={FadeInDown.duration(300).delay(150).springify()}
              style={{ flexDirection: 'row', marginHorizontal: scale(20), marginBottom: scale(12), gap: scale(8) }}
            >
              <SpringPressable
                onPress={() => { setSelectWholeDays(true); setSelectedClasses(new Set()); setExpandedDates(new Set()); }}
                style={{
                  flex: 1, paddingVertical: scale(10), borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center',
                  backgroundColor: selectWholeDays ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  borderColor: selectWholeDays ? Colors.blue500 : Colors.cardBorder,
                }}
              >
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: selectWholeDays ? Colors.blue500 : Colors.textMuted }}>
                  Días enteros
                </Text>
              </SpringPressable>
              <SpringPressable
                onPress={() => { setSelectWholeDays(false); setSelectedClasses(new Set()); setExpandedDates(new Set()); }}
                style={{
                  flex: 1, paddingVertical: scale(10), borderRadius: Radius.sm, borderWidth: 1, alignItems: 'center',
                  backgroundColor: !selectWholeDays ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                  borderColor: !selectWholeDays ? Colors.blue500 : Colors.cardBorder,
                }}
              >
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: !selectWholeDays ? Colors.blue500 : Colors.textMuted }}>
                  Por hora
                </Text>
              </SpringPressable>
            </Animated.View>
          )}

          {loading || !transitionDone ? (
            <SkeletonCalendar monthDays={monthDays} />
          ) : (
            <>
              <View ref={calendarRef} collapsable={false}>
                <CalendarGrid
                  monthDays={monthDays}
                  classesByDate={classesByDate}
                  currentYear={currentYear}
                  currentMonth={currentMonth}
                  today={today}
                  selectedDate={selectedDate}
                  selectionMode={selectionMode}
                  selectWholeDays={selectWholeDays}
                  selectedClasses={selectedClasses}
                  expandedDates={expandedDates}
                  onDayPress={handleDayPress}
                  onDaySelect={(dateStr) => setSelectedDate(selectedDate === dateStr ? null : dateStr)}
                />
              </View>

              {selectionMode && !selectWholeDays && (
                <View style={{ marginHorizontal: scale(20), marginTop: scale(16) }}>
                  {Array.from(expandedDates).map((dateStr, idx) => {
                    const dayClasses = classesByDate[dateStr] || [];
                    const date = new Date(dateStr + 'T00:00:00');
                    if (dayClasses.length === 0) return null;

                    return (
                      <Animated.View
                        key={dateStr}
                        entering={FadeInDown.duration(350).delay(200 + idx * 80).springify()}
                        style={{ marginBottom: scale(20) }}
                      >
                        <Text style={{
                          fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary,
                          marginBottom: scale(8), textTransform: 'capitalize',
                        }}>
                          {date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        {dayClasses.map(cls => {
                          const isSel = selectedClasses.has(cls.id);
                          const booked = cls.bookings?.length || 0;

                          return (
                            <SpringPressable
                              key={cls.id}
                              onPress={() => toggleClassSelection(cls.id)}
                              style={{
                                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                padding: scale(12), borderRadius: Radius.md, borderWidth: 1, marginBottom: scale(6),
                                backgroundColor: isSel ? 'rgba(239,68,68,0.15)' : Colors.card,
                                borderColor: isSel ? Colors.danger : Colors.cardBorder,
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.blue500, marginBottom: scale(2) }}>
                                  {cls.class_time.slice(0, 5)}
                                </Text>
                                <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(2) }}>
                                  {cls.name}
                                </Text>
                                {booked > 0 && (
                                  <Text style={{ fontSize: moderateScale(11), color: Colors.warning }}>
                                    {booked} reserva{booked > 1 ? 's' : ''}
                                  </Text>
                                )}
                              </View>
                              <View style={{
                                width: scale(20), height: scale(20), borderRadius: scale(10),
                                borderWidth: 2, alignItems: 'center', justifyContent: 'center',
                                borderColor: isSel ? Colors.danger : 'rgba(255,255,255,0.3)',
                                backgroundColor: isSel ? Colors.danger : 'transparent',
                              }}>
                                {isSel && <Text style={{ fontSize: moderateScale(10), color: '#fff', fontWeight: '700' }}>✓</Text>}
                              </View>
                            </SpringPressable>
                          );
                        })}
                      </Animated.View>
                    );
                  })}
                </View>
              )}

              {!selectionMode && selectedDate && classesByDate[selectedDate] && (
                <View style={{ marginHorizontal: scale(20), marginTop: scale(24) }}>
                  <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(12) }}>
                    Clases del {new Date(selectedDate + 'T00:00:00').getDate()} de {MONTH_NAMES[currentMonth]}
                  </Text>
                  {classesByDate[selectedDate].map((cls, idx) => (
                    <ClassCardRow
                      key={cls.id}
                      time={cls.class_time.slice(0, 5)}
                      name={cls.name}
                      booked={cls.bookings?.length || 0}
                      capacity={cls.max_spots}
                      index={idx}
                      onPress={() => navigation.navigate('AdminClassDetail', { classId: cls.id })}
                    />
                  ))}
                </View>
              )}

              {!selectionMode && (
                <Animated.View
                  entering={FadeInDown.duration(400).delay(300).springify()}
                  style={{
                    marginHorizontal: scale(20), marginTop: scale(24), padding: scale(16),
                    backgroundColor: Colors.card, borderRadius: Radius.md, alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600' }}>
                    Total: {classes.length} clases este mes
                  </Text>
                </Animated.View>
              )}

              <View style={{ height: scale(80) }} />
            </>
          )}
        </ScrollView>

        {!selectionMode && (
          <FAB viewRef={createClassRef} onPress={() => navigation.navigate('AdminCreateClass', { initialDate: undefined })} />
        )}

        {selectionMode && (
          <Animated.View
            entering={FadeInDown.duration(300).springify()}
            style={{
              padding: scale(20), paddingBottom: insets.bottom + scale(20),
              backgroundColor: Colors.background, borderTopWidth: 1, borderTopColor: Colors.border,
            }}
          >
            <SpringPressable
              onPress={handleDeleteSelected}
              disabled={selectedClasses.size === 0 || deleting}
              style={{
                padding: scale(18), borderRadius: Radius.md, alignItems: 'center',
                opacity: (selectedClasses.size === 0 || deleting) ? 0.5 : 1,
                backgroundColor: selectedClasses.size > 0 ? Colors.danger : Colors.card,
                shadowColor: Colors.danger, shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
              }}
            >
              <Text style={{ fontSize: moderateScale(17), fontWeight: '800', color: '#fff' }}>
                {deleting ? 'Eliminando...' : selectedClasses.size === 0 ? 'Selecciona clases para eliminar' : `Eliminar ${selectedClasses.size} clase${selectedClasses.size > 1 ? 's' : ''}`}
              </Text>
            </SpringPressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
