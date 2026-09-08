import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Keyboard, KeyboardEvent, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
import { scrollFocusedInputIntoView } from '../utils/scrollToFocusedInput';
import { ExerciseProgress, buildProgressMap } from '../utils/workoutProgress';
import { LocalSetRow, emptySetRow } from '../utils/workoutSetRows';

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
  target_rows?: { sets: number | null; reps: number | null; rpe: number | null }[] | null;
  block_name: string | null;
  isOrphanLog?: boolean;
}

interface TodayLog {
  id: string;
  exercise_id: string;
  set_number: number;
  weight: number | null;
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
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog[]>>(new Map());
  const [setEntriesMap, setSetEntriesMap] = useState<Record<string, LocalSetRow[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExWeight, setNewExWeight] = useState('');
  const [newExSets, setNewExSets] = useState('');
  const [newExReps, setNewExReps] = useState('');
  const [newExRpe, setNewExRpe] = useState('');
  const [savingNewEx, setSavingNewEx] = useState(false);
  // Un único shared value con la altura del teclado impulsa TANTO el
  // translateY (subir la ficha) COMO el maxHeight (reducir su alto) — si
  // fueran dos mecanismos separados (uno animado, otro por estado de React)
  // se podían desincronizar visualmente. Sin esto, con contenido alto la
  // ficha se sale por ARRIBA de la pantalla en vez de quedar recortada por
  // abajo — bug reportado con captura real: título y "Nombre" desaparecían
  // arriba. windowHeightRef se captura UNA VEZ al montar (no
  // useWindowDimensions, que en Android con windowSoftInputMode=resize
  // puede devolver ya la altura reducida por el teclado, duplicando la
  // compensación).
  const addKeyboardHeightSV = useSharedValue(0);
  const windowHeightRef = useRef(Dimensions.get('window').height);
  const addExerciseScrollViewRef = useRef<ScrollView>(null);
  const addExerciseScrollOffsetRef = useRef(0);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { addKeyboardHeightSV.value = withTiming(e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { addKeyboardHeightSV.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const ADD_SHEET_BASE_MAX_HEIGHT = windowHeightRef.current * 0.85;
  const ADD_SHEET_MIN_MAX_HEIGHT = scale(280);

  const addSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -addKeyboardHeightSV.value }],
    maxHeight: Math.max(
      ADD_SHEET_MIN_MAX_HEIGHT,
      ADD_SHEET_BASE_MAX_HEIGHT - addKeyboardHeightSV.value
    ),
  }));

  // Si se cierra con el teclado abierto, hay que resetear el shared value a
  // mano — el listener nativo de "hide" puede tardar en llegar y la próxima
  // apertura se vería ya desplazada/encogida.
  function closeAddExerciseModal() {
    Keyboard.dismiss();
    addKeyboardHeightSV.value = 0;
    setAddModalVisible(false);
  }

  useEffect(() => {
    loadData();
  }, [selectedDateStr]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadData);
    return unsubscribe;
  }, [navigation, selectedDateStr]);

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
      const exList: Exercise[] = exRes.data || [];
      setAvatarUrl(profileRes.data?.avatar_url || null);

      // Registros de ese día cuyo ejercicio ya no está en la sesión actual
      // — el registro sigue siendo válido y hay que poder editarlo/borrarlo.
      const knownIds = new Set(exList.map((e) => e.id));
      const orphanIds = Array.from(new Set(
        (logRes.data || [])
          .map((l: any) => l.exercise_id as string)
          .filter((id: string) => !knownIds.has(id))
      ));
      if (orphanIds.length > 0) {
        const { data: orphanExRows } = await supabase
          .from('workout_exercises')
          .select('id, name')
          .in('id', orphanIds);
        (orphanExRows || []).forEach((row: any) => {
          exList.push({
            id: row.id,
            name: row.name,
            session_date: null,
            description: null,
            user_id: null,
            target_sets: null,
            target_reps: null,
            target_rpe: null,
            target_rows: null,
            block_name: null,
            isOrphanLog: true,
          });
        });
      }
      setExercises(exList);

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

      const logMap = new Map<string, TodayLog[]>();
      (logRes.data || []).forEach((log: any) => {
        const arr = logMap.get(log.exercise_id) || [];
        arr.push(log);
        logMap.set(log.exercise_id, arr);
      });

      const entriesMap: Record<string, LocalSetRow[]> = {};
      const n: Record<string, string> = {};
      exList.forEach((ex) => {
        const logsForEx = (logMap.get(ex.id) || []).slice().sort((a, b) => a.set_number - b.set_number);
        if (logsForEx.length === 0) {
          entriesMap[ex.id] = [emptySetRow(ex.id, 1)];
          n[ex.id] = '';
        } else {
          entriesMap[ex.id] = logsForEx.map((log) => ({
            key: log.id,
            dbId: log.id,
            setNumber: log.set_number,
            weight: log.weight != null ? String(log.weight) : '',
            sets: String(log.sets ?? 1),
            reps: String(log.reps),
            rpe: log.rpe ? String(log.rpe) : '',
          }));
          n[ex.id] = logsForEx[0].notes || '';
        }
      });
      setTodayLogs(logMap);
      setSetEntriesMap(entriesMap);
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
        const entries = setEntriesMap[exercise.id] || [];
        const noteVal = notes[exercise.id]?.trim() || null;

        for (const entry of entries) {
          const weightRaw = entry.weight.trim();
          const weightNum = parseFloat(weightRaw.replace(',', '.'));
          const hasWeight = weightRaw !== '' && !isNaN(weightNum) && weightNum > 0;

          const repsRaw = entry.reps.trim();
          const repsNum = parseInt(repsRaw, 10);
          const hasReps = repsRaw !== '' && !isNaN(repsNum) && repsNum > 0;

          if (!hasWeight && !hasReps) {
            if (entry.dbId) {
              await supabase.from('workout_logs').delete().eq('id', entry.dbId);
            }
            continue;
          }

          const weightVal = hasWeight ? weightNum : null;
          const setsVal = parseInt(entry.sets) || 1;
          const repVal = hasReps ? repsNum : 1;
          const rpeVal = parseInt(entry.rpe) || null;

          if (entry.dbId) {
            await supabase.from('workout_logs').update({
              weight: weightVal, sets: setsVal, reps: repVal, rpe: rpeVal, notes: noteVal,
            }).eq('id', entry.dbId);
          } else {
            await supabase.from('workout_logs').insert({
              user_id: userId,
              exercise_id: exercise.id,
              date: selectedDateStr,
              set_number: entry.setNumber,
              weight: weightVal, sets: setsVal, reps: repVal, rpe: rpeVal, notes: noteVal,
            });
          }
        }
      }

      Alert.alert('Guardado', `Entrenamiento de ${userName} registrado`);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }, [exercises, setEntriesMap, notes, userId, userName, selectedDateStr]);

  function handleSetFieldChange(exerciseId: string, key: string, field: 'weight' | 'sets' | 'reps' | 'rpe', value: string) {
    setSetEntriesMap(prev => ({
      ...prev,
      [exerciseId]: (prev[exerciseId] || []).map(e => e.key === key ? { ...e, [field]: value } : e),
    }));
  }

  function handleAddSet(exerciseId: string) {
    setSetEntriesMap(prev => {
      const current = prev[exerciseId] || [];
      const maxSetNumber = current.reduce((max, e) => Math.max(max, e.setNumber), 0);
      return { ...prev, [exerciseId]: [...current, emptySetRow(exerciseId, maxSetNumber + 1)] };
    });
  }

  async function handleRemoveSet(exerciseId: string, key: string) {
    const current = setEntriesMap[exerciseId] || [];
    const entry = current.find(e => e.key === key);
    if (!entry) return;

    if (current.length === 1) {
      if (entry.dbId) {
        await supabase.from('workout_logs').delete().eq('id', entry.dbId);
        setTodayLogs(prev => { const next = new Map(prev); next.delete(exerciseId); return next; });
      }
      setSetEntriesMap(prev => ({ ...prev, [exerciseId]: [emptySetRow(exerciseId, 1)] }));
      return;
    }

    if (entry.dbId) {
      await supabase.from('workout_logs').delete().eq('id', entry.dbId);
      setTodayLogs(prev => {
        const next = new Map(prev);
        const remaining = (next.get(exerciseId) || []).filter(l => l.id !== entry.dbId);
        if (remaining.length > 0) next.set(exerciseId, remaining); else next.delete(exerciseId);
        return next;
      });
    }
    setSetEntriesMap(prev => ({ ...prev, [exerciseId]: (prev[exerciseId] || []).filter(e => e.key !== key) }));
  }

  function handleAddExercise() {
    setNewExName('');
    setNewExWeight('');
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
      Alert.alert('RPE inválido', 'El RPE debe ser un número entre 1 y 10');
      return;
    }
    const weightTrim = newExWeight.trim().replace(',', '.');
    const weightVal = weightTrim ? parseFloat(weightTrim) : null;
    if (weightVal !== null && (isNaN(weightVal) || weightVal <= 0)) {
      Alert.alert('Peso inválido', 'El peso debe ser un número mayor que 0');
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
      const newExercise = data as Exercise;
      setExercises(prev => [...prev, newExercise]);
      setNotes(prev => ({ ...prev, [newExercise.id]: '' }));
      closeAddExerciseModal();

      if (weightVal !== null || repsVal !== null) {
        try {
          const logSets = sets || 1;
          const logReps = repsVal || 1;
          const { data: logData, error: logError } = await supabase.from('workout_logs').insert({
            user_id: userId,
            exercise_id: newExercise.id,
            date: selectedDateStr,
            set_number: 1,
            weight: weightVal, sets: logSets, reps: logReps, rpe: rpeVal, notes: null,
          }).select().single();
          if (logError) throw logError;
          const newLog = logData as TodayLog;
          setTodayLogs(prev => new Map(prev).set(newExercise.id, [newLog]));
          setSetEntriesMap(prev => ({
            ...prev,
            [newExercise.id]: [{
              key: newLog.id, dbId: newLog.id, setNumber: 1,
              weight: weightVal !== null ? String(weightVal) : '',
              sets: String(logSets), reps: String(logReps), rpe: rpeVal ? String(rpeVal) : '',
            }],
          }));
        } catch (logErr: any) {
          Alert.alert('Ejercicio añadido', 'No se pudo registrar el peso — puedes anotarlo desde la tarjeta del ejercicio.');
          setSetEntriesMap(prev => ({ ...prev, [newExercise.id]: [emptySetRow(newExercise.id, 1)] }));
        }
      } else {
        setSetEntriesMap(prev => ({ ...prev, [newExercise.id]: [emptySetRow(newExercise.id, 1)] }));
      }
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
            setTodayLogs(prev => { const next = new Map(prev); next.delete(exercise.id); return next; });
            setSetEntriesMap(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
            setNotes(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
          },
        },
      ]
    );
  }

  // Borra TODAS las series registradas ese día de un ejercicio — quitar una
  // serie suelta se hace desde la tarjeta (handleRemoveSet).
  function handleDeleteLog(exercise: Exercise) {
    const logs = todayLogs.get(exercise.id);
    if (!logs || logs.length === 0) return;
    Alert.alert(
      'Eliminar registro',
      `¿Eliminar el registro guardado de "${exercise.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('workout_logs').delete().eq('user_id', userId).eq('exercise_id', exercise.id).eq('date', selectedDateStr);
            setTodayLogs(prev => { const next = new Map(prev); next.delete(exercise.id); return next; });
            setSetEntriesMap(prev => ({ ...prev, [exercise.id]: [emptySetRow(exercise.id, 1)] }));
            setNotes(prev => ({ ...prev, [exercise.id]: '' }));
            if (exercise.isOrphanLog) {
              setExercises(prev => prev.filter(ex => ex.id !== exercise.id));
            }
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
                    setEntries={setEntriesMap[ex.id] || [emptySetRow(ex.id, 1)]}
                    notes={notes[ex.id] || ''}
                    onSetFieldChange={(key, field, v) => handleSetFieldChange(ex.id, key, field, v)}
                    onAddSet={() => handleAddSet(ex.id)}
                    onRemoveSet={(key) => handleRemoveSet(ex.id, key)}
                    onNotesChange={(v) => setNotes(prev => ({ ...prev, [ex.id]: v }))}
                    isCustom={!!ex.user_id}
                    isOrphanLog={ex.isOrphanLog}
                    registered={todayLogs.has(ex.id)}
                    deleteKind={ex.user_id ? 'exercise' : 'log'}
                    onDelete={
                      ex.user_id ? () => handleDeleteExercise(ex)
                        : todayLogs.has(ex.id) ? () => handleDeleteLog(ex)
                        : undefined
                    }
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
        onRequestClose={closeAddExerciseModal}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={closeAddExerciseModal}
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
              <Pressable onPress={closeAddExerciseModal} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView
              ref={addExerciseScrollViewRef}
              style={{ flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={(e) => { addExerciseScrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
              Nombre *
            </Text>
            <TextInput
              value={newExName}
              onChangeText={setNewExName}
              placeholder="Ej: Curl de bíceps"
              placeholderTextColor={Colors.placeholder}
              autoFocus
              onFocus={(e) => scrollFocusedInputIntoView(addExerciseScrollViewRef, addExerciseScrollOffsetRef, e)}
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
              Peso (kg) — si lo apuntas ahora, se registra ya
            </Text>
            <TextInput
              value={newExWeight}
              onChangeText={setNewExWeight}
              placeholder="Ej: 60"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
              onFocus={(e) => scrollFocusedInputIntoView(addExerciseScrollViewRef, addExerciseScrollOffsetRef, e)}
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(14),
                height: scale(48),
                fontSize: moderateScale(15),
                fontWeight: '700',
                color: Colors.textPrimary,
                textAlign: 'center',
                marginBottom: scale(16),
              }}
            />

            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
              {newExWeight.trim() ? 'Series, reps y RPE' : 'Objetivo (opcional)'}
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(10), marginBottom: scale(20) }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={newExSets}
                  onChangeText={setNewExSets}
                  placeholder="Series"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="number-pad"
                  onFocus={(e) => scrollFocusedInputIntoView(addExerciseScrollViewRef, addExerciseScrollOffsetRef, e)}
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
                  onFocus={(e) => scrollFocusedInputIntoView(addExerciseScrollViewRef, addExerciseScrollOffsetRef, e)}
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
                  onFocus={(e) => scrollFocusedInputIntoView(addExerciseScrollViewRef, addExerciseScrollOffsetRef, e)}
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
            </ScrollView>

            <View style={{ marginTop: scale(4) }}>
              <Button
                onPress={handleSaveNewExercise}
                label={savingNewEx ? 'Guardando...' : ((newExWeight.trim() || newExReps.trim()) ? 'Añadir y registrar' : 'Añadir ejercicio')}
                loading={savingNewEx}
                disabled={savingNewEx}
                size="lg"
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
