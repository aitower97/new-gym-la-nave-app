import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, EditIcon } from '../components/Icons';
import { SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { BODY_GROUPS, classifyExercise } from '../utils/exerciseClassification';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutDay'>;
  route: RouteProp<RootStackParamList, 'WorkoutDay'>;
};

interface DayLog {
  name: string;
  weight: number | null;
  sets: number;
  reps: number;
  rpe: number | null;
  notes: string | null;
  color: string;
}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function WorkoutDayScreen({ navigation, route }: Props) {
  const { date } = route.params;
  const insets = useSafeAreaInsets();
  const { userId, email } = useUserProfile();

  const [logs, setLogs] = useState<DayLog[]>([]);
  const [loading, setLoading] = useState(true);

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
      const { data: logData, error } = await supabase
        .from('workout_logs')
        .select('exercise_id, weight, sets, reps, rpe, notes')
        .eq('user_id', uid)
        .eq('date', date);
      if (error) throw error;

      const rows = logData || [];
      const ids = Array.from(new Set(rows.map((l: any) => l.exercise_id)));
      const nameById: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: exRows } = await supabase
          .from('workout_exercises')
          .select('id, name')
          .in('id', ids);
        (exRows || []).forEach((r: any) => { nameById[r.id] = r.name; });
      }

      const result: DayLog[] = rows.map((l: any) => {
        const name = nameById[l.exercise_id] || 'Ejercicio';
        const { group } = classifyExercise(name);
        return {
          name,
          weight: l.weight != null ? Number(l.weight) : null,
          sets: l.sets ?? 1,
          reps: l.reps,
          rpe: l.rpe,
          notes: l.notes,
          color: BODY_GROUPS[group].color,
        };
      });
      result.sort((a, b) => a.name.localeCompare(b.name));
      setLogs(result);
    } catch (err: any) {
      console.error('Error loading day:', err);
    } finally {
      setLoading(false);
    }
  }

  const totalVolume = logs.reduce((s, l) => s + (l.weight != null ? l.weight * l.reps * l.sets : 0), 0);

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
            <Text numberOfLines={1} style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, textTransform: 'capitalize' }}>
              {formatFullDate(date)}
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Registros de ese día
            </Text>
          </View>
          <SpringPressable onPress={() => navigation.navigate('Workout', { email, date })}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: scale(6),
              paddingHorizontal: scale(12), height: scale(36),
              borderRadius: scale(18),
              backgroundColor: 'rgba(59,130,246,0.15)',
              borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
            }}>
              <EditIcon size={scale(15)} color={Colors.blue400} />
              <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400 }}>
                Editar
              </Text>
            </View>
          </SpringPressable>
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : logs.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <BarbellIcon size={scale(44)} color={Colors.textMuted} />
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
              Sin registros
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
              No registraste pesos este día
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
          >
            {/* Resumen */}
            <View style={{
              flexDirection: 'row', gap: scale(10), marginBottom: scale(16),
            }}>
              <View style={{
                flex: 1, backgroundColor: 'rgba(59,130,246,0.1)',
                borderRadius: Radius.md, padding: scale(14),
                borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)', alignItems: 'center',
              }}>
                <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: Colors.blue400 }}>
                  {logs.length}
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
                  {totalVolume % 1 === 0 ? totalVolume : totalVolume.toFixed(1)}
                </Text>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: scale(2) }}>
                  Volumen (kg)
                </Text>
              </View>
            </View>

            {/* Lista de ejercicios registrados */}
            {logs.map((l, i) => (
              <Animated.View
                key={`${l.name}-${i}`}
                entering={FadeInDown.duration(280).delay(i * 40)}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  borderRadius: Radius.md,
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  borderLeftWidth: 3, borderLeftColor: l.color,
                  padding: scale(14),
                  marginBottom: scale(8),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={{ flex: 1, fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
                    {l.name}
                  </Text>
                  {l.weight != null ? (
                    <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary }}>
                      {l.weight.toFixed(1)}<Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}> kg</Text>
                    </Text>
                  ) : (
                    <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textSecondary }}>
                        Sin peso
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: scale(8), marginTop: scale(8) }}>
                  <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textSecondary }}>
                      {l.sets} × {l.reps} rep{l.reps !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  {!!l.rpe && (
                    <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                      <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textSecondary }}>
                        RPE {l.rpe}
                      </Text>
                    </View>
                  )}
                </View>
                {!!l.notes && (
                  <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(8), fontStyle: 'italic' }}>
                    {l.notes}
                  </Text>
                )}
              </Animated.View>
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
