import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, PlusIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { ExerciseCard } from '../components/ui/ExerciseCard';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { ExerciseProgress, buildProgressMap } from '../utils/workoutProgress';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUserWorkout'>;
  route: RouteProp<RootStackParamList, 'AdminUserWorkout'>;
};

interface Exercise {
  id: string;
  name: string;
  session_date: string | null;
  description: string | null;
  user_id: string | null;
  target_sets: number | null;
  target_reps: number | null;
  target_rpe: number | null;
}

interface TodayLog {
  id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  rpe: number | null;
  notes: string | null;
}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export default function AdminUserWorkoutScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const { userId, userName } = route.params;
  const insets = useSafeAreaInsets();
  const today = new Date();
  const dayOfWeek = today.getDay();
  const todayStr = toDateStr(today);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [progress, setProgress] = useState<Record<string, ExerciseProgress>>({});
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog>>(new Map());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [rpes, setRpes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const [exRes, logRes, profileRes] = await Promise.all([
        supabase.from('workout_exercises').select('*').eq('is_active', true)
          .eq('session_date', todayStr)
          .or(`user_id.is.null,user_id.eq.${userId}`)
          .order('sort_order'),
        supabase.from('workout_logs').select('*').eq('user_id', userId).eq('date', todayStr),
        supabase.from('profiles').select('avatar_url').eq('id', userId).single(),
      ]);

      if (exRes.error) throw exRes.error;
      const exList = exRes.data || [];
      setExercises(exList);
      setAvatarUrl(profileRes.data?.avatar_url || null);

      const exIds = exList.map((e: Exercise) => e.id);
      if (exIds.length > 0) {
        const { data: histLogs } = await supabase
          .from('workout_logs')
          .select('exercise_id, date, weight')
          .eq('user_id', userId)
          .in('exercise_id', exIds)
          .order('date', { ascending: true });
        setProgress(buildProgressMap(histLogs || []));
      } else {
        setProgress({});
      }

      const logMap = new Map<string, TodayLog>();
      const w: Record<string, string> = {};
      const r: Record<string, string> = {};
      const p: Record<string, string> = {};
      const n: Record<string, string> = {};
      (logRes.data || []).forEach((log: any) => {
        logMap.set(log.exercise_id, log);
        w[log.exercise_id] = String(log.weight);
        r[log.exercise_id] = String(log.reps);
        p[log.exercise_id] = log.rpe ? String(log.rpe) : '';
        n[log.exercise_id] = log.notes || '';
      });
      setTodayLogs(logMap);
      setWeights(w);
      setReps(r);
      setRpes(p);
      setNotes(n);
    } catch (error: any) {
      console.error('Error loading workout:', error);
    } finally {
      setLoading(false);
    }
  }

  const hasData = exercises.length > 0;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      for (const exercise of exercises) {
        const weight = parseFloat(weights[exercise.id]);
        if (isNaN(weight) || weight <= 0) continue;

        const repVal = parseInt(reps[exercise.id]) || 1;
        const rpeVal = parseInt(rpes[exercise.id]) || null;
        const noteVal = notes[exercise.id]?.trim() || null;

        const existing = todayLogs.get(exercise.id);
        if (existing) {
          await supabase.from('workout_logs').update({
            weight, reps: repVal, rpe: rpeVal, notes: noteVal,
          }).eq('id', existing.id);
        } else {
          await supabase.from('workout_logs').insert({
            user_id: userId,
            exercise_id: exercise.id,
            date: todayStr,
            weight, reps: repVal, rpe: rpeVal, notes: noteVal,
          });
        }
      }

      Alert.alert('Guardado', `Entrenamiento de ${userName} registrado`);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }, [exercises, weights, reps, rpes, notes, todayLogs, userId, userName, todayStr]);

  function handleAddExercise() {
    if (Platform.OS !== 'ios') {
      Alert.alert('Añadir ejercicio', 'Añadir ejercicios personalizados por nombre solo está disponible en iOS. Usa la pestaña "Sesión" para montar la sesión del día.');
      return;
    }
    Alert.prompt(
      'Añadir ejercicio',
      `Nombre del ejercicio para ${userName} (solo hoy):`,
      async (exName) => {
        if (!exName?.trim()) return;
        const { data, error } = await supabase.from('workout_exercises').insert({
          name: exName.trim(),
          session_date: todayStr,
          user_id: userId,
          is_active: true,
          sort_order: 999,
        }).select().single();
        if (!error && data) {
          setExercises(prev => [...prev, data as Exercise]);
        } else if (error) {
          Alert.alert('Error', 'No se pudo añadir el ejercicio');
        }
      },
      'plain-text'
    );
  }

  function handleDeleteExercise(exercise: Exercise) {
    Alert.alert(
      'Eliminar ejercicio',
      `¿Eliminar "${exercise.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('workout_exercises').delete().eq('id', exercise.id);
            setExercises(prev => prev.filter(ex => ex.id !== exercise.id));
          },
        },
      ]
    );
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        {/* Header */}
        <Animated.View
          entering={FadeIn.duration(350)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + scale(12),
            paddingBottom: scale(12),
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
              {userName}
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              {WEEKDAY_NAMES[dayOfWeek]} {today.getDate()} {MONTH_NAMES[today.getMonth()]} · {exercises.length} ejercicio{exercises.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Avatar uri={avatarUrl} size={scale(40)} />
        </Animated.View>

        {/* Content */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : !hasData ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <BarbellIcon size={scale(48)} color="#A78BFA" />
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
              Sin entreno hoy
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(24) }}>
              No hay sesión preparada para hoy. Móntala en la pestaña "Sesión" o añade ejercicios sueltos para {userName}.
            </Text>
            <Pressable
              onPress={handleAddExercise}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingVertical: scale(14), paddingHorizontal: scale(24),
                borderRadius: scale(12),
                backgroundColor: 'rgba(167,139,250,0.15)',
                borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
                gap: scale(8),
              }}
            >
              <PlusIcon size={scale(18)} color="#A78BFA" />
              <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#A78BFA' }}>
                Añadir ejercicio
              </Text>
            </Pressable>
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
                reps={reps[ex.id] || ''}
                rpe={rpes[ex.id] || ''}
                notes={notes[ex.id] || ''}
                onWeightChange={(v) => setWeights(prev => ({ ...prev, [ex.id]: v }))}
                onRepsChange={(v) => setReps(prev => ({ ...prev, [ex.id]: v }))}
                onRpeChange={(v) => setRpes(prev => ({ ...prev, [ex.id]: v }))}
                onNotesChange={(v) => setNotes(prev => ({ ...prev, [ex.id]: v }))}
                isCustom={!!ex.user_id}
                onDelete={ex.user_id ? () => handleDeleteExercise(ex) : undefined}
                progress={progress[ex.id]}
              />
            ))}

            <Pressable
              onPress={handleAddExercise}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                marginTop: scale(4), marginBottom: scale(8),
                paddingVertical: scale(12),
                borderRadius: scale(10),
                borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)',
                backgroundColor: 'rgba(167,139,250,0.07)',
                gap: scale(8),
              }}
            >
              <PlusIcon size={scale(16)} color="#A78BFA" />
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: '#A78BFA' }}>
                Añadir ejercicio para {userName}
              </Text>
            </Pressable>

            <View style={{ marginTop: scale(8) }}>
              <Button
                onPress={handleSave}
                label={saving ? 'Guardando...' : `Guardar entrenamiento de ${userName}`}
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
