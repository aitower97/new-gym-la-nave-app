import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon } from '../components/Icons';
import { Button, SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Workout'>;
  route: RouteProp<RootStackParamList, 'Workout'>;
};

interface Exercise {
  id: string;
  name: string;
  day_of_week: number;
  description: string | null;
}

interface TodayLog {
  id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  notes: string | null;
}

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export default function WorkoutScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const today = new Date();
  const dayOfWeek = today.getDay();

  const [userId, setUserId] = useState<string>('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog>>(new Map());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      const dateStr = today.toISOString().split('T')[0];

      const [exRes, logRes] = await Promise.all([
        supabase.from('workout_exercises').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('workout_logs').select('*').eq('user_id', uid).eq('date', dateStr),
      ]);

      if (exRes.error) throw exRes.error;
      setExercises(exRes.data || []);

      const logMap = new Map<string, TodayLog>();
      const w: Record<string, string> = {};
      const r: Record<string, string> = {};
      const n: Record<string, string> = {};
      (logRes.data || []).forEach((log: any) => {
        logMap.set(log.exercise_id, log);
        w[log.exercise_id] = String(log.weight);
        r[log.exercise_id] = String(log.reps || 1);
        n[log.exercise_id] = log.notes || '';
      });
      setTodayLogs(logMap);
      setWeights(w);
      setReps(r);
      setNotes(n);
    } catch (error: any) {
      console.error('Error loading workout:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const dateStr = today.toISOString().split('T')[0];
      const todayExerciseIds = new Set(exercises.map(e => e.id));

      for (const exercise of exercises) {
        const weight = parseFloat(weights[exercise.id]);
        if (isNaN(weight) || weight <= 0) continue;

        const repVal = parseInt(reps[exercise.id]) || 1;
        const noteVal = notes[exercise.id]?.trim() || null;

        const existing = todayLogs.get(exercise.id);
        if (existing) {
          await supabase.from('workout_logs').update({
            weight, reps: repVal, notes: noteVal,
          }).eq('id', existing.id);
        } else {
          await supabase.from('workout_logs').insert({
            user_id: userId,
            exercise_id: exercise.id,
            date: dateStr,
            weight, reps: repVal, notes: noteVal,
          });
        }
      }

      Alert.alert('Guardado', 'Entrenamiento registrado');
      loadData(userId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }, [userId, exercises, weights, reps, notes, todayLogs]);

  // Always show all exercises, not filtered by day
  const hasData = exercises.length > 0;

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
              Todos los ejercicios
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Registra tu entrenamiento cualquier día
            </Text>
          </View>
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : !hasData ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(8) }}>
              Sin ejercicios
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
              El administrador debe configurar los ejercicios en la base de datos
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            keyboardShouldPersistTaps="handled"
          >
            {exercises.map((ex, i) => {
              const isTodayExercise = ex.day_of_week === dayOfWeek;
              return (
              <Animated.View
                key={ex.id}
                entering={FadeInDown.duration(350).delay(100 + i * 80).springify()}
                style={{
                  backgroundColor: Colors.card,
                  borderRadius: Radius.lg,
                  padding: scale(16),
                  marginBottom: scale(12),
                  borderWidth: 1, borderColor: isTodayExercise ? Colors.blue500 + '40' : Colors.cardBorder,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(6) }}>
                  <View style={{
                    paddingHorizontal: scale(8), paddingVertical: scale(3),
                    borderRadius: Radius.sm,
                    backgroundColor: isTodayExercise ? 'rgba(59,130,246,0.15)' : 'rgba(100,100,120,0.1)',
                  }}>
                    <Text style={{
                      fontSize: moderateScale(10), fontWeight: '700',
                      color: isTodayExercise ? Colors.blue400 : Colors.textMuted,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>
                      {DAY_NAMES[ex.day_of_week]}
                    </Text>
                  </View>
                  {isTodayExercise && (
                    <View style={{
                      paddingHorizontal: scale(8), paddingVertical: scale(3),
                      borderRadius: Radius.sm,
                      backgroundColor: 'rgba(16,185,129,0.15)',
                    }}>
                      <Text style={{
                        fontSize: moderateScale(10), fontWeight: '700',
                        color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>
                        Hoy
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.blue400, marginBottom: scale(4) }}>
                  {ex.name}
                </Text>
                {ex.description && (
                  <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginBottom: scale(12) }}>
                    {ex.description}
                  </Text>
                )}

                <View style={{ flexDirection: 'row', gap: scale(12), marginBottom: scale(12) }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(4) }}>
                      Peso (kg)
                    </Text>
                    <TextInput
                      value={weights[ex.id] || ''}
                      onChangeText={(v) => setWeights(prev => ({ ...prev, [ex.id]: v }))}
                      placeholder="0.0"
                      placeholderTextColor={Colors.placeholder}
                      keyboardType="decimal-pad"
                      style={{
                        backgroundColor: Colors.inputBg,
                        borderWidth: 1, borderColor: Colors.inputBorder,
                        borderRadius: Radius.sm,
                        paddingHorizontal: scale(12),
                        height: scale(44),
                        fontSize: scale(16),
                        fontWeight: '700',
                        color: Colors.textPrimary,
                        textAlign: 'center',
                      }}
                    />
                  </View>
                  <View style={{ width: scale(70) }}>
                    <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(4) }}>
                      Reps
                    </Text>
                    <TextInput
                      value={reps[ex.id] || '1'}
                      onChangeText={(v) => setReps(prev => ({ ...prev, [ex.id]: v }))}
                      keyboardType="number-pad"
                      style={{
                        backgroundColor: Colors.inputBg,
                        borderWidth: 1, borderColor: Colors.inputBorder,
                        borderRadius: Radius.sm,
                        paddingHorizontal: scale(12),
                        height: scale(44),
                        fontSize: scale(16),
                        fontWeight: '700',
                        color: Colors.textPrimary,
                        textAlign: 'center',
                      }}
                    />
                  </View>
                </View>

                <TextInput
                  value={notes[ex.id] || ''}
                  onChangeText={(v) => setNotes(prev => ({ ...prev, [ex.id]: v }))}
                  placeholder="Notas (opcional)"
                  placeholderTextColor={Colors.placeholder}
                  style={{
                    backgroundColor: Colors.inputBg,
                    borderWidth: 1, borderColor: Colors.inputBorder,
                    borderRadius: Radius.sm,
                    paddingHorizontal: scale(12),
                    height: scale(40),
                    fontSize: scale(13),
                    color: Colors.textPrimary,
                  }}
                />

                <SpringPressable
                  onPress={() => navigation.navigate('WorkoutHistory', { email, name, exerciseId: ex.id })}
                  style={{
                    marginTop: scale(10),
                    paddingVertical: scale(8),
                    borderRadius: Radius.sm,
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.blue400 }}>
                    Ver progreso →
                  </Text>
                </SpringPressable>
              </Animated.View>
              );
            })}

            <View style={{ marginTop: scale(8) }}>
              <Button
                onPress={handleSave}
                label={saving ? 'Guardando...' : 'Guardar entrenamiento'}
                loading={saving}
                disabled={saving}
                size="lg"
              />
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
