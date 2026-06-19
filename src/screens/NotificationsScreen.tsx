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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, ChevronLeftIcon, EditIcon, TrashIcon, XIcon } from '../components/Icons';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { supabase } from '../lib/supabase';
import { Colors, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { deleteNotification, markAllNotificationsAsRead, markNotificationAsRead } from '../utils/notifications';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'>;
};

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  class_id: string | null;
  read: boolean;
  created_at: string;
}

export default function NotificationsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();

    // Suscripción en tiempo real
    const channel = supabase
      .channel('notifications_changes_' + Date.now()) // ← Nombre único
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAsRead(notificationId: string) {
    try {
      await markNotificationAsRead(notificationId);
      // Recargar inmediatamente
      await loadNotifications();
    } catch (error: any) {
      console.error('Error marking notification as read:', error);
    }
  }

  async function handleMarkAllAsRead() {
    try {
      await markAllNotificationsAsRead();
      // Recargar inmediatamente
      await loadNotifications();
    } catch (error: any) {
      console.error('Error marking all as read:', error);
    }
  }

  async function handleDelete(notificationId: string) {
    Alert.alert(
      'Eliminar notificación',
      '¿Estás seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotification(notificationId);
              loadNotifications();
            } catch (error: any) {
              console.error('Error deleting notification:', error);
            }
          },
        },
      ]
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Notificaciones</Text>
          <Text style={styles.subtitle}>
            {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todas leídas'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable onPress={handleMarkAllAsRead} style={styles.markAllBtn}>
            <Text style={styles.markAllBtnText}>Marcar todas</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scrollView}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <BellIcon size={scale(32)} color="rgba(255,255,255,0.2)" strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>Sin notificaciones</Text>
            <Text style={styles.emptyText}>
              Te avisaremos cuando haya cambios en tus clases
            </Text>
          </View>
        ) : (
          <View style={styles.notificationsList}>
            {notifications.map((notification) => {
              const isUnread = !notification.read;
              const date = new Date(notification.created_at);
              const now = new Date();
              const diffMs = now.getTime() - date.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);

              let timeAgo = '';
              if (diffMins < 1) timeAgo = 'Ahora';
              else if (diffMins < 60) timeAgo = `Hace ${diffMins}m`;
              else if (diffHours < 24) timeAgo = `Hace ${diffHours}h`;
              else if (diffDays === 1) timeAgo = 'Ayer';
              else timeAgo = `Hace ${diffDays}d`;

              const iconSize = scale(18);
              const iconColor = isUnread ? Colors.blue400 : Colors.textSecondary;
              const NotifIcon =
                notification.type === 'class_cancelled' ? <TrashIcon size={iconSize} color={iconColor} strokeWidth={2} /> :
                notification.type === 'class_modified' ? <EditIcon size={iconSize} color={iconColor} strokeWidth={2} /> :
                <BellIcon size={iconSize} color={iconColor} strokeWidth={2} />;

              return (
                  <Pressable
                    key={notification.id}
                    style={[
                      styles.notificationCard,
                      isUnread && styles.notificationCardUnread,
                    ]}
                    onPress={() => {
                      if (isUnread) {
                        handleMarkAsRead(notification.id);
                      }
                    }}
                  >
                  <View style={styles.notificationIcon}>
                    {NotifIcon}
                  </View>
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <Text style={[
                        styles.notificationTitle,
                        isUnread && styles.notificationTitleUnread,
                      ]}>
                        {notification.title}
                      </Text>
                      {isUnread && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.notificationMessage}>
                      {notification.message}
                    </Text>
                    <Text style={styles.notificationTime}>{timeAgo}</Text>
                  </View>
                  <Pressable
                    style={styles.deleteBtn}
                    onPress={() => handleDelete(notification.id)}
                  >
                    <XIcon size={16} color="#EF4444" strokeWidth={2.5} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  </ScreenWrapper>
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
  markAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  markAllBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyState: {
    paddingVertical: 80,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  notificationsList: {
    padding: 20,
  },
  notificationCard: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 12,
  },
  notificationCardUnread: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationIconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    flex: 1,
  },
  notificationTitleUnread: {
    color: '#fff',
    fontWeight: 'bold',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 6,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  deleteBtnText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '600',
  },
});