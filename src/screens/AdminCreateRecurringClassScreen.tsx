import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ClockIcon, PlusIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { Button, ScreenHeader, SpringPressable } from '../components/ui';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminCreateRecurringClass'>;
  route: RouteProp<RootStackParamList, 'AdminCreateRecurringClass'>;
};

const DAYS_OF_WEEK = [
  { id: 1, name: 'L', full: 'Lunes' },
  { id: 2, name: 'M', full: 'Martes' },
  { id: 3, name: 'X', full: 'Miércoles' },
  { id: 4, name: 'J', full: 'Jueves' },
  { id: 5, name: 'V', full: 'Viernes' },
  { id: 6, name: 'S', full: 'Sábado' },
  { id: 0, name: 'D', full: 'Domingo' },
];

export default function AdminCreateRecurringClassScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [classType, setClassType] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]);
  const _initStart = new Date();
  const _initEnd = new Date();
  _initEnd.setMonth(_initEnd.getMonth() + 3);
  const [startDateStr, setStartDateStr] = useState(
    `${_initStart.getDate().toString().padStart(2,'0')}/${(_initStart.getMonth()+1).toString().padStart(2,'0')}/${_initStart.getFullYear()}`
  );
  const [endDateStr, setEndDateStr] = useState(
    `${_initEnd.getDate().toString().padStart(2,'0')}/${(_initEnd.getMonth()+1).toString().padStart(2,'0')}/${_initEnd.getFullYear()}`
  );
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['07:00']);
  const [maxSpots, setMaxSpots] = useState('10');
  const [loading, setLoading] = useState(false);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => {
    loadClassTypes();
  }, []);

  async function loadClassTypes() {
    try {
      setLoadingTypes(true);
      const { data } = await supabase
        .from('class_types')
        .select('name')
        .order('name');

      const names = (data || []).map(r => r.name).filter(Boolean);
      setClassTypes(names);
      if (names.length > 0) setClassType(names[0]);
    } catch (error) {
      console.error('Error loading class types:', error);
    } finally {
      setLoadingTypes(false);
    }
  }

  async function handleAddType(name: string) {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed || classTypes.includes(trimmed)) return;

    const { error } = await supabase.from('class_types').insert({ name: trimmed });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setClassTypes(prev => [...prev, trimmed].sort());
    setClassType(trimmed);
  }

  async function handleDeleteType(name: string) {
    Alert.alert(
      'Eliminar tipo',
      `¿Borrar "${name}"? Las clases existentes no se verán afectadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('class_types').delete().eq('name', name);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            setClassTypes(prev => prev.filter(t => t !== name));
            if (classType === name) setClassType(classTypes[0] !== name ? classTypes[0] : '');
          },
        },
      ]
    );
  }

  function addTimeSlot() {
    setSelectedTimes([...selectedTimes, '19:00']);
  }

  function removeTimeSlot(index: number) {
    if (selectedTimes.length > 1) {
      setSelectedTimes(selectedTimes.filter((_, i) => i !== index));
    }
  }

  function toggleDay(dayId: number) {
    if (selectedDays.includes(dayId)) {
      setSelectedDays(selectedDays.filter(d => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  }

  function generateClassDates(): Array<{ date: Date; timeStr: string }> {
    const [sd, sm, sy] = startDateStr.split('/').map(Number);
    const [ed, em, ey] = endDateStr.split('/').map(Number);
    if (!sy || !ey) return [];
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);
    const classes: Array<{ date: Date; timeStr: string }> = [];
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (selectedDays.includes(dayOfWeek)) {
        selectedTimes.forEach(t => {
          classes.push({ date: new Date(current), timeStr: t });
        });
      }
      current.setDate(current.getDate() + 1);
    }
    return classes;
  }

  async function handleCreate() {
    if (!classType) {
      Alert.alert('Error', 'Selecciona un tipo de clase');
      return;
    }

    if (selectedDays.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un día de la semana');
      return;
    }

    const [sd2, sm2, sy2] = startDateStr.split('/').map(Number);
    const [ed2, em2, ey2] = endDateStr.split('/').map(Number);
    if (!sy2 || !ey2) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA');
      return;
    }
    if (new Date(sy2, sm2 - 1, sd2) >= new Date(ey2, em2 - 1, ed2)) {
      Alert.alert('Error', 'La fecha de fin debe ser posterior a la de inicio');
      return;
    }

    const spots = parseInt(maxSpots);
    if (isNaN(spots) || spots < 1 || spots > 10) {
      Alert.alert('Error', 'La capacidad debe ser entre 1 y 10');
      return;
    }

    const classesToCreate = generateClassDates();

    if (classesToCreate.length === 0) {
      Alert.alert('Error', 'No se generó ninguna clase con los parámetros seleccionados');
      return;
    }

    Alert.alert(
      'Confirmar creación',
      `Se crearán ${classesToCreate.length} clases.\n\n¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Crear', onPress: () => createClasses(classesToCreate) },
      ]
    );
  }

  async function createClasses(classesInfo: Array<{ date: Date; timeStr: string }>) {
    try {
      setLoading(true);
      const spots = parseInt(maxSpots);

      const classesData = classesInfo.map(({ date, timeStr: t }) => {
        const y = date.getFullYear();
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const d = date.getDate().toString().padStart(2, '0');
        return {
          name: classType,
          class_type: classType,
          class_date: `${y}-${m}-${d}`,
          class_time: `${t}:00`,
          max_spots: spots,
        };
      });

      const { error } = await supabase.from('classes').insert(classesData);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'create_recurring_classes',
          target_type: 'class',
          details: {
            class_type: classType,
            times: selectedTimes,
            max_spots: spots,
            days_of_week: selectedDays,
            start_date: startDateStr,
            end_date: endDateStr,
            total_classes: classesData.length,
          },
        });
      }

      Alert.alert(
        '¡Listo! ✅',
        `Se crearon ${classesData.length} clases correctamente`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      console.error('Error creating recurring classes:', error);
      Alert.alert('Error', error.message || 'No se pudieron crear las clases');
    } finally {
      setLoading(false);
    }
  }

  const estimatedClasses = generateClassDates().length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Clases Recurrentes"
          subtitle="Crear múltiples clases automáticamente"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: scale(20) }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ padding: scale(20) }}>
            {/* Tipo de clase */}
            <Animated.View entering={FadeInDown.duration(350).delay(80).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Tipo de clase *
              </Text>
              {loadingTypes ? (
                <ActivityIndicator size="small" color={Colors.blue500} style={{ alignSelf: 'flex-start' }} />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  {classTypes.map((type) => (
                    <SpringPressable
                      key={type}
                      onPress={() => setClassType(type)}
                      onLongPress={() => handleDeleteType(type)}
                      style={{
                        paddingHorizontal: scale(16), paddingVertical: scale(10),
                        borderRadius: Radius.sm, borderWidth: 1,
                        backgroundColor: classType === type ? 'rgba(59,130,246,0.2)' : Colors.card,
                        borderColor: classType === type ? Colors.blue500 : Colors.cardBorder,
                      }}
                    >
                      <Text style={{
                        fontSize: moderateScale(13), fontWeight: '600',
                        color: classType === type ? Colors.blue500 : Colors.textMuted,
                      }}>
                        {type}
                      </Text>
                    </SpringPressable>
                  ))}
                  <SpringPressable
                    onPress={() => setShowNewType(true)}
                    style={{
                      paddingHorizontal: scale(14), paddingVertical: scale(10),
                      borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed',
                      borderColor: Colors.cardBorder,
                      backgroundColor: Colors.card,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <PlusIcon size={scale(16)} color={Colors.textMuted} />
                  </SpringPressable>
                  {showNewType && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: scale(12), paddingVertical: scale(8),
                      borderRadius: Radius.sm, borderWidth: 1,
                      borderColor: Colors.blue500,
                      backgroundColor: 'rgba(59,130,246,0.1)',
                    }}>
                      <TextInput
                        autoFocus
                        value={newTypeName}
                        onChangeText={setNewTypeName}
                        placeholder="Nuevo tipo"
                        placeholderTextColor={Colors.placeholder}
                        style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.blue500, minWidth: 100, padding: 0 }}
                        onSubmitEditing={() => {
                          handleAddType(newTypeName);
                          setShowNewType(false);
                          setNewTypeName('');
                        }}
                        onBlur={() => {
                          handleAddType(newTypeName);
                          setShowNewType(false);
                          setNewTypeName('');
                        }}
                      />
                    </View>
                  )}
                </View>
              )}
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(8) }}>
                Mantenga pulsado sobre un tipo para eliminarlo
              </Text>
            </Animated.View>

            {/* Días de la semana */}
            <Animated.View entering={FadeInDown.duration(350).delay(120).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Días de la semana *
              </Text>
              <View style={{ flexDirection: 'row', gap: scale(8) }}>
                {DAYS_OF_WEEK.map((day) => (
                  <SpringPressable
                    key={day.id}
                    onPress={() => toggleDay(day.id)}
                    style={{
                      flex: 1, aspectRatio: 1,
                      borderRadius: Radius.sm, borderWidth: 1,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: selectedDays.includes(day.id) ? 'rgba(59,130,246,0.2)' : Colors.card,
                      borderColor: selectedDays.includes(day.id) ? Colors.blue500 : Colors.cardBorder,
                    }}
                  >
                    <Text style={{
                      fontSize: moderateScale(15), fontWeight: '700',
                      color: selectedDays.includes(day.id) ? Colors.blue500 : Colors.textMuted,
                    }}>
                      {day.name}
                    </Text>
                  </SpringPressable>
                ))}
              </View>
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(6) }}>
                Seleccionados: {selectedDays.map(id =>
                  DAYS_OF_WEEK.find(d => d.id === id)?.full
                ).join(', ') || 'Ninguno'}
              </Text>
            </Animated.View>

            {/* Fecha inicio */}
            <Animated.View entering={FadeInDown.duration(350).delay(160).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Fecha de inicio *
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(16),
                backgroundColor: Colors.card,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <CalendarIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                <TextInput
                  style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                  value={startDateStr}
                  onChangeText={setStartDateStr}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Animated.View>

            {/* Fecha fin */}
            <Animated.View entering={FadeInDown.duration(350).delay(200).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Fecha de fin *
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(16),
                backgroundColor: Colors.card,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <CalendarIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                <TextInput
                  style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                  value={endDateStr}
                  onChangeText={setEndDateStr}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Animated.View>

            {/* Horas */}
            <Animated.View entering={FadeInDown.duration(350).delay(240).springify()} style={{ marginBottom: scale(24) }}>
              <View style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: scale(8),
              }}>
                <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                  Horas * ({selectedTimes.length})
                </Text>
                <SpringPressable
                  onPress={addTimeSlot}
                  style={{
                    paddingHorizontal: scale(12), paddingVertical: scale(6),
                    backgroundColor: 'rgba(59,130,246,0.2)',
                    borderRadius: Radius.sm,
                    borderWidth: 1, borderColor: Colors.borderBlue,
                  }}
                >
                  <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.blue500 }}>
                    + Añadir hora
                  </Text>
                </SpringPressable>
              </View>

              {selectedTimes.map((timeSlot, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: scale(8), marginBottom: scale(8) }}>
                  <View style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center',
                    padding: scale(16),
                    backgroundColor: Colors.card,
                    borderRadius: Radius.md,
                    borderWidth: 1, borderColor: Colors.cardBorder,
                  }}>
                    <ClockIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                    <TextInput
                      style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                      value={timeSlot}
                      onChangeText={(val) => {
                        const newTimes = [...selectedTimes];
                        newTimes[index] = val;
                        setSelectedTimes(newTimes);
                      }}
                      placeholder="HH:MM"
                      placeholderTextColor={Colors.placeholder}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>

                  {selectedTimes.length > 1 && (
                    <SpringPressable
                      onPress={() => removeTimeSlot(index)}
                      style={{
                        width: scale(44), height: scale(50),
                        backgroundColor: Colors.dangerLight,
                        borderRadius: Radius.md,
                        borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: moderateScale(20), color: Colors.danger, fontWeight: '600' }}>✕</Text>
                    </SpringPressable>
                  )}
                </View>
              ))}
            </Animated.View>

            {/* Capacidad */}
            <Animated.View entering={FadeInDown.duration(350).delay(280).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Capacidad máxima *
              </Text>
              <TextInput
                style={{
                  padding: scale(16),
                  backgroundColor: Colors.card,
                  borderRadius: Radius.md,
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  color: Colors.textPrimary,
                  fontSize: moderateScale(15),
                  fontWeight: '600',
                }}
                value={maxSpots}
                onChangeText={setMaxSpots}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor={Colors.placeholder}
              />
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(6) }}>
                Número de plazas disponibles (1-10)
              </Text>
            </Animated.View>

            {/* Resumen */}
            <Animated.View entering={FadeInDown.duration(400).delay(320).springify()} style={{ marginTop: scale(8) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(12) }}>
                Resumen
              </Text>
              <View style={{
                padding: scale(20),
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.borderBlue,
              }}>
                <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(12) }}>
                  {classType}
                </Text>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, marginBottom: scale(6) }}>
                  Días: {selectedDays.map(id =>
                    DAYS_OF_WEEK.find(d => d.id === id)?.name
                  ).join(', ')}
                </Text>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, marginBottom: scale(6) }}>
                  Horas: {selectedTimes.join(', ')}
                </Text>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, marginBottom: scale(6) }}>
                  Del {startDateStr} al {endDateStr}
                </Text>
                <View style={{
                  marginTop: scale(12), padding: scale(12),
                  backgroundColor: 'rgba(59,130,246,0.2)',
                  borderRadius: Radius.sm, alignItems: 'center',
                }}>
                  <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.blue500 }}>
                    Se crearán {estimatedClasses} clases
                  </Text>
                  <Text style={{ fontSize: moderateScale(12), color: 'rgba(59,130,246,0.8)', marginTop: scale(4) }}>
                    ({selectedDays.length} días × {selectedTimes.length} horas)
                  </Text>
                </View>
              </View>
            </Animated.View>
          </View>
        </ScrollView>

        {/* Botón crear */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(360).springify()}
          style={{
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            backgroundColor: Colors.background,
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}
        >
          <Button
            label={loading ? 'Creando clases...' : `Crear ${estimatedClasses} clases`}
            onPress={handleCreate}
            loading={loading}
            disabled={loading || estimatedClasses === 0 || !classType || classTypes.length === 0}
          />
        </Animated.View>
      </View>
    </View>
  );
}
