import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Keyboard, KeyboardEvent, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { ExerciseCard } from '../components/ui/ExerciseCard';
import { useUserProfile } from '../hooks/useUserProfile';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useTutorialScreenLoaded, useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { groupByBlock } from '../utils/exerciseBlocks';
import { scrollFocusedInputIntoView } from '../utils/scrollToFocusedInput';
import { ExerciseProgress, buildProgressMap } from '../utils/workoutProgress';
import { TodayWorkoutAccess, formatUnlockTime, getTodayWorkoutAccess } from '../utils/workoutAccess';
import { LocalSetRow, emptySetRow } from '../utils/workoutSetRows';

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
  target_rows?: { sets: number | null; reps: number | null; rpe: number | null }[] | null;
  block_name: string | null;
  // Tiene un registro guardado para este día pero ya no aparece en la
  // sesión (el admin lo quitó, cambió de bloque, etc.) — se muestra igual
  // para poder editar/eliminar el registro, nunca debe desaparecer solo.
  isOrphanLog?: boolean;
}

interface LibraryExercise {
  id: string;
  name: string;
  description: string | null;
  default_sets: number | null;
  default_reps: number | null;
  default_rpe: number | null;
  user_id: string | null;
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
  const [todayLogs, setTodayLogs] = useState<Map<string, TodayLog[]>>(new Map());
  const [setEntriesMap, setSetEntriesMap] = useState<Record<string, LocalSetRow[]>>({});
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

  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

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
            target_rows: null,
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
          // Las notas viven a nivel de ejercicio en la UI aunque en BD estén
          // por fila — se toman/guardan repetidas en todas las filas de ese
          // ejercicio (ver handleSave), así que basta con leer la primera.
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

  const handleSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    try {
      for (const exercise of exercises) {
        const entries = setEntriesMap[exercise.id] || [];
        const noteVal = notes[exercise.id]?.trim() || null;

        for (const entry of entries) {
          // Peso opcional: hay ejercicios (peso corporal, cardio...) que no
          // llevan carga. Se registra si hay peso VÁLIDO o reps VÁLIDAS
          // tecleadas — el "|| 1" de más abajo es solo el valor por defecto
          // al guardar, no sirve para detectar si el campo se rellenó.
          const weightRaw = entry.weight.trim();
          const weightNum = parseFloat(weightRaw.replace(',', '.'));
          const hasWeight = weightRaw !== '' && !isNaN(weightNum) && weightNum > 0;

          const repsRaw = entry.reps.trim();
          const repsNum = parseInt(repsRaw, 10);
          const hasReps = repsRaw !== '' && !isNaN(repsNum) && repsNum > 0;

          if (!hasWeight && !hasReps) {
            // Fila vacía: si tenía un registro guardado, se borra (el
            // usuario la vació a propósito). Una fila nueva vacía no llega
            // a crear nada.
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

      Alert.alert('Guardado', 'Entrenamiento registrado');
      loadData(userId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }, [userId, exercises, setEntriesMap, notes, selectedDateStr]);

  const hasData = exercises.length > 0;

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

  // Quita una serie. Si ya estaba guardada en BD se borra ahí mismo (igual
  // que handleDeleteLog para el ejercicio entero) — no se espera a "Guardar"
  // porque el usuario ya vio la fila desaparecer de la pantalla. La lista
  // nunca se queda vacía: quitar la última fila la limpia en vez de borrarla,
  // para que siempre haya un hueco donde registrar algo.
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

  function openAddExerciseForm(prefill?: string) {
    setNewExName(prefill || '');
    setNewExWeight('');
    setNewExSets('');
    setNewExReps('');
    setNewExRpe('');
    setAddModalVisible(true);
  }

  function handleAddOwnExercise(prefill?: string) {
    if (!userId) return;
    // Con nombre precargado (entrada directa desde "Mi progreso") se salta
    // la elección — el usuario ya escogió un ejercicio concreto antes de
    // llegar aquí, no tiene sentido volver a preguntarle.
    if (prefill) {
      openAddExerciseForm(prefill);
      return;
    }
    Alert.alert(
      'Añadir ejercicio',
      '¿De dónde quieres añadirlo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'De tu biblioteca', onPress: openLibraryPicker },
        { text: 'Crear nuevo', onPress: () => openAddExerciseForm() },
      ]
    );
  }

  async function openLibraryPicker() {
    if (!userId) return;
    setLibraryModalVisible(true);
    try {
      setLoadingLibrary(true);
      // Biblioteca propia, sin acceso a la del entrenador (pedido por el
      // admin) — cada socio ve y gestiona solo la suya.
      const { data, error } = await supabase
        .from('exercise_library')
        .select('id, name, description, default_sets, default_reps, default_rpe, user_id')
        .eq('user_id', userId)
        .order('name');
      if (error) throw error;

      // No mostrar ejercicios que ya están en la sesión de hoy.
      const namesInDay = new Set(exercises.map(e => e.name.toLowerCase()));
      setLibraryExercises((data || []).filter(e => !namesInDay.has(e.name.toLowerCase())));
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo cargar tu biblioteca de ejercicios');
    } finally {
      setLoadingLibrary(false);
    }
  }

  // Elegir de la biblioteca precarga el formulario con los valores por
  // defecto — se ajustan para hoy antes de guardar, igual que hace el admin.
  function selectFromLibrary(lib: LibraryExercise) {
    setLibraryModalVisible(false);
    setNewExName(lib.name);
    setNewExWeight('');
    setNewExSets(lib.default_sets ? String(lib.default_sets) : '');
    setNewExReps(lib.default_reps ? String(lib.default_reps) : '');
    setNewExRpe(lib.default_rpe ? String(lib.default_rpe) : '');
    setAddModalVisible(true);
  }

  // Quita el ejercicio de la biblioteca PERSONAL del socio — no afecta a
  // entrenos ya registrados con ese ejercicio, ni a la biblioteca del
  // entrenador (esos ni se pueden borrar aquí: RLS solo deja borrar lo
  // propio, por eso el botón ni se muestra para los globales).
  function handleDeleteLibraryExercise(lib: LibraryExercise) {
    Alert.alert(
      'Quitar de tu biblioteca',
      `¿Quitar "${lib.name}" de tu biblioteca? No afecta a entrenos ya registrados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('exercise_library').delete().eq('id', lib.id);
            if (error) {
              Alert.alert('Error', 'No se pudo quitar de la biblioteca');
              return;
            }
            setLibraryExercises(prev => prev.filter(e => e.id !== lib.id));
          },
        },
      ]
    );
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

      // Guardarlo en la biblioteca PERSONAL para no tener que retipearlo la
      // próxima vez — no crítico, un fallo aquí no debe presentarse como
      // "no se pudo añadir el ejercicio" (que ya se creó correctamente).
      try {
        await supabase.from('exercise_library').upsert(
          { name, user_id: userId, default_sets: sets, default_reps: repsVal, default_rpe: rpeVal },
          { onConflict: 'user_id,name', ignoreDuplicates: true }
        );
      } catch { /* no crítico */ }
      setExercises(prev => [...prev, newExercise]);
      setNotes(prev => ({ ...prev, [newExercise.id]: '' }));
      // El ejercicio ya está creado a partir de aquí — un fallo en el
      // registro del peso no debe presentarse como "no se pudo añadir".
      closeAddExerciseModal();

      // Se registra ya si hay peso O reps (ejercicios sin peso se registran
      // solo con reps); sin ninguno de los dos, se queda solo la plantilla
      // (una fila vacía, lista para rellenar desde la tarjeta).
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

  // Borra TODAS las series registradas hoy de un ejercicio (no solo una) —
  // a diferencia de handleDeleteExercise, no toca el ejercicio en sí (puede
  // ser del admin, compartido con otros usuarios ese día). Quitar una serie
  // suelta se hace desde la tarjeta (handleRemoveSet); esto es el botón
  // "Registro" de la cabecera para limpiar el día entero de una vez.
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
                      setEntries={setEntriesMap[ex.id] || [emptySetRow(ex.id, 1)]}
                      notes={notes[ex.id] || ''}
                      onSetFieldChange={(key, field, v) => handleSetFieldChange(ex.id, key, field, v)}
                      onAddSet={() => handleAddSet(ex.id)}
                      onRemoveSet={(key) => handleRemoveSet(ex.id, key)}
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
                Añadir ejercicio propio
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

      {/* Modal: elegir ejercicio de tu biblioteca */}
      <Modal
        transparent
        visible={libraryModalVisible}
        animationType="slide"
        onRequestClose={() => setLibraryModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setLibraryModalVisible(false)}
          />
          <View style={{
            backgroundColor: '#0d1929',
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            maxHeight: '75%',
            borderWidth: 1,
            borderColor: Colors.cardBorder,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(6) }}>
              <Text style={{ fontSize: moderateScale(17), fontWeight: '700', color: Colors.textPrimary }}>
                Tu biblioteca de ejercicios
              </Text>
              <Pressable onPress={() => setLibraryModalVisible(false)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(16) }}>
              Los ejercicios que has creado tú. Tócalo para ajustar peso/series antes de añadirlo a hoy.
            </Text>

            {loadingLibrary ? (
              <ActivityIndicator size="small" color={Colors.blue500} style={{ paddingVertical: scale(30) }} />
            ) : libraryExercises.length === 0 ? (
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', paddingVertical: scale(30) }}>
                No hay más ejercicios en tu biblioteca para añadir. Crea uno nuevo y quedará guardado para la próxima vez.
              </Text>
            ) : (
              <ScrollView style={{ marginBottom: scale(4) }}>
                {libraryExercises.map((lib) => (
                  <TouchableOpacity
                    key={lib.id}
                    onPress={() => selectFromLibrary(lib)}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      padding: scale(12), borderRadius: Radius.md,
                      borderWidth: 1, borderColor: Colors.cardBorder,
                      backgroundColor: Colors.card,
                      marginBottom: scale(8),
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }}>
                        {lib.name}
                      </Text>
                      {(lib.default_sets || lib.default_reps || lib.default_rpe) && (
                        <Text style={{ fontSize: moderateScale(11), color: Colors.blue400, marginTop: scale(2) }}>
                          {[
                            lib.default_sets ? `${lib.default_sets} series` : null,
                            lib.default_reps ? `${lib.default_reps} reps` : null,
                            lib.default_rpe ? `RPE ${lib.default_rpe}` : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    {lib.user_id === userId && (
                      <Pressable
                        onPress={() => handleDeleteLibraryExercise(lib)}
                        hitSlop={scale(6)}
                        style={{
                          width: scale(32), height: scale(32), borderRadius: scale(16),
                          backgroundColor: 'rgba(239,68,68,0.12)',
                          alignItems: 'center', justifyContent: 'center',
                          marginRight: scale(8),
                        }}
                      >
                        <TrashIcon size={scale(14)} color={Colors.danger} strokeWidth={2} />
                      </Pressable>
                    )}
                    <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
