import { supabase } from '../lib/supabase';
import { sendPushNotifications } from './pushNotifications';

export type NotificationType = 'class_cancelled' | 'class_modified' | 'booking_removed' | 'booking_created' | 'reminder' | 'recurring_class_cancelled' | 'payment_due' | 'payment_blocked';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  classId?: string;
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  classId,
}: CreateNotificationParams): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    message,
    class_id: classId,
  });

  if (error) console.error('Error creating notification:', error);

  const pushData: Record<string, string> = { type };
  if (classId) pushData.class_id = classId;
  sendPushNotifications([userId], title, message, pushData);
}

export async function createNotificationsForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<void> {
  if (userIds.length === 0) return;

  const notifications = userIds.map(userId => ({
    user_id: userId,
    type: params.type,
    title: params.title,
    message: params.message,
    class_id: params.classId,
  }));

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) console.error('Error creating notifications:', error);

  const pushData: Record<string, string> = { type: params.type };
  if (params.classId) pushData.class_id = params.classId;
  sendPushNotifications(userIds, params.title, params.message, pushData);
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);

  if (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
}

export async function getUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);

  if (error) {
    // En el arranque con auto-login, la sesión puede estar refrescando el token
    // y la petición llega con un error vacío ({"message":""}). Es transitorio y
    // se resuelve en la siguiente carga: no lo tratamos como error real.
    if (error.message || error.code) {
      console.error('Error getting unread count:', error);
    }
    return 0;
  }

  return count || 0;
}