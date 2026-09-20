import { NativeStackScreenProps } from '@react-navigation/native-stack';
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
import { CheckIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { Avatar, Button, ScreenHeader, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { createNotificationsForUsers } from '../utils/notifications';
import { getDisplayName } from '../utils/user';

type Props = NativeStackScreenProps<any, 'AdminClassPreBook'>;

interface User {
  id: string;
  username: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

interface ClassInfo {
  id: string;
  name: string;
  class_date: string;
  class_time: string;
  max_spots: number;
  current_bookings: number;
}

export default function AdminClassPreBookScreen({ route, navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const classId = route.params?.classId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [alreadyBooked, setAlreadyBooked] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name, class_date, class_time, max_spots')
        .eq('id', classId)
        .single();

      if (classError) throw classError;

      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId);

      setClassInfo({
        ...classData,
        current_bookings: count || 0,
      });

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, avatar_url')
        .eq('role', 'user')
        .order('full_name');

      if (usersError) throw usersError;

      setUsers(usersData || []);

      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('user_id')
        .eq('class_id', classId);

      const bookedIds = new Set(
        (bookingsData || []).map(b => b.user_id).filter((id): id is string => id !== null)
      );
      setAlreadyBooked(bookedIds);

    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleUser(userId: string) {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handlePreBook() {
    if (selectedUsers.size === 0) {
      Alert.alert('Error', 'Selecciona al menos un usuario');
      return;
    }

    const spotsAvailable = (classInfo?.max_spots || 0) - (classInfo?.current_bookings || 0);

    if (selectedUsers.size > spotsAvailable) {
      Alert.alert(
        'Capacidad insuficiente',
        `Solo quedan ${spotsAvailable} plazas disponibles. Has seleccionado ${selectedUsers.size} usuarios.`
      );
      return;
    }

    Alert.alert(
      'Confirmar pre-reserva',
      `¿Reservar ${selectedUsers.size} usuario(s) en esta clase?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reservar',
          onPress: async () => {
            try {
              setSaving(true);

              const bookings = Array.from(selectedUsers).map(userId => ({
                user_id: userId,
                class_id: classId,
              }));

              const { error: insertError } = await supabase
                .from('bookings')
                .insert(bookings);

              if (insertError) throw insertError;

              const date = new Date(classInfo!.class_date + 'T00:00:00');
              const formattedDate = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
              await createNotificationsForUsers(Array.from(selectedUsers), {
                type: 'booking_created',
                title: 'Reserva confirmada',
                message: `El administrador te ha reservado plaza en la clase de ${classInfo!.name} del ${formattedDate} a las ${classInfo!.class_time.slice(0, 5)}.`,
                classId,
              });

              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase.from('admin_actions').insert({
                  admin_id: user.id,
                  action_type: 'prebook_users',
                  target_type: 'class',
                  target_id: classId,
                  details: {
                    users_count: selectedUsers.size,
                    class_name: classInfo!.name,
                    class_date: classInfo!.class_date,
                  },
                });
              }

              Alert.alert(
                'Reservas creadas',
                `${selectedUsers.size} usuario(s) reservado(s) correctamente`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (error: any) {
              console.error('Error creating bookings:', error);
              Alert.alert('Error', error.message);
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={Colors.blue500} />
      </View>
    );
  }

  if (!classInfo) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: moderateScale(15), color: Colors.danger }}>No se pudo cargar la clase</Text>
      </View>
    );
  }

  const spotsAvailable = classInfo.max_spots - classInfo.current_bookings;
  const filteredUsers = users.filter(u =>
    getDisplayName(u).toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Pre-reservar usuarios"
          subtitle={`${classInfo.name} · ${classInfo.class_time.slice(0, 5)}`}
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        {/* Info de la clase */}
        <Animated.View
          entering={FadeInDown.duration(350).springify()}
          style={{
            marginHorizontal: scale(20), marginTop: scale(16),
            backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
            borderRadius: Radius.md, padding: scale(14),
          }}
        >
          <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textTransform: 'capitalize' }}>
            {new Date(classInfo.class_date + 'T00:00:00').toLocaleDateString('es-ES', {
              weekday: 'long', day: 'numeric', month: 'long',
            })}
          </Text>
          <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.blue500, marginTop: scale(4) }}>
            Plazas disponibles: {spotsAvailable} / {classInfo.max_spots}
          </Text>
        </Animated.View>

        {/* Buscador */}
        <Animated.View
          entering={FadeInDown.duration(350).delay(80).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: scale(8),
            marginHorizontal: scale(20), marginTop: scale(14),
            backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
            borderRadius: Radius.md, paddingHorizontal: scale(14), paddingVertical: scale(10),
          }}
        >
          <SearchIcon size={scale(16)} color={Colors.textMuted} strokeWidth={2} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Buscar usuario..."
            placeholderTextColor={Colors.placeholder}
            style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textPrimary, padding: 0 }}
          />
        </Animated.View>

        {/* Lista de usuarios */}
        <ScrollView style={{ flex: 1, marginTop: scale(12) }} contentContainerStyle={{ paddingHorizontal: scale(20), paddingBottom: scale(20) }}>
          {filteredUsers.map((user, i) => {
            const isBooked = alreadyBooked.has(user.id);
            const isSelected = selectedUsers.has(user.id);

            return (
              <Animated.View key={user.id} entering={FadeInDown.duration(280).delay(Math.min(i, 12) * 30).springify()}>
                <SpringPressable
                  onPress={() => toggleUser(user.id)}
                  disabled={isBooked}
                  style={{
                    backgroundColor: isSelected && !isBooked ? 'rgba(59,130,246,0.12)' : Colors.card,
                    borderWidth: 1,
                    borderColor: isSelected && !isBooked ? Colors.blue500 : Colors.cardBorder,
                    borderRadius: Radius.md, marginBottom: scale(10),
                    opacity: isBooked ? 0.5 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: scale(12) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: scale(10) }}>
                      <Avatar uri={user.avatar_url} size={scale(38)} index={i} name={user.full_name || user.username} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>
                          {getDisplayName(user)}
                        </Text>
                        <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }} numberOfLines={1}>
                          {user.email}
                        </Text>
                      </View>
                    </View>

                    {isBooked ? (
                      <View style={{
                        paddingHorizontal: scale(10), paddingVertical: scale(5),
                        borderRadius: Radius.sm, backgroundColor: 'rgba(16,185,129,0.15)',
                      }}>
                        <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: '#10B981' }}>
                          YA RESERVADO
                        </Text>
                      </View>
                    ) : (
                      <View style={{
                        width: scale(24), height: scale(24), borderRadius: scale(6),
                        borderWidth: 2, borderColor: isSelected ? Colors.blue500 : Colors.cardBorder,
                        backgroundColor: isSelected ? Colors.blue500 : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <CheckIcon size={scale(14)} color="#fff" strokeWidth={3} />}
                      </View>
                    )}
                  </View>
                </SpringPressable>
              </Animated.View>
            );
          })}

          {filteredUsers.length === 0 && (
            <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: moderateScale(13), marginTop: scale(30) }}>
              No se encontraron usuarios
            </Text>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={{
          paddingHorizontal: scale(20), paddingTop: scale(14),
          paddingBottom: insets.bottom + scale(16),
          borderTopWidth: 1, borderTopColor: Colors.border,
        }}>
          <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, textAlign: 'center', marginBottom: scale(10) }}>
            Seleccionados: {selectedUsers.size}
          </Text>
          <Button
            label={`Reservar ${selectedUsers.size} usuario${selectedUsers.size !== 1 ? 's' : ''}`}
            onPress={handlePreBook}
            loading={saving}
            disabled={saving || selectedUsers.size === 0}
            variant="primary"
            size="lg"
          />
        </View>
      </View>
    </View>
  );
}
