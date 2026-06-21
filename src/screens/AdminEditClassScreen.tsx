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
import { createNotificationsForUsers } from '../utils/notifications';
import { createClassSchema, validateOrAlert } from '../utils/validation';
import { Button, ScreenHeader, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminEditClass'>;
  route: RouteProp<RootStackParamList, 'AdminEditClass'>;
};

interface ClassData {
  id: string;
  name: string;
  class_type: string;
  class_date: string;
  class_time: string;
  max_spots: number;
}

export default function AdminEditClassScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const { classId } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [originalClass, setOriginalClass] = useState<ClassData | null>(null);
  const [currentBookings, setCurrentBookings] = useState(0);

  const [classType, setClassType] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [maxSpots, setMaxSpots] = useState('10');
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => {
    loadClassData();
    loadClassTypes();
  }, [classId]);

  async function loadClassTypes() {
    try {
      setLoadingTypes(true);
      const { data } = await supabase
        .from('class_types')
        .select('name')
        .order('name');

      const names = (data || []).map(r => r.name).filter(Boolean);
      setClassTypes(names);
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

  async function loadClassData() {
    try {
      setLoading(true);

      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (classError) throw classError;
      setOriginalClass(classData);

      const { count, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId);

      if (countError) throw countError;
      setCurrentBookings(count || 0);

      setClassType(classData.class_type);
      const [cy, cm, cd] = classData.class_date.split('-').map(Number);
      setDateStr(`${cd.toString().padStart(2,'0')}/${cm.toString().padStart(2,'0')}/${cy}`);
      setTimeStr(classData.class_time.slice(0, 5));
      setMaxSpots('10');
    } catch (error: any) {
      console.error('Error loading class:', error);
      Alert.alert('Error', 'No se pudo cargar la clase');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const [dd, mm, yyyy] = dateStr.split('/').map(Number);
    if (!dd || !mm || !yyyy || yyyy < 2020) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA');
      return;
    }
    const classDate = `${yyyy}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;

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

      const dateChanged = originalClass!.class_date !== validated.class_date;
      const timeChanged = originalClass!.class_time !== classTime;

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

      const significantChange = dateChanged || timeChanged;

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

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
          <ScreenHeader
            title="Editar Clase"
            onBack={() => navigation.goBack()}
            topInset={insets.top}
          />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Editar Clase"
          subtitle="Modificar detalles"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: scale(20) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Warning banner */}
          {currentBookings > 0 && (
            <Animated.View entering={FadeInDown.duration(350).delay(80).springify()}>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(16), marginHorizontal: scale(20),
                marginTop: scale(16), marginBottom: scale(8),
                backgroundColor: 'rgba(245,158,11,0.1)',
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
              }}>
                <View style={{
                  width: scale(28), height: scale(28),
                  borderRadius: Radius.full,
                  backgroundColor: 'rgba(245,158,11,0.2)',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: scale(12),
                }}>
                  <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.warning }}>!</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.warning, marginBottom: scale(4) }}>
                    {currentBookings} reserva{currentBookings > 1 ? 's' : ''} confirmada{currentBookings > 1 ? 's' : ''}
                  </Text>
                  <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary }}>
                    Los usuarios serán notificados si cambias la fecha u hora
                  </Text>
                </View>
              </View>
            </Animated.View>
          )}

          <View style={{ padding: scale(20) }}>
            {/* Tipo de clase */}
            <Animated.View entering={FadeInDown.duration(350).delay(120).springify()} style={{ marginBottom: scale(24) }}>
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

            {/* Fecha */}
            <Animated.View entering={FadeInDown.duration(350).delay(160).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Fecha *
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
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Animated.View>

            {/* Hora */}
            <Animated.View entering={FadeInDown.duration(350).delay(200).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Hora *
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(16),
                backgroundColor: Colors.card,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <ClockIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                <TextInput
                  style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                  value={timeStr}
                  onChangeText={setTimeStr}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Animated.View>

            {/* Capacidad */}
            <Animated.View entering={FadeInDown.duration(350).delay(240).springify()} style={{ marginBottom: scale(24) }}>
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
                Mínimo: {currentBookings} (reservas actuales) • Máximo: 10
              </Text>
            </Animated.View>

            {/* Preview de cambios */}
            <Animated.View entering={FadeInDown.duration(400).delay(280).springify()}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(12) }}>
                Cambios a aplicar
              </Text>
              <View style={{
                padding: scale(20),
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.borderBlue,
              }}>
                {originalClass && originalClass.class_type !== classType && (
                  <View style={{ flexDirection: 'row', marginBottom: scale(8) }}>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600', width: scale(80) }}>
                      Tipo:
                    </Text>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.blue500, fontWeight: '600', flex: 1 }}>
                      {originalClass.class_type} → {classType}
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', marginBottom: scale(8) }}>
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600', width: scale(80) }}>
                    Fecha:
                  </Text>
                  <Text style={{ fontSize: moderateScale(13), color: Colors.blue500, fontWeight: '600', flex: 1 }}>
                    {dateStr}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', marginBottom: scale(8) }}>
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600', width: scale(80) }}>
                    Hora:
                  </Text>
                  <Text style={{ fontSize: moderateScale(13), color: Colors.blue500, fontWeight: '600', flex: 1 }}>
                    {timeStr}
                  </Text>
                </View>
                {originalClass && originalClass.max_spots !== parseInt(maxSpots) && (
                  <View style={{ flexDirection: 'row' }}>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600', width: scale(80) }}>
                      Capacidad:
                    </Text>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.blue500, fontWeight: '600', flex: 1 }}>
                      {originalClass.max_spots} → {maxSpots} plazas
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          </View>
        </ScrollView>

        {/* Botón guardar */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(320).springify()}
          style={{
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            backgroundColor: Colors.background,
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}
        >
          <Button
            label={saving ? 'Guardando...' : '✓ Guardar cambios'}
            onPress={handleSave}
            loading={saving}
            disabled={saving || !classType || classTypes.length === 0}
          />
        </Animated.View>
      </View>
    </View>
  );
}
