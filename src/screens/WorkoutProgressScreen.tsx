import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, ChevronRightIcon, FlexIcon } from '../components/Icons';
import { Avatar, SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { BODY_GROUPS, BODY_GROUP_ORDER, BodyGroupKey, classifyExercise } from '../utils/exerciseClassification';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutProgress'>;
  route: RouteProp<RootStackParamList, 'WorkoutProgress'>;
};

interface RawLog {
  exercise_id: string;
  date: string;
  weight: number;
  reps: number;
}

interface ProgressExercise {
  name: string;
  group: BodyGroupKey;
  muscles: string[];
  series: number[];
  pr: number;
  first: number;
  last: number;
  delta: number | null;
  sessions: number;
  lastDate: string;
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

export default function WorkoutProgressScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { avatarUrl, userId, email: profileEmail } = useUserProfile();
  const email = route.params?.email || profileEmail || '';
  const name = route.params?.name;

  const [exercises, setExercises] = useState<ProgressExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<BodyGroupKey>>(new Set());

  useEffect(() => {
    if (userId) loadData(userId);
  }, [userId]);

  async function loadData(uid: string) {
    try {
      setLoading(true);

      const { data: logs, error } = await supabase
        .from('workout_logs')
        .select('exercise_id, date, weight, reps')
        .eq('user_id', uid)
        .order('date', { ascending: true });
      if (error) throw error;

      const rawLogs = (logs || []) as RawLog[];
      if (rawLogs.length === 0) {
        setExercises([]);
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
        const series = sorted.map((e) => Number(e.weight));
        const pr = Math.max(...series);
        const first = series[0];
        const last = series[series.length - 1];
        const prev = series.length > 1 ? series[series.length - 2] : null;
        const { group, muscles } = classifyExercise(display);
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
          lastDate: sorted[sorted.length - 1].date,
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

  function toggleGroup(k: BodyGroupKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

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
        ) : exercises.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
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
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
          >
            {/* Resumen global */}
            <Animated.View
              entering={FadeInDown.duration(400).springify()}
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
                              <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
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
                            flexDirection: 'row', alignItems: 'center',
                            gap: scale(14), marginTop: scale(12),
                            paddingTop: scale(10), borderTopWidth: 1, borderTopColor: Colors.border,
                          }}>
                            <View>
                              <Text style={{ fontSize: moderateScale(9), fontWeight: '800', color: '#F5B301', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                PR
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
          </ScrollView>
        )}
      </View>
    </View>
  );
}
