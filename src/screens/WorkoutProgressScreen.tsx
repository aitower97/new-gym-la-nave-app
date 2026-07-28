import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardEvent, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, ChevronRightIcon, FlexIcon, LightningIcon, PlusIcon, ScaleIcon, XIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
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
  weight: number;
  sets: number;
  reps: number;
  rpe: number | null;
}

interface ProgressExercise {
  name: string;
  group: BodyGroupKey;
  muscles: string[];
  series: number[]; // e1RM estimado, orden cronológico
  pr: number;
  first: number;
  last: number;
  delta: number | null;
  sessions: number;
  lastDate: string;
  lastSets: number;
  lastReps: number;
}

interface BwLog {
  date: string;
  weight_kg: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function rpeColor(rpe: number): string {
  if (rpe >= 8.5) return '#EF4444';
  if (rpe >= 7) return '#F59E0B';
  return '#10B981';
}

// Mini sparkline de barras (última barra resaltada)
function ProgressSparkline({ series, color }: { series: number[]; color: string }) {
  const data = series.slice(-12);
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
  const [bwLogs, setBwLogs] = useState<BwLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<BodyGroupKey>>(new Set());

  const [bwModalVisible, setBwModalVisible] = useState(false);
  const [bwInput, setBwInput] = useState('');
  const [savingBw, setSavingBw] = useState(false);
  const bwSheetTranslateY = useSharedValue(0);

  useEffect(() => {
    if (userId) loadData(userId);
  }, [userId]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { bwSheetTranslateY.value = withTiming(-e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { bwSheetTranslateY.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const bwSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bwSheetTranslateY.value }],
  }));

  async function loadData(uid: string) {
    try {
      setLoading(true);

      const [logsRes, bwRes] = await Promise.all([
        supabase.from('workout_logs').select('exercise_id, date, weight, sets, reps, rpe').eq('user_id', uid).order('date', { ascending: true }),
        supabase.from('bodyweight_logs').select('date, weight_kg').eq('user_id', uid).order('date', { ascending: true }),
      ]);
      if (logsRes.error) throw logsRes.error;
      setBwLogs((bwRes.data || []) as BwLog[]);

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
          return { date: l.date, weight: Number(l.weight), sets: l.sets ?? 1, reps: l.reps, rpe: l.rpe, exerciseName, group };
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
        const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
        const series = sorted.map((e) => estimate1RM(Number(e.weight), e.reps, e.rpe));
        const pr = Math.max(...series);
        const first = series[0];
        const last = series[series.length - 1];
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
          delta: prev !== null ? last - prev : null,
          sessions: sorted.length,
          lastDate: lastEntry.date,
          lastSets: lastEntry.sets ?? 1,
          lastReps: lastEntry.reps,
        };
      });

      // Dentro de cada zona, ordenar por más registros y luego alfabético
      result.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
      setExercises(result);
    } catch (err: any) {
      console.error('Error loading progress:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBodyweight() {
    if (!userId) return;
    const weight = parseFloat(bwInput.replace(',', '.'));
    if (isNaN(weight) || weight <= 0 || weight >= 500) {
      return;
    }
    try {
      setSavingBw(true);
      const todayStr = toDateStr(new Date());
      const { error } = await supabase
        .from('bodyweight_logs')
        .upsert({ user_id: userId, date: todayStr, weight_kg: weight }, { onConflict: 'user_id,date' });
      if (error) throw error;
      setBwLogs((prev) => {
        const withoutToday = prev.filter((b) => b.date !== todayStr);
        return [...withoutToday, { date: todayStr, weight_kg: weight }].sort((a, b) => a.date.localeCompare(b.date));
      });
      setBwModalVisible(false);
      setBwInput('');
    } catch (err: any) {
      console.error('Error saving bodyweight:', err);
    } finally {
      setSavingBw(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map<BodyGroupKey, ProgressExercise[]>();
    for (const ex of exercises) {
      if (!map.has(ex.group)) map.set(ex.group, []);
      map.get(ex.group)!.push(ex);
    }
    return BODY_GROUP_ORDER
      .filter((k) => map.has(k))
      .map((k) => ({ group: BODY_GROUPS[k], items: map.get(k)! }));
  }, [exercises]);

  const totals = useMemo(() => {
    const sessions = exercises.reduce((s, e) => s + e.sessions, 0);
    return { exercises: exercises.length, sessions };
  }, [exercises]);

  const bwCurrent = bwLogs.length > 0 ? bwLogs[bwLogs.length - 1] : null;
  const bwPrev = bwLogs.length > 1 ? bwLogs[bwLogs.length - 2] : null;
  const bwDelta = bwCurrent && bwPrev ? bwCurrent.weight_kg - bwPrev.weight_kg : null;
  const bwSeries = bwLogs.map((b) => b.weight_kg);

  function toggleGroup(k: BodyGroupKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  const hasWeeklyActivity = weeklyStats.some((w) => w.totalVolume > 0);

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
              Mi progreso
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Estadísticas de tus ejercicios
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
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
          >
            {/* Peso corporal */}
            <Animated.View
              entering={FadeInDown.duration(360).springify()}
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderRadius: Radius.lg, padding: scale(16),
                borderWidth: 1, borderColor: Colors.cardBorder,
                marginBottom: scale(14),
                flexDirection: 'row', alignItems: 'center', gap: scale(12),
              }}
            >
              <View style={{
                width: scale(42), height: scale(42), borderRadius: scale(12),
                backgroundColor: 'rgba(167,139,250,0.15)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <ScaleIcon size={scale(20)} color="#A78BFA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Peso corporal
                </Text>
                {bwCurrent ? (
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: scale(6), marginTop: scale(2) }}>
                    <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary }}>
                      {bwCurrent.weight_kg.toFixed(1)} kg
                    </Text>
                    {bwDelta !== null && bwDelta !== 0 && (
                      <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: bwDelta > 0 ? '#EF4444' : '#10B981' }}>
                        {bwDelta > 0 ? '▲' : '▼'} {Math.abs(bwDelta).toFixed(1)}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, marginTop: scale(2) }}>
                    Sin registros todavía
                  </Text>
                )}
              </View>
              {bwSeries.length >= 2 && <ProgressSparkline series={bwSeries} color="#A78BFA" />}
              <Pressable
                onPress={() => { setBwInput(bwCurrent ? String(bwCurrent.weight_kg) : ''); setBwModalVisible(true); }}
                style={{
                  width: scale(34), height: scale(34), borderRadius: scale(17),
                  backgroundColor: 'rgba(167,139,250,0.15)',
                  borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <PlusIcon size={scale(16)} color="#A78BFA" />
              </Pressable>
            </Animated.View>

            {/* Carga de entrenamiento: volumen semanal por zona + RPE */}
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

            {exercises.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: scale(40), paddingHorizontal: scale(20) }}>
                <BarbellIcon size={scale(48)} color={Colors.textMuted} />
                <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                  Sin progreso todavía
                </Text>
                <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(24) }}>
                  Cuando guardes pesos en tu entreno diario, aquí verás la evolución de cada ejercicio agrupada por zona.
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
                  style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(20) }}
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
                  <View style={{
                    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)',
                    borderRadius: Radius.md, padding: scale(14),
                    borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center',
                  }}>
                    <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: Colors.textPrimary }}>
                      {grouped.length}
                    </Text>
                    <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: scale(2) }}>
                      Zonas
                    </Text>
                  </View>
                </Animated.View>

                {/* Secciones por zona */}
                {grouped.map(({ group, items }, gi) => {
                  const isCollapsed = collapsed.has(group.key);
                  return (
                    <Animated.View
                      key={group.key}
                      entering={FadeInDown.duration(320).delay(gi * 60)}
                      style={{ marginBottom: scale(16) }}
                    >
                      {/* Cabecera de zona */}
                      <Pressable
                        onPress={() => toggleGroup(group.key)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: scale(10),
                          paddingVertical: scale(10), paddingHorizontal: scale(12),
                          borderRadius: Radius.md,
                          backgroundColor: group.color + '15',
                          borderWidth: 1, borderColor: group.color + '30',
                        }}
                      >
                        <View style={{
                          width: scale(30), height: scale(30), borderRadius: scale(15),
                          backgroundColor: group.color + '25',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FlexIcon size={scale(16)} color={group.color} />
                        </View>
                        <Text style={{ flex: 1, fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary }}>
                          {group.label}
                        </Text>
                        <View style={{
                          paddingHorizontal: scale(8), paddingVertical: scale(2),
                          borderRadius: scale(10), backgroundColor: group.color + '25',
                        }}>
                          <Text style={{ fontSize: moderateScale(11), fontWeight: '800', color: group.color }}>
                            {items.length}
                          </Text>
                        </View>
                        <View style={{ transform: [{ rotate: isCollapsed ? '0deg' : '90deg' }] }}>
                          <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
                        </View>
                      </Pressable>

                      {/* Ejercicios de la zona */}
                      {!isCollapsed && (
                        <View style={{ marginTop: scale(8), gap: scale(8) }}>
                          {items.map((ex) => (
                            <Pressable
                              key={ex.name}
                              onPress={() => navigation.navigate('WorkoutHistory', { email, name, exerciseName: ex.name })}
                              style={{
                                backgroundColor: 'rgba(255,255,255,0.04)',
                                borderRadius: Radius.md,
                                borderWidth: 1, borderColor: Colors.cardBorder,
                                borderLeftWidth: 3, borderLeftColor: group.color,
                                padding: scale(14),
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
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
                                <ProgressSparkline series={ex.series} color={group.color} />
                                <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
                              </View>

                              {/* Stats */}
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
                                    Última
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
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </Animated.View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* Modal: registrar peso corporal */}
      <Modal
        transparent
        visible={bwModalVisible}
        animationType="slide"
        onRequestClose={() => setBwModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setBwModalVisible(false)}
          />
          <Animated.View style={[bwSheetStyle, {
            backgroundColor: '#0d1929',
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            borderWidth: 1,
            borderColor: Colors.cardBorder,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, flex: 1 }}>
                Registrar peso de hoy
              </Text>
              <Pressable onPress={() => setBwModalVisible(false)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
              Peso (kg) *
            </Text>
            <TextInput
              value={bwInput}
              onChangeText={setBwInput}
              placeholder="Ej: 78.5"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
              autoFocus
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(14),
                height: scale(48),
                fontSize: moderateScale(16),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
                marginBottom: scale(20),
              }}
            />

            <Button
              onPress={handleSaveBodyweight}
              label={savingBw ? 'Guardando...' : 'Guardar'}
              loading={savingBw}
              disabled={savingBw}
              size="lg"
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
