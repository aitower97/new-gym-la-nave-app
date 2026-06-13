import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, scale } from '../theme';

type Props = NativeStackScreenProps<any, 'AdminUserTemplates'>;

interface UserInfo {
  id: string;
  full_name: string;
  email: string;
}

interface Template {
  id: string;
  day_of_week: number;
  class_time: string;
  class_type: string;
}

// Horarios típicos de gym (ajusta según tu gym)
const TIME_SLOTS = [
  '07:00:00',
  '08:00:00',
  '09:00:00',
  '10:00:00',
  '17:00:00',
  '18:00:00',
  '19:00:00',
  '20:00:00',
];

const DAYS = [
  { label: 'Lun', value: 1 },
  { label: 'Mar', value: 2 },
  { label: 'Mié', value: 3 },
  { label: 'Jue', value: 4 },
  { label: 'Vie', value: 5 },
  { label: 'Sáb', value: 6 },
  { label: 'Dom', value: 0 },
];

const CLASS_TYPES = ['CrossFit', 'Yoga', 'Spinning', 'Funcional'];

export default function AdminUserTemplatesScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const userId = route.params?.userId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [selectedClassType, setSelectedClassType] = useState(CLASS_TYPES[0]);

  useEffect(() => {
    if (!userId) {
      Alert.alert('Error', 'No se proporcionó ID de usuario');
      navigation.goBack();
      return;
    }
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      // 1. Cargar info del usuario
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      setUserInfo(userData);

      // 2. Cargar plantillas existentes
      const { data: templatesData, error: templatesError } = await supabase
        .from('booking_templates')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (templatesError) throw templatesError;

      setTemplates(templatesData || []);

      // 3. Marcar slots existentes
      const existing = new Set<string>();
      (templatesData || []).forEach(t => {
        const key = `${t.day_of_week}-${t.class_time}`;
        existing.add(key);
      });
      setSelectedSlots(existing);

    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSlot(day: number, time: string) {
    const key = `${day}-${time}`;
    const newSelected = new Set(selectedSlots);
    
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    
    setSelectedSlots(newSelected);
  }

  async function handleSave() {
    try {
      setSaving(true);

      // 1. Eliminar todas las plantillas antiguas del usuario
      await supabase
        .from('booking_templates')
        .delete()
        .eq('user_id', userId);

      // 2. Obtener admin actual
      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      if (selectedSlots.size === 0) {
        Alert.alert('✅ Plantilla guardada', 'Plantilla vaciada correctamente', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      // 3. Crear las nuevas plantillas
      const newTemplates = Array.from(selectedSlots).map(key => {
        const dashIdx = key.indexOf('-');
        const day = key.substring(0, dashIdx);
        const time = key.substring(dashIdx + 1);
        return {
          user_id: userId,
          day_of_week: parseInt(day),
          class_time: time,
          class_type: selectedClassType,
          created_by: adminId,
        };
      });

      const { error: insertError } = await supabase
        .from('booking_templates')
        .insert(newTemplates);

      if (insertError) throw insertError;

      // 4. Aplicar la plantilla INMEDIATAMENTE a clases existentes (hoy + 60 días)
      const today = new Date();
      const until = new Date();
      until.setDate(until.getDate() + 60);
      const todayStr = today.toISOString().split('T')[0];
      const untilStr = until.toISOString().split('T')[0];

      const { data: existingClasses } = await supabase
        .from('classes')
        .select('id, class_date, class_time')
        .gte('class_date', todayStr)
        .lte('class_date', untilStr);

      if (existingClasses && existingClasses.length > 0) {
        const classIds = existingClasses.map(c => c.id);

        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('class_id')
          .eq('user_id', userId)
          .in('class_id', classIds);

        const alreadyBooked = new Set((existingBookings || []).map(b => b.class_id));

        const toBook = existingClasses.filter(cls => {
          const classDate = new Date(cls.class_date + 'T00:00:00');
          const dayOfWeek = classDate.getDay();
          return newTemplates.some(
            t => t.day_of_week === dayOfWeek && t.class_time === cls.class_time
          ) && !alreadyBooked.has(cls.id);
        });

        if (toBook.length > 0) {
          await supabase.from('bookings').insert(
            toBook.map(cls => ({ class_id: cls.id, user_id: userId }))
          );
        }
      }

      // 5. Log admin
      if (adminId) {
        await supabase.from('admin_actions').insert({
          admin_id: adminId,
          action_type: 'update_user_template',
          target_type: 'user',
          target_id: userId,
          details: {
            slots_count: selectedSlots.size,
            class_type: selectedClassType,
          },
        });
      }

      Alert.alert(
        '✅ Plantilla guardada',
        `${selectedSlots.size} slot(s) configurados y reservas aplicadas automáticamente`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      console.error('Error saving template:', error);
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.outerContainer}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Cargando plantilla...</Text>
        </View>
      </View>
    );
  }

  if (!userInfo) {
    return (
      <View style={styles.outerContainer}>
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.errorText}>No se pudo cargar el usuario</Text>
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
          <Text style={styles.title}>{userInfo.full_name}</Text>
          <Text style={styles.subtitle}>{userInfo.email}</Text>
        </View>
      </View>

      {/* Selector de tipo de clase */}
      <View style={styles.classTypeSection}>
        <Text style={styles.sectionLabel}>Tipo de clase:</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.classTypeScroll}
        >
          {CLASS_TYPES.map(type => (
            <Pressable
              key={type}
              style={[
                styles.typeChip,
                selectedClassType === type && styles.typeChipSelected,
              ]}
              onPress={() => setSelectedClassType(type)}
            >
              <Text style={[
                styles.typeChipText,
                selectedClassType === type && styles.typeChipTextSelected,
              ]}>
                {type}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Grid semanal */}
      <ScrollView style={styles.gridContainer}>
        <Text style={styles.gridTitle}>Selecciona días y horarios fijos:</Text>

        <View style={styles.grid}>
          {/* Header de días */}
          <View style={styles.gridRow}>
            <View style={styles.timeHeaderCell}>
              <Text style={styles.timeHeaderText}>Hora</Text>
            </View>
            {DAYS.map(day => (
              <View key={day.value} style={styles.dayHeaderCell}>
                <Text style={styles.dayHeaderText}>{day.label}</Text>
              </View>
            ))}
          </View>

          {/* Filas de horarios */}
          {TIME_SLOTS.map(time => (
            <View key={time} style={styles.gridRow}>
              <View style={styles.timeCell}>
                <Text style={styles.timeCellText}>{time.slice(0, 5)}</Text>
              </View>
              {DAYS.map(day => {
                const key = `${day.value}-${time}`;
                const isSelected = selectedSlots.has(key);

                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.slotCell,
                      isSelected && styles.slotCellSelected,
                    ]}
                    onPress={() => toggleSlot(day.value, time)}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer - Botón guardar */}
      <View style={styles.footer}>
        <View style={styles.footerInfo}>
          <Text style={styles.footerCount}>
            {selectedSlots.size} reserva{selectedSlots.size !== 1 ? 's' : ''} fija{selectedSlots.size !== 1 ? 's' : ''} por semana
          </Text>
          <Text style={styles.footerSubtext}>
            Se aplicarán automáticamente cada semana
          </Text>
        </View>

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#0a0f1a" />
          ) : (
            <>
              <CheckIcon size={scale(18)} color="#0a0f1a" strokeWidth={2.5} />
              <Text style={styles.saveButtonText}>Guardar Plantilla</Text>
            </>
          )}
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
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
  classTypeSection: {
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 12,
  },
  classTypeScroll: {
    paddingRight: 20,
  },
  typeChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeChipSelected: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderColor: '#3b82f6',
  },
  typeChipText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  typeChipTextSelected: {
    color: '#3b82f6',
  },
  gridContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  gridTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 16,
  },
  grid: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  timeHeaderCell: {
    width: 70,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  timeHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  dayHeaderCell: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  timeCell: {
    width: 70,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  timeCellText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
  },
  slotCell: {
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.05)',
  },
  slotCellSelected: {
    backgroundColor: 'rgba(59,130,246,0.25)',
  },
  checkmark: {
    fontSize: 20,
    color: '#3b82f6',
    fontWeight: '700',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  footerInfo: {
    marginBottom: 16,
  },
  footerCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  saveButton: {
    flexDirection: 'row',
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    shadowOpacity: 0,
  },
  saveButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  saveButtonText: {
    color: '#0a0f1a',
    fontSize: 16,
    fontWeight: '700',
  },
});