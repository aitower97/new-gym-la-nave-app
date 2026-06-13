import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
import { createNotificationsForUsers } from '../utils/notifications';
import { createClassSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminEditClass'>;
  route: RouteProp<RootStackParamList, 'AdminEditClass'>;
};

const CLASS_TYPES = [
  'CROSS TRAINING',
  'HALTEROFILIA',
];

interface ClassData {
  id: string;
  name: string;
  class_type: string;
  class_date: string;
  class_time: string;
  max_spots: number;
}

export default function AdminEditClassScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { classId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalClass, setOriginalClass] = useState<ClassData | null>(null);
  const [currentBookings, setCurrentBookings] = useState(0);

  const [classType, setClassType] = useState('CROSS TRAINING');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [maxSpots, setMaxSpots] = useState('15');

  useEffect(() => {
    loadClassData();
  }, [classId]);

  async function loadClassData() {
    try {
      setLoading(true);

      // Cargar datos de la clase
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (classError) throw classError;
      setOriginalClass(classData);

      // Cargar número de reservas
      const { count, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId);

      if (countError) throw countError;
      setCurrentBookings(count || 0);

      // Pre-rellenar formulario
      setClassType(classData.class_type);
      const [cy, cm, cd] = classData.class_date.split('-').map(Number);
      setDateStr(`${cd.toString().padStart(2,'0')}/${cm.toString().padStart(2,'0')}/${cy}`);
      setTimeStr(classData.class_time.slice(0, 5));
      setMaxSpots(classData.max_spots.toString());
    } catch (error: any) {
      console.error('Error loading class:', error);
      Alert.alert('Error', 'No se pudo cargar la clase');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    // Parse dateStr (DD/MM/AAAA)
    const [dd, mm, yyyy] = dateStr.split('/').map(Number);
    if (!dd || !mm || !yyyy || yyyy < 2020) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA');
      return;
    }
    const classDate = `${yyyy}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;
    
    // Validar inputs básicos
    const validated = validateOrAlert(
      createClassSchema,
      {
        class_type: classType,
        class_date: classDate,
        max_spots: parseInt(maxSpots),
      },
      Alert
    );
    
    if (!validated) return;

    // Validación extra: no reducir capacidad por debajo de reservas actuales
    if (validated.max_spots < currentBookings) {
      Alert.alert(
        'Error',
        `No puedes reducir la capacidad a ${validated.max_spots} porque ya hay ${currentBookings} reservas confirmadas.`
      );
      return;
    }

    try {
      setSaving(true);

      const [hh, mins] = timeStr.split(':').map(Number);
      const classTime = `${hh.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:00`;

      // Detectar si cambió fecha u hora
      const dateChanged = originalClass!.class_date !== validated.class_date;
      const timeChanged = originalClass!.class_time !== classTime;

      // SOLO verificar duplicados si cambió fecha u hora
      if (dateChanged || timeChanged) {
        const { data: existingClass } = await supabase
          .from('classes')
          .select('id')
          .eq('class_date', validated.class_date)
          .eq('class_time', classTime)
          .neq('id', classId)
          .single();

        if (existingClass) {
          Alert.alert('Error', 'Ya existe otra clase en esa fecha y hora');
          setSaving(false);
          return;
        }
      }

      // Detectar si cambió fecha u hora (importante para usuarios)
      const significantChange = dateChanged || timeChanged;

      // Obtener usuarios afectados SI hay cambio significativo
      let affectedUserIds: string[] = [];
      if (significantChange && currentBookings > 0) {
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('user_id')
          .eq('class_id', classId);

        affectedUserIds = (bookingsData || [])
          .map(b => b.user_id)
          .filter((id): id is string => id !== null);
      }

      // Actualizar clase
      const { error } = await supabase
        .from('classes')
        .update({
          name: validated.class_type,
          class_type: validated.class_type,
          class_date: validated.class_date,
          class_time: classTime,
          max_spots: validated.max_spots,
        })
        .eq('id', classId);

      if (error) throw error;

      // Enviar notificaciones si hay cambio significativo
      if (significantChange && affectedUserIds.length > 0) {
        const newDate = new Date(validated.class_date + 'T00:00:00');
        const formattedDate = newDate.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });

        let changeDescription = '';
        if (dateChanged && timeChanged) {
          changeDescription = `fecha y hora. Nueva fecha: ${formattedDate} a las ${classTime.slice(0, 5)}`;
        } else if (dateChanged) {
          changeDescription = `fecha. Nueva fecha: ${formattedDate}`;
        } else {
          changeDescription = `hora. Nueva hora: ${classTime.slice(0, 5)}`;
        }

        await createNotificationsForUsers(affectedUserIds, {
          type: 'class_modified',
          title: 'Clase modificada',
          message: `La clase de ${validated.class_type} ha cambiado de ${changeDescription}.`,
          classId: classId,
        });
      }

      // Log de acción admin
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'edit_class',
          target_type: 'class',
          target_id: classId,
          details: {
            old_values: {
              class_type: originalClass?.class_type,
              class_date: originalClass?.class_date,
              class_time: originalClass?.class_time,
              max_spots: originalClass?.max_spots,
            },
            new_values: {
              class_type: validated.class_type,
              class_date: validated.class_date,
              class_time: classTime,
              max_spots: validated.max_spots,
            },
            notifications_sent: affectedUserIds.length,
          },
        });
      }

      Alert.alert('¡Listo! ✅', 'Clase actualizada correctamente', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error updating class:', error);
      Alert.alert('Error', error.message || 'No se pudo actualizar la clase');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.outerContainer}>
        <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Editar Clase</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Editar Clase</Text>
          <Text style={styles.subtitle}>Modificar detalles</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Info de reservas actuales */}
        {currentBookings > 0 && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningIcon}>!</Text>
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>
                {currentBookings} reserva{currentBookings > 1 ? 's' : ''} confirmada{currentBookings > 1 ? 's' : ''}
              </Text>
              <Text style={styles.warningText}>
                Los usuarios serán notificados si cambias la fecha u hora
              </Text>
            </View>
          </View>
        )}

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

          {/* Fecha */}
          <View style={styles.field}>
            <Text style={styles.label}>Fecha *</Text>
            <View style={styles.dateTimeBtn}>
              <CalendarIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.dateTimeText, { flex: 1, marginLeft: 8 }]}
                value={dateStr}
                onChangeText={setDateStr}
                placeholder="DD/MM/AAAA"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* Hora */}
          <View style={styles.field}>
            <Text style={styles.label}>Hora *</Text>
            <View style={styles.dateTimeBtn}>
              <ClockIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
              <TextInput
                style={[styles.dateTimeText, { flex: 1, marginLeft: 8 }]}
                value={timeStr}
                onChangeText={setTimeStr}
                placeholder="HH:MM"
                placeholderTextColor="rgba(255,255,255,0.3)"
                keyboardType="numbers-and-punctuation"
              />
            </View>
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
            <Text style={styles.hint}>
              Mínimo: {currentBookings} (reservas actuales) • Máximo: 30
            </Text>
          </View>

          {/* Preview de cambios */}
          {originalClass && (
            <View style={styles.preview}>
              <Text style={styles.previewTitle}>Cambios a aplicar</Text>
              <View style={styles.previewCard}>
                {originalClass.class_type !== classType && (
                  <View style={styles.changeRow}>
                    <Text style={styles.changeLabel}>Tipo:</Text>
                    <Text style={styles.changeValue}>
                      {originalClass.class_type} → {classType}
                    </Text>
                  </View>
                )}
                <View style={styles.changeRow}>
                  <Text style={styles.changeLabel}>Fecha:</Text>
                  <Text style={styles.changeValue}>{dateStr}</Text>
                </View>
                <View style={styles.changeRow}>
                  <Text style={styles.changeLabel}>Hora:</Text>
                  <Text style={styles.changeValue}>{timeStr}</Text>
                </View>
                {originalClass.max_spots !== parseInt(maxSpots) && (
                  <View style={styles.changeRow}>
                    <Text style={styles.changeLabel}>Capacidad:</Text>
                    <Text style={styles.changeValue}>
                      {originalClass.max_spots} → {maxSpots} plazas
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Botón guardar */}
      <View style={styles.bottomContainer}>
        <Pressable
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Guardando...' : '✓ Guardar cambios'}
          </Text>
        </Pressable>
      </View>
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F59E0B',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 24,
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
  changeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  changeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    width: 80,
  },
  changeValue: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '600',
    flex: 1,
  },
  noChanges: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  bottomContainer: {
    padding: 20,
    paddingBottom: 30,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  saveBtn: {
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
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
});