import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardEvent, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarbellIcon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from '../components/Icons';
import { Avatar, Button, SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { getDisplayName } from '../utils/user';

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad2 = (n: number) => String(n).padStart(2, '0');
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDaysStr(dateStr: string, delta: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return toDateStr(d);
}
// "miércoles 7 jul"
function formatSessionLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${WEEKDAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

interface TemplateExercise {
  id: string;
  name: string;
  description: string | null;
  session_date: string | null;
  sort_order: number;
  target_sets: number | null;
  target_reps: number | null;
  target_rpe: number | null;
}

interface LibraryExercise {
  id: string;
  name: string;
  description: string | null;
  default_sets: number | null;
  default_reps: number | null;
  default_rpe: number | null;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminWorkout'>;
};

interface ClassWithUsers {
  id: string;
  name: string;
  class_time: string;
  class_type: string;
  bookings: Array<{
    user_id: string;
    profiles: { id: string; username: string | null; full_name: string | null; email: string; avatar_url: string | null };
  }>;
}

interface UserProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

function UserRow({ user, onPress, index }: {
  user: { id: string; displayName: string; email?: string; avatarUrl: string | null };
  onPress: () => void;
  index: number;
}) {
  const pressScale = useSharedValue(1);
  const shadowOp = useSharedValue(0.08);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
    shadowOpacity: shadowOp.value,
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(260).delay(Math.min(index * 40, 300))}
      style={{ marginBottom: scale(8) }}
    >
      <Animated.View style={[animStyle, {
        borderRadius: Radius.md,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
      }]}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            pressScale.value = withSpring(0.97, { damping: 14, stiffness: 300 });
            shadowOp.value = withTiming(0.2, { duration: 120 });
          }}
          onPressOut={() => {
            pressScale.value = withSpring(1, { damping: 12, stiffness: 200 });
            shadowOp.value = withTiming(0.08, { duration: 280 });
          }}
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.04)',
            borderRadius: Radius.md,
            padding: scale(14),
            borderWidth: 1, borderColor: Colors.cardBorder,
            gap: scale(12),
          }}
        >
          <Avatar uri={user.avatarUrl} size={scale(40)} index={index} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
              {user.displayName}
            </Text>
            {user.email && (
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>
                {user.email}
              </Text>
            )}
          </View>
          <BarbellIcon size={scale(18)} color={Colors.blue400} />
          <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

function ClassCard({ cls, isExpanded, onToggle, onUserPress }: {
  cls: ClassWithUsers;
  isExpanded: boolean;
  onToggle: () => void;
  onUserPress: (userId: string, userName: string) => void;
}) {
  const pressScale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const users = cls.bookings || [];

  return (
    <Animated.View style={[animStyle, {
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: isExpanded ? Colors.blue500 + '40' : Colors.cardBorder,
      marginBottom: scale(12),
      overflow: 'hidden',
    }]}>
      <Pressable
        onPress={onToggle}
        onPressIn={() => { pressScale.value = withSpring(0.97, { damping: 14, stiffness: 300 }); }}
        onPressOut={() => { pressScale.value = withSpring(1, { damping: 12, stiffness: 200 }); }}
        style={{
          flexDirection: 'row', alignItems: 'center',
          padding: scale(16), gap: scale(12),
        }}
      >
        <View style={{
          width: scale(48), height: scale(44),
          borderRadius: Radius.md,
          backgroundColor: isExpanded ? 'rgba(59,130,246,0.15)' : 'rgba(100,100,120,0.08)',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: moderateScale(12), fontWeight: '800', color: isExpanded ? Colors.blue400 : Colors.textSecondary }} numberOfLines={1}>
            {cls.class_time.slice(0, 5)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
            {cls.name}
          </Text>
          <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
            {users.length} usuario{users.length !== 1 ? 's' : ''} reservado{users.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {/* Avatars stack */}
        {users.length > 0 && (
          <View style={{ flexDirection: 'row', marginRight: scale(4) }}>
            {users.slice(0, 3).map((b, i) => (
              <View key={b.user_id} style={{ marginLeft: i > 0 ? -scale(10) : 0 }}>
                <Avatar uri={b.profiles?.avatar_url} size={scale(28)} index={i} />
              </View>
            ))}
            {users.length > 3 && (
              <View style={{
                width: scale(28), height: scale(28), borderRadius: scale(14),
                backgroundColor: Colors.blue500, marginLeft: -scale(10),
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: Colors.background,
              }}>
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: '#fff' }}>
                  +{users.length - 3}
                </Text>
              </View>
            )}
          </View>
        )}
        <ChevronRightIcon size={scale(18)} color={Colors.textMuted} />
      </Pressable>

      {isExpanded && (
        <View style={{
          borderTopWidth: 1, borderTopColor: Colors.border,
          paddingHorizontal: scale(16), paddingBottom: scale(12),
        }}>
          {users.length === 0 ? (
            <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, paddingVertical: scale(16), textAlign: 'center' }}>
              No hay usuarios en esta clase
            </Text>
          ) : (
            users.map((booking, j) => {
              const profile = booking.profiles;
              const displayName = profile ? getDisplayName(profile) : 'Usuario';
              return (
                <Pressable
                  key={booking.user_id}
                  onPress={() => onUserPress(booking.user_id, displayName)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingVertical: scale(12),
                    borderBottomWidth: j < users.length - 1 ? 1 : 0,
                    borderBottomColor: Colors.border,
                    gap: scale(12),
                  }}
                >
                  <Avatar uri={profile?.avatar_url} size={scale(36)} index={j} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                      {displayName}
                    </Text>
                  </View>
                  <BarbellIcon size={scale(18)} color={Colors.blue400} />
                  <ChevronRightIcon size={scale(16)} color={Colors.textMuted} />
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </Animated.View>
  );
}

export default function AdminWorkoutScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'class' | 'users' | 'template'>('class');
  const [loading, setLoading] = useState(true);

  const [todayClasses, setTodayClasses] = useState<ClassWithUsers[]>([]);
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Sesión del día (ejercicios globales, user_id NULL — los ve todo el mundo
  // que entrena ESA fecha). Cada fecha es una sesión independiente.
  const [sessionDate, setSessionDate] = useState(toDateStr(new Date()));
  const [templateExercises, setTemplateExercises] = useState<TemplateExercise[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [editingExercise, setEditingExercise] = useState<TemplateExercise | null>(null);
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseDescription, setExerciseDescription] = useState('');
  const [exerciseSets, setExerciseSets] = useState('');
  const [exerciseReps, setExerciseReps] = useState('');
  const [exerciseRpe, setExerciseRpe] = useState('');
  const [savingExercise, setSavingExercise] = useState(false);
  const templateSheetTranslateY = useSharedValue(0);
  const exerciseNameInputRef = useRef<TextInput>(null);

  // Biblioteca de ejercicios reutilizable
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { templateSheetTranslateY.value = withTiming(-e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { templateSheetTranslateY.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const templateSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: templateSheetTranslateY.value }],
  }));

  useEffect(() => {
    loadTodayClasses();
  }, []);

  async function loadTodayClasses() {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('classes')
        .select(`
          id, name, class_time, class_type,
          bookings ( user_id, profiles:user_id ( id, username, full_name, email, avatar_url ) )
        `)
        .eq('class_date', today)
        .order('class_time');

      if (error) throw error;
      setTodayClasses((data as any) || []);

      if (data && data.length > 0) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        let closest: string | null = null;
        let closestDiff = Infinity;
        for (const cls of data) {
          const [h, m] = cls.class_time.split(':').map(Number);
          const diff = Math.abs(h * 60 + m - currentMinutes);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = cls.id;
          }
        }
        if (closest) setExpandedClassId(closest);
      }
    } catch (error) {
      console.error('Error loading today classes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllUsers() {
    if (allUsers.length > 0) return;
    try {
      setLoadingUsers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, avatar_url')
        .order('full_name');

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoadingUsers(false);
    }
  }

  function handleTabChange(newTab: 'class' | 'users' | 'template') {
    setTab(newTab);
    if (newTab === 'users') loadAllUsers();
    if (newTab === 'template') loadSession(sessionDate);
  }

  async function loadSession(dateStr: string) {
    try {
      setLoadingTemplate(true);
      const { data, error } = await supabase
        .from('workout_exercises')
        .select('id, name, description, session_date, sort_order, target_sets, target_reps, target_rpe')
        .is('user_id', null)
        .eq('session_date', dateStr)
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setTemplateExercises(data || []);
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoadingTemplate(false);
    }
  }

  function goToDate(dateStr: string) {
    setSessionDate(dateStr);
    loadSession(dateStr);
  }

  function resetExerciseForm() {
    setEditingExercise(null);
    setExerciseName('');
    setExerciseDescription('');
    setExerciseSets('');
    setExerciseReps('');
    setExerciseRpe('');
  }

  function openAddExerciseModal() {
    Alert.alert(
      'Añadir ejercicio',
      `¿De dónde quieres añadirlo para ${formatSessionLabel(sessionDate)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'De la biblioteca', onPress: openLibraryPicker },
        { text: 'Crear nuevo', onPress: () => { resetExerciseForm(); setTemplateModalVisible(true); } },
      ]
    );
  }

  function openEditExerciseModal(exercise: TemplateExercise) {
    setEditingExercise(exercise);
    setExerciseName(exercise.name);
    setExerciseDescription(exercise.description || '');
    setExerciseSets(exercise.target_sets ? String(exercise.target_sets) : '');
    setExerciseReps(exercise.target_reps ? String(exercise.target_reps) : '');
    setExerciseRpe(exercise.target_rpe ? String(exercise.target_rpe) : '');
    setTemplateModalVisible(true);
  }

  async function openLibraryPicker() {
    setLibraryModalVisible(true);
    try {
      setLoadingLibrary(true);
      const { data, error } = await supabase
        .from('exercise_library')
        .select('id, name, description, default_sets, default_reps, default_rpe')
        .order('name');
      if (error) throw error;

      // No mostrar ejercicios que ya están asignados a este día
      const namesInDay = new Set(templateExercises.map(e => e.name.toLowerCase()));
      setLibraryExercises((data || []).filter(e => !namesInDay.has(e.name.toLowerCase())));
    } catch (error: any) {
      Alert.alert('Error', 'No se pudo cargar la biblioteca de ejercicios');
    } finally {
      setLoadingLibrary(false);
    }
  }

  // Elegir de la biblioteca precarga el formulario de configuración con los
  // valores por defecto — el admin los ajusta para HOY antes de añadir. No
  // se toca el registro de la biblioteca; solo se crea la fila del día.
  function selectFromLibrary(lib: LibraryExercise) {
    setLibraryModalVisible(false);
    setEditingExercise(null);
    setExerciseName(lib.name);
    setExerciseDescription(lib.description || '');
    setExerciseSets(lib.default_sets ? String(lib.default_sets) : '');
    setExerciseReps(lib.default_reps ? String(lib.default_reps) : '');
    setExerciseRpe(lib.default_rpe ? String(lib.default_rpe) : '');
    setTemplateModalVisible(true);
  }

  // Borra el ejercicio de la BIBLIOTECA (catálogo reutilizable). No afecta a
  // los ejercicios ya añadidos a las sesiones de días concretos.
  function handleDeleteLibraryExercise(lib: LibraryExercise) {
    Alert.alert(
      'Eliminar de la biblioteca',
      `¿Quitar "${lib.name}" de la biblioteca? No se borra de las sesiones donde ya lo hayas añadido, solo del catálogo reutilizable.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('exercise_library').delete().eq('id', lib.id);
            if (error) {
              Alert.alert('Error', 'No se pudo eliminar de la biblioteca');
              return;
            }
            setLibraryExercises(prev => prev.filter(e => e.id !== lib.id));
          },
        },
      ]
    );
  }

  async function handleSaveExercise() {
    if (!exerciseName.trim()) {
      Alert.alert('Campo requerido', 'El nombre del ejercicio no puede estar vacío');
      return;
    }
    const sets = exerciseSets.trim() ? parseInt(exerciseSets, 10) : null;
    const reps = exerciseReps.trim() ? parseInt(exerciseReps, 10) : null;
    const rpe = exerciseRpe.trim() ? parseInt(exerciseRpe, 10) : null;
    if (rpe !== null && (isNaN(rpe) || rpe < 1 || rpe > 10)) {
      Alert.alert('RPE inválido', 'El RPE objetivo debe ser un número entre 1 y 10');
      return;
    }

    try {
      setSavingExercise(true);
      const name = exerciseName.trim();
      const description = exerciseDescription.trim() || null;

      if (editingExercise) {
        const { error } = await supabase
          .from('workout_exercises')
          .update({
            name, description,
            target_sets: sets, target_reps: reps, target_rpe: rpe,
          })
          .eq('id', editingExercise.id);
        if (error) throw error;
      } else {
        const nextSortOrder = templateExercises.length > 0
          ? Math.max(...templateExercises.map(e => e.sort_order)) + 1
          : 0;
        const { error } = await supabase.from('workout_exercises').insert({
          name, description,
          session_date: sessionDate,
          user_id: null,
          is_active: true,
          sort_order: nextSortOrder,
          target_sets: sets, target_reps: reps, target_rpe: rpe,
        });
        if (error) throw error;

        // Guardarlo en la biblioteca para poder reutilizarlo otro día sin
        // volver a escribirlo. Si ya existe (mismo nombre), no lo pisamos.
        await supabase.from('exercise_library').upsert(
          { name, description, default_sets: sets, default_reps: reps, default_rpe: rpe },
          { onConflict: 'name', ignoreDuplicates: true }
        );
      }
      setTemplateModalVisible(false);
      await loadSession(sessionDate);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar el ejercicio');
    } finally {
      setSavingExercise(false);
    }
  }

  function handleDeleteTemplateExercise(exercise: TemplateExercise) {
    Alert.alert(
      'Eliminar ejercicio',
      `¿Eliminar "${exercise.name}" de la sesión del ${formatSessionLabel(sessionDate)}? Esto lo quita para TODOS los usuarios.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('workout_exercises').delete().eq('id', exercise.id);
            if (error) {
              Alert.alert('Error', 'No se pudo eliminar el ejercicio');
              return;
            }
            setTemplateExercises(prev => prev.filter(e => e.id !== exercise.id));
          },
        },
      ]
    );
  }

  const filteredUsers = allUsers.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (u.full_name?.toLowerCase().includes(q)) ||
      u.email.toLowerCase().includes(q)
    );
  });

  function navigateToUserWorkout(userId: string, userName: string) {
    navigation.navigate('AdminUserWorkout', { userId, userName });
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
              Entrenamientos
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              Registrar pesos por usuario
            </Text>
          </View>
        </Animated.View>

        {/* Tabs */}
        <View style={{
          flexDirection: 'row', marginHorizontal: scale(20), marginTop: scale(16),
          backgroundColor: Colors.card, borderRadius: Radius.md,
          borderWidth: 1, borderColor: Colors.cardBorder, padding: scale(3),
        }}>
          <SpringPressable onPress={() => handleTabChange('class')} style={{ flex: 1 }}>
            <View style={{
              paddingVertical: scale(10), borderRadius: Radius.sm,
              backgroundColor: tab === 'class' ? 'rgba(59,130,246,0.15)' : 'transparent',
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: scale(4),
            }}>
              <ClockIcon size={scale(14)} color={tab === 'class' ? Colors.blue400 : Colors.textMuted} />
              <Text style={{
                fontSize: moderateScale(12), fontWeight: '700',
                color: tab === 'class' ? Colors.blue400 : Colors.textMuted,
              }}>
                Clase
              </Text>
            </View>
          </SpringPressable>
          <SpringPressable onPress={() => handleTabChange('users')} style={{ flex: 1 }}>
            <View style={{
              paddingVertical: scale(10), borderRadius: Radius.sm,
              backgroundColor: tab === 'users' ? 'rgba(59,130,246,0.15)' : 'transparent',
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: scale(4),
            }}>
              <UsersIcon size={scale(14)} color={tab === 'users' ? Colors.blue400 : Colors.textMuted} />
              <Text style={{
                fontSize: moderateScale(12), fontWeight: '700',
                color: tab === 'users' ? Colors.blue400 : Colors.textMuted,
              }}>
                Usuarios
              </Text>
            </View>
          </SpringPressable>
          <SpringPressable onPress={() => handleTabChange('template')} style={{ flex: 1 }}>
            <View style={{
              paddingVertical: scale(10), borderRadius: Radius.sm,
              backgroundColor: tab === 'template' ? 'rgba(59,130,246,0.15)' : 'transparent',
              alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: scale(4),
            }}>
              <BarbellIcon size={scale(14)} color={tab === 'template' ? Colors.blue400 : Colors.textMuted} />
              <Text style={{
                fontSize: moderateScale(12), fontWeight: '700',
                color: tab === 'template' ? Colors.blue400 : Colors.textMuted,
              }}>
                Sesión
              </Text>
            </View>
          </SpringPressable>
        </View>

        {/* Content */}
        {tab === 'class' ? (
          loading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={Colors.blue500} />
            </View>
          ) : todayClasses.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
              <BarbellIcon size={scale(48)} color={Colors.textMuted} />
              <Text style={{ fontSize: moderateScale(18), fontWeight: '700', color: Colors.textPrimary, marginTop: scale(16), marginBottom: scale(8) }}>
                Sin clases hoy
              </Text>
              <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
                No hay clases programadas para hoy
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            >
              {todayClasses.map((cls, i) => (
                <Animated.View
                  key={cls.id}
                  entering={FadeIn.duration(260).delay(i * 50)}
                >
                  <ClassCard
                    cls={cls}
                    isExpanded={expandedClassId === cls.id}
                    onToggle={() => setExpandedClassId(expandedClassId === cls.id ? null : cls.id)}
                    onUserPress={navigateToUserWorkout}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          )
        ) : tab === 'users' ? (
          <View style={{ flex: 1 }}>
            {/* Search bar */}
            <View style={{
              marginHorizontal: scale(20), marginTop: scale(16),
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: Colors.inputBg,
              borderWidth: 1, borderColor: Colors.inputBorder,
              borderRadius: Radius.md, paddingHorizontal: scale(12),
              gap: scale(8),
            }}>
              <SearchIcon size={scale(18)} color={Colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar por nombre o email..."
                placeholderTextColor={Colors.placeholder}
                autoCapitalize="none"
                style={{
                  flex: 1, height: scale(44),
                  fontSize: moderateScale(14),
                  color: Colors.textPrimary,
                }}
              />
            </View>

            {loadingUsers ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.blue500} />
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
                keyboardShouldPersistTaps="handled"
              >
                {filteredUsers.length === 0 ? (
                  <Text style={{ fontSize: moderateScale(14), color: Colors.textMuted, textAlign: 'center', paddingTop: scale(40) }}>
                    {searchQuery ? 'Sin resultados' : 'No hay usuarios'}
                  </Text>
                ) : (
                  filteredUsers.map((user, i) => {
                    const displayName = getDisplayName(user);
                    return (
                      <UserRow
                        key={user.id}
                        user={{
                          id: user.id,
                          displayName,
                          email: user.email,
                          avatarUrl: user.avatar_url,
                        }}
                        onPress={() => navigateToUserWorkout(user.id, displayName)}
                        index={i}
                      />
                    );
                  })
                )}
              </ScrollView>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Navegador de fecha */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: scale(20), paddingVertical: scale(14), gap: scale(10),
            }}>
              <Pressable
                onPress={() => goToDate(addDaysStr(sessionDate, -1))}
                hitSlop={scale(8)}
                style={{
                  width: scale(40), height: scale(40), borderRadius: scale(20),
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronLeftIcon size={scale(20)} color={Colors.textSecondary} />
              </Pressable>

              <Pressable
                onPress={() => goToDate(toDateStr(new Date()))}
                style={{ flex: 1, alignItems: 'center' }}
              >
                <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary, textTransform: 'capitalize' }}>
                  {sessionDate === toDateStr(new Date()) ? 'Hoy' : formatSessionLabel(sessionDate)}
                </Text>
                {sessionDate === toDateStr(new Date()) ? (
                  <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2), textTransform: 'capitalize' }}>
                    {formatSessionLabel(sessionDate)}
                  </Text>
                ) : (
                  <Text style={{ fontSize: moderateScale(11), color: Colors.blue400, marginTop: scale(2) }}>
                    Toca para volver a hoy
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => goToDate(addDaysStr(sessionDate, 1))}
                hitSlop={scale(8)}
                style={{
                  width: scale(40), height: scale(40), borderRadius: scale(20),
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronRightIcon size={scale(20)} color={Colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: scale(8),
              paddingHorizontal: scale(20), marginBottom: scale(6),
            }}>
              <BarbellIcon size={scale(15)} color={Colors.blue400} />
              <Text style={{ fontSize: moderateScale(13), fontWeight: '800', color: Colors.textPrimary }}>
                {templateExercises.length} ejercicio{templateExercises.length !== 1 ? 's' : ''} en la sesión
              </Text>
            </View>
            <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, paddingHorizontal: scale(20), marginBottom: scale(8) }}>
              La ve todo el mundo que entrene este día, en cualquier clase u horario.
            </Text>

            {loadingTemplate ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={Colors.blue500} />
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: scale(20), paddingTop: scale(4), paddingBottom: insets.bottom + scale(90) }}
              >
                {templateExercises.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: scale(60) }}>
                    <BarbellIcon size={scale(40)} color={Colors.textMuted} />
                    <Text style={{ fontSize: moderateScale(15), color: Colors.textSecondary, marginTop: scale(12), textAlign: 'center' }}>
                      Sin ejercicios para este día todavía
                    </Text>
                  </View>
                ) : (
                  templateExercises.map((ex, i) => {
                    const chips = [
                      ex.target_sets ? `${ex.target_sets} series` : null,
                      ex.target_reps ? `${ex.target_reps} reps` : null,
                      ex.target_rpe ? `RPE ${ex.target_rpe}` : null,
                    ].filter(Boolean) as string[];
                    return (
                    <Animated.View
                      key={ex.id}
                      entering={FadeInDown.duration(280).delay(i * 50)}
                      style={{
                        flexDirection: 'row', alignItems: 'center',
                        backgroundColor: 'rgba(255,255,255,0.04)',
                        borderRadius: Radius.md,
                        borderWidth: 1, borderColor: Colors.cardBorder,
                        borderLeftWidth: 3, borderLeftColor: Colors.blue500,
                        padding: scale(14),
                        marginBottom: scale(8),
                        gap: scale(12),
                      }}
                    >
                      <View style={{
                        width: scale(28), height: scale(28), borderRadius: scale(14),
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Text style={{ fontSize: moderateScale(13), fontWeight: '800', color: Colors.blue400 }}>
                          {i + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
                          {ex.name}
                        </Text>
                        {ex.description && (
                          <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
                            {ex.description}
                          </Text>
                        )}
                        {chips.length > 0 && (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginTop: scale(6) }}>
                            {chips.map((c) => (
                              <View key={c} style={{
                                paddingHorizontal: scale(8), paddingVertical: scale(3),
                                borderRadius: Radius.sm, backgroundColor: 'rgba(59,130,246,0.12)',
                              }}>
                                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.blue400 }}>
                                  {c}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <Pressable
                        onPress={() => openEditExerciseModal(ex)}
                        style={{
                          width: scale(32), height: scale(32), borderRadius: scale(16),
                          backgroundColor: 'rgba(59,130,246,0.12)',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <EditIcon size={scale(14)} color={Colors.blue400} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleDeleteTemplateExercise(ex)}
                        style={{
                          width: scale(32), height: scale(32), borderRadius: scale(16),
                          backgroundColor: 'rgba(239,68,68,0.12)',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <TrashIcon size={scale(14)} color={Colors.danger} strokeWidth={2} />
                      </Pressable>
                    </Animated.View>
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Add button */}
            <View style={{
              position: 'absolute', left: scale(20), right: scale(20), bottom: insets.bottom + scale(16),
            }}>
              <Pressable
                onPress={openAddExerciseModal}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: Colors.blue500,
                  borderRadius: Radius.md,
                  paddingVertical: scale(14),
                  gap: scale(8),
                  shadowColor: Colors.blue500,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 10,
                  elevation: 6,
                }}
              >
                <PlusIcon size={scale(18)} color="#fff" />
                <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#fff' }}>
                  Añadir ejercicio
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Modal: añadir/editar ejercicio de la plantilla */}
      <Modal
        transparent
        visible={templateModalVisible}
        animationType="slide"
        onRequestClose={() => setTemplateModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setTemplateModalVisible(false)}
          />
          <Animated.View style={[templateSheetStyle, {
            backgroundColor: '#0d1929',
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            borderWidth: 1,
            borderColor: Colors.cardBorder,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, flex: 1, textTransform: 'capitalize' }}>
                {editingExercise ? 'Editar ejercicio' : 'Nuevo ejercicio'} · {formatSessionLabel(sessionDate)}
              </Text>
              <Pressable onPress={() => setTemplateModalVisible(false)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(6) }}>
              Nombre *
            </Text>
            <TextInput
              ref={exerciseNameInputRef}
              value={exerciseName}
              onChangeText={setExerciseName}
              placeholder="Ej: Sentadilla"
              placeholderTextColor={Colors.placeholder}
              autoFocus
              returnKeyType="next"
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
              Notas para este día (opcional)
            </Text>
            <TextInput
              value={exerciseDescription}
              onChangeText={setExerciseDescription}
              placeholder="Ej: Sentadilla clásica con barra"
              placeholderTextColor={Colors.placeholder}
              multiline
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(14),
                paddingVertical: scale(10),
                height: scale(70),
                textAlignVertical: 'top',
                fontSize: moderateScale(14),
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
                  value={exerciseSets}
                  onChangeText={setExerciseSets}
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
                  value={exerciseReps}
                  onChangeText={setExerciseReps}
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
                  value={exerciseRpe}
                  onChangeText={setExerciseRpe}
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
              label={savingExercise ? 'Guardando...' : editingExercise ? 'Guardar cambios' : 'Añadir ejercicio'}
              onPress={handleSaveExercise}
              loading={savingExercise}
              disabled={savingExercise || !exerciseName.trim()}
              fullWidth
            />
          </Animated.View>
        </View>
      </Modal>

      {/* Modal: elegir ejercicios de la biblioteca */}
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
                Biblioteca de ejercicios
              </Text>
              <Pressable onPress={() => setLibraryModalVisible(false)} style={{ padding: scale(4) }}>
                <XIcon size={scale(20)} color={Colors.textMuted} />
              </Pressable>
            </View>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(16) }}>
              Toca uno para configurar sus series/reps/RPE y notas antes de añadirlo a la sesión del {formatSessionLabel(sessionDate)}
            </Text>

            {loadingLibrary ? (
              <ActivityIndicator size="small" color={Colors.blue500} style={{ paddingVertical: scale(30) }} />
            ) : libraryExercises.length === 0 ? (
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', paddingVertical: scale(30) }}>
                No hay más ejercicios en la biblioteca para añadir. Crea uno nuevo y quedará guardado para la próxima vez.
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
