import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from '../components/Icons';
import { SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'WorkoutHistory'>;
  route: RouteProp<RootStackParamList, 'WorkoutHistory'>;
};

interface LogEntry {
  date: string;
  weight: number;
  reps: number;
  notes: string | null;
}

const CHART_HEIGHT = scale(200);

export default function WorkoutHistoryScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const insets = useSafeAreaInsets();
  const [userId, setUserId] = useState<string>('');
  const [exerciseName, setExerciseName] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        loadData(user.id);
      }
    });
  }, []);

  async function loadData(uid: string) {
    try {
      setLoading(true);
      const [exRes, logRes] = await Promise.all([
        supabase.from('workout_exercises').select('name').eq('id', exerciseId).single(),
        supabase.from('workout_logs')
          .select('date, weight, reps, notes')
          .eq('user_id', uid)
          .eq('exercise_id', exerciseId)
          .order('date', { ascending: true }),
      ]);

      if (exRes.error) throw exRes.error;
      if (logRes.error) throw logRes.error;

      setExerciseName(exRes.data?.name || 'Ejercicio');
      setLogs(logRes.data || []);
    } catch (error: any) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }

  const maxWeight = Math.max(...logs.map(l => l.weight), 0);
  const screenWidth = Dimensions.get('window').width;
  const barMaxWidth = Math.min(screenWidth - scale(80), MAX_CONTENT_WIDTH - scale(80));

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
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
          <SpringPressable onPress={() => navigation.goBack()} style={{
            width: scale(40), height: scale(40),
            borderRadius: scale(20),
            backgroundColor: Colors.card,
            borderWidth: 1, borderColor: Colors.cardBorder,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </SpringPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              {exerciseName}
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Progreso de peso máximo
            </Text>
          </View>
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
            {/* Chart */}
            <Animated.View
              entering={FadeInDown.duration(400).springify()}
              style={{
                backgroundColor: Colors.card,
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
                  {logs.map((log, i) => {
                    const barHeight = maxWeight > 0 ? (log.weight / maxWeight) * (CHART_HEIGHT - scale(20)) : scale(4);
                    return (
                      <View key={i} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <Text style={{ fontSize: moderateScale(8), color: Colors.blue400, fontWeight: '700', marginBottom: scale(2) }}>
                          {log.weight.toFixed(0)}
                        </Text>
                        <View
                          style={{
                            width: '80%',
                            height: Math.max(barHeight, scale(4)),
                            backgroundColor: log.weight === maxWeight ? Colors.blue500 : 'rgba(59,130,246,0.4)',
                            borderRadius: scale(2),
                          }}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
              {/* Date labels */}
              <View style={{ flexDirection: 'row', marginTop: scale(8), gap: scale(4) }}>
                {logs.filter((_, i) => i % Math.max(1, Math.floor(logs.length / 5)) === 0 || i === logs.length - 1).map((log, i) => (
                  <Text key={i} style={{ fontSize: moderateScale(9), color: Colors.textMuted, flex: 1, textAlign: 'center' }}>
                    {new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                  </Text>
                ))}
              </View>
            </Animated.View>

            {/* History list */}
            <Animated.View
              entering={FadeInDown.duration(400).delay(100).springify()}
            >
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(12) }}>
                Historial
              </Text>
              {[...logs].reverse().map((log, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: Colors.card,
                    borderRadius: Radius.md,
                    padding: scale(12),
                    marginBottom: scale(6),
                    borderWidth: 1, borderColor: Colors.cardBorder,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}>
                      {log.weight.toFixed(1)} kg
                    </Text>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textSecondary }}>
                      {log.reps} rep{log.reps !== 1 ? 's' : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textMuted }}>
                      {new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                </View>
              ))}
            </Animated.View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
