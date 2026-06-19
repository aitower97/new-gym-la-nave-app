import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronLeftIcon, EditIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { ActionButton } from '../components/ui';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUsers'>;
};

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  template_count: number;
}

export default function AdminUsersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadUsers();
    });
    return unsubscribe;
  }, [navigation]);

  async function loadUsers() {
    try {
      setLoading(true);

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name');

      if (error) throw error;

      const usersWithTemplates = await Promise.all(
        (profiles || []).map(async (user) => {
          const { count } = await supabase
            .from('booking_templates')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('is_active', true);

          return {
            ...user,
            template_count: count || 0,
          };
        })
      );

      setUsers(usersWithTemplates);
    } catch (error: any) {
      console.error('Error loading users:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = users.filter(user =>
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const userCount = users.filter(u => u.role === 'user').length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + scale(12),
            paddingBottom: scale(16),
            paddingHorizontal: scale(20),
            borderBottomWidth: 1, borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({
              width: scale(40), height: scale(40),
              borderRadius: scale(20),
              backgroundColor: Colors.card,
              borderWidth: 1, borderColor: Colors.cardBorder,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              Usuarios
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
              {userCount} usuarios · {adminCount} admins
            </Text>
          </View>
        </Animated.View>

        {/* Search */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(80).springify()}
          style={{ paddingHorizontal: scale(20), paddingVertical: scale(14) }}
        >
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: Colors.inputBg,
            borderRadius: Radius.md,
            borderWidth: 1, borderColor: Colors.inputBorder,
            paddingHorizontal: scale(14),
            height: scale(48),
            gap: scale(10),
          }}>
            <SearchIcon size={scale(16)} color={Colors.placeholder} />
            <TextInput
              style={{ flex: 1, fontSize: scale(15), color: Colors.textPrimary }}
              placeholder="Buscar por nombre o email..."
              placeholderTextColor={Colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </Animated.View>

        {/* List */}
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: scale(12) }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
            <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary }}>Cargando usuarios...</Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
            keyboardShouldPersistTaps="handled"
          >
            {filteredUsers.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: scale(80) }}>
                <View style={{
                  width: scale(72), height: scale(72),
                  borderRadius: scale(36),
                  backgroundColor: Colors.card,
                  alignItems: 'center', justifyContent: 'center',
                  marginBottom: scale(16),
                }}>
                  <SearchIcon size={scale(32)} color={Colors.textDisabled} strokeWidth={1.5} />
                </View>
                <Text style={{ fontSize: moderateScale(20), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(8) }}>
                  No hay usuarios
                </Text>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', lineHeight: scale(20), paddingHorizontal: scale(40) }}>
                  {searchQuery ? 'No se encontraron resultados' : 'Todavía no hay usuarios registrados'}
                </Text>
              </View>
            ) : (
              filteredUsers.map((user, i) => (
                <Animated.View
                  key={user.id}
                  entering={FadeInDown.duration(350).delay(120 + i * 60).springify()}
                  style={{
                    backgroundColor: Colors.card,
                    borderRadius: Radius.lg,
                    padding: scale(16),
                    marginBottom: scale(10),
                    borderWidth: 1, borderColor: Colors.cardBorder,
                  }}
                >
                  {/* Row: avatar + info */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(14) }}>
                    <View style={{
                      width: scale(44), height: scale(44),
                      borderRadius: Radius.md,
                      backgroundColor: user.role === 'admin'
                        ? 'rgba(59,130,246,0.2)'
                        : 'rgba(16,185,129,0.15)',
                      borderWidth: 2,
                      borderColor: user.role === 'admin'
                        ? 'rgba(59,130,246,0.4)'
                        : 'rgba(16,185,129,0.3)',
                      justifyContent: 'center', alignItems: 'center',
                      marginRight: scale(12),
                    }}>
                      <Text style={{
                        fontSize: moderateScale(20),
                        fontWeight: '800',
                        color: user.role === 'admin' ? Colors.blue400 : '#10B981',
                      }}>
                        {(user.full_name || user.email)?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(3) }} numberOfLines={1}>
                        {user.full_name || 'Sin nombre'}
                      </Text>
                      <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(8) }} numberOfLines={1}>
                        {user.email}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: scale(6), flexWrap: 'wrap' }}>
                        <View style={{
                          alignSelf: 'flex-start',
                          backgroundColor: user.role === 'admin' ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.1)',
                          borderWidth: 1,
                          borderColor: user.role === 'admin' ? Colors.borderBlue : 'rgba(16,185,129,0.25)',
                          paddingHorizontal: scale(10), paddingVertical: scale(4),
                          borderRadius: Radius.sm,
                        }}>
                          <Text style={{
                            fontSize: moderateScale(11), fontWeight: '700',
                            color: user.role === 'admin' ? Colors.blue400 : '#10B981',
                          }}>
                            {user.role === 'admin' ? 'Admin' : 'Usuario'}
                          </Text>
                        </View>
                        <View style={{
                          alignSelf: 'flex-start',
                          backgroundColor: 'rgba(59,130,246,0.1)',
                          borderWidth: 1, borderColor: 'rgba(59,130,246,0.25)',
                          paddingHorizontal: scale(10), paddingVertical: scale(4),
                          borderRadius: Radius.sm,
                        }}>
                          <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.blue400 }}>
                            {user.template_count === 0
                              ? 'Sin plantilla'
                              : `${user.template_count} plantilla${user.template_count > 1 ? 's' : ''}`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={{ flexDirection: 'row', gap: scale(10) }}>
                    <ActionButton
                      icon={<EditIcon size={scale(18)} color={Colors.blue400} strokeWidth={1.5} />}
                      label="Editar"
                      onPress={() => (navigation as any).navigate('AdminEditUser', { userId: user.id })}
                    />
                    {user.role === 'user' && (
                      <ActionButton
                        icon={<CalendarIcon size={scale(18)} color={Colors.blue400} strokeWidth={1.5} />}
                        label="Plantilla"
                        onPress={() => (navigation as any).navigate('AdminUserTemplates', { userId: user.id })}
                      />
                    )}
                  </View>
                </Animated.View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
