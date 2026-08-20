import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardEvent,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, EditIcon, RefreshIcon, TrashIcon, UsersIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { createNotificationsForUsers } from '../utils/notifications';
import { Avatar, Button, ScreenHeader, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { getDisplayName } from '../utils/user';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminClassDetail'>;
  route: RouteProp<RootStackParamList, 'AdminClassDetail'>;
};

interface ClassDetail {
  id: string;
  name: string;
  class_type: string;
  class_date: string;
  class_time: string;
  max_spots: number;
  created_at: string;
}

interface Booking {
  id: string;
  user_id: string;
  created_at: string;
  profiles?: {
    username: string | null;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

export default function AdminClassDetailScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const { classId } = route.params;
  const [classData, setClassData] = useState<ClassDetail | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'forever' | 'until'>('forever');
  const [scheduleEndDateStr, setScheduleEndDateStr] = useState('');
  const [cancelingSchedule, setCancelingSchedule] = useState(false);
  const scheduleSheetTranslateY = useSharedValue(0);
  const endDateInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { scheduleSheetTranslateY.value = withTiming(-e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { scheduleSheetTranslateY.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  const scheduleSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scheduleSheetTranslateY.value }],
  }));

  useEffect(() => {
    loadClassData();
  }, [classId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', loadClassData);
    return unsubscribe;
  }, [navigation, classId]);

  async function loadClassData() {
    try {
      setLoading(true);

      const { data: classInfo, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (classError) throw classError;
      setClassData(classInfo);

      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, user_id, created_at')
        .eq('class_id', classId)
        .order('created_at', { ascending: true });

      if (bookingsError) throw bookingsError;

      const userIds = (bookingsData || []).map((b: any) => b.user_id).filter(Boolean);
      let profilesMap: Record<string, { username: string | null; full_name: string | null; email: string; avatar_url: string | null }> = {};

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, username, full_name, email, avatar_url')
          .in('id', userIds);
        (profilesData || []).forEach((p: any) => { profilesMap[p.id] = p; });
      }

      const formattedBookings = (bookingsData || []).map((booking: any) => ({
        id: booking.id,
        user_id: booking.user_id,
        created_at: booking.created_at,
        profiles: profilesMap[booking.user_id] || null,
      }));
      setBookings(formattedBookings);
    } catch (error: any) {
      console.error('Error loading class data:', error);
      Alert.alert('Error', 'No se pudo cargar la información de la clase');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelClass() {
    Alert.alert(
      'Cancelar clase',
      '¿Quieres cancelar solo esta clase o también este mismo horario en futuras semanas?',
      [
        { text: 'Cerrar', style: 'cancel' },
        {
          text: 'Solo esta clase',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmar',
              `¿Cancelar esta clase?\n\n${bookings.length} usuarios afectados.\n\nEsta acción NO se puede deshacer.`,
              [
                { text: 'No', style: 'cancel' },
                { text: 'Sí, cancelar', style: 'destructive', onPress: confirmCancelClass },
              ]
            );
          },
        },
        {
          text: 'Este horario (recurrente)',
          onPress: () => {
            setScheduleMode('forever');
            setScheduleEndDateStr('');
            setScheduleModalVisible(true);
          },
        },
      ]
    );
  }

  function getMatchingWeekdayClasses(endDateIso?: string) {
    if (!classData) return Promise.resolve<{ id: string; class_date: string }[]>([]);

    let query = supabase
      .from('classes')
      .select('id, class_date')
      .eq('class_type', classData.class_type)
      .eq('class_time', classData.class_time)
      .gte('class_date', classData.class_date);

    if (endDateIso) {
      query = query.lte('class_date', endDateIso);
    }

    const targetWeekday = new Date(classData.class_date + 'T00:00:00').getDay();

    return query.then(({ data, error }) => {
      if (error) throw error;
      return (data || []).filter(
        (c) => new Date(c.class_date + 'T00:00:00').getDay() === targetWeekday
      );
    });
  }

  async function handleConfirmCancelSchedule() {
    if (!classData) return;

    let endDateIso: string | undefined;
    if (scheduleMode === 'until') {
      const parts = scheduleEndDateStr.split('/');
      if (parts.length !== 3 || parts.some((p) => !p)) {
        Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA');
        return;
      }
      const [d, m, y] = parts.map(Number);
      const endDate = new Date(y, m - 1, d);
      if (isNaN(endDate.getTime()) || endDate < new Date(classData.class_date + 'T00:00:00')) {
        Alert.alert('Fecha inválida', 'La fecha de fin debe ser posterior a la fecha de esta clase');
        return;
      }
      endDateIso = `${y}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    }

    try {
      setCancelingSchedule(true);
      const matchingClasses = await getMatchingWeekdayClasses(endDateIso);

      if (matchingClasses.length === 0) {
        Alert.alert('Sin clases', 'No hay clases futuras que coincidan con este horario.');
        return;
      }

      const classIds = matchingClasses.map((c) => c.id);

      const { data: bookingsData, error: bookingsFetchError } = await supabase
        .from('bookings')
        .select('user_id')
        .in('class_id', classIds);
      if (bookingsFetchError) throw bookingsFetchError;

      const affectedUserIds = Array.from(
        new Set((bookingsData || []).map((b) => b.user_id).filter((id): id is string => !!id))
      );

      setScheduleModalVisible(false);

      const periodText = scheduleMode === 'forever'
        ? 'para siempre'
        : `hasta el ${scheduleEndDateStr}`;

      Alert.alert(
        'Confirmar cancelación',
        `Se cancelarán ${classIds.length} clase${classIds.length > 1 ? 's' : ''} de ${classData.class_type} (${periodText}).\n\n${affectedUserIds.length} usuario${affectedUserIds.length !== 1 ? 's' : ''} afectado${affectedUserIds.length !== 1 ? 's' : ''}.\n\nEsta acción NO se puede deshacer.`,
        [
          { text: 'No', style: 'cancel', onPress: () => setCancelingSchedule(false) },
          {
            text: 'Sí, cancelar',
            style: 'destructive',
            onPress: () => executeCancelSchedule(classIds, affectedUserIds, periodText),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error preparing schedule cancellation:', error);
      Alert.alert('Error', error.message || 'No se pudo procesar la cancelación');
      setCancelingSchedule(false);
    }
  }

  async function executeCancelSchedule(classIds: string[], affectedUserIds: string[], periodText: string) {
    try {
      const { error: bookingsError } = await supabase.from('bookings').delete().in('class_id', classIds);
      if (bookingsError) throw bookingsError;

      const { error: classesError } = await supabase.from('classes').delete().in('id', classIds);
      if (classesError) throw classesError;

      if (affectedUserIds.length > 0 && classData) {
        const dayName = new Date(classData.class_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' });
        await createNotificationsForUsers(affectedUserIds, {
          type: 'recurring_class_cancelled',
          title: 'Horario cancelado',
          message: `La clase de ${classData.class_type} de los ${dayName} a las ${classData.class_time.slice(0, 5)} ha sido cancelada ${periodText}. Se han eliminado tus reservas futuras para este horario.`,
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'cancel_recurring_class',
          target_type: 'class',
          details: {
            class_type: classData?.class_type,
            class_time: classData?.class_time,
            period: periodText,
            deleted_count: classIds.length,
            notifications_sent: affectedUserIds.length,
          },
        });
      }

      Alert.alert('¡Listo! ✅', `${classIds.length} clase${classIds.length > 1 ? 's' : ''} cancelada${classIds.length > 1 ? 's' : ''} correctamente`, [
        { text: 'OK', onPress: () => navigation.navigate('AdminClasses') },
      ]);
    } catch (error: any) {
      console.error('Error canceling recurring schedule:', error);
      Alert.alert('Error', error.message || 'No se pudo cancelar el horario');
    } finally {
      setCancelingSchedule(false);
    }
  }

  async function confirmCancelClass() {
    try {
      setLoading(true);

      const affectedUserIds = bookings
        .map(b => b.user_id)
        .filter((id): id is string => id !== null);

      const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('class_id', classId);

      if (bookingsError) throw bookingsError;

      const { error: classError } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId);

      if (classError) throw classError;

      if (affectedUserIds.length > 0 && classData) {
        const date = new Date(classData.class_date + 'T00:00:00');
        const formattedDate = date.toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });

        await createNotificationsForUsers(affectedUserIds, {
          type: 'class_cancelled',
          title: 'Clase cancelada',
          message: `La clase de ${classData.class_type} del ${formattedDate} a las ${classData.class_time.slice(0, 5)} ha sido cancelada.`,
          classId: classId,
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'cancel_class',
          target_type: 'class',
          target_id: classId,
          details: {
            class_type: classData?.class_type,
            class_date: classData?.class_date,
            class_time: classData?.class_time,
            affected_users: bookings.length,
            notifications_sent: affectedUserIds.length,
          },
        });
      }

      Alert.alert('¡Listo! ✅', 'Clase cancelada correctamente', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('AdminClasses'),
        },
      ]);
    } catch (error: any) {
      console.error('Error canceling class:', error);
      Alert.alert('Error', error.message || 'No se pudo cancelar la clase');
      setLoading(false);
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
          <ScreenHeader
            title="Detalle de Clase"
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

  if (!classData) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
          <ScreenHeader
            title="Detalle de Clase"
            onBack={() => navigation.goBack()}
            topInset={insets.top}
          />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: scale(20) }}>
            <Text style={{ fontSize: moderateScale(16), color: Colors.textSecondary, textAlign: 'center' }}>
              No se encontró la clase
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const date = new Date(classData.class_date + 'T00:00:00');
  const occupancyPercentage = Math.round((bookings.length / classData.max_spots) * 100);

  const getOccupancyColor = () => {
    if (occupancyPercentage >= 100) return Colors.danger;
    if (occupancyPercentage >= 80) return Colors.warning;
    return Colors.success;
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Detalle de Clase"
          subtitle={classData.class_type}
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info principal */}
          <Animated.View
            entering={FadeInDown.duration(350).delay(80).springify()}
            style={{
              margin: scale(20),
              padding: scale(20),
              backgroundColor: Colors.card,
              borderRadius: Radius.lg,
              borderWidth: 1, borderColor: Colors.cardBorder,
            }}
          >
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', paddingVertical: scale(12),
              borderBottomWidth: 1, borderBottomColor: Colors.border,
            }}>
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, fontWeight: '600' }}>
                Tipo
              </Text>
              <Text style={{ fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: scale(12) }}>
                {classData.class_type}
              </Text>
            </View>

            <View style={{
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', paddingVertical: scale(12),
              borderBottomWidth: 1, borderBottomColor: Colors.border,
            }}>
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, fontWeight: '600' }}>
                Fecha
              </Text>
              <Text style={{ fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: scale(12) }}>
                {date.toLocaleDateString('es-ES', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })}
              </Text>
            </View>

            <View style={{
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', paddingVertical: scale(12),
              borderBottomWidth: 1, borderBottomColor: Colors.border,
            }}>
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, fontWeight: '600' }}>
                Hora
              </Text>
              <Text style={{ fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: scale(12) }}>
                {classData.class_time.slice(0, 5)}
              </Text>
            </View>

            <View style={{
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', paddingVertical: scale(12),
            }}>
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, fontWeight: '600' }}>
                Capacidad
              </Text>
              <Text style={{ fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: scale(12) }}>
                {bookings.length} / {classData.max_spots} plazas
              </Text>
            </View>

            {/* Barra de ocupación */}
            <View style={{
              marginTop: scale(16), height: scale(8),
              backgroundColor: Colors.cardBorder,
              borderRadius: Radius.full, overflow: 'hidden',
            }}>
              <View style={{
                width: `${occupancyPercentage}%`,
                height: '100%',
                backgroundColor: getOccupancyColor(),
                borderRadius: Radius.full,
              }} />
            </View>
          </Animated.View>

          {/* Asistentes */}
          <Animated.View
            entering={FadeInDown.duration(350).delay(140).springify()}
            style={{ marginHorizontal: scale(20), marginBottom: scale(20) }}
          >
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(12) }}>
              Asistentes ({bookings.length})
            </Text>

            {bookings.length === 0 ? (
              <View style={{ padding: scale(40), alignItems: 'center' }}>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textMuted, textAlign: 'center' }}>
                  No hay reservas para esta clase
                </Text>
              </View>
            ) : (
              bookings.map((booking, index) => (
                <Animated.View
                  key={booking.id}
                  entering={FadeInDown.duration(300).delay(160 + index * 60).springify()}
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: scale(16),
                    backgroundColor: Colors.card,
                    borderRadius: Radius.md,
                    borderWidth: 1, borderColor: Colors.cardBorder,
                    marginBottom: scale(8),
                  }}
                >
                  <Avatar uri={booking.profiles?.avatar_url || null} size={scale(36)} index={index} />
                  <View style={{ flex: 1, marginLeft: scale(10) }}>
                    <Text style={{ fontSize: moderateScale(15), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(4) }}>
                      {booking.profiles ? getDisplayName(booking.profiles) : 'Sin nombre'}
                    </Text>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, marginBottom: scale(4) }}>
                      {booking.profiles?.email || 'Sin email'}
                    </Text>
                    <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }}>
                      Reservado: {new Date(booking.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </Animated.View>
              ))
            )}
          </Animated.View>

          <View style={{ height: scale(120) }} />
        </ScrollView>

        {/* Botones de acción */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(180).springify()}
          style={{
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            backgroundColor: Colors.background,
            borderTopWidth: 1, borderTopColor: Colors.border,
            gap: scale(12),
          }}
        >
          <SpringPressable
            onPress={() => {
              const nav = navigation as any;
              nav.navigate('AdminClassPreBook', { classId });
            }}
            style={{
              paddingVertical: scale(14),
              paddingHorizontal: scale(20),
              backgroundColor: '#8B5CF6',
              borderRadius: Radius.md,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              gap: scale(8),
            }}
          >
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <UsersIcon size={scale(16)} color="#fff" strokeWidth={2} />
            </View>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '600', color: '#fff' }}>
              Pre-reservar Usuarios
            </Text>
          </SpringPressable>

          <View style={{ flexDirection: 'row', gap: scale(12) }}>
            <SpringPressable
              onPress={() => navigation.navigate('AdminEditClass', { classId })}
              style={{
                flex: 1, padding: scale(16),
                backgroundColor: Colors.blue500,
                borderRadius: Radius.md,
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                gap: scale(6),
              }}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <EditIcon size={scale(15)} color="#fff" strokeWidth={2} />
              </View>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: '#fff' }}>
                Editar clase
              </Text>
            </SpringPressable>

            <SpringPressable
              onPress={handleCancelClass}
              style={{
                flex: 1, padding: scale(16),
                backgroundColor: Colors.dangerLight,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center',
                gap: scale(6),
              }}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <TrashIcon size={scale(15)} color={Colors.danger} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.danger }}>
                Cancelar clase
              </Text>
            </SpringPressable>
          </View>
        </Animated.View>
      </View>

      {/* Modal: cancelar horario recurrente */}
      <Modal
        transparent
        visible={scheduleModalVisible}
        animationType="slide"
        onRequestClose={() => setScheduleModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setScheduleModalVisible(false)}
          />
          <Animated.View style={[scheduleSheetStyle, {
            backgroundColor: '#0d1929',
            borderTopLeftRadius: Radius.xl,
            borderTopRightRadius: Radius.xl,
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            borderWidth: 1,
            borderColor: Colors.cardBorder,
          }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(4) }}>
              <RefreshIcon size={scale(18)} color={Colors.blue500} strokeWidth={2} />
              <Text style={{ fontSize: moderateScale(17), fontWeight: '700', color: Colors.textPrimary, marginLeft: scale(8) }}>
                Cancelar horario recurrente
              </Text>
            </View>
            {classData && (
              <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, marginBottom: scale(20) }}>
                {classData.class_type} — {new Date(classData.class_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' })}s a las {classData.class_time.slice(0, 5)}
              </Text>
            )}

            <TouchableOpacity
              onPress={() => setScheduleMode('forever')}
              style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(14), borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: scheduleMode === 'forever' ? Colors.blue500 : Colors.cardBorder,
                backgroundColor: scheduleMode === 'forever' ? 'rgba(59,130,246,0.1)' : Colors.card,
                marginBottom: scale(10),
              }}
            >
              <View style={{
                width: scale(18), height: scale(18), borderRadius: scale(9),
                borderWidth: 2,
                borderColor: scheduleMode === 'forever' ? Colors.blue500 : Colors.textMuted,
                alignItems: 'center', justifyContent: 'center', marginRight: scale(10),
              }}>
                {scheduleMode === 'forever' && (
                  <View style={{ width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: Colors.blue500 }} />
                )}
              </View>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                Para siempre
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setScheduleMode('until')}
              style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(14), borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: scheduleMode === 'until' ? Colors.blue500 : Colors.cardBorder,
                backgroundColor: scheduleMode === 'until' ? 'rgba(59,130,246,0.1)' : Colors.card,
                marginBottom: scale(14),
              }}
            >
              <View style={{
                width: scale(18), height: scale(18), borderRadius: scale(9),
                borderWidth: 2,
                borderColor: scheduleMode === 'until' ? Colors.blue500 : Colors.textMuted,
                alignItems: 'center', justifyContent: 'center', marginRight: scale(10),
              }}>
                {scheduleMode === 'until' && (
                  <View style={{ width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: Colors.blue500 }} />
                )}
              </View>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                Durante un periodo
              </Text>
            </TouchableOpacity>

            {scheduleMode === 'until' && (
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(14), marginBottom: scale(10),
                backgroundColor: Colors.card, borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <CalendarIcon size={scale(16)} color={Colors.textSecondary} strokeWidth={1.5} />
                <TextInput
                  ref={endDateInputRef}
                  style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                  value={scheduleEndDateStr}
                  onChangeText={setScheduleEndDateStr}
                  placeholder="Cancelar hasta DD/MM/AAAA"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            )}

            <Button
              label={cancelingSchedule ? 'Cancelando...' : 'Cancelar horario'}
              onPress={handleConfirmCancelSchedule}
              loading={cancelingSchedule}
              disabled={cancelingSchedule || (scheduleMode === 'until' && !scheduleEndDateStr)}
              fullWidth
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}
