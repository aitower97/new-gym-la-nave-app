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
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { createNotificationsForUsers } from '../utils/notifications';

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
    full_name: string | null;
    email: string;
  } | null;
}

export default function AdminClassDetailScreen({ navigation, route }: Props) {
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

      // Cargar datos de la clase
      const { data: classInfo, error: classError } = await supabase
        .from('classes')
        .select('*')
        .eq('id', classId)
        .single();

      if (classError) throw classError;
      setClassData(classInfo);

      // Cargar reservas con información del usuario
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          user_id,
          created_at,
          profiles (
            full_name,
            email
          )
        `)
        .eq('class_id', classId)
        .order('created_at', { ascending: true });

      if (bookingsError) throw bookingsError;
      const formattedBookings = (bookingsData || []).map((booking: any) => ({
        id: booking.id,
        user_id: booking.user_id,
        created_at: booking.created_at,
        profiles: booking.profiles?.[0] || null,
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

        // Obtener IDs de usuarios afectados ANTES de eliminar
        const affectedUserIds = bookings
        .map(b => b.user_id)
        .filter((id): id is string => id !== null);

        // Eliminar reservas
        const { error: bookingsError } = await supabase
        .from('bookings')
        .delete()
        .eq('class_id', classId);

        if (bookingsError) throw bookingsError;

        // Eliminar clase
        const { error: classError } = await supabase
        .from('classes')
        .delete()
        .eq('id', classId);

        if (classError) throw classError;

        // Crear notificaciones para usuarios afectados
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

        // Log de acción admin
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

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Detalle de Clase</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </View>
    );
  }

  if (!classData) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerContent}>
            <Text style={styles.title}>Detalle de Clase</Text>
          </View>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No se encontró la clase</Text>
        </View>
      </View>
    );
  }

  const date = new Date(classData.class_date + 'T00:00:00');
  const occupancyPercentage = Math.round((bookings.length / classData.max_spots) * 100);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Detalle de Clase</Text>
          <Text style={styles.subtitle}>{classData.class_type}</Text>
        </View>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Info principal */}
        <View style={styles.mainInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tipo</Text>
            <Text style={styles.infoValue}>{classData.class_type}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fecha</Text>
            <Text style={styles.infoValue}>
              {date.toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Hora</Text>
            <Text style={styles.infoValue}>{classData.class_time.slice(0, 5)}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Capacidad</Text>
            <Text style={styles.infoValue}>
              {bookings.length} / {classData.max_spots} plazas
            </Text>
          </View>

          <View style={styles.occupancyBar}>
            <View
              style={[
                styles.occupancyFill,
                {
                  width: `${occupancyPercentage}%`,
                  backgroundColor:
                    occupancyPercentage >= 100 ? '#EF4444' :
                    occupancyPercentage >= 80 ? '#F59E0B' :
                    '#10B981'
                }
              ]}
            />
          </View>
        </View>

        {/* Asistentes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Asistentes ({bookings.length})
          </Text>
          
          {bookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No hay reservas para esta clase
              </Text>
            </View>
          ) : (
            bookings.map((booking, index) => (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingNumber}>
                  <Text style={styles.bookingNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingName}>
                    {booking.profiles?.full_name || 'Sin nombre'}
                  </Text>
                  <Text style={styles.bookingEmail}>
                    {booking.profiles?.email || 'Sin email'}
                  </Text>
                  <Text style={styles.bookingDate}>
                    Reservado: {new Date(booking.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
      
      {/* Botón Pre-reservar Usuarios */}
      <Pressable
        style={[styles.actionButton, { backgroundColor: '#8B5CF6' }]}
        onPress={() => {
          const nav = navigation as any;
          nav.navigate('AdminClassPreBook', { classId });
        }}
      >
        <Text style={styles.actionButtonText}>👥 Pre-reservar Usuarios</Text>
      </Pressable>
      {/* Botones de acción */}
      <View style={styles.bottomActions}>
        <Pressable
          style={[styles.actionBtn, styles.editBtn]}
          onPress={() => navigation.navigate('AdminEditClass', { classId })}
        >
          <Text style={styles.actionBtnText}>✏️ Editar clase</Text>
        </Pressable>

        <Pressable
          style={[styles.actionBtn, styles.cancelBtn]}
          onPress={handleCancelClass}
        >
          <Text style={styles.actionBtnText}>🗑️ Cancelar clase</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
  },
  mainInfo: {
    margin: 20,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  infoLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 12,
    textTransform: 'capitalize',
  },
  occupancyBar: {
    marginTop: 16,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  occupancyFill: {
    height: '100%',
    borderRadius: 4,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  bookingCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  bookingNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59,130,246,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bookingNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3B82F6',
  },
  bookingInfo: {
    flex: 1,
  },
  bookingName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  bookingEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  bookingDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  bottomActions: {
    padding: 20,
    paddingBottom: 30,
    backgroundColor: '#0a0f1a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  actionBtn: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  editBtn: {
    backgroundColor: '#3B82F6',
  },
  cancelBtn: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  actionBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});