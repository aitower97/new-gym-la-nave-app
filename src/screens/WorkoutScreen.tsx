import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, PlusIcon } from '../components/Icons';
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
  user_id: string | null;
}

interface TodayLog {
  id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  rpe: number | null;
  notes: string | null;
}

const DAY_FILTERS = [
  { label: 'Hoy', value: -1 },
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'Todos', value: -2 },
];

const DAY_NAMES_SHORT: Record<number, string> = {
  1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes',
};

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
  const [rpes, setRpes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState(-1);

  useEffect(() => {
    if (userId) loadData(userId);
  }, [userId]);

  async function loadData(uid: string) {
    try {
      setLoading(true);
      const dateStr = today.toISOString().split('T')[0];

      const [exRes, logRes] = await Promise.all([
        supabase.from('workout_exercises').select('*').eq('is_active', true)
          .or(`user_id.is.null,user_id.eq.${uid}`)
          .order('sort_order'),
        supabase.from('workout_logs').select('*').eq('user_id', uid).eq('date', dateStr),
      ]);

      if (exRes.error) throw exRes.error;
      setExercises(exRes.data || []);

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

  const filteredExercises = useMemo(() => {
    if (selectedFilter === -2) return exercises;
    const filterDay = selectedFilter === -1 ? dayOfWeek : selectedFilter;
    return exercises.filter(ex => ex.day_of_week === filterDay);
  }, [exercises, selectedFilter, dayOfWeek]);

  const headerSubtitle = useMemo(() => {
    if (selectedFilter === -2) return 'Todos los ejercicios';
    if (selectedFilter === -1) return DAY_NAMES_SHORT[dayOfWeek] || 'Hoy';
    return DAY_NAMES_SHORT[selectedFilter] || '';
  }, [selectedFilter, dayOfWeek]);

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const dateStr = today.toISOString().split('T')[0];

      for (const exercise of filteredExercises) {
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
            date: dateStr,
            weight, reps: repVal, rpe: rpeVal, notes: noteVal,
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
  }, [userId, filteredExercises, weights, reps, rpes, notes, todayLogs]);

  const hasData = exercises.length > 0;
  const isFridayView = selectedFilter === 5 || (selectedFilter === -1 && dayOfWeek === 5);

  function handleAddFridayExercise() {
    if (!userId) return;
    Alert.prompt(
      'Añadir ejercicio',
      'Nombre del ejercicio para este viernes:',
      async (name) => {
        if (!name?.trim()) return;
        const { data, error } = await supabase.from('workout_exercises').insert({
          name: name.trim(),
          day_of_week: 5,
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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
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
              Entrenamiento
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              {headerSubtitle} · {filteredExercises.length} ejercicio{filteredExercises.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <SpringPressable onPress={() => navigation.navigate('Profile', { email: email || '' })}>
            <Avatar uri={avatarUrl} size={scale(40)} />
          </SpringPressable>
        </Animated.View>

        {/* Day filter tabs */}
        {hasData && !loading && (
          <Animated.View
            entering={FadeInDown.duration(350).delay(80).springify()}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                paddingHorizontal: scale(20),
                paddingVertical: scale(12),
                gap: scale(6),
              }}
            >
              {DAY_FILTERS.map((filter) => {
                const isActive = selectedFilter === filter.value;
                const isToday = filter.value === -1;
                const filterDayOfWeek = filter.value === -1 ? dayOfWeek : filter.value;
                const hasExercises = filter.value === -2
                  ? true
                  : exercises.some(ex => ex.day_of_week === filterDayOfWeek);

                return (
                  <Pressable
                    key={filter.value}
                    onPress={() => setSelectedFilter(filter.value)}
                    style={{
                      paddingHorizontal: scale(14),
                      paddingVertical: scale(8),
                      borderRadius: scale(20),
                      borderWidth: 1,
                      backgroundColor: isActive
                        ? 'rgba(59,130,246,0.2)'
                        : 'rgba(255,255,255,0.03)',
                      borderColor: isActive
                        ? Colors.blue500
                        : !hasExercises
                        ? 'rgba(255,255,255,0.03)'
                        : 'rgba(255,255,255,0.08)',
                      opacity: hasExercises || filter.value === -2 ? 1 : 0.4,
                    }}
                  >
                    <Text style={{
                      fontSize: moderateScale(13),
                      fontWeight: isActive ? '800' : '600',
                      color: isActive
                        ? Colors.blue500
                        : isToday
                        ? Colors.textPrimary
                        : Colors.textSecondary,
                    }}>
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        )}

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
              El administrador debe configurar los ejercicios
            </Text>
          </View>
        ) : filteredExercises.length === 0 ? (
          isFridayView ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
              <BarbellIcon size={scale(48)} color="#A78BFA" />
              <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                Viernes libre
              </Text>
              <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(24) }}>
                Añade los ejercicios que vayas a hacer hoy
              </Text>
              <Pressable
                onPress={handleAddFridayExercise}
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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
              <BarbellIcon size={scale(40)} color={Colors.textMuted} />
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                Día de descanso
              </Text>
              <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
                No hay ejercicios programados para este día
              </Text>
            </View>
          )
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredExercises.map((ex, i) => (
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
                onViewProgress={() => navigation.navigate('WorkoutHistory', { email, name, exerciseId: ex.id })}
                isCustom={!!ex.user_id}
                onDelete={ex.user_id ? () => handleDeleteExercise(ex) : undefined}
              />
            ))}

            {isFridayView && (
              <Pressable
                onPress={handleAddFridayExercise}
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
                  Añadir ejercicio
                </Text>
              </Pressable>
            )}

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
