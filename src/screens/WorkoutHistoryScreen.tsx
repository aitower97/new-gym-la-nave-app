import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from '../components/Icons';
import { Avatar, SpringPressable } from '../components/ui';
import { useUserProfile } from '../hooks/useUserProfile';
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

function HistoryEntry({ log, prevLog, index }: {
  log: LogEntry; prevLog: LogEntry | null; index: number;
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

  const delta = prevLog ? log.weight - prevLog.weight : null;
  const isMax = index === 0;
  const dateLabel = new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'short', day: 'numeric', month: 'short',
  });

  const handlePress = () => {
    const parts = [`${log.weight.toFixed(1)} kg × ${log.reps} rep${log.reps !== 1 ? 's' : ''}`];
    if (log.notes) parts.push(`\nNotas: ${log.notes}`);
    if (delta !== null) parts.push(`\nCambio: ${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`);
    Alert.alert(dateLabel, parts.join(''));
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(300).delay(index * 50).springify()}
      style={[animStyle, {
        borderRadius: Radius.md,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        marginBottom: scale(8),
      }]}
    >
      <Pressable
        onPress={handlePress}
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
            color: isMax ? Colors.blue400 : Colors.textPrimary,
          }}>
            {log.weight.toFixed(1)} kg
          </Text>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textSecondary, marginTop: scale(2) }}>
            {log.reps} rep{log.reps !== 1 ? 's' : ''}
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
      </Pressable>
    </Animated.View>
  );
}

export default function WorkoutHistoryScreen({ navigation, route }: Props) {
  const { exerciseId } = route.params;
  const insets = useSafeAreaInsets();
  const { avatarUrl, email: userEmail } = useUserProfile();
  const [exerciseName, setExerciseName] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [exRes, logRes] = await Promise.all([
        supabase.from('workout_exercises').select('name').eq('id', exerciseId).single(),
        supabase.from('workout_logs')
          .select('date, weight, reps, notes')
          .eq('user_id', user.id)
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
  const avgWeight = logs.length > 0 ? logs.reduce((s, l) => s + l.weight, 0) / logs.length : 0;
  const screenWidth = Dimensions.get('window').width;
  const barMaxWidth = Math.min(screenWidth - scale(80), MAX_CONTENT_WIDTH - scale(80));
  const reversedLogs = [...logs].reverse();

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
              {exerciseName}
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Progreso de peso máximo
            </Text>
          </View>
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
                  {logs.length}
                </Text>
                <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>total</Text>
              </View>
            </Animated.View>

            {/* Chart */}
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
                  {logs.map((log, i) => {
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
                {logs.filter((_, i) => i % Math.max(1, Math.floor(logs.length / 5)) === 0 || i === logs.length - 1).map((log, i) => (
                  <Text key={i} style={{ fontSize: moderateScale(9), color: Colors.textMuted, flex: 1, textAlign: 'center' }}>
                    {new Date(log.date + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                  </Text>
                ))}
              </View>
            </Animated.View>

            {/* History list */}
            <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(12) }}>
              Historial
            </Text>
            {reversedLogs.map((log, i) => {
              const originalIndex = logs.length - 1 - i;
              const prevLog = originalIndex > 0 ? logs[originalIndex - 1] : null;
              return (
                <HistoryEntry
                  key={i}
                  log={log}
                  prevLog={prevLog}
                  index={i}
                />
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
