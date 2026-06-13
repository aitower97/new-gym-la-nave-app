import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { createClassSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminCreateClass'>;
  route: RouteProp<RootStackParamList, 'AdminCreateClass'>;
};

const CLASS_TYPES = [
  'CROSS TRAINING',
  'HALTEROFILIA',
];

export default function AdminCreateClassScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { initialDate } = route.params || {};

  const [classType, setClassType] = useState('CROSS TRAINING');
  const initDate = initialDate ? new Date(initialDate) : new Date();
  const [dateStr, setDateStr] = useState(
    `${initDate.getDate().toString().padStart(2,'0')}/${(initDate.getMonth()+1).toString().padStart(2,'0')}/${initDate.getFullYear()}`
  );
  const [timeStr, setTimeStr] = useState('07:00');
  const [maxSpots, setMaxSpots] = useState('15');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    // Parse dateStr (DD/MM/AAAA)
    const [dd, mm, yyyy] = dateStr.split('/').map(Number);
    if (!dd || !mm || !yyyy || yyyy < 2020) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA');
      return;
    }
    const classDate = `${yyyy}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;

    // Validar inputs
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

    try {
      setLoading(true);
      
      const [hh, mins] = timeStr.split(':').map(Number);
      const classTime = `${hh.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:00`;
      
      // Verificar si ya existe una clase en esa fecha/hora
      const { data: existingClass } = await supabase
        .from('classes')
        .select('id')
        .eq('class_date', validated.class_date)
        .eq('class_time', classTime)
        .single();
      
      if (existingClass) {
        Alert.alert('Error', 'Ya existe una clase en esa fecha y hora');
        setLoading(false);
        return;
      }

      // Crear clase
      const classData = {
        name: validated.class_type,
        class_type: validated.class_type,
        class_date: validated.class_date,
        class_time: classTime,
        max_spots: validated.max_spots,
      };

      const { error } = await supabase
        .from('classes')
        .insert([classData]);

      if (error) throw error;

      // Log de acción admin
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'create_class',
          target_type: 'class',
          details: classData,
        });
      }

      Alert.alert('✅ Clase creada', 'La clase se ha creado correctamente', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: any) {
      console.error('Error creating class:', error);
      Alert.alert('Error', error.message || 'No se pudo crear la clase');
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.title}>Crear Clase</Text>
          <Text style={styles.subtitle}>Nueva clase puntual</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Banner para clases recurrentes */}
        <Pressable 
          style={styles.recurringBanner}
          onPress={() => navigation.navigate('AdminCreateRecurringClass')}
        >
          <CalendarIcon size={scale(18)} color={Colors.blue400} />
          <View style={styles.recurringBannerContent}>
            <Text style={styles.recurringBannerTitle}>Crear clases recurrentes</Text>
            <Text style={styles.recurringBannerText}>
              Genera múltiples clases automáticamente
            </Text>
          </View>
          <ChevronRightIcon size={scale(18)} color={Colors.blue400} />
        </Pressable>
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
            <Text style={styles.hint}>Número de plazas disponibles (1-30)</Text>
          </View>

          {/* Preview */}
          <View style={styles.preview}>
            <Text style={styles.previewTitle}>Vista previa</Text>
            <View style={styles.previewCard}>
              <Text style={styles.previewType}>{classType}</Text>
              <Text style={styles.previewDateTime}>
                {dateStr} • {timeStr}
              </Text>
              <Text style={styles.previewCapacity}>
                Capacidad: {maxSpots} plazas
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Botón FIJO abajo FUERA del ScrollView */}
      <View style={styles.bottomContainer}>
        <Pressable
          style={[styles.createBtn, loading && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          <Text style={styles.createBtnText}>
            {loading ? 'Creando clase...' : '✓ Añadir clase'}
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
  bottomContainer: {  // ← NUEVO
    padding: 20,
    paddingBottom: 30,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
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
    marginBottom: 8,
  },
  previewDateTime: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  previewCapacity: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
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
  fabButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
  },
 recurringBanner: {
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
  recurringBannerIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  recurringBannerContent: {
    flex: 1,
  },
  recurringBannerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F59E0B',
    marginBottom: 2,
  },
  recurringBannerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  recurringBannerArrow: {
    fontSize: 20,
    color: '#F59E0B',
  },
});