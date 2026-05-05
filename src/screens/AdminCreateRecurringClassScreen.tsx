import DateTimePicker from '@react-native-community/datetimepicker';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon, ClockIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminCreateRecurringClass'>;
  route: RouteProp<RootStackParamList, 'AdminCreateRecurringClass'>;
};

const CLASS_TYPES = [
  'CROSS TRAINING',
  'HALTEROFILIA',
];

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
  const [classType, setClassType] = useState('CROSS TRAINING');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Lun, Mie, Vie por defecto
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 3); // 3 meses por defecto
    return date;
  });
  const [selectedTimes, setSelectedTimes] = useState<Date[]>([new Date()]);
  const [maxSpots, setMaxSpots] = useState('15');
  const [loading, setLoading] = useState(false);
  
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showTimePickerIndex, setShowTimePickerIndex] = useState<number | null>(null);

  const handleStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setStartDate(selectedDate);
    }
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date, index?: number) => {
    if (Platform.OS === 'android') {
      setShowTimePickerIndex(null);
    }
    
    if (selectedTime && index !== undefined) {
      const newTimes = [...selectedTimes];
      newTimes[index] = selectedTime;
      setSelectedTimes(newTimes);
    }
  };

  function addTimeSlot() {
    const newTime = new Date();
    newTime.setHours(19, 0, 0, 0); // Default 19:00
    setSelectedTimes([...selectedTimes, newTime]);
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

  function generateClassDates(): Array<{ date: Date; time: Date }> {
    const classes: Array<{ date: Date; time: Date }> = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      if (selectedDays.includes(dayOfWeek)) {
        // Para cada día, crear una clase por cada hora seleccionada
        selectedTimes.forEach(time => {
          classes.push({
            date: new Date(current),
            time: new Date(time)
          });
        });
      }
      current.setDate(current.getDate() + 1);
    }
    
    return classes;
  }

  async function handleCreate() {
    // Validaciones
    if (!classType) {
      Alert.alert('Error', 'Selecciona un tipo de clase');
      return;
    }

    if (selectedDays.length === 0) {
      Alert.alert('Error', 'Selecciona al menos un día de la semana');
      return;
    }

    if (startDate >= endDate) {
      Alert.alert('Error', 'La fecha de fin debe ser posterior a la de inicio');
      return;
    }

    const spots = parseInt(maxSpots);
    if (isNaN(spots) || spots < 1 || spots > 30) {
      Alert.alert('Error', 'La capacidad debe ser entre 1 y 30');
      return;
    }

    const classesToCreate = generateClassDates();
    
    if (classesToCreate.length === 0) {
      Alert.alert('Error', 'No se generó ninguna clase con los parámetros seleccionados');
      return;
    }

    // Confirmar con el usuario
    Alert.alert(
      'Confirmar creación',
      `Se crearán ${classesToCreate.length} clases.\n\n¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Crear',
          onPress: () => createClasses(classesToCreate),
        },
      ]
    );
  }

  async function createClasses(classesInfo: Array<{ date: Date; time: Date }>) {
    try {
      setLoading(true);

      const spots = parseInt(maxSpots);

      // Preparar datos para inserción batch
      const classesData = classesInfo.map(({ date, time }) => ({
        name: classType,
        class_type: classType,
        class_date: date.toISOString().split('T')[0],
        class_time: `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}:00`,
        max_spots: spots,
      }));

      // Insertar todas las clases
      const { error } = await supabase
        .from('classes')
        .insert(classesData);

      if (error) throw error;

      // Log de acción admin
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'create_recurring_classes',
          target_type: 'class',
          details: {
            class_type: classType,
            times: selectedTimes.map(t => `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`),
            max_spots: spots,
            days_of_week: selectedDays,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            total_classes: classesData.length,
          },
        });
      }

      Alert.alert(
        '¡Listo! ✅', 
        `Se crearon ${classesData.length} clases correctamente`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
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
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Clases Recurrentes</Text>
          <Text style={styles.subtitle}>Crear múltiples clases automáticamente</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.form}>
          {/* Tipo de clase */}
          <View style={styles.field}>
            <Text style={styles.label}>Tipo de clase *</Text>
            <View style={styles.typeGrid}>
              {CLASS_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.typeBtn,
                    classType === type && styles.typeBtnActive,
                  ]}
                  onPress={() => setClassType(type)}
                >
                  <Text
                    style={[
                      styles.typeBtnText,
                      classType === type && styles.typeBtnTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Días de la semana */}
          <View style={styles.field}>
            <Text style={styles.label}>Días de la semana *</Text>
            <View style={styles.daysGrid}>
              {DAYS_OF_WEEK.map((day) => (
                <Pressable
                  key={day.id}
                  style={[
                    styles.dayBtn,
                    selectedDays.includes(day.id) && styles.dayBtnActive,
                  ]}
                  onPress={() => toggleDay(day.id)}
                >
                  <Text
                    style={[
                      styles.dayBtnText,
                      selectedDays.includes(day.id) && styles.dayBtnTextActive,
                    ]}
                  >
                    {day.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              Seleccionados: {selectedDays.map(id => 
                DAYS_OF_WEEK.find(d => d.id === id)?.full
              ).join(', ') || 'Ninguno'}
            </Text>
          </View>

          {/* Fecha inicio */}
          <View style={styles.field}>
            <Text style={styles.label}>Fecha de inicio *</Text>
            <Pressable
              style={styles.dateTimeBtn}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Text style={styles.dateTimeText}>
                {startDate.toLocaleDateString('es-ES', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              <CalendarIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
            </Pressable>
          </View>

          {showStartDatePicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleStartDateChange}
              minimumDate={new Date()}
              themeVariant="light"
              textColor = "#ffffff"
            />
          )}

          {/* Fecha fin */}
          <View style={styles.field}>
            <Text style={styles.label}>Fecha de fin *</Text>
            <Pressable
              style={styles.dateTimeBtn}
              onPress={() => setShowEndDatePicker(true)}
            >
              <Text style={styles.dateTimeText}>
                {endDate.toLocaleDateString('es-ES', {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              <CalendarIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
            </Pressable>
          </View>

          {showEndDatePicker && (
            <DateTimePicker
              value={endDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleEndDateChange}
              minimumDate={startDate}
              themeVariant="light"
              textColor = "#ffffff"
            />
          )}

          {/* Horas */}
          <View style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text style={styles.label}>Horas * ({selectedTimes.length})</Text>
              <Pressable style={styles.addTimeBtn} onPress={addTimeSlot}>
                <Text style={styles.addTimeBtnText}>+ Añadir hora</Text>
              </Pressable>
            </View>
            
            {selectedTimes.map((timeSlot, index) => (
              <View key={index} style={styles.timeSlotRow}>
                <Pressable
                  style={[styles.dateTimeBtn, styles.timeSlotBtn]}
                  onPress={() => setShowTimePickerIndex(index)}
                >
                  <Text style={styles.dateTimeText}>
                    {timeSlot.getHours().toString().padStart(2, '0')}:
                    {timeSlot.getMinutes().toString().padStart(2, '0')}
                  </Text>
                  <ClockIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                </Pressable>
                
                {selectedTimes.length > 1 && (
                  <Pressable
                    style={styles.removeTimeBtn}
                    onPress={() => removeTimeSlot(index)}
                  >
                    <Text style={styles.removeTimeBtnText}>✕</Text>
                  </Pressable>
                )}
              </View>
            ))}

            {showTimePickerIndex !== null && (
              <DateTimePicker
                value={selectedTimes[showTimePickerIndex]}
                mode="time"
                is24Hour={true}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(e, date) => handleTimeChange(e, date, showTimePickerIndex)}
                themeVariant="light"
                textColor = "#ffffff"
              />
            )}
          </View>

          {/* Capacidad */}
          <View style={styles.field}>
            <Text style={styles.label}>Capacidad máxima *</Text>
            <TextInput
              style={styles.input}
              value={maxSpots}
              onChangeText={setMaxSpots}
              keyboardType="number-pad"
              placeholder="15"
              placeholderTextColor="rgba(255,255,255,0.3)"
            />
            <Text style={styles.hint}>Número de plazas disponibles (1-30)</Text>
          </View>

          {/* Preview */}
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Resumen</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewType}>{classType}</Text>
              <Text style={styles.previewDetail}>
                Días: {selectedDays.map(id => 
                  DAYS_OF_WEEK.find(d => d.id === id)?.name
                ).join(', ')}
              </Text>
              <Text style={styles.previewDetail}>
                Horas: {selectedTimes.map(t => 
                  `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`
                ).join(', ')}
              </Text>
              <Text style={styles.previewDetail}>
                Del {startDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al {endDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
              <View style={styles.previewHighlight}>
                <Text style={styles.previewHighlightText}>
                  Se crearán {estimatedClasses} clases
                </Text>
                <Text style={styles.previewSubtext}>
                  ({selectedDays.length} días × {selectedTimes.length} horas)
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Botón crear */}
      <View style={styles.bottomContainer}>
        <Pressable
          style={[styles.createBtn, (loading || estimatedClasses === 0) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading || estimatedClasses === 0}
        >
          <Text style={styles.createBtnText}>
            {loading ? 'Creando clases...' : `✓ Crear ${estimatedClasses} clases`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backIcon: {
    fontSize: 24,
    color: '#fff',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 24,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  typeBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderColor: '#3B82F6',
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  typeBtnTextActive: {
    color: '#3B82F6',
  },
  daysGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  dayBtn: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBtnActive: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderColor: '#3B82F6',
  },
  dayBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  dayBtnTextActive: {
    color: '#3B82F6',
  },
  dateTimeBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  dateTimeText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateTimeIcon: {
    fontSize: 20,
  },
  addTimeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  addTimeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  timeSlotRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  timeSlotBtn: {
    flex: 1,
  },
  removeTimeBtn: {
    width: 44,
    height: 50,
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeTimeBtnText: {
    fontSize: 20,
    color: '#EF4444',
    fontWeight: '600',
  },
  input: {
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 6,
  },
  preview: {
    marginTop: 8,
    marginBottom: 0,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 12,
  },
  previewCard: {
    padding: 20,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  previewType: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  previewDetail: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 6,
  },
  previewHighlight: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderRadius: 8,
    alignItems: 'center',
  },
  previewHighlightText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  previewSubtext: {
    fontSize: 12,
    color: 'rgba(59,130,246,0.8)',
    marginTop: 4,
  },
  bottomContainer: {
    padding: 20,
    paddingBottom: 30,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  createBtn: {
    padding: 18,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
});