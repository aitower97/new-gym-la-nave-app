import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EditIcon, TrashIcon, UsersIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { createNotificationsForUsers } from '../utils/notifications';
import { Avatar, ScreenHeader, SpringPressable } from '../components/ui';
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

  useEffect(() => {
    loadClassData();
  }, [classId]);

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
      `¿Estás seguro de que quieres cancelar esta clase?\n\n${bookings.length} usuarios afectados.\n\nEsta acción NO se puede deshacer.`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: confirmCancelClass,
        },
      ]
    );
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
    </View>
  );
}
