import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Keyboard, KeyboardEvent, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, XIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { toDateStr } from '../utils/planPayments';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutHistory'>;
  route: RouteProp<RootStackParamList, 'WorkoutHistory'>;
};

interface LogEntry {
  id: string;
  exercise_id: string;
  date: string;
  set_number: number;
  weight: number | null;
  sets: number;
  reps: number;
  rpe: number | null;
  notes: string | null;
}

const CHART_HEIGHT = scale(200);

const CAL_WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const CAL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const calPad = (n: number) => String(n).padStart(2, '0');

// Calendario emergente: resalta los días con registro y navega por meses.
function HistoryCalendarModal({ visible, loggedDates, initialMonth, onSelectDate, onClose }: {
  visible: boolean;
  loggedDates: Set<string>;
  initialMonth: Date;
  onSelectDate: (date: string) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(initialMonth);

  useEffect(() => {
    if (visible) setMonth(initialMonth);
  }, [visible, initialMonth]);

  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const startWeekday = (new Date(year, m, 1).getDay() + 6) % 7; // Lunes = 0

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: scale(24) }}>
        <View style={{
          width: '100%', maxWidth: 360,
          backgroundColor: '#0d1929',
          borderRadius: Radius.xl,
          borderWidth: 1, borderColor: Colors.cardBorder,
          padding: scale(18),
        }}>
          {/* Cabecera: navegación de mes */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(14) }}>
            <Pressable
              onPress={() => setMonth(new Date(year, m - 1, 1))}
              hitSlop={scale(8)}
              style={{
                width: scale(36), height: scale(36), borderRadius: scale(18),
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChevronLeftIcon size={scale(18)} color={Colors.textSecondary} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary }}>
              {CAL_MONTHS[m]} {year}
            </Text>
            <Pressable
              onPress={() => setMonth(new Date(year, m + 1, 1))}
              hitSlop={scale(8)}
              style={{
                width: scale(36), height: scale(36), borderRadius: scale(18),
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ChevronRightIcon size={scale(18)} color={Colors.textSecondary} />
            </Pressable>
          </View>

          {/* Días de la semana */}
          <View style={{ flexDirection: 'row', marginBottom: scale(6) }}>
            {CAL_WEEKDAYS.map((w) => (
              <View key={w} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textMuted }}>{w}</Text>
              </View>
            ))}
          </View>

          {/* Rejilla */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((d, i) => {
              if (d === null) return <View key={`b${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
              const dateStr = `${year}-${calPad(m + 1)}-${calPad(d)}`;
              const hasLog = loggedDates.has(dateStr);
              return (
                <View key={dateStr} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: scale(2) }}>
                  <TouchableOpacity
                    disabled={!hasLog}
                    onPress={() => onSelectDate(dateStr)}
                    activeOpacity={0.7}
                    style={{
                      flex: 1, borderRadius: Radius.sm,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: hasLog ? Colors.blue500 : 'transparent',
                    }}
                  >
                    <Text style={{
                      fontSize: moderateScale(13),
                      fontWeight: hasLog ? '800' : '500',
                      color: hasLog ? '#fff' : 'rgba(255,255,255,0.25)',
                    }}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: scale(12) }}>
            <View style={{ width: scale(10), height: scale(10), borderRadius: scale(3), backgroundColor: Colors.blue500 }} />
            <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, flex: 1 }}>
              Días con registro — toca uno para ver la sesión
            </Text>
            <Pressable onPress={onClose} hitSlop={scale(8)} style={{ padding: scale(4) }}>
              <XIcon size={scale(18)} color={Colors.textMuted} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function HistoryEntry({ log, prevDayTopWeight, index, onPress }: {
  log: LogEntry; prevDayTopWeight: number | null; index: number; onPress: () => void;
}) {
  const pressScale = useSharedValue(1);
  const shadowOp = useSharedValue(0.1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    shadowOpacity: shadowOp.value,
  }));

  const handlePressIn = () => {
    pressScale.value = withSpring(0.97, { damping: 14, stiffness: 300, mass: 0.6 });
    shadowOp.value = withTiming(0.25, { duration: 120 });
  };
  const handlePressOut = () => {
    pressScale.value = withSpring(1, { damping: 12, stiffness: 200, mass: 0.6 });
    shadowOp.value = withTiming(0.1, { duration: 280 });
  };

  // Compara contra el mejor peso del día distinto anterior (no la fila
  // físicamente anterior en la lista, que con varias series el mismo día
  // sería otra serie de la misma sesión, no la sesión anterior).
  const delta = (prevDayTopWeight != null && log.weight != null) ? log.weight - prevDayTopWeight : null;
  const isMax = index === 0;
  const dateLabel = new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(index * 50).springify()}
      style={{ marginBottom: scale(8) }}
    >
      <Animated.View style={[animStyle, {
        borderRadius: Radius.md,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
      }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{
          flexDirection: 'row', alignItems: 'center',
          backgroundColor: isMax ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.04)',
          borderRadius: Radius.md,
          padding: scale(14),
          borderWidth: 1,
          borderLeftWidth: 3,
          borderLeftColor: isMax ? Colors.blue500 : Colors.cardBorder,
          borderColor: isMax ? Colors.blue500 + '30' : Colors.cardBorder,
          gap: scale(12),
        }}
      >
        {/* Weight */}
        <View style={{ minWidth: scale(70) }}>
          <Text style={{
            fontSize: moderateScale(16), fontWeight: '800',
            color: log.weight != null ? (isMax ? Colors.blue400 : Colors.textPrimary) : Colors.textMuted,
          }}>
            {log.weight != null ? `${log.weight.toFixed(1)} kg` : 'Sin peso'}
          </Text>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textSecondary, marginTop: scale(2) }}>
            {log.sets} × {log.reps} rep{log.reps !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Notes + delta */}
        <View style={{ flex: 1 }}>
          {log.notes ? (
            <Text style={{
              fontSize: moderateScale(12), color: Colors.textSecondary,
            }} numberOfLines={2}>
              {log.notes}
            </Text>
          ) : null}
        </View>

        {/* Right: date + delta */}
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{
            fontSize: moderateScale(11), fontWeight: '600',
            color: Colors.textMuted,
          }}>
            {dateLabel}
          </Text>
          {delta !== null && delta !== 0 && (
            <Text style={{
              fontSize: moderateScale(11), fontWeight: '700', marginTop: scale(2),
              color: delta > 0 ? '#10B981' : '#EF4444',
            }}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} kg
            </Text>
          )}
        </View>
        <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export default function WorkoutHistoryScreen({ navigation, route }: Props) {
  const { exerciseId, exerciseName } = route.params;
  const insets = useSafeAreaInsets();
  const { avatarUrl, email: userEmail } = useUserProfile();
  const [displayName, setDisplayName] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [calendarVisible, setCalendarVisible] = useState(false);

  // Editar un registro sin saltar de pantalla en pantalla (antes: historial
  // → día completo → "Editar" → pantalla de entreno). Ahora se edita aquí.
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editSets, setEditSets] = useState('');
  const [editReps, setEditReps] = useState('');
  const [editRpe, setEditRpe] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const editSheetTranslateY = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { editSheetTranslateY.value = withTiming(-e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { editSheetTranslateY.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const editSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: editSheetTranslateY.value }],
  }));

  function openEditModal(log: LogEntry) {
    setEditingLog(log);
    setEditWeight(log.weight != null ? String(log.weight) : '');
    setEditSets(String(log.sets ?? 1));
    setEditReps(String(log.reps));
    setEditRpe(log.rpe ? String(log.rpe) : '');
    setEditNotes(log.notes || '');
  }

  async function handleSaveEdit() {
    if (!editingLog) return;
    // Peso opcional (ejercicios sin carga: peso corporal, cardio...) — solo
    // se valida si se ha escrito algo.
    const weightTrim = editWeight.trim().replace(',', '.');
    const weight = weightTrim ? parseFloat(weightTrim) : null;
    if (weight !== null && (isNaN(weight) || weight <= 0)) {
      Alert.alert('Peso inválido', 'El peso debe ser un número mayor que 0');
      return;
    }
    const sets = parseInt(editSets, 10) || 1;
    const reps = parseInt(editReps, 10) || 1;
    const rpeVal = editRpe.trim() ? parseInt(editRpe, 10) : null;
    if (rpeVal !== null && (isNaN(rpeVal) || rpeVal < 1 || rpeVal > 10)) {
      Alert.alert('RPE inválido', 'El RPE debe ser un número entre 1 y 10');
      return;
    }

    try {
      setSavingEdit(true);
      const { error } = await supabase.from('workout_logs').update({
        weight, sets, reps, rpe: rpeVal, notes: editNotes.trim() || null,
      }).eq('id', editingLog.id);
      if (error) throw error;
      setLogs(prev => prev.map(l => l.id === editingLog.id
        ? { ...l, weight, sets, reps, rpe: rpeVal, notes: editNotes.trim() || null }
        : l));
      setEditingLog(null);
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo guardar el registro');
    } finally {
      setSavingEdit(false);
    }
  }

  function handleDeleteEdit() {
    if (!editingLog) return;
    const log = editingLog;
    Alert.alert(
      'Eliminar registro',
      `¿Eliminar este registro del ${new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('workout_logs').delete().eq('id', log.id);
              if (error) throw error;
              setLogs(prev => prev.filter(l => l.id !== log.id));
              setEditingLog(null);
            } catch (error: any) {
              Alert.alert('Error', 'No se pudo eliminar el registro');
            }
          },
        },
      ]
    );
  }

  const loggedDates = new Set(logs.map((l) => l.date));
  const latestDate = logs.length > 0 ? logs[logs.length - 1].date : toDateStr(new Date());
  const calendarInitialMonth = new Date(latestDate + 'T00:00:00');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (exerciseName) {
        // Progreso por NOMBRE: agrega todos los días con ese ejercicio (cada día
        // es una fila distinta de workout_exercises en el modelo por fecha).
        const { data: exRows } = await supabase
          .from('workout_exercises')
          .select('id')
          .ilike('name', exerciseName);
        const ids = (exRows || []).map((r: any) => r.id);
        setDisplayName(exerciseName);
        if (ids.length === 0) {
          setLogs([]);
          return;
        }
        const { data: logData, error: logErr } = await supabase.from('workout_logs')
          .select('id, exercise_id, date, set_number, weight, sets, reps, rpe, notes')
          .eq('user_id', user.id)
          .in('exercise_id', ids)
          .order('date', { ascending: true })
          .order('set_number', { ascending: true });
        if (logErr) throw logErr;
        setLogs(logData || []);
      } else {
        const [exRes, logRes] = await Promise.all([
          supabase.from('workout_exercises').select('name').eq('id', exerciseId).single(),
          supabase.from('workout_logs')
            .select('id, exercise_id, date, set_number, weight, sets, reps, rpe, notes')
            .eq('user_id', user.id)
            .eq('exercise_id', exerciseId)
            .order('date', { ascending: true })
            .order('set_number', { ascending: true }),
        ]);

        if (exRes.error) throw exRes.error;
        if (logRes.error) throw logRes.error;

        setDisplayName(exRes.data?.name || 'Ejercicio');
        setLogs(logRes.data || []);
      }
    } catch (error: any) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }

  // Ejercicios sin peso (peso corporal, cardio...) no aportan a estas
  // estadísticas de carga — solo tiene sentido calcularlas sobre lo pesado.
  const weightedLogs = logs.filter((l): l is LogEntry & { weight: number } => l.weight != null);

  // Un día puede tener varias series (rampa de peso) — para PR/gráfica/media
  // cuenta la serie más pesada de cada día ("top set"), no cada serie suelta,
  // igual que el resto de la app (workoutProgress.ts). "logs" seguimos
  // usándolo tal cual para el listado de abajo: ahí sí interesa ver cada
  // serie por separado.
  const dailyTopsMap = new Map<string, LogEntry & { weight: number }>();
  for (const log of weightedLogs) {
    const current = dailyTopsMap.get(log.date);
    if (!current || log.weight > current.weight) dailyTopsMap.set(log.date, log);
  }
  const dailyTops = Array.from(dailyTopsMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const hasWeightData = dailyTops.length > 0;
  const maxWeight = hasWeightData ? Math.max(...dailyTops.map(l => l.weight)) : 0;
  const avgWeight = hasWeightData ? dailyTops.reduce((s, l) => s + l.weight, 0) / dailyTops.length : 0;
  const sessionDays = new Set(logs.map(l => l.date)).size;
  const screenWidth = Dimensions.get('window').width;
  const barMaxWidth = Math.min(screenWidth - scale(80), MAX_CONTENT_WIDTH - scale(80));
  const reversedLogs = [...logs].reverse();

  // Para cada fecha, el mejor peso del día distinto INMEDIATAMENTE anterior
  // (no la fila anterior en el array) — usado para el delta ↑/↓ de cada fila
  // del historial, sin que varias series del mismo día se comparen entre sí.
  const prevDayTopByDate = new Map<string, number | null>();
  dailyTops.forEach((log, i) => {
    prevDayTopByDate.set(log.date, i > 0 ? dailyTops[i - 1].weight : null);
  });

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + scale(12),
            paddingBottom: scale(16),
            paddingHorizontal: scale(20),
            borderBottomWidth: 1, borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <SpringPressable onPress={() => navigation.goBack()}>
            <View style={{
              width: scale(40), height: scale(40),
              borderRadius: scale(20),
              backgroundColor: Colors.card,
              borderWidth: 1, borderColor: Colors.cardBorder,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
            </View>
          </SpringPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              {displayName}
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Progreso de peso máximo
            </Text>
          </View>
          {logs.length > 0 && (
            <SpringPressable onPress={() => setCalendarVisible(true)}>
              <View style={{
                width: scale(40), height: scale(40),
                borderRadius: scale(20),
                backgroundColor: 'rgba(59,130,246,0.15)',
                borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <CalendarIcon size={scale(20)} color={Colors.blue400} />
              </View>
            </SpringPressable>
          )}
          <SpringPressable onPress={() => navigation.navigate('Profile', { email: userEmail })}>
            <Avatar uri={avatarUrl} size={scale(40)} />
          </SpringPressable>
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : logs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(8) }}>
              Sin registros
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
              Aún no has registrado peso para este ejercicio
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
          >
            {/* Stats summary */}
            <Animated.View
              entering={FadeInDown.duration(400).springify()}
              style={{
                flexDirection: 'row', gap: scale(10),
                marginBottom: scale(16),
              }}
            >
              {hasWeightData && (
              <>
              <View style={{
                flex: 1, backgroundColor: 'rgba(59,130,246,0.1)',
                borderRadius: Radius.md, padding: scale(14),
                borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.blue400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Máximo
                </Text>
                <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.blue400, marginTop: scale(4) }}>
                  {maxWeight.toFixed(1)}
                </Text>
                <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>kg</Text>
              </View>
              <View style={{
                flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: Radius.md, padding: scale(14),
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Media
                </Text>
                <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(4) }}>
                  {avgWeight.toFixed(1)}
                </Text>
                <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>kg</Text>
              </View>
              </>
              )}
              <View style={{
                flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: Radius.md, padding: scale(14),
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Sesiones
                </Text>
                <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(4) }}>
                  {sessionDays}
                </Text>
                <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>total</Text>
              </View>
            </Animated.View>

            {/* Chart — solo tiene sentido si hay al menos un registro con peso */}
            {hasWeightData && (
            <Animated.View
              entering={FadeInDown.duration(400).delay(80).springify()}
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: Radius.lg,
                padding: scale(16),
                borderWidth: 1, borderColor: Colors.cardBorder,
                marginBottom: scale(20),
              }}
            >
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(16) }}>
                Evolución
              </Text>
              <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(4), height: CHART_HEIGHT - scale(20) }}>
                  {dailyTops.map((log, i) => {
                    const barHeight = maxWeight > 0 ? (log.weight / maxWeight) * (CHART_HEIGHT - scale(20)) : scale(4);
                    const isMaxBar = log.weight === maxWeight;
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <Text style={{ fontSize: moderateScale(8), color: isMaxBar ? Colors.blue400 : Colors.textMuted, fontWeight: '700', marginBottom: scale(2) }}>
                          {log.weight.toFixed(0)}
                        </Text>
                        <LinearGradient
                          colors={isMaxBar
                            ? ['#3B82F6', '#2563EB']
                            : ['rgba(59,130,246,0.5)', 'rgba(59,130,246,0.25)']
                          }
                          style={{
                            width: '80%',
                            height: Math.max(barHeight, scale(4)),
                            borderRadius: scale(3),
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', marginTop: scale(8), gap: scale(4) }}>
                {dailyTops.filter((_, i) => i % Math.max(1, Math.floor(dailyTops.length / 5)) === 0 || i === dailyTops.length - 1).map((log, i) => (
                  <Text key={i} style={{ fontSize: moderateScale(9), color: Colors.textMuted, flex: 1, textAlign: 'center' }}>
                    {new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                  </Text>
                ))}
              </View>
            </Animated.View>
            )}

            {/* History list */}
            <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(12) }}>
              Historial
            </Text>
            {reversedLogs.map((log, i) => (
              <HistoryEntry
                key={log.id}
                log={log}
                prevDayTopWeight={prevDayTopByDate.get(log.date) ?? null}
                index={i}
                onPress={() => openEditModal(log)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <HistoryCalendarModal
        visible={calendarVisible}
        loggedDates={loggedDates}
        initialMonth={calendarInitialMonth}
        onClose={() => setCalendarVisible(false)}
        onSelectDate={(d) => {
          setCalendarVisible(false);
          // Puede haber varias series ese día (rampa de peso) — se abre la
          // más pesada ("top set"); las demás siguen accesibles tocándolas
          // directamente en la lista de abajo.
          const logsForDate = logs.filter(l => l.date === d);
          if (logsForDate.length === 0) return;
          const top = logsForDate.reduce((best, l) =>
            (l.weight ?? -Infinity) > (best.weight ?? -Infinity) ? l : best
          );
          openEditModal(top);
        }}
      />

      {/* Modal: editar/eliminar un registro sin salir de esta pantalla */}
      <Modal
        transparent
        visible={!!editingLog}
        animationType="slide"
        onRequestClose={() => setEditingLog(null)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setEditingLog(null)}
          />
          <Animated.View style={[editSheetStyle, {
            backgroundColor: '#0d1929',
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            maxHeight: '85%',
            borderWidth: 1,
            borderColor: Colors.cardBorder,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, flex: 1 }}>
                {editingLog && new Date(editingLog.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <Pressable onPress={() => setEditingLog(null)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
                Peso (kg, opcional)
              </Text>
              <TextInput
                value={editWeight}
                onChangeText={setEditWeight}
                placeholder="Ej: 60"
                placeholderTextColor={Colors.placeholder}
                keyboardType="decimal-pad"
                autoFocus
                style={{
                  backgroundColor: Colors.inputBg,
                  borderWidth: 1, borderColor: Colors.inputBorder,
                  borderRadius: Radius.md,
                  paddingHorizontal: scale(14),
                  height: scale(48),
                  fontSize: moderateScale(15),
                  fontWeight: '700',
                  color: Colors.textPrimary,
                  textAlign: 'center',
                  marginBottom: scale(16),
                }}
              />

              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
                Series, reps y RPE
              </Text>
              <View style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(16) }}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={editSets}
                    onChangeText={setEditSets}
                    placeholder="Series"
                    placeholderTextColor={Colors.placeholder}
                    keyboardType="number-pad"
                    style={{
                      backgroundColor: Colors.inputBg,
                      borderWidth: 1, borderColor: Colors.inputBorder,
                      borderRadius: Radius.md,
                      paddingHorizontal: scale(12),
                      height: scale(46),
                      fontSize: moderateScale(14),
                      color: Colors.textPrimary,
                      textAlign: 'center',
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={editReps}
                    onChangeText={setEditReps}
                    placeholder="Reps"
                    placeholderTextColor={Colors.placeholder}
                    keyboardType="number-pad"
                    style={{
                      backgroundColor: Colors.inputBg,
                      borderWidth: 1, borderColor: Colors.inputBorder,
                      borderRadius: Radius.md,
                      paddingHorizontal: scale(12),
                      height: scale(46),
                      fontSize: moderateScale(14),
                      color: Colors.textPrimary,
                      textAlign: 'center',
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={editRpe}
                    onChangeText={(v) => {
                      const num = parseInt(v);
                      if (v === '' || (num >= 1 && num <= 10)) setEditRpe(v);
                    }}
                    placeholder="RPE"
                    placeholderTextColor={Colors.placeholder}
                    keyboardType="number-pad"
                    maxLength={2}
                    style={{
                      backgroundColor: Colors.inputBg,
                      borderWidth: 1, borderColor: Colors.inputBorder,
                      borderRadius: Radius.md,
                      paddingHorizontal: scale(12),
                      height: scale(46),
                      fontSize: moderateScale(14),
                      color: Colors.textPrimary,
                      textAlign: 'center',
                    }}
                  />
                </View>
              </View>

              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
                Notas
              </Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Notas (opcional)"
                placeholderTextColor={Colors.placeholder}
                style={{
                  backgroundColor: Colors.inputBg,
                  borderWidth: 1, borderColor: Colors.inputBorder,
                  borderRadius: Radius.md,
                  paddingHorizontal: scale(12),
                  height: scale(40),
                  fontSize: moderateScale(13),
                  color: Colors.textPrimary,
                  marginBottom: scale(4),
                }}
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: scale(10), marginTop: scale(16) }}>
              <Pressable
                onPress={handleDeleteEdit}
                style={{
                  width: scale(52),
                  borderRadius: Radius.md,
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <TrashIcon size={scale(18)} color="#EF4444" />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Button
                  onPress={handleSaveEdit}
                  label={savingEdit ? 'Guardando...' : 'Guardar cambios'}
                  loading={savingEdit}
                  disabled={savingEdit}
                  size="lg"
                />
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
