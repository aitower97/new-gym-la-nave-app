import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon } from '../components/Icons';
import { SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { BODY_GROUPS, classifyExercise } from '../utils/exerciseClassification';
import { BlockReviewItem, buildBlockReview, StatsLogEntry } from '../utils/trainingStats';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'BlockReview'>;
  route: RouteProp<RootStackParamList, 'BlockReview'>;
};

const PERIODS = [
  { label: '4 semanas', weeks: 4 },
  { label: '8 semanas', weeks: 8 },
  { label: '12 semanas', weeks: 12 },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function BlockReviewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { userId } = useUserProfile();

  const [allEntries, setAllEntries] = useState<StatsLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodIdx, setPeriodIdx] = useState(1); // 8 semanas por defecto

  useEffect(() => {
    if (userId) loadData(userId);
  }, [userId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userId) loadData(userId);
    });
    return unsubscribe;
  }, [navigation, userId]);

  async function loadData(uid: string) {
    try {
      setLoading(true);
      const { data: logs, error } = await supabase
        .from('workout_logs')
        .select('exercise_id, date, weight, sets, reps, rpe')
        .eq('user_id', uid)
        .order('date', { ascending: true });
      if (error) throw error;

      const rows = logs || [];
      const ids = Array.from(new Set(rows.map((l: any) => l.exercise_id)));
      const nameById: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: exRows } = await supabase
          .from('workout_exercises')
          .select('id, name')
          .in('id', ids);
        (exRows || []).forEach((r: any) => { nameById[r.id] = r.name; });
      }

      const entries: StatsLogEntry[] = rows
        .filter((l: any) => nameById[l.exercise_id])
        .map((l: any) => {
          const exerciseName = nameById[l.exercise_id];
          const { group } = classifyExercise(exerciseName);
          return { date: l.date, weight: l.weight != null ? Number(l.weight) : null, sets: l.sets ?? 1, reps: l.reps, rpe: l.rpe, exerciseName, group };
        });
      setAllEntries(entries);
    } catch (err: any) {
      console.error('Error loading block review:', err);
    } finally {
      setLoading(false);
    }
  }

  const weeks = PERIODS[periodIdx].weeks;
  const periodEnd = toDateStr(new Date());
  const periodStartDate = new Date();
  periodStartDate.setDate(periodStartDate.getDate() - weeks * 7);
  const periodStart = toDateStr(periodStartDate);

  const items: BlockReviewItem[] = buildBlockReview(allEntries, periodStart, periodEnd);

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
              Resumen del bloque
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Evolución del 1RM estimado por ejercicio
            </Text>
          </View>
        </Animated.View>

        {/* Selector de periodo */}
        <View style={{ flexDirection: 'row', gap: scale(8), paddingHorizontal: scale(20), paddingTop: scale(16) }}>
          {PERIODS.map((p, i) => {
            const active = i === periodIdx;
            return (
              <Pressable
                key={p.label}
                onPress={() => setPeriodIdx(i)}
                style={{
                  flex: 1, paddingVertical: scale(9),
                  borderRadius: Radius.md, alignItems: 'center',
                  backgroundColor: active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
                  borderWidth: 1, borderColor: active ? 'rgba(59,130,246,0.4)' : Colors.cardBorder,
                }}
              >
                <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: active ? Colors.blue400 : Colors.textSecondary }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : items.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <BarbellIcon size={scale(44)} color={Colors.textMuted} />
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8), textAlign: 'center' }}>
              Todavía no hay suficientes datos
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
              Necesitas al menos 2 registros del mismo ejercicio dentro de este periodo para comparar el progreso.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
          >
            {items.map((it, i) => {
              const color = BODY_GROUPS[it.group].color;
              const improved = it.delta > 0;
              return (
                <Animated.View
                  key={it.exerciseName}
                  entering={FadeInDown.duration(280).delay(i * 40)}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.04)',
                    borderRadius: Radius.md,
                    borderWidth: 1, borderColor: Colors.cardBorder,
                    borderLeftWidth: 3, borderLeftColor: color,
                    padding: scale(14),
                    marginBottom: scale(10),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
                      {it.exerciseName}
                    </Text>
                    <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <Text style={{ fontSize: moderateScale(10), fontWeight: '600', color: Colors.textSecondary }}>
                        {it.sessions} sesiones
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), marginTop: scale(12) }}>
                    <View>
                      <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Inicio
                      </Text>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textSecondary }}>
                        {it.startE1rm.toFixed(1)} kg
                      </Text>
                    </View>
                    <Text style={{ fontSize: moderateScale(16), color: Colors.textMuted }}>→</Text>
                    <View>
                      <Text style={{ fontSize: moderateScale(9), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Mejor del bloque
                      </Text>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary }}>
                        {it.endE1rm.toFixed(1)} kg
                      </Text>
                    </View>
                    <View style={{
                      marginLeft: 'auto', alignItems: 'flex-end',
                      paddingHorizontal: scale(10), paddingVertical: scale(6),
                      borderRadius: Radius.sm,
                      backgroundColor: improved ? 'rgba(16,185,129,0.12)' : it.delta < 0 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                    }}>
                      <Text style={{ fontSize: moderateScale(13), fontWeight: '800', color: improved ? '#10B981' : it.delta < 0 ? '#EF4444' : Colors.textMuted }}>
                        {improved ? '▲' : it.delta < 0 ? '▼' : '–'} {Math.abs(it.delta).toFixed(1)} kg
                      </Text>
                      <Text style={{ fontSize: moderateScale(10), fontWeight: '600', color: improved ? '#10B981' : it.delta < 0 ? '#EF4444' : Colors.textMuted }}>
                        {it.deltaPct > 0 ? '+' : ''}{it.deltaPct.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
