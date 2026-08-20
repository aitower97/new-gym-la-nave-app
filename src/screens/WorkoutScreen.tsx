import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardEvent, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, PlusIcon, XIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { ExerciseCard } from '../components/ui/ExerciseCard';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useTutorialScreenLoaded, useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { groupByBlock } from '../utils/exerciseBlocks';
import { ExerciseProgress, buildProgressMap } from '../utils/workoutProgress';
import { TodayWorkoutAccess, formatUnlockTime, getTodayWorkoutAccess } from '../utils/workoutAccess';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Workout'>;
  route: RouteProp<RootStackParamList, 'Workout'>;
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
  // Tiene un registro guardado para este día pero ya no aparece en la
  // sesión (el admin lo quitó, cambió de bloque, etc.) — se muestra igual
  // para poder editar/eliminar el registro, nunca debe desaparecer solo.
  isOrphanLog?: boolean;
}

interface TodayLog {
  id: string;
  exercise_id: string;
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

export default function WorkoutScreen({ navigation, route }: Props) {
  const { email, name, date, openAdd, prefillName } = route.params;
  const insets = useSafeAreaInsets();
  const { avatarUrl, userId } = useUserProfile();
  const todayStr = toDateStr(new Date());
  const initialDateStr = date && date <= todayStr ? date : todayStr;
  const [selectedDateStr, setSelectedDateStr] = useState(initialDateStr);
  const isToday = selectedDateStr === todayStr;
  const selectedDate = new Date(selectedDateStr + 'T00:00:00');
  const dayOfWeek = selectedDate.getDay();

  const addExerciseRef = useTutorialTarget('workout-add-exercise');
  // Envuelve TODO el área de contenido (spinner / "sin entreno" / lista +
  // guardar) en vez de apuntar a una tarjeta o al botón "Guardar" concretos:
  // esos solo existen si el usuario tiene un entreno asignado ese día, y
  // para una cuenta sin nada asignado (el caso más común al hacer el tour
  // por primera vez) el paso se saltaba en silencio, sin nada que resaltar.
  // Este contenedor, al tener flex:1 y no depender de qué rama interna se
  // renderice, SIEMPRE existe — el paso nunca "queda mal" por falta de datos.
  const sessionAreaRef = useTutorialTarget('workout-session');
  // "Añadir ejercicio propio" (cuando ya hay ejercicios) vive al final de la
  // lista con scroll — si la pantalla no está desplazada hasta abajo cuando
  // el tutorial llega a ese paso, el elemento puede quedar fuera de lo
  // visible aunque el ref exista.
  const scrollRef = useRef<ScrollView>(null);
  useTutorialScrollAction('workout-add-exercise', () => scrollRef.current?.scrollToEnd({ animated: true }));
  // El área de sesión se resalta entera (flex:1): se vuelve a dejar la lista
  // arriba del todo para que, si hay entreno, se vea desde el primer
  // ejercicio en vez de quedarse donde la dejó el paso anterior.
  useTutorialScrollAction('workout-session', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [todayAccess, setTodayAccess] = useState<TodayWorkoutAccess | null>(null);
  const [progress, setProgress] = useState<Record<string, ExerciseProgress>>({});
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog>>(new Map());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [setsMap, setSetsMap] = useState<Record<string, string>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [rpes, setRpes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  useTutorialScreenLoaded('Workout', !loading);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExWeight, setNewExWeight] = useState('');
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
    if (userId) loadData(userId);
  }, [userId, selectedDateStr]);

  // Refresca al volver a esta pantalla (ej. tras editar/borrar un registro
  // en el historial y pulsar atrás) — el stack no desmonta la pantalla.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (userId) loadData(userId);
    });
    return unsubscribe;
  }, [navigation, userId, selectedDateStr]);

  // Entrada directa desde "Mi progreso" (botón añadir ejercicio, o "+" en
  // un ejercicio existente para registrar un nuevo día por libre)
  useEffect(() => {
    if (openAdd && userId) handleAddOwnExercise(prefillName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAdd, userId]);

  async function loadData(uid: string) {
    try {
      setLoading(true);

      let wodLocked = false;
      if (selectedDateStr === todayStr) {
        const access = await getTodayWorkoutAccess(uid, selectedDateStr);
        setTodayAccess(access);
        wodLocked = !access.isUnlocked;
      } else {
        setTodayAccess(null);
      }

      // Bloqueada la sesión del entrenador (evita el spoiler del WOD) no
      // significa bloquear al usuario: si entrena por su cuenta sin clase
      // reservada, sigue pudiendo ver/añadir SUS propios ejercicios de hoy.
      const exQuery = supabase.from('workout_exercises').select('*').eq('is_active', true)
        .eq('session_date', selectedDateStr);
      const [exRes, logRes] = await Promise.all([
        wodLocked
          ? exQuery.eq('user_id', uid).order('sort_order')
          : exQuery.or(`user_id.is.null,user_id.eq.${uid}`).order('sort_order'),
        supabase.from('workout_logs').select('*').eq('user_id', uid).eq('date', selectedDateStr),
      ]);

      if (exRes.error) throw exRes.error;
      const exList: Exercise[] = exRes.data || [];

      // Registros de ese día cuyo ejercicio ya no está en la sesión actual
      // (el admin lo quitó/renombró de bloque, etc.) — el registro sigue
      // siendo válido y hay que poder verlo/editarlo/borrarlo igualmente.
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
            block_name: null,
            isOrphanLog: true,
          });
        });
      }
      setExercises(exList);

      // Histórico completo de estos ejercicios para el panel de progreso
      const exIds = exList.map((e: Exercise) => e.id);
      if (exIds.length > 0) {
        const { data: histLogs } = await supabase
          .from('workout_logs')
          .select('exercise_id, date, weight')
          .eq('user_id', uid)
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
        w[log.exercise_id] = log.weight != null ? String(log.weight) : '';
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

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      for (const exercise of exercises) {
        // Peso opcional: hay ejercicios (peso corporal, cardio...) que no
        // llevan carga. Se registra si hay peso VÁLIDO o reps VÁLIDAS
        // tecleadas — el "|| 1" de más abajo es solo el valor por defecto
        // al guardar, no sirve para detectar si el campo se rellenó.
        const weightRaw = (weights[exercise.id] || '').trim();
        const weightNum = parseFloat(weightRaw.replace(',', '.'));
        const hasWeight = weightRaw !== '' && !isNaN(weightNum) && weightNum > 0;

        const repsRaw = (reps[exercise.id] || '').trim();
        const repsNum = parseInt(repsRaw, 10);
        const hasReps = repsRaw !== '' && !isNaN(repsNum) && repsNum > 0;

        if (!hasWeight && !hasReps) continue;

        const weightVal = hasWeight ? weightNum : null;
        const setsVal = parseInt(setsMap[exercise.id]) || 1;
        const repVal = hasReps ? repsNum : 1;
        const rpeVal = parseInt(rpes[exercise.id]) || null;
        const noteVal = notes[exercise.id]?.trim() || null;

        const existing = todayLogs.get(exercise.id);
        if (existing) {
          await supabase.from('workout_logs').update({
            weight: weightVal, sets: setsVal, reps: repVal, rpe: rpeVal, notes: noteVal,
          }).eq('id', existing.id);
        } else {
          await supabase.from('workout_logs').insert({
            user_id: userId,
            exercise_id: exercise.id,
            date: selectedDateStr,
            weight: weightVal, sets: setsVal, reps: repVal, rpe: rpeVal, notes: noteVal,
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
  }, [userId, exercises, weights, setsMap, reps, rpes, notes, todayLogs, selectedDateStr]);

  const hasData = exercises.length > 0;

  function handleAddOwnExercise(prefill?: string) {
    if (!userId) return;
    setNewExName(prefill || '');
    setNewExWeight('');
    setNewExSets('');
    setNewExReps('');
    setNewExRpe('');
    setAddModalVisible(true);
  }

  async function handleSaveNewExercise() {
    if (!userId) return;
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
    // Si se indica peso, se registra de una vez — si no, solo se crea el
    // ejercicio y habrá que apuntar el peso luego desde la tarjeta.
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
      // El ejercicio ya está creado a partir de aquí — un fallo en el
      // registro del peso no debe presentarse como "no se pudo añadir".
      setAddModalVisible(false);

      // Se registra ya si hay peso O reps (ejercicios sin peso se registran
      // solo con reps); sin ninguno de los dos, se queda solo la plantilla.
      if (weightVal !== null || repsVal !== null) {
        try {
          const logSets = sets || 1;
          const logReps = repsVal || 1;
          const { data: logData, error: logError } = await supabase.from('workout_logs').insert({
            user_id: userId,
            exercise_id: newExercise.id,
            date: selectedDateStr,
            weight: weightVal, sets: logSets, reps: logReps, rpe: rpeVal, notes: null,
          }).select().single();
          if (logError) throw logError;
          setTodayLogs(prev => new Map(prev).set(newExercise.id, logData as TodayLog));
          setWeights(prev => ({ ...prev, [newExercise.id]: weightVal !== null ? String(weightVal) : '' }));
          setSetsMap(prev => ({ ...prev, [newExercise.id]: String(logSets) }));
          setReps(prev => ({ ...prev, [newExercise.id]: String(logReps) }));
          setRpes(prev => ({ ...prev, [newExercise.id]: rpeVal ? String(rpeVal) : '' }));
        } catch (logErr: any) {
          Alert.alert('Ejercicio añadido', 'No se pudo registrar el peso — puedes anotarlo desde la tarjeta del ejercicio.');
        }
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
          },
        },
      ]
    );
  }

  // Borra solo el registro (peso/reps/etc.) de un ejercicio de la sesión —
  // a diferencia de handleDeleteExercise, no toca el ejercicio en sí (puede
  // ser del admin, compartido con otros usuarios ese día).
  function handleDeleteLog(exercise: Exercise) {
    const log = todayLogs.get(exercise.id);
    if (!log) return;
    Alert.alert(
      'Eliminar registro',
      `¿Eliminar el registro guardado de "${exercise.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('workout_logs').delete().eq('id', log.id);
            setTodayLogs(prev => { const next = new Map(prev); next.delete(exercise.id); return next; });
            setWeights(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
            setSetsMap(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
            setReps(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
            setRpes(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
            setNotes(prev => { const { [exercise.id]: _omit, ...rest } = prev; return rest; });
            if (exercise.isOrphanLog) {
              setExercises(prev => prev.filter(ex => ex.id !== exercise.id));
            }
          },
        },
      ]
    );
  }

  // La sesión del entrenador sigue oculta hasta la hora de la clase, pero
  // no bloquea al usuario: puede seguir viendo/añadiendo sus propios
  // ejercicios si entrena por su cuenta — se avisa con un banner, no con
  // una pantalla completa.
  const wodLocked = isToday && !!todayAccess && !todayAccess.isUnlocked;
  const wodLockedBanner = wodLocked ? (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: scale(10),
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder,
      padding: scale(12), marginBottom: scale(16),
    }}>
      <LockIcon size={scale(18)} color={Colors.textMuted} />
      <Text style={{ flex: 1, fontSize: moderateScale(12), color: Colors.textSecondary }}>
        {todayAccess?.hasBookingToday && todayAccess.unlockTime
          ? `La sesión de tu entrenador se desbloquea a las ${formatUnlockTime(todayAccess.unlockTime)}`
          : 'Reserva una clase para ver la sesión de tu entrenador'}
      </Text>
    </View>
  ) : null;

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
              {WEEKDAY_NAMES[dayOfWeek]} {selectedDate.getDate()} {MONTH_NAMES[selectedDate.getMonth()]}
              {!loading && ` · ${exercises.length} ejercicio${exercises.length !== 1 ? 's' : ''}`}
            </Text>
          </View>
          <SpringPressable onPress={() => navigation.navigate('Profile', { email: email || '' })}>
            <Avatar uri={avatarUrl} size={scale(40)} />
          </SpringPressable>
        </Animated.View>

        {/* Navegador de fecha: permite registrar/ver días pasados que se te pasaron */}
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

        <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : !hasData ? (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: scale(40) }}>
            {wodLockedBanner && <View style={{ paddingTop: scale(20) }}>{wodLockedBanner}</View>}
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              {/* El ref del tutorial va en este grupo (tamaño por contenido),
                  no en los wrappers flex:1 de arriba — esos se estiran hasta
                  llenar la pantalla, dejando casi nada que oscurecer. */}
              <View ref={sessionAreaRef} collapsable={false} style={{ alignItems: 'center' }}>
                <BarbellIcon size={scale(48)} color="#A78BFA" />
                <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                  {isToday ? 'Sin entreno hoy' : 'Sin entreno ese día'}
                </Text>
                <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginBottom: scale(24) }}>
                  {isToday
                    ? (wodLocked
                      ? 'Si vienes al gimnasio por tu cuenta, añade tu entreno abajo'
                      : 'Tu entrenador aún no ha preparado la sesión de hoy')
                    : 'No hubo sesión preparada. Si entrenaste por tu cuenta, añádelo abajo'}
                </Text>
                <View ref={addExerciseRef} collapsable={false}>
                  <Pressable
                    onPress={() => handleAddOwnExercise()}
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
                      Añadir ejercicio propio
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            keyboardShouldPersistTaps="handled"
          >
            {wodLockedBanner}
            <View ref={sessionAreaRef} collapsable={false}>
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
                {block.items.map((ex) => {
                  const card = (
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
                      onViewProgress={() => navigation.navigate('WorkoutHistory', { email, name, exerciseName: ex.name })}
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
                  );
                  return <View key={ex.id}>{card}</View>;
                })}
              </View>
            ))}

            <View ref={addExerciseRef} collapsable={false}>
              <Pressable
                onPress={() => handleAddOwnExercise()}
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
                  Añadir ejercicio propio
                </Text>
              </Pressable>
            </View>

            <View style={{ marginTop: scale(8) }}>
              <Button
                onPress={handleSave}
                label={saving ? 'Guardando...' : 'Guardar entrenamiento'}
                loading={saving}
                disabled={saving}
                size="lg"
              />
            </View>
            </View>
          </ScrollView>
        )}
        </View>
      </View>

      {/* Modal: añadir ejercicio propio */}
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
            maxHeight: '85%',
            borderWidth: 1,
            borderColor: Colors.cardBorder,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, flex: 1 }}>
                Añadir ejercicio propio
              </Text>
              <Pressable onPress={() => setAddModalVisible(false)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
              Peso (kg) — si lo apuntas ahora, se registra ya
            </Text>
            <TextInput
              value={newExWeight}
              onChangeText={setNewExWeight}
              placeholder="Ej: 60"
              placeholderTextColor={Colors.placeholder}
              keyboardType="decimal-pad"
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
