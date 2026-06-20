import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronLeftIcon, PlusIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { Button, SpringPressable } from '../components/ui';

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
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
];

export default function AdminUserTemplatesScreen({ route, navigation }: Props) {
  const insets = useSafeAreaInsets();
  const userId = route.params?.userId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [selectedClassType, setSelectedClassType] = useState('');
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

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

      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      setUserInfo(userData);

      const { data: templatesData, error: templatesError } = await supabase
        .from('booking_templates')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (templatesError) throw templatesError;

      setTemplates(templatesData || []);

      const existing = new Set<string>();
      (templatesData || []).forEach(t => {
        const key = `${t.day_of_week}-${t.class_time}`;
        existing.add(key);
      });
      setSelectedSlots(existing);

      const { data: typesData } = await supabase
        .from('class_types')
        .select('name')
        .order('name');

      const names = (typesData || []).map(r => r.name).filter(Boolean);
      setClassTypes(names);

      if (names.length > 0) {
        const existingType = templatesData?.[0]?.class_type;
        if (existingType && names.includes(existingType)) {
          setSelectedClassType(existingType);
        } else {
          setSelectedClassType(names[0]);
        }
      }

    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddType(name: string) {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed || classTypes.includes(trimmed)) return;
    const { error } = await supabase.from('class_types').insert({ name: trimmed });
    if (error) { Alert.alert('Error', error.message); return; }
    setClassTypes(prev => [...prev, trimmed].sort());
  }

  async function handleDeleteType(name: string) {
    Alert.alert('Eliminar tipo', `¿Borrar "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('class_types').delete().eq('name', name);
          if (error) { Alert.alert('Error', error.message); return; }
          setClassTypes(prev => prev.filter(t => t !== name));
          if (selectedClassType === name) setSelectedClassType(classTypes[0] !== name ? classTypes[0] : '');
        },
      },
    ]);
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

      await supabase
        .from('booking_templates')
        .delete()
        .eq('user_id', userId);

      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      if (selectedSlots.size === 0) {
        Alert.alert('Plantilla guardada', 'Plantilla vaciada correctamente', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

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
        'Plantilla guardada',
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
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.blue500} />
        <Text style={{ marginTop: scale(12), fontSize: moderateScale(14), color: Colors.textSecondary }}>
          Cargando plantilla...
        </Text>
      </View>
    );
  }

  if (!userInfo) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: moderateScale(16), color: Colors.danger }}>No se pudo cargar el usuario</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + scale(12),
            paddingBottom: scale(16),
            paddingHorizontal: scale(20),
            borderBottomWidth: 1, borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <SpringPressable onPress={() => navigation.goBack()} style={{
            width: scale(40), height: scale(40),
            borderRadius: scale(20),
            backgroundColor: Colors.card,
            borderWidth: 1, borderColor: Colors.cardBorder,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </SpringPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary }}>
              Plantilla de usuario
            </Text>
          </View>
        </Animated.View>

        {/* Tipo de clase */}
        <Animated.View
          entering={FadeInDown.duration(350).delay(80).springify()}
          style={{ paddingHorizontal: scale(20), paddingTop: scale(16), paddingBottom: scale(8) }}
        >
          <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
            Tipo de clase
          </Text>
          {classTypes.length === 0 ? (
            <ActivityIndicator size="small" color={Colors.blue500} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
              {classTypes.map((type) => (
                <SpringPressable
                  key={type}
                  onPress={() => setSelectedClassType(type)}
                  onLongPress={() => handleDeleteType(type)}
                  style={{
                    paddingHorizontal: scale(16), paddingVertical: scale(10),
                    borderRadius: Radius.sm, borderWidth: 1,
                    backgroundColor: selectedClassType === type ? 'rgba(59,130,246,0.2)' : Colors.card,
                    borderColor: selectedClassType === type ? Colors.blue500 : Colors.cardBorder,
                  }}
                >
                  <Text style={{
                    fontSize: moderateScale(13), fontWeight: '600',
                    color: selectedClassType === type ? Colors.blue500 : Colors.textMuted,
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
                    onSubmitEditing={() => { handleAddType(newTypeName); setShowNewType(false); setNewTypeName(''); }}
                    onBlur={() => { handleAddType(newTypeName); setShowNewType(false); setNewTypeName(''); }}
                  />
                </View>
              )}
            </View>
          )}
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(8) }}>
            Mantenga pulsado sobre un tipo para eliminarlo
          </Text>
        </Animated.View>

        {/* Grid */}
        <ScrollView style={{ flex: 1, paddingHorizontal: scale(20), paddingTop: scale(16) }}>
          <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(14) }}>
            Selecciona días y horarios fijos:
          </Text>

          <Animated.View
            entering={FadeInDown.duration(400).delay(250).springify()}
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: Radius.lg,
              overflow: 'hidden',
              borderWidth: 1, borderColor: Colors.cardBorder,
              marginBottom: scale(20),
            }}
          >
            {/* Header row */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
              <View style={{
                width: scale(60),
                padding: scale(12),
                justifyContent: 'center', alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRightWidth: 1, borderRightColor: Colors.cardBorder,
              }}>
                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textMuted }}>Hora</Text>
              </View>
              {DAYS.map(day => (
                <View key={day.value} style={{
                  flex: 1,
                  padding: scale(12),
                  justifyContent: 'center', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}>
                  <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textSecondary }}>
                    {day.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Time rows */}
            {TIME_SLOTS.map((time, rowIdx) => (
              <Animated.View
                key={time}
                entering={FadeInDown.duration(300).delay(300 + rowIdx * 50).springify()}
                style={{ flexDirection: 'row', borderBottomWidth: rowIdx < TIME_SLOTS.length - 1 ? 1 : 0, borderBottomColor: Colors.cardBorder }}
              >
                <View style={{
                  width: scale(60),
                  padding: scale(12),
                  justifyContent: 'center', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRightWidth: 1, borderRightColor: Colors.cardBorder,
                }}>
                  <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textMuted }}>
                    {time.slice(0, 5)}
                  </Text>
                </View>
                {DAYS.map(day => {
                  const key = `${day.value}-${time}`;
                  const isSelected = selectedSlots.has(key);

                  return (
                    <SlotCell
                      key={key}
                      isSelected={isSelected}
                      onPress={() => toggleSlot(day.value, time)}
                    />
                  );
                })}
              </Animated.View>
            ))}
          </Animated.View>
        </ScrollView>

        {/* Footer */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(500).springify()}
          style={{
            paddingHorizontal: scale(20),
            paddingVertical: scale(16),
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}
        >
          <View style={{ marginBottom: scale(12) }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '600', color: Colors.textPrimary }}>
              {selectedSlots.size} reserva{selectedSlots.size !== 1 ? 's' : ''} fija{selectedSlots.size !== 1 ? 's' : ''} por semana
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }}>
              Se aplicarán automáticamente cada semana
            </Text>
          </View>

          <Button
            label="Guardar Plantilla"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            variant="primary"
            size="lg"
            icon={<CheckIcon size={scale(18)} color="#fff" strokeWidth={2.5} />}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function SlotCell({ isSelected, onPress }: { isSelected: boolean; onPress: () => void }) {
  const s = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    s.value = withSpring(isSelected ? 1 : 0, { damping: 10, stiffness: 200 });
  }, [isSelected]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: s.value,
    transform: [{ scale: s.value }],
  }));

  return (
    <SpringPressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: scale(44),
        justifyContent: 'center', alignItems: 'center',
        borderRightWidth: 1, borderRightColor: Colors.cardBorder,
        backgroundColor: isSelected ? 'rgba(59,130,246,0.2)' : 'transparent',
      }}
    >
      <Animated.View style={[checkStyle, {
        width: scale(24), height: scale(24),
        borderRadius: scale(12),
        backgroundColor: isSelected ? Colors.blue500 : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }]}>
        <Text style={{ fontSize: moderateScale(13), color: '#fff', fontWeight: '700' }}>✓</Text>
      </Animated.View>
    </SpringPressable>
  );
}
