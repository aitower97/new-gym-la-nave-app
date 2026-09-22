import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

let Notifications: any;
let Device: any;
try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (e) {
  console.warn('[Push] Native module not available — rebuild required:', (e as Error).message);
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device || !Notifications) {
    console.log('[Push] Módulos nativos no disponibles');
    return null;
  }

  if (!Device.isDevice) {
    console.log('[Push] Solo funciona en dispositivo físico');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Permiso denegado — actívalo en Ajustes > La Nave > Notificaciones');
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'bf2edec3-1c57-4561-8131-09402de4097f',
    });
    return token.data;
  } catch (error) {
    console.error('[Push] Error obteniendo token:', error);
    return null;
  }
}

export async function savePushToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.error('Error saving push token:', error);
  }
}

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, string | undefined>;
}

/** La API de Expo acepta como mucho 100 mensajes por petición — con "enviar a
 * todos" (broadcast del admin) es fácil superarlo. */
async function sendExpoPushBatches(messages: ExpoPushMessage[]): Promise<void> {
  const EXPO_PUSH_BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error('Expo push API error:', result);
    }
  }
}

export async function sendPushNotifications(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string | undefined>
): Promise<void> {
  try {
    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds);

    if (error) throw error;
    if (!tokens || tokens.length === 0) return;

    await sendExpoPushBatches(tokens.map(({ token }) => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      data: data || {},
    })));
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
}

/**
 * Igual que sendPushNotifications, pero con título/mensaje propios por
 * destinatario — para plantillas con placeholders ({{nombre}}, {{apodo}},
 * {{plan}}) ya interpolados, donde mandar el mismo texto a todos mostraría
 * el placeholder sin sustituir en el push.
 */
export async function sendPersonalizedPushNotifications(
  entries: { userId: string; title: string; body: string; data?: Record<string, string | undefined> }[]
): Promise<void> {
  try {
    const userIds = entries.map(e => e.userId);
    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds);

    if (error) throw error;
    if (!tokens || tokens.length === 0) return;

    const byUser = new Map(entries.map(e => [e.userId, e]));
    const messages = tokens
      .map(({ user_id, token }): ExpoPushMessage | null => {
        const entry = byUser.get(user_id);
        if (!entry) return null;
        return { to: token, sound: 'default' as const, title: entry.title, body: entry.body, data: entry.data || {} };
      })
      .filter((m): m is ExpoPushMessage => m !== null);

    await sendExpoPushBatches(messages);
  } catch (error) {
    console.error('Error sending personalized push notifications:', error);
  }
}

export async function setupAndroidNotificationChannel(): Promise<void> {
  if (!Notifications) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notificaciones',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
  }
}
