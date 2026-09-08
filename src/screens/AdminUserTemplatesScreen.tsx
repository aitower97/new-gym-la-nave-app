import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { Button, ClassTypeSelector, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { BillingPeriod, toDateStr } from '../utils/planPayments';
import { estimateTemplateFit } from '../utils/planEnforcement';
import { createNotification } from '../utils/notifications';
import { classTypeColorMap, ClassTypeInfo, DEFAULT_CLASS_TYPE_COLOR, getClassTypes } from '../utils/classTypes';

type Props = NativeStackScreenProps<any, 'AdminUserTemplates'>;

interface UserInfo {
  id: string;
  full_name: string;
  email: string;
}

interface UserPlan {
  name: string;
  billing_period: BillingPeriod;
  classes_per_month: number | null;
  validity_days: number | null;
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
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const userId = route.params?.userId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [types, setTypes] = useState<ClassTypeInfo[]>([]);
  // Cada slot (día-hora) guarda su propio tipo de clase, para poder mezclar
  // varios tipos distintos dentro de la misma plantilla semanal.
  const [slotTypes, setSlotTypes] = useState<Record<string, string>>({});
  const [selectedClassType, setSelectedClassType] = useState('');

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
        .select('id, full_name, email, plan_id')
        .eq('id', userId)
        .single();

      if (userError) throw userError;
      setUserInfo(userData);

      if (userData?.plan_id) {
        const { data: planData } = await supabase
          .from('membership_plans')
          .select('name, billing_period, classes_per_month, validity_days')
          .eq('id', userData.plan_id)
          .single();
        setUserPlan(planData || null);
      }

      const { data: templatesData, error: templatesError } = await supabase
        .from('booking_templates')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (templatesError) throw templatesError;

      setTemplates(templatesData || []);

      const existing: Record<string, string> = {};
      (templatesData || []).forEach(t => {
        const key = `${t.day_of_week}-${t.class_time}`;
        existing[key] = t.class_type;
      });
      setSlotTypes(existing);

      const typesData = await getClassTypes();
      setTypes(typesData);

      if (typesData.length > 0) {
        setSelectedClassType(typesData[0].name);
      }

    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSlot(day: number, time: string) {
    if (!selectedClassType) return;
    const key = `${day}-${time}`;

    setSlotTypes(prev => {
      const next = { ...prev };
      if (next[key] === selectedClassType) {
        // Ya pintado con el tipo activo → despintar
        delete next[key];
      } else {
        // Vacío o con otro tipo → asignar/sobrescribir con el tipo activo
        next[key] = selectedClassType;
      }
      return next;
    });
  }

  async function handleSave() {
    const slotEntriesCount = Object.keys(slotTypes).length;

    // Bloqueo duro, sin "guardar de todas formas": una plantilla que ya de
    // por sí supera el cupo del plan del socio no debe poder guardarse — a
    // diferencia del aviso al cambiar de PLAN (AdminEditUserScreen), donde sí
    // se permite continuar porque puede haber una plantilla previa legítima
    // pendiente de ajustar. Aquí el admin está creando el desajuste ahora mismo.
    if (userPlan && slotEntriesCount > 0) {
      const { mismatched, demand, totalLabel } = estimateTemplateFit(slotEntriesCount, userPlan);
      if (mismatched) {
        Alert.alert(
          'La plantilla no encaja con su plan',
          `Esta plantilla reserva ${slotEntriesCount} clase${slotEntriesCount !== 1 ? 's' : ''} por semana (~${demand} en total), pero "${userPlan.name}" solo permite ${totalLabel}. Quita alguna reserva fija o cambia primero el plan del socio.`,
          [{ text: 'Entendido' }]
        );
        return;
      }
    }

    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      const adminId = user?.id;

      const slotEntries = Object.entries(slotTypes);

      const newTemplates = slotEntries.map(([key, type]) => {
        const dashIdx = key.indexOf('-');
        const day = key.substring(0, dashIdx);
        const time = key.substring(dashIdx + 1);
        return {
          user_id: userId,
          day_of_week: parseInt(day),
          class_time: time,
          class_type: type,
          created_by: adminId,
        };
      });

      // Slots que tenía la plantilla ANTES de este guardado (estado cargado
      // al entrar en la pantalla) y que ya no están en la nueva — las
      // reservas futuras que generaron hay que cancelarlas explícitamente:
      // la plantilla ya no las va a "recordar" y sin este paso se quedaban
      // huérfanas, ocupando plaza y cupo para siempre.
      const slotKey = (t: { day_of_week: number; class_time: string; class_type: string }) =>
        `${t.day_of_week}-${t.class_time}-${t.class_type}`;
      const newSlotKeys = new Set(newTemplates.map(slotKey));
      const removedSlotKeys = new Set(
        templates.filter(t => !newSlotKeys.has(slotKey(t))).map(slotKey)
      );

      await supabase
        .from('booking_templates')
        .delete()
        .eq('user_id', userId);

      if (newTemplates.length > 0) {
        const { error: insertError } = await supabase
          .from('booking_templates')
          .insert(newTemplates);
        if (insertError) throw insertError;
      }

      const today = new Date();
      const until = new Date();
      until.setDate(until.getDate() + 60);
      // toDateStr usa año/mes/día LOCALES — toISOString() convierte a UTC y
      // en España puede desplazar el rango un día, dejando fuera o dentro
      // clases reales de ese límite.
      const todayStr = toDateStr(today);
      const untilStr = toDateStr(until);

      const { data: existingClasses } = await supabase
        .from('classes')
        .select('id, class_date, class_time, class_type')
        .gte('class_date', todayStr)
        .lte('class_date', untilStr);

      let bookedCount = 0;
      let cancelledCount = 0;

      if (existingClasses && existingClasses.length > 0) {
        const classIds = existingClasses.map(c => c.id);

        const { data: existingBookings } = await supabase
          .from('bookings')
          .select('id, class_id')
          .eq('user_id', userId)
          .in('class_id', classIds);

        const bookingIdByClassId = new Map((existingBookings || []).map(b => [b.class_id, b.id as string]));

        const toBook = existingClasses.filter(cls => {
          const classDate = new Date(cls.class_date + 'T00:00:00');
          const dayOfWeek = classDate.getDay();
          return newTemplates.some(
            t => t.day_of_week === dayOfWeek && t.class_time === cls.class_time && t.class_type === cls.class_type
          ) && !bookingIdByClassId.has(cls.id);
        });

        if (toBook.length > 0) {
          await supabase.from('bookings').insert(
            toBook.map(cls => ({ class_id: cls.id, user_id: userId }))
          );
          bookedCount = toBook.length;
        }

        const toCancel = existingClasses.filter(cls => {
          const classDate = new Date(cls.class_date + 'T00:00:00');
          const dayOfWeek = classDate.getDay();
          return removedSlotKeys.has(`${dayOfWeek}-${cls.class_time}-${cls.class_type}`) && bookingIdByClassId.has(cls.id);
        });

        if (toCancel.length > 0) {
          const bookingIdsToCancel = toCancel.map(cls => bookingIdByClassId.get(cls.id)!);
          await supabase.from('bookings').delete().in('id', bookingIdsToCancel);
          cancelledCount = toCancel.length;

          for (const cls of toCancel) {
            const classDate = new Date(cls.class_date + 'T00:00:00');
            const formattedDate = classDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            await createNotification({
              userId,
              type: 'booking_removed',
              title: 'Reserva cancelada',
              message: `Tu plantilla de reservas fijas ha cambiado y ya no incluye la clase de ${cls.class_type} del ${formattedDate} a las ${cls.class_time.slice(0, 5)} — se ha cancelado automáticamente.`,
              classId: cls.id,
            });
          }
        }
      }

      if (adminId) {
        await supabase.from('admin_actions').insert({
          admin_id: adminId,
          action_type: 'update_user_template',
          target_type: 'user',
          target_id: userId,
          details: {
            slots_count: slotEntries.length,
            class_types: Array.from(new Set(newTemplates.map(t => t.class_type))),
            booked: bookedCount,
            cancelled: cancelledCount,
          },
        });
      }

      const extra = [
        bookedCount > 0 ? `${bookedCount} reserva${bookedCount !== 1 ? 's' : ''} nueva${bookedCount !== 1 ? 's' : ''} aplicada${bookedCount !== 1 ? 's' : ''}.` : '',
        cancelledCount > 0 ? `${cancelledCount} reserva${cancelledCount !== 1 ? 's' : ''} cancelada${cancelledCount !== 1 ? 's' : ''} por quitarse de la plantilla.` : '',
      ].filter(Boolean).join(' ');

      Alert.alert(
        'Plantilla guardada',
        slotEntries.length === 0
          ? `Plantilla vaciada correctamente.${extra ? ` ${extra}` : ''}`
          : `${slotEntries.length} slot(s) configurados.${extra ? ` ${extra}` : ''}`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error: any) {
      console.error('Error saving template:', error);
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

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

  const typeColorMap = classTypeColorMap(types);

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
            Tipo de clase (pincel activo)
          </Text>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
            Selecciona un tipo y toca las celdas de la rejilla para asignárselo. Puedes mezclar varios tipos en la misma plantilla.
          </Text>
          {types.length === 0 ? (
            <ActivityIndicator size="small" color={Colors.blue500} style={{ alignSelf: 'flex-start' }} />
          ) : (
            <ClassTypeSelector types={types} onTypesChange={setTypes} selected={selectedClassType} onSelect={setSelectedClassType} />
          )}
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
                  const slotType = slotTypes[key];

                  return (
                    <SlotCell
                      key={key}
                      color={slotType ? (typeColorMap[slotType] ?? DEFAULT_CLASS_TYPE_COLOR) : null}
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
            paddingTop: scale(16),
            paddingBottom: insets.bottom + scale(16),
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}
        >
          <View style={{ marginBottom: scale(12) }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '600', color: Colors.textPrimary }}>
              {Object.keys(slotTypes).length} reserva{Object.keys(slotTypes).length !== 1 ? 's' : ''} fija{Object.keys(slotTypes).length !== 1 ? 's' : ''} por semana
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }}>
              Se aplicarán automáticamente cada semana
            </Text>
          </View>

          <Button
            label="Guardar Plantilla"
            onPress={() => handleSave()}
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

function SlotCell({ color, onPress }: { color: string | null; onPress: () => void }) {
  const isSelected = color !== null;
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
        backgroundColor: isSelected ? `${color}33` : 'transparent',
      }}
    >
      <Animated.View style={[checkStyle, {
        width: scale(24), height: scale(24),
        borderRadius: scale(12),
        backgroundColor: isSelected ? color! : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }]}>
        <Text style={{ fontSize: moderateScale(13), color: '#fff', fontWeight: '700' }}>✓</Text>
      </Animated.View>
    </SpringPressable>
  );
}
