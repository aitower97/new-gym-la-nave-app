import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert,
  Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, ChevronRightIcon, LightningIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';
import { Avatar, SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { estimate1RM } from '../utils/e1rm';
import { BODY_GROUPS, BODY_GROUP_ORDER, BodyGroupKey, classifyExercise } from '../utils/exerciseClassification';
import { buildWeeklyStats, StatsLogEntry, WeekStats } from '../utils/trainingStats';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutProgress'>;
  route: RouteProp<RootStackParamList, 'WorkoutProgress'>;
};

interface RawLog {
  exercise_id: string;
  date: string;
  weight: number | null; // null = ejercicio sin peso (peso corporal, cardio...)
  sets: number;
  reps: number;
  rpe: number | null;
}

interface ProgressExercise {
  name: string;
  group: BodyGroupKey;
  muscles: string[];
  series: number[]; // e1RM estimado, orden cronológico (solo sesiones con peso)
  pr: number;
  first: number;
  last: number;
  delta: number | null;
  sessions: number; // todas las sesiones, con o sin peso
  lastDate: string;
  lastSets: number;
  lastReps: number;
  // Sin ningún registro con peso (solo reps/series) — no tiene sentido
  // mostrar 1RM/PR/progreso, solo el conteo de sesiones.
  hasWeightData: boolean;
  // Todos los workout_exercises.id agrupados bajo este nombre — hace falta
  // para poder borrar de golpe todos los registros del ejercicio.
  exerciseIds: string[];
}

function rpeColor(rpe: number): string {
  if (rpe >= 8.5) return '#EF4444';
  if (rpe >= 7) return '#F59E0B';
  return '#10B981';
}

// Mini sparkline de barras (última barra resaltada)
function ProgressSparkline({ series, color, maxBars = 12 }: { series: number[]; color: string; maxBars?: number }) {
  const data = series.slice(-maxBars);
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const H = scale(30);
  const base = scale(5);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(2), height: H }}>
      {data.map((v, i) => {
        const norm = (v - min) / range;
        const isLast = i === data.length - 1;
        const isPeak = v === max;
        return (
          <View
            key={i}
            style={{
              width: scale(4),
              height: base + norm * (H - base),
              borderRadius: scale(2),
              backgroundColor: isLast ? color : isPeak ? color + 'AA' : color + '44',
            }}
          />
        );
      })}
    </View>
  );
}

// Gráfico de volumen semanal apilado por zona
function WeeklyVolumeChart({ weeks }: { weeks: WeekStats[] }) {
  const maxTotal = Math.max(...weeks.map((w) => w.totalVolume), 1);
  const CHART_H = scale(84);
  const groupsPresent = BODY_GROUP_ORDER.filter((k) => weeks.some((w) => (w.byGroup[k] || 0) > 0));

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(6), height: CHART_H }}>
        {weeks.map((w) => {
          const barH = w.totalVolume > 0 ? Math.max((w.totalVolume / maxTotal) * CHART_H, scale(3)) : scale(2);
          return (
            <View key={w.weekStart} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{
                width: '100%', height: barH, borderRadius: scale(4),
                overflow: 'hidden', flexDirection: 'column-reverse',
                backgroundColor: w.totalVolume > 0 ? 'transparent' : Colors.cardBorder,
              }}>
                {BODY_GROUP_ORDER.map((k) => {
                  const v = w.byGroup[k] || 0;
                  if (v <= 0) return null;
                  const segH = (v / w.totalVolume) * barH;
                  return (
                    <View key={k} style={{ width: '100%', height: segH, backgroundColor: BODY_GROUPS[k].color }} />
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
      {/* Eje de RPE medio */}
      <View style={{ flexDirection: 'row', gap: scale(6), marginTop: scale(6) }}>
        {weeks.map((w) => (
          <View key={w.weekStart} style={{ flex: 1, alignItems: 'center', gap: scale(3) }}>
            {w.avgRpe != null ? (
              <View style={{
                width: scale(7), height: scale(7), borderRadius: scale(3.5),
                backgroundColor: rpeColor(w.avgRpe),
              }} />
            ) : (
              <View style={{ width: scale(7), height: scale(7) }} />
            )}
            <Text style={{ fontSize: moderateScale(8), color: Colors.textMuted, fontWeight: '600' }}>
              {w.label}
            </Text>
          </View>
        ))}
      </View>
      {/* Leyenda de zonas */}
      {groupsPresent.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginTop: scale(12) }}>
          {groupsPresent.map((k) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(5) }}>
              <View style={{ width: scale(8), height: scale(8), borderRadius: scale(2), backgroundColor: BODY_GROUPS[k].color }} />
              <Text style={{ fontSize: moderateScale(10), color: Colors.textSecondary, fontWeight: '600' }}>
                {BODY_GROUPS[k].label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function WorkoutProgressScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { avatarUrl, userId, email: profileEmail } = useUserProfile();
  const email = route.params?.email || profileEmail || '';
  const name = route.params?.name;

  const [exercises, setExercises] = useState<ProgressExercise[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeekStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [calc1RM, setCalc1RM] = useState('');
  const [calcPct, setCalcPct] = useState('');
  const calculatorRef = useTutorialTarget('progress-1rm-calculator');
  const volumeChartRef = useTutorialTarget('progress-volume-chart');
  const searchRef = useTutorialTarget('progress-search');
  // Si esta pantalla ya estaba en la pila con scroll (p. ej. el usuario había
  // bajado a ver ejercicios antes de abrir el tutorial), el motor vuelve a
  // ella con popTo sin resetear el scroll — la calculadora, al no estar
  // pegada arriba del todo, podría quedar fuera de lo visible.
  const scrollRef = useRef<ScrollView>(null);
  // Offset de scroll actual — measureLayout(relativeToNode) da warnings en
  // esta versión de RN ("ref.measureLayout must be called with a ref to a
  // native component"), así que para saber dónde está el buscador DENTRO
  // del contenido con scroll se usa measureInWindow (misma API que ya usa
  // el motor del tutorial, sin warnings) sobre el target y el ScrollView, y
  // se combina con el offset actual en vez de medir en relativo.
  const scrollOffsetRef = useRef(0);
  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
  useTutorialScrollAction('progress-volume-chart', scrollToTop);
  useTutorialScrollAction('progress-1rm-calculator', scrollToTop);
  // El buscador NO está pegado arriba (va después del gráfico de volumen, la
  // calculadora y el resumen global) — desplazarlo a y:0 como los anteriores
  // lo dejaba fuera de la parte visible en vez de mostrarlo, y el anillo de
  // resalto quedaba descolocado respecto a lo que realmente se veía. Se mide
  // su posición real dentro del ScrollView y se desplaza justo lo necesario.
  useTutorialScrollAction('progress-search', () => {
    const node = searchRef.current;
    const scroller = scrollRef.current;
    if (!node || !scroller) return;
    node.measureInWindow((_targetX: number, targetY: number) => {
      (scroller as unknown as { measureInWindow: (cb: (x: number, y: number) => void) => void })
        .measureInWindow((_scrollX: number, scrollY: number) => {
          const desiredY = scrollOffsetRef.current + (targetY - scrollY) - scale(16);
          scroller.scrollTo({ y: Math.max(0, desiredY), animated: true });
        });
    });
  });

  useEffect(() => {
    if (userId) loadData(userId);
  }, [userId]);

  // Refresca al volver a esta pantalla (ej. tras registrar/editar/borrar
  // un peso en Entreno o en el historial) — el stack no la desmonta.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userId) loadData(userId);
    });
    return unsubscribe;
  }, [navigation, userId]);

  async function loadData(uid: string) {
    try {
      setLoading(true);

      const logsRes = await supabase
        .from('workout_logs')
        .select('exercise_id, date, weight, sets, reps, rpe')
        .eq('user_id', uid)
        .order('date', { ascending: true });
      if (logsRes.error) throw logsRes.error;

      const rawLogs = (logsRes.data || []) as RawLog[];
      if (rawLogs.length === 0) {
        setExercises([]);
        setWeeklyStats(buildWeeklyStats([], 8));
        return;
      }

      // Nombres de los ejercicios referenciados
      const ids = Array.from(new Set(rawLogs.map((l) => l.exercise_id)));
      const { data: exRows } = await supabase
        .from('workout_exercises')
        .select('id, name')
        .in('id', ids);
      const nameById: Record<string, string> = {};
      (exRows || []).forEach((r: any) => { nameById[r.id] = r.name; });

      // Entradas anotadas con nombre y zona, para volumen semanal y carga RPE
      const statsEntries: StatsLogEntry[] = rawLogs
        .filter((l) => nameById[l.exercise_id])
        .map((l) => {
          const exerciseName = nameById[l.exercise_id];
          const { group } = classifyExercise(exerciseName);
          return { date: l.date, weight: l.weight != null ? Number(l.weight) : null, sets: l.sets ?? 1, reps: l.reps, rpe: l.rpe, exerciseName, group };
        });
      setWeeklyStats(buildWeeklyStats(statsEntries, 8));

      // Agrupar por NOMBRE (mismo ejercicio en días distintos = filas distintas)
      const byName: Record<string, { display: string; entries: RawLog[] }> = {};
      for (const log of rawLogs) {
        const display = nameById[log.exercise_id];
        if (!display) continue;
        const key = display.trim().toLowerCase();
        (byName[key] ||= { display: display.trim(), entries: [] }).entries.push(log);
      }

      const result: ProgressExercise[] = Object.values(byName).map(({ display, entries }) => {
        const exerciseIds = Array.from(new Set(entries.map((e) => e.exercise_id)));
        const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
        // El 1RM/PR solo tiene sentido sobre sesiones CON peso — un
        // ejercicio de peso corporal se cuenta en "sessions" igualmente.
        const weightedSorted = sorted.filter((e) => e.weight != null);
        const hasWeightData = weightedSorted.length > 0;
        const series = weightedSorted.map((e) => estimate1RM(e.weight, e.reps, e.rpe));
        const pr = hasWeightData ? Math.max(...series) : 0;
        const first = hasWeightData ? series[0] : 0;
        const last = hasWeightData ? series[series.length - 1] : 0;
        const prev = series.length > 1 ? series[series.length - 2] : null;
        const { group, muscles } = classifyExercise(display);
        const lastEntry = sorted[sorted.length - 1];
        return {
          name: display,
          group,
          muscles,
          series,
          pr,
          first,
          last,
          delta: hasWeightData && prev !== null ? last - prev : null,
          sessions: sorted.length,
          lastDate: lastEntry.date,
          lastSets: lastEntry.sets ?? 1,
          lastReps: lastEntry.reps,
          hasWeightData,
          exerciseIds,
        };
      });

      // Más registrados primero, luego alfabético
      result.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
      setExercises(result);
    } catch (err: any) {
      console.error('Error loading progress:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredExercises = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((ex) => ex.name.toLowerCase().includes(q));
  }, [exercises, search]);

  const calc1RMNum = parseFloat(calc1RM.replace(',', '.')) || 0;
  const calcPctNum = parseFloat(calcPct.replace(',', '.')) || 0;
  const calcResult = calc1RMNum > 0 && calcPctNum > 0 ? (calc1RMNum * calcPctNum) / 100 : null;

  // Borra TODOS los registros de este ejercicio (no la plantilla, que puede
  // estar compartida con otros alumnos) — quita el ejercicio de tu progreso.
  function handleDeleteProgressExercise(ex: ProgressExercise) {
    Alert.alert(
      'Eliminar ejercicio',
      `¿Eliminar "${ex.name}" de tu progreso? Se borrarán tus ${ex.sessions} registro${ex.sessions !== 1 ? 's' : ''} guardados. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            const { error } = await supabase.from('workout_logs')
              .delete()
              .eq('user_id', userId)
              .in('exercise_id', ex.exerciseIds);
            if (error) {
              Alert.alert('Error', 'No se pudo eliminar el ejercicio');
              return;
            }
            setExercises(prev => prev.filter(e => e.name !== ex.name));
          },
        },
      ]
    );
  }

  const totals = useMemo(() => {
    const sessions = exercises.reduce((s, e) => s + e.sessions, 0);
    return { exercises: exercises.length, sessions };
  }, [exercises]);

  // "Actividad" no es solo volumen con peso — entrenar solo con ejercicios
  // de peso corporal también cuenta como semana entrenada.
  const hasWeeklyActivity = weeklyStats.some((w) => w.totalVolume > 0 || w.sessionDays > 0);

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
              Progreso y Ejercicios
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Estadísticas y calculadora de %1RM
            </Text>
          </View>
          <SpringPressable onPress={() => navigation.navigate('Workout', { email, name })}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: scale(5),
              paddingHorizontal: scale(11), height: scale(36),
              borderRadius: scale(18),
              backgroundColor: 'rgba(59,130,246,0.15)',
              borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
            }}>
              <BarbellIcon size={scale(15)} color={Colors.blue400} />
              <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400 }}>
                Hoy
              </Text>
            </View>
          </SpringPressable>
          <SpringPressable onPress={() => navigation.navigate('Profile', { email })}>
            <Avatar uri={avatarUrl} size={scale(40)} />
          </SpringPressable>
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Carga de entrenamiento: volumen semanal por zona + RPE */}
            <View ref={volumeChartRef} collapsable={false}>
            <Animated.View
              entering={FadeInDown.duration(380).delay(40).springify()}
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: Radius.lg, padding: scale(16),
                borderWidth: 1, borderColor: Colors.cardBorder,
                marginBottom: scale(20),
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: scale(14) }}>
                <View style={{
                  width: scale(34), height: scale(34), borderRadius: scale(10),
                  backgroundColor: 'rgba(245,158,11,0.15)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <LightningIcon size={scale(17)} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: moderateScale(14), fontWeight: '800', color: Colors.textPrimary }}>
                    Carga de entrenamiento
                  </Text>
                  <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(1) }}>
                    Volumen por zona y RPE medio · últimas 8 semanas
                  </Text>
                </View>
              </View>

              {hasWeeklyActivity ? (
                <WeeklyVolumeChart weeks={weeklyStats} />
              ) : (
                <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, textAlign: 'center', paddingVertical: scale(20) }}>
                  Registra pesos en tu entreno para ver aquí tu carga semanal.
                </Text>
              )}

              <Pressable
                onPress={() => navigation.navigate('BlockReview', { email, name })}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  marginTop: scale(16), paddingVertical: scale(11),
                  borderRadius: Radius.md,
                  backgroundColor: 'rgba(59,130,246,0.12)',
                  borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
                  gap: scale(6),
                }}
              >
                <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.blue400 }}>
                  Ver resumen del bloque
                </Text>
                <ChevronRightIcon size={scale(14)} color={Colors.blue400} strokeWidth={2.5} />
              </Pressable>
            </Animated.View>
            </View>

            {/* Calculadora %1RM — visible siempre, no depende de tener historial */}
            <View ref={calculatorRef} collapsable={false}>
              <Animated.View
                entering={FadeInDown.duration(360).delay(60).springify()}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: Radius.lg, padding: scale(14),
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  marginBottom: scale(16),
                }}
              >
                <Text style={{ fontSize: moderateScale(13), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(10) }}>
                  Calculadora %1RM
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: moderateScale(10), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(4) }}>
                      1RM (kg)
                    </Text>
                    <TextInput
                      value={calc1RM}
                      onChangeText={setCalc1RM}
                      placeholder="100"
                      placeholderTextColor={Colors.placeholder}
                      keyboardType="decimal-pad"
                      style={{
                        backgroundColor: Colors.inputBg,
                        borderWidth: 1, borderColor: Colors.inputBorder,
                        borderRadius: Radius.sm,
                        height: scale(42),
                        fontSize: moderateScale(14), fontWeight: '700',
                        color: Colors.textPrimary,
                        textAlign: 'center',
                      }}
                    />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text numberOfLines={1} style={{ fontSize: moderateScale(10), marginBottom: scale(4), opacity: 0 }}>·</Text>
                    <View style={{ height: scale(42), justifyContent: 'center' }}>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textMuted }}>×</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: moderateScale(10), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(4) }}>
                      %
                    </Text>
                    <TextInput
                      value={calcPct}
                      onChangeText={setCalcPct}
                      placeholder="80"
                      placeholderTextColor={Colors.placeholder}
                      keyboardType="decimal-pad"
                      style={{
                        backgroundColor: Colors.inputBg,
                        borderWidth: 1, borderColor: Colors.inputBorder,
                        borderRadius: Radius.sm,
                        height: scale(42),
                        fontSize: moderateScale(14), fontWeight: '700',
                        color: Colors.textPrimary,
                        textAlign: 'center',
                      }}
                    />
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text numberOfLines={1} style={{ fontSize: moderateScale(10), marginBottom: scale(4), opacity: 0 }}>·</Text>
                    <View style={{ height: scale(42), justifyContent: 'center' }}>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textMuted }}>=</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Text numberOfLines={1} style={{ fontSize: moderateScale(10), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(4) }}>
                      Peso
                    </Text>
                    <View style={{
                      height: scale(42), borderRadius: Radius.sm,
                      backgroundColor: 'rgba(167,139,250,0.12)',
                      borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text numberOfLines={1} style={{ fontSize: moderateScale(14), fontWeight: '800', color: '#A78BFA' }}>
                        {calcResult !== null ? `${calcResult.toFixed(1)} kg` : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>
            </View>

            {exercises.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: scale(40), paddingHorizontal: scale(20) }}>
                <BarbellIcon size={scale(48)} color={Colors.textMuted} />
                <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                  Sin progreso todavía
                </Text>
                <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(24) }}>
                  Cuando guardes pesos en tu entreno diario, aquí verás la evolución de cada ejercicio.
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('Workout', { email, name })}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: scale(14), paddingHorizontal: scale(24),
                    borderRadius: scale(12),
                    backgroundColor: 'rgba(59,130,246,0.15)',
                    borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)',
                    gap: scale(8),
                  }}
                >
                  <BarbellIcon size={scale(18)} color={Colors.blue400} />
                  <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.blue400 }}>
                    Ir a mi entreno de hoy
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {/* Resumen global */}
                <Animated.View
                  entering={FadeInDown.duration(400).delay(80).springify()}
                  style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(16) }}
                >
                  <View style={{
                    flex: 1, backgroundColor: 'rgba(59,130,246,0.1)',
                    borderRadius: Radius.md, padding: scale(14),
                    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: Colors.blue400 }}>
                      {totals.exercises}
                    </Text>
                    <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: scale(2) }}>
                      Ejercicios
                    </Text>
                  </View>
                  <View style={{
                    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
                    borderRadius: Radius.md, padding: scale(14),
                    borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: Colors.textPrimary }}>
                      {totals.sessions}
                    </Text>
                    <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: scale(2) }}>
                      Registros
                    </Text>
                  </View>
                </Animated.View>

                {/* Buscador */}
                <View ref={searchRef} collapsable={false}>
                <Animated.View
                  entering={FadeInDown.duration(360).delay(100).springify()}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(16) }}
                >
                  <View
                    style={{
                      flex: 1,
                      flexDirection: 'row', alignItems: 'center', gap: scale(8),
                      backgroundColor: Colors.inputBg,
                      borderWidth: 1, borderColor: Colors.inputBorder,
                      borderRadius: Radius.md,
                      paddingHorizontal: scale(12),
                      height: scale(44),
                    }}
                  >
                    <SearchIcon size={scale(16)} color={Colors.textMuted} />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Buscar ejercicio..."
                      placeholderTextColor={Colors.placeholder}
                      style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textPrimary }}
                      returnKeyType="search"
                    />
                  </View>
                  <Pressable
                    onPress={() => navigation.navigate('Workout', { email, name, openAdd: true })}
                    style={{
                      width: scale(44), height: scale(44), borderRadius: Radius.md,
                      backgroundColor: 'rgba(59,130,246,0.15)',
                      borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <PlusIcon size={scale(18)} color={Colors.blue400} />
                  </Pressable>
                </Animated.View>
                </View>

                {/* Lista de ejercicios */}
                {filteredExercises.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: scale(30) }}>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted }}>
                      Ningún ejercicio coincide con "{search}"
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: scale(8) }}>
                    {filteredExercises.map((ex, i) => {
                      const color = BODY_GROUPS[ex.group].color;
                      return (
                        <Animated.View key={ex.name} entering={FadeInDown.duration(300).delay(Math.min(i, 10) * 30)}>
                          <Pressable
                            onPress={() => navigation.navigate('WorkoutHistory', { email, name, exerciseName: ex.name })}
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.04)',
                              borderRadius: Radius.md,
                              borderWidth: 1, borderColor: Colors.cardBorder,
                              borderLeftWidth: 3, borderLeftColor: color,
                              padding: scale(14),
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                              <View style={{ flex: 1 }}>
                                <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
                                  {ex.name}
                                </Text>
                                {ex.muscles.length > 0 && (
                                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(5), marginTop: scale(6) }}>
                                    {ex.muscles.map((m) => (
                                      <View key={m} style={{
                                        paddingHorizontal: scale(7), paddingVertical: scale(2),
                                        borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.05)',
                                        borderWidth: 1, borderColor: Colors.cardBorder,
                                      }}>
                                        <Text style={{ fontSize: moderateScale(9), fontWeight: '600', color: Colors.textSecondary }}>
                                          {m}
                                        </Text>
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </View>
                              <ProgressSparkline series={ex.series} color={color} maxBars={6} />
                              <Pressable
                                onPress={() => navigation.navigate('Workout', { email, name, openAdd: true, prefillName: ex.name })}
                                hitSlop={scale(6)}
                                style={{
                                  width: scale(24), height: scale(24), borderRadius: scale(12),
                                  backgroundColor: color + '15',
                                  borderWidth: 1, borderColor: color + '35',
                                  alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <PlusIcon size={scale(13)} color={color} />
                              </Pressable>
                              <Pressable
                                onPress={() => handleDeleteProgressExercise(ex)}
                                hitSlop={scale(6)}
                                style={{
                                  width: scale(24), height: scale(24), borderRadius: scale(12),
                                  backgroundColor: 'rgba(239,68,68,0.1)',
                                  borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                                  alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <TrashIcon size={scale(12)} color="#EF4444" />
                              </Pressable>
                              <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
                            </View>

                            {/* Stats */}
                            {ex.hasWeightData ? (
                            <View style={{
                              flexDirection: 'row', alignItems: 'flex-start',
                              gap: scale(14), marginTop: scale(12),
                              paddingTop: scale(10), borderTopWidth: 1, borderTopColor: Colors.border,
                            }}>
                              <View>
                                <Text style={{ fontSize: moderateScale(9), fontWeight: '800', color: '#F5B301', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  1RM est.
                                </Text>
                                <Text style={{ fontSize: moderateScale(14), fontWeight: '800', color: Colors.textPrimary }}>
                                  {ex.pr.toFixed(1)}<Text style={{ fontSize: moderateScale(9), color: Colors.textMuted }}> kg</Text>
                                </Text>
                              </View>
                              <View>
                                <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  Último 1RM
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
                                  <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textSecondary }}>
                                    {ex.last.toFixed(1)}
                                  </Text>
                                  {ex.delta !== null && ex.delta !== 0 && (
                                    <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: ex.delta > 0 ? '#10B981' : '#EF4444' }}>
                                      {ex.delta > 0 ? '▲' : '▼'}{Math.abs(ex.delta).toFixed(1)}
                                    </Text>
                                  )}
                                </View>
                                <Text style={{ fontSize: moderateScale(9), color: Colors.textMuted, marginTop: scale(1) }}>
                                  {ex.lastSets}×{ex.lastReps}
                                </Text>
                              </View>
                              <View>
                                <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  Sesiones
                                </Text>
                                <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textSecondary }}>
                                  {ex.sessions}
                                </Text>
                              </View>
                              {ex.pr - ex.first > 0 && (
                                <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
                                  <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Progreso
                                  </Text>
                                  <Text style={{ fontSize: moderateScale(14), fontWeight: '800', color: '#10B981' }}>
                                    +{(ex.pr - ex.first).toFixed(1)} kg
                                  </Text>
                                </View>
                              )}
                            </View>
                            ) : (
                            // Ejercicio sin peso (peso corporal, cardio...): el 1RM no
                            // aplica, solo mostramos sesiones y la última marca.
                            <View style={{
                              flexDirection: 'row', alignItems: 'flex-start',
                              gap: scale(14), marginTop: scale(12),
                              paddingTop: scale(10), borderTopWidth: 1, borderTopColor: Colors.border,
                            }}>
                              <View>
                                <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  Sesiones
                                </Text>
                                <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textSecondary }}>
                                  {ex.sessions}
                                </Text>
                              </View>
                              <View>
                                <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  Última
                                </Text>
                                <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textSecondary }}>
                                  {ex.lastSets}×{ex.lastReps}
                                </Text>
                              </View>
                            </View>
                            )}
                          </Pressable>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
