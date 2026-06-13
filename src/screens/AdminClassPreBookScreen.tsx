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
import { supabase } from '../lib/supabase';
import { MAX_CONTENT_WIDTH, scale } from '../theme';

type Props = NativeStackScreenProps<any, 'AdminClassPreBook'>;

interface User {
  id: string;
  full_name: string;
  email: string;
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
  const insets = useSafeAreaInsets();
  const classId = route.params?.classId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [alreadyBooked, setAlreadyBooked] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);

      // 1. Cargar info de la clase
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name, class_date, class_time, max_spots')
        .eq('id', classId)
        .single();

      if (classError) throw classError;

      // 2. Contar reservas actuales
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', classId);

      setClassInfo({
        ...classData,
        current_bookings: count || 0,
      });

      // 3. Cargar lista de usuarios (solo role=user)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'user')
        .order('full_name');

      if (usersError) throw usersError;

      setUsers(usersData || []);

      // 4. Cargar usuarios ya reservados en esta clase
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
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
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

              // Crear bookings
              const bookings = Array.from(selectedUsers).map(userId => ({
                user_id: userId,
                class_id: classId,
              }));

              const { error: insertError } = await supabase
                .from('bookings')
                .insert(bookings);

              if (insertError) throw insertError;

              // Enviar notificaciones a usuarios
              const notifications = Array.from(selectedUsers).map(userId => ({
                user_id: userId,
                type: 'booking_created',
                title: 'Reserva confirmada',
                message: `Has sido reservado para ${classInfo!.name} el ${new Date(classInfo!.class_date).toLocaleDateString('es-ES')} a las ${classInfo!.class_time.slice(0, 5)}.`,
                class_id: classId,
              }));

              await supabase.from('notifications').insert(notifications);

              // Log admin
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
                '✅ Reservas creadas',
                `${selectedUsers.size} usuario(s) reservado(s) correctamente`,
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack(),
                  },
                ]
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

  if (loading) {
    return (
      <View style={styles.outerContainer}>
        <View style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  if (!classInfo) {
    return (
      <View style={styles.outerContainer}>
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.errorText}>No se pudo cargar la clase</Text>
        </View>
      </View>
    );
  }

  const spotsAvailable = classInfo.max_spots - classInfo.current_bookings;

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
      {/* Header - Info de la clase */}
      <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
        <Text style={styles.className}>{classInfo.name}</Text>
        <Text style={styles.classDate}>
          {new Date(classInfo.class_date + 'T00:00:00').toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </Text>
        <Text style={styles.classTime}>{classInfo.class_time.slice(0, 5)}</Text>
        <Text style={styles.capacity}>
          Plazas disponibles: {spotsAvailable} / {classInfo.max_spots}
        </Text>
      </View>

      {/* Lista de usuarios */}
      <ScrollView style={styles.userList}>
        <Text style={styles.sectionTitle}>Selecciona usuarios para reservar:</Text>

        {users.map(user => {
          const isBooked = alreadyBooked.has(user.id);
          const isSelected = selectedUsers.has(user.id);

          return (
            <Pressable
              key={user.id}
              style={[
                styles.userCard,
                isBooked && styles.userCardBooked,
                isSelected && !isBooked && styles.userCardSelected,
              ]}
              onPress={() => !isBooked && toggleUser(user.id)}
              disabled={isBooked}
            >
              <View style={styles.userInfo}>
                <Text style={[
                  styles.userName,
                  isBooked && styles.userNameBooked,
                ]}>
                  {user.full_name || 'Sin nombre'}
                </Text>
                <Text style={styles.userEmail}>{user.email}</Text>
              </View>

              <View style={styles.checkbox}>
                {isBooked ? (
                  <Text style={styles.bookedBadge}>YA RESERVADO</Text>
                ) : (
                  <View style={[
                    styles.checkboxBox,
                    isSelected && styles.checkboxBoxSelected,
                  ]}>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Footer - Botón guardar */}
      <View style={styles.footer}>
        <Text style={styles.selectedCount}>
          Seleccionados: {selectedUsers.size}
        </Text>

        <Pressable
          style={[
            styles.saveButton,
            (saving || selectedUsers.size === 0) && styles.saveButtonDisabled,
          ]}
          onPress={handlePreBook}
          disabled={saving || selectedUsers.size === 0}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveButtonText}>
              Reservar {selectedUsers.size} usuario(s)
            </Text>
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
    backgroundColor: '#F3F4F6',
  },
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  className: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
  },
  classDate: {
    fontSize: 16,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  classTime: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  capacity: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 12,
  },
  userList: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  userCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  userCardBooked: {
    backgroundColor: '#F3F4F6',
    opacity: 0.6,
  },
  userCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  userNameBooked: {
    color: '#9CA3AF',
  },
  userEmail: {
    fontSize: 14,
    color: '#6B7280',
  },
  checkbox: {
    marginLeft: 12,
  },
  checkboxBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  checkmark: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  bookedBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  footer: {
    backgroundColor: 'white',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  selectedCount: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
  },
});