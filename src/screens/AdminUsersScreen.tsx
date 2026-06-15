import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, SearchIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUsers'>;
};

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminUsersScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
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

  const userCount  = users.filter(u => u.role === 'user').length;
  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <View style={[styles.outerContainer, { paddingTop: insets.top }]}>
      <View style={styles.container}>

        {/* ── Header con botón volver ── */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            onPress={() => navigation.goBack()}
            hitSlop={8}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>

          <View style={styles.headerContent}>
            <Text style={styles.title}>Usuarios</Text>
            <Text style={styles.subtitle}>
              {userCount} usuarios · {adminCount} admins
            </Text>
          </View>
        </View>

        {/* ── Buscador ── */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBox}>
            <SearchIcon size={scale(16)} color={Colors.placeholder} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre o email..."
              placeholderTextColor={Colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {/* ── Lista ── */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.blue500} />
            <Text style={styles.loadingText}>Cargando usuarios...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + scale(24) },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {filteredUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconBox}>
                  <SearchIcon size={scale(32)} color={Colors.textDisabled} strokeWidth={1.5} />
                </View>
                <Text style={styles.emptyTitle}>No hay usuarios</Text>
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? 'No se encontraron resultados'
                    : 'Todavía no hay usuarios registrados'}
                </Text>
              </View>
            ) : (
              filteredUsers.map(user => (
                <View key={user.id} style={styles.userCard}>
                  {/* Info */}
                  <View style={styles.userRow}>
                    <View style={styles.userAvatar}>
                      <Text style={styles.userAvatarText}>
                        {(user.full_name || user.email)?.[0]?.toUpperCase() || '?'}
                      </Text>
                    </View>

                    <View style={styles.userInfo}>
                      <Text style={styles.userName} numberOfLines={1}>
                        {user.full_name || 'Sin nombre'}
                      </Text>
                      <Text style={styles.userEmail} numberOfLines={1}>
                        {user.email}
                      </Text>
                      <View
                        style={[
                          styles.roleBadge,
                          user.role === 'admin' && styles.roleBadgeAdmin,
                        ]}
                      >
                        <Text style={styles.roleBadgeText}>
                          {user.role === 'admin' ? 'Admin' : 'Usuario'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Acciones (solo usuarios normales) */}
                  {user.role === 'user' && (
                    <View style={styles.actions}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.actionButton,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() =>
                          (navigation as any).navigate('AdminUserTemplates', {
                            userId: user.id,
                          })
                        }
                      >
                        <CalendarIcon
                          size={scale(14)}
                          color={Colors.blue400}
                          strokeWidth={1.5}
                        />
                        <Text style={styles.actionButtonText}>Plantilla</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingTop: scale(12),
    paddingBottom: scale(16),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(12),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.cardBorder,
  },
  backIcon: {
    fontSize: scale(26),
    color: Colors.textPrimary,
    lineHeight: scale(30),
    marginTop: -scale(2),
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: scale(20),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: scale(2),
  },
  subtitle: {
    fontSize: scale(13),
    color: Colors.textSecondary,
  },

  /* Search */
  searchContainer: {
    paddingHorizontal: scale(20),
    paddingVertical: scale(14),
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.inputBorder,
    paddingHorizontal: scale(14),
    height: scale(48),
    gap: scale(10),
  },
  searchInput: {
    flex: 1,
    fontSize: scale(15),
    color: Colors.textPrimary,
  },

  /* Loading */
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: scale(12),
  },
  loadingText: {
    fontSize: scale(14),
    color: Colors.textSecondary,
  },

  /* List */
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(20),
    paddingTop: scale(8),
  },

  /* User card */
  userCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: scale(16),
    marginBottom: scale(10),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.cardBorder,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: scale(10),
  },
  userAvatar: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1.5,
    borderColor: Colors.borderBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(14),
    flexShrink: 0,
  },
  userAvatarText: {
    fontSize: scale(20),
    fontWeight: '700',
    color: Colors.blue400,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,      // permite que numberOfLines funcione dentro de flex
  },
  userName: {
    fontSize: scale(16),
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: scale(2),
  },
  userEmail: {
    fontSize: scale(13),
    color: Colors.textMuted,
    marginBottom: scale(6),
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    paddingHorizontal: scale(10),
    paddingVertical: scale(3),
    borderRadius: Radius.sm,
  },
  roleBadgeAdmin: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: Colors.borderBlue,
  },
  roleBadgeText: {
    fontSize: scale(11),
    fontWeight: '600',
    color: Colors.textSecondary,
  },

  /* Actions */
  actions: {
    flexDirection: 'row',
    gap: scale(8),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.borderBlue,
    paddingVertical: scale(11),
    paddingHorizontal: scale(16),
    borderRadius: Radius.md,
  },
  actionButtonText: {
    color: Colors.blue400,
    fontSize: scale(14),
    fontWeight: '600',
  },

  /* Empty */
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(80),
  },
  emptyIconBox: {
    width: scale(72),
    height: scale(72),
    borderRadius: scale(36),
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(16),
  },
  emptyTitle: {
    fontSize: scale(20),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: scale(8),
  },
  emptyText: {
    fontSize: scale(14),
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: scale(20),
    paddingHorizontal: scale(40),
  },
});
