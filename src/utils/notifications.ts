import { supabase } from '../lib/supabase';
import { sendPersonalizedPushNotifications, sendPushNotifications } from './pushNotifications';
import { hasPlaceholder, interpolateTemplate, TemplateVars } from './interpolateTemplate';

export type NotificationType = 'class_cancelled' | 'class_modified' | 'booking_removed' | 'booking_created' | 'reminder' | 'recurring_class_cancelled' | 'payment_due' | 'payment_blocked' | 'admin_message' | 'inactivity_nudge';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  classId?: string;
  /** Ver src/screens/AdminNotificationsScreen.tsx — una de las 8 claves del catálogo de iconos. */
  iconKey?: string;
}

/** nombre/apodo/plan de cada usuario, para interpolar {{nombre}}/{{apodo}}/{{plan}}. */
async function fetchTemplateVars(userIds: string[]): Promise<Map<string, TemplateVars>> {
  const [{ data: profiles }, { data: plans }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, username, plan_id').in('id', userIds),
    supabase.from('membership_plans').select('id, name'),
  ]);
  const planNameById = new Map((plans || []).map(p => [p.id, p.name]));

  const result = new Map<string, TemplateVars>();
  for (const p of (profiles || []) as any[]) {
    result.set(p.id, {
      nombre: p.full_name,
      apodo: p.username || p.full_name,
      plan: p.plan_id ? planNameById.get(p.plan_id) || '' : '',
    });
  }
  return result;
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  classId,
  iconKey,
}: CreateNotificationParams): Promise<void> {
  let finalTitle = title;
  let finalMessage = message;
  if (hasPlaceholder(title) || hasPlaceholder(message)) {
    const vars = (await fetchTemplateVars([userId])).get(userId);
    if (vars) {
      finalTitle = interpolateTemplate(title, vars);
      finalMessage = interpolateTemplate(message, vars);
    }
  }

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type,
    title: finalTitle,
    message: finalMessage,
    class_id: classId,
    icon_key: iconKey ?? null,
  });

  if (error) console.error('Error creating notification:', error);

  const pushData: Record<string, string> = { type };
  if (classId) pushData.class_id = classId;
  sendPushNotifications([userId], finalTitle, finalMessage, pushData);
}

/**
 * Devuelve false si no se pudieron guardar las notificaciones. No lanza: casi
 * todas las llamadas son un efecto secundario de otra acción (cancelar una
 * clase...) que ya se ha hecho y no debe presentarse como fallida. Quien
 * envía la notificación como acción principal (el panel del admin) sí debe
 * comprobar el resultado.
 */
export async function createNotificationsForUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<boolean> {
  if (userIds.length === 0) return true;

  const needsVars = hasPlaceholder(params.title) || hasPlaceholder(params.message);
  const varsByUser = needsVars ? await fetchTemplateVars(userIds) : null;

  const notifications = userIds.map(userId => {
    const vars = varsByUser?.get(userId);
    return {
      user_id: userId,
      type: params.type,
      title: vars ? interpolateTemplate(params.title, vars) : params.title,
      message: vars ? interpolateTemplate(params.message, vars) : params.message,
      class_id: params.classId,
      icon_key: params.iconKey ?? null,
    };
  });

  const { error } = await supabase.from('notifications').insert(notifications);
  if (error) console.error('Error creating notifications:', error);

  const pushData: Record<string, string> = { type: params.type };
  if (params.classId) pushData.class_id = params.classId;

  if (varsByUser) {
    // Placeholders interpolados por destinatario: el push tiene que llevar
    // el texto ya sustituido de cada uno, no el mismo para todos.
    await sendPersonalizedPushNotifications(
      notifications.map(n => ({ userId: n.user_id, title: n.title, body: n.message, data: pushData }))
    );
  } else {
    sendPushNotifications(userIds, params.title, params.message, pushData);
  }
  return !error;
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