import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, CheckIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { Avatar, Button, ScreenHeader, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { createNotificationsForUsers } from '../utils/notifications';
import { getDisplayName } from '../utils/user';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminNotifications'>;
};

interface UserOption {
  id: string;
  username: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

export default function AdminNotificationsScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, email, avatar_url')
        .eq('role', 'user')
        .order('full_name');
      if (error) throw error;
      setUsers(data || []);
    } catch (error: any) {
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

  const recipientCount = sendToAll ? users.length : selectedUsers.size;
  const canSend = title.trim().length > 0 && message.trim().length > 0 && recipientCount > 0;

  function handleSend() {
    Alert.alert(
      'Enviar notificación',
      `¿Enviar a ${recipientCount} usuario${recipientCount !== 1 ? 's' : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Enviar', onPress: sendNotification },
      ]
    );
  }

  async function sendNotification() {
    try {
      setSending(true);
      const targetIds = sendToAll ? users.map(u => u.id) : Array.from(selectedUsers);

      await createNotificationsForUsers(targetIds, {
        type: 'admin_message',
        title: title.trim(),
        message: message.trim(),
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'send_notification',
          target_type: 'user',
          details: {
            title: title.trim(),
            recipients_count: targetIds.length,
            send_to_all: sendToAll,
          },
        });
      }

      Alert.alert('Enviado', `Notificación enviada a ${targetIds.length} usuario${targetIds.length !== 1 ? 's' : ''}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSending(false);
    }
  }

  const filteredUsers = users.filter(u =>
    getDisplayName(u).toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Notificaciones"
          subtitle="Avisar a socios dentro de la app"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: scale(20) }}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View entering={FadeInDown.duration(350).springify()} style={{ marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(8) }}>
                Título
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ej: Por favor usa la app"
                placeholderTextColor={Colors.placeholder}
                maxLength={80}
                style={{
                  fontSize: moderateScale(15), fontWeight: '600', color: Colors.textPrimary,
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, padding: scale(14),
                }}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(350).delay(60).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(8) }}>
                Mensaje
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Escribe el mensaje que verán en la app..."
                placeholderTextColor={Colors.placeholder}
                multiline
                numberOfLines={4}
                maxLength={300}
                style={{
                  fontSize: moderateScale(14), color: Colors.textPrimary,
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, padding: scale(14),
                  minHeight: scale(100), textAlignVertical: 'top',
                }}
              />
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(350).delay(120).springify()} style={{ marginBottom: scale(16) }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary, marginBottom: scale(8) }}>
                Destinatarios
              </Text>
              <View style={{ flexDirection: 'row', gap: scale(10) }}>
                <SpringPressable
                  onPress={() => setSendToAll(true)}
                  style={{
                    flex: 1, paddingVertical: scale(12), alignItems: 'center',
                    borderRadius: Radius.md, borderWidth: 1,
                    backgroundColor: sendToAll ? 'rgba(59,130,246,0.15)' : Colors.card,
                    borderColor: sendToAll ? Colors.blue500 : Colors.cardBorder,
                  }}
                >
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: sendToAll ? Colors.blue500 : Colors.textMuted }}>
                    Todos ({users.length})
                  </Text>
                </SpringPressable>
                <SpringPressable
                  onPress={() => setSendToAll(false)}
                  style={{
                    flex: 1, paddingVertical: scale(12), alignItems: 'center',
                    borderRadius: Radius.md, borderWidth: 1,
                    backgroundColor: !sendToAll ? 'rgba(59,130,246,0.15)' : Colors.card,
                    borderColor: !sendToAll ? Colors.blue500 : Colors.cardBorder,
                  }}
                >
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: !sendToAll ? Colors.blue500 : Colors.textMuted }}>
                    Elegir ({selectedUsers.size})
                  </Text>
                </SpringPressable>
              </View>
            </Animated.View>

            {!sendToAll && (
              <Animated.View entering={FadeInDown.duration(300).springify()}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: scale(8),
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, paddingHorizontal: scale(14), paddingVertical: scale(10),
                  marginBottom: scale(12),
                }}>
                  <SearchIcon size={scale(16)} color={Colors.textMuted} strokeWidth={2} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Buscar usuario..."
                    placeholderTextColor={Colors.placeholder}
                    style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textPrimary, padding: 0 }}
                  />
                </View>

                {filteredUsers.map((u, i) => {
                  const isSelected = selectedUsers.has(u.id);
                  return (
                    <Animated.View key={u.id} entering={FadeInDown.duration(250).delay(Math.min(i, 12) * 25).springify()}>
                      <SpringPressable
                        onPress={() => toggleUser(u.id)}
                        style={{
                          backgroundColor: isSelected ? 'rgba(59,130,246,0.1)' : Colors.card,
                          borderWidth: 1, borderColor: isSelected ? Colors.blue500 : Colors.cardBorder,
                          borderRadius: Radius.md, marginBottom: scale(8),
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: scale(12), gap: scale(10) }}>
                          <Avatar uri={u.avatar_url} size={scale(36)} index={i} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>
                              {getDisplayName(u)}
                            </Text>
                            <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }} numberOfLines={1}>
                              {u.email}
                            </Text>
                          </View>
                          <View style={{
                            width: scale(22), height: scale(22), borderRadius: scale(5),
                            borderWidth: 2, borderColor: isSelected ? Colors.blue500 : Colors.cardBorder,
                            backgroundColor: isSelected ? Colors.blue500 : 'transparent',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isSelected && <CheckIcon size={scale(13)} color="#fff" strokeWidth={3} />}
                          </View>
                        </View>
                      </SpringPressable>
                    </Animated.View>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, textAlign: 'center', marginTop: scale(20) }}>
                    No se encontraron usuarios
                  </Text>
                )}
              </Animated.View>
            )}
          </ScrollView>
        )}

        <View style={{
          paddingHorizontal: scale(20), paddingTop: scale(14),
          paddingBottom: insets.bottom + scale(16),
          borderTopWidth: 1, borderTopColor: Colors.border,
        }}>
          <Button
            label={`Enviar${recipientCount > 0 ? ` a ${recipientCount}` : ''}`}
            onPress={handleSend}
            loading={sending}
            disabled={sending || loading || !canSend}
            variant="primary"
            size="lg"
            icon={<BellIcon size={scale(18)} color="#fff" strokeWidth={2} />}
          />
        </View>
      </View>
    </View>
  );
}
