import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { ExerciseCard } from '../components/ui/ExerciseCard';
import { useUserProfile } from '../hooks/useUserProfile';
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

export default function WorkoutScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const insets = useSafeAreaInsets();
  const { avatarUrl, userId } = useUserProfile();
  const today = new Date();
  const dayOfWeek = today.getDay();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog>>(new Map());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (userId) loadData(userId);
  }, [userId]);

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

  const hasData = exercises.length > 0;

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
              Todos los ejercicios
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Registra tu entrenamiento cualquier día
            </Text>
          </View>
          <Avatar uri={avatarUrl} size={scale(40)} />
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : !hasData ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <BarbellIcon size={scale(48)} color={Colors.textMuted} />
            <Text style={{ fontSize: moderateScale(18), fontWeight: '700', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
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
            {exercises.map((ex, i) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                index={i}
                dayOfWeek={dayOfWeek}
                weight={weights[ex.id] || ''}
                reps={reps[ex.id] || '1'}
                notes={notes[ex.id] || ''}
                onWeightChange={(v) => setWeights(prev => ({ ...prev, [ex.id]: v }))}
                onRepsChange={(v) => setReps(prev => ({ ...prev, [ex.id]: v }))}
                onNotesChange={(v) => setNotes(prev => ({ ...prev, [ex.id]: v }))}
                onViewProgress={() => navigation.navigate('WorkoutHistory', { email, name, exerciseId: ex.id })}
              />
            ))}

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
