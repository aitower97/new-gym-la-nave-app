import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardEvent, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { ExerciseCard } from '../components/ui/ExerciseCard';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { groupByBlock } from '../utils/exerciseBlocks';
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
  block_name: string | null;
}

interface TodayLog {
  id: string;
  exercise_id: string;
  weight: number;
  sets: number;
  reps: number;
  rpe: number | null;
  notes: string | null;
}

const WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDaysStr = (dateStr: string, delta: number) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
};

export default function AdminUserWorkoutScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const { userId, userName } = route.params;
  const insets = useSafeAreaInsets();
  const todayStr = toDateStr(new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(todayStr);
  const isToday = selectedDateStr === todayStr;
  const selectedDate = new Date(selectedDateStr + 'T00:00:00');
  const dayOfWeek = selectedDate.getDay();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [progress, setProgress] = useState<Record<string, ExerciseProgress>>({});
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog>>(new Map());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [setsMap, setSetsMap] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [rpes, setRpes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExSets, setNewExSets] = useState('');
  const [newExReps, setNewExReps] = useState('');
  const [newExRpe, setNewExRpe] = useState('');
  const [savingNewEx, setSavingNewEx] = useState(false);
  const addSheetTranslateY = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { addSheetTranslateY.value = withTiming(-e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { addSheetTranslateY.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const addSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: addSheetTranslateY.value }],
  }));

  useEffect(() => {
    loadData();
  }, [selectedDateStr]);

  async function loadData() {
    try {
      setLoading(true);

      const [exRes, logRes, profileRes] = await Promise.all([
        supabase.from('workout_exercises').select('*').eq('is_active', true)
          .eq('session_date', selectedDateStr)
          .or(`user_id.is.null,user_id.eq.${userId}`)
          .order('sort_order'),
        supabase.from('workout_logs').select('*').eq('user_id', userId).eq('date', selectedDateStr),
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
      const s: Record<string, string> = {};
      const r: Record<string, string> = {};
      const p: Record<string, string> = {};
      const n: Record<string, string> = {};
      (logRes.data || []).forEach((log: any) => {
        logMap.set(log.exercise_id, log);
        w[log.exercise_id] = String(log.weight);
        s[log.exercise_id] = String(log.sets ?? 1);
        r[log.exercise_id] = String(log.reps);
        p[log.exercise_id] = log.rpe ? String(log.rpe) : '';
        n[log.exercise_id] = log.notes || '';
      });
      setTodayLogs(logMap);
      setWeights(w);
      setSetsMap(s);
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

        const setsVal = parseInt(setsMap[exercise.id]) || 1;
        const repVal = parseInt(reps[exercise.id]) || 1;
        const rpeVal = parseInt(rpes[exercise.id]) || null;
        const noteVal = notes[exercise.id]?.trim() || null;

        const existing = todayLogs.get(exercise.id);
        if (existing) {
          await supabase.from('workout_logs').update({
            weight, sets: setsVal, reps: repVal, rpe: rpeVal, notes: noteVal,
          }).eq('id', existing.id);
        } else {
          await supabase.from('workout_logs').insert({
            user_id: userId,
            exercise_id: exercise.id,
            date: selectedDateStr,
            weight, sets: setsVal, reps: repVal, rpe: rpeVal, notes: noteVal,
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
  }, [exercises, weights, setsMap, reps, rpes, notes, todayLogs, userId, userName, selectedDateStr]);

  function handleAddExercise() {
    setNewExName('');
    setNewExSets('');
    setNewExReps('');
    setNewExRpe('');
    setAddModalVisible(true);
  }

  async function handleSaveNewExercise() {
    const name = newExName.trim();
    if (!name) {
      Alert.alert('Campo requerido', 'El nombre del ejercicio no puede estar vacío');
      return;
    }
    const sets = newExSets.trim() ? parseInt(newExSets, 10) : null;
    const repsVal = newExReps.trim() ? parseInt(newExReps, 10) : null;
    const rpeVal = newExRpe.trim() ? parseInt(newExRpe, 10) : null;
    if (rpeVal !== null && (isNaN(rpeVal) || rpeVal < 1 || rpeVal > 10)) {
      Alert.alert('RPE inválido', 'El RPE objetivo debe ser un número entre 1 y 10');
      return;
    }

    try {
      setSavingNewEx(true);
      const { data, error } = await supabase.from('workout_exercises').insert({
        name,
        session_date: selectedDateStr,
        user_id: userId,
        is_active: true,
        sort_order: 999,
        target_sets: sets,
        target_reps: repsVal,
        target_rpe: rpeVal,
      }).select().single();
      if (error) throw error;
      setExercises(prev => [...prev, data as Exercise]);
      setAddModalVisible(false);
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo añadir el ejercicio');
    } finally {
      setSavingNewEx(false);
    }
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
              {WEEKDAY_NAMES[dayOfWeek]} {selectedDate.getDate()} {MONTH_NAMES[selectedDate.getMonth()]} · {exercises.length} ejercicio{exercises.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <Avatar uri={avatarUrl} size={scale(40)} />
        </Animated.View>

        {/* Navegador de fecha: permite registrar/editar días pasados de este usuario */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: scale(12),
          paddingHorizontal: scale(20), paddingVertical: scale(10),
          borderBottomWidth: 1, borderBottomColor: Colors.border,
        }}>
          <Pressable
            onPress={() => setSelectedDateStr(addDaysStr(selectedDateStr, -1))}
            style={{
              width: scale(36), height: scale(36), borderRadius: scale(18),
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderWidth: 1, borderColor: Colors.cardBorder,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ChevronLeftIcon size={scale(16)} color={Colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setSelectedDateStr(todayStr)} style={{ flex: 1, alignItems: 'center' }}>
            <Text numberOfLines={1} style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}>
              {isToday ? 'Hoy' : `${WEEKDAY_NAMES[dayOfWeek]} ${selectedDate.getDate()} ${MONTH_NAMES[selectedDate.getMonth()]}`}
            </Text>
            <View style={{ minHeight: scale(14), marginTop: scale(1) }}>
              {!isToday && (
                <Text numberOfLines={1} style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>
                  Toca para volver a hoy
                </Text>
              )}
            </View>
          </Pressable>
          <Pressable
            onPress={() => { if (!isToday) setSelectedDateStr(addDaysStr(selectedDateStr, 1)); }}
            disabled={isToday}
            style={{
              width: scale(36), height: scale(36), borderRadius: scale(18),
              backgroundColor: 'rgba(255,255,255,0.05)',
              borderWidth: 1, borderColor: Colors.cardBorder,
              alignItems: 'center', justifyContent: 'center',
              opacity: isToday ? 0.35 : 1,
            }}
          >
            <ChevronRightIcon size={scale(16)} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* Content */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : !hasData ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <BarbellIcon size={scale(48)} color="#A78BFA" />
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
              {isToday ? 'Sin entreno hoy' : 'Sin entreno ese día'}
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(24) }}>
              {isToday
                ? `No hay sesión preparada para hoy. Móntala en la pestaña "Sesión" o añade ejercicios sueltos para ${userName}.`
                : `No hubo sesión ese día. Añade ejercicios sueltos para ${userName} si entrenó por su cuenta.`}
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
            {groupByBlock(exercises).map((block) => (
              <View key={block.blockName ?? '__sin_bloque__'}>
                {block.blockName && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: scale(8), marginBottom: scale(10) }}>
                    <Text numberOfLines={1} style={{
                      flexShrink: 1,
                      fontSize: moderateScale(12), fontWeight: '800', color: '#A78BFA',
                      textTransform: 'uppercase', letterSpacing: 0.8,
                    }}>
                      {block.blockName}
                    </Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(167,139,250,0.2)' }} />
                  </View>
                )}
                {block.items.map((ex) => (
                  <ExerciseCard
                    key={ex.id}
                    exercise={ex}
                    index={exercises.indexOf(ex)}
                    dayOfWeek={dayOfWeek}
                    weight={weights[ex.id] || ''}
                    sets={setsMap[ex.id] || ''}
                    reps={reps[ex.id] || ''}
                    rpe={rpes[ex.id] || ''}
                    notes={notes[ex.id] || ''}
                    onWeightChange={(v) => setWeights(prev => ({ ...prev, [ex.id]: v }))}
                    onSetsChange={(v) => setSetsMap(prev => ({ ...prev, [ex.id]: v }))}
                    onRepsChange={(v) => setReps(prev => ({ ...prev, [ex.id]: v }))}
                    onRpeChange={(v) => setRpes(prev => ({ ...prev, [ex.id]: v }))}
                    onNotesChange={(v) => setNotes(prev => ({ ...prev, [ex.id]: v }))}
                    isCustom={!!ex.user_id}
                    onDelete={ex.user_id ? () => handleDeleteExercise(ex) : undefined}
                    progress={progress[ex.id]}
                  />
                ))}
              </View>
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

      {/* Modal: añadir ejercicio suelto para este usuario */}
      <Modal
        transparent
        visible={addModalVisible}
        animationType="slide"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setAddModalVisible(false)}
          />
          <Animated.View style={[addSheetStyle, {
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
                Añadir ejercicio para {userName}
              </Text>
              <Pressable onPress={() => setAddModalVisible(false)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
              Nombre *
            </Text>
            <TextInput
              value={newExName}
              onChangeText={setNewExName}
              placeholder="Ej: Curl de bíceps"
              placeholderTextColor={Colors.placeholder}
              autoFocus
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(14),
                height: scale(48),
                fontSize: moderateScale(15),
                color: Colors.textPrimary,
                marginBottom: scale(16),
              }}
            />

            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
              Objetivo (opcional)
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(20) }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={newExSets}
                  onChangeText={setNewExSets}
                  placeholder="Series"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="number-pad"
                  style={{
                    backgroundColor: Colors.inputBg,
                    borderWidth: 1, borderColor: Colors.inputBorder,
                    borderRadius: Radius.md,
                    paddingHorizontal: scale(12),
                    height: scale(46),
                    fontSize: moderateScale(14),
                    color: Colors.textPrimary,
                    textAlign: 'center',
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={newExReps}
                  onChangeText={setNewExReps}
                  placeholder="Reps"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="number-pad"
                  style={{
                    backgroundColor: Colors.inputBg,
                    borderWidth: 1, borderColor: Colors.inputBorder,
                    borderRadius: Radius.md,
                    paddingHorizontal: scale(12),
                    height: scale(46),
                    fontSize: moderateScale(14),
                    color: Colors.textPrimary,
                    textAlign: 'center',
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={newExRpe}
                  onChangeText={setNewExRpe}
                  placeholder="RPE"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{
                    backgroundColor: Colors.inputBg,
                    borderWidth: 1, borderColor: Colors.inputBorder,
                    borderRadius: Radius.md,
                    paddingHorizontal: scale(12),
                    height: scale(46),
                    fontSize: moderateScale(14),
                    color: Colors.textPrimary,
                    textAlign: 'center',
                  }}
                />
              </View>
            </View>

            <Button
              onPress={handleSaveNewExercise}
              label={savingNewEx ? 'Añadiendo...' : 'Añadir ejercicio'}
              loading={savingNewEx}
              disabled={savingNewEx}
              size="lg"
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
