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
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminTemplates'>;
};

interface UserWithTemplates {
  id: string;
  full_name: string;
  email: string;
  template_count: number;
}

export default function AdminTemplatesScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithTemplates[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadUsersWithTemplates();
  }, []);

  async function loadUsersWithTemplates() {
    try {
      setLoading(true);

      // Cargar usuarios (solo role=user)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('role', 'user')
        .order('full_name');

      if (usersError) throw usersError;

      // Contar plantillas por usuario
      const usersWithCount = await Promise.all(
        (usersData || []).map(async (user) => {
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

      setUsers(usersWithCount);
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerContent}>
          <Text style={styles.title}>Plantillas de Reservas</Text>
          <Text style={styles.subtitle}>Reservas automáticas por usuario</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar usuario..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Lista de usuarios */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Cargando usuarios...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No hay usuarios</Text>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No se encontraron resultados' : 'Todavía no hay usuarios registrados'}
              </Text>
            </View>
          ) : (
            filteredUsers.map((user) => (
              <Pressable
                key={user.id}
                style={styles.userCard}
                onPress={() => {
                  (navigation as any).navigate('AdminUserTemplates', {
                    userId: user.id,
                  });
                }}
              >
                {/* Avatar */}
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(user.full_name || user.email)?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>

                {/* Info */}
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>
                    {user.full_name || 'Sin nombre'}
                  </Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <View style={styles.templateBadge}>
                    <Text style={styles.templateBadgeText}>
                      {user.template_count === 0
                        ? 'Sin plantilla'
                        : `${user.template_count} reserva${user.template_count > 1 ? 's' : ''} fija${user.template_count > 1 ? 's' : ''}`}
                    </Text>
                  </View>
                </View>

                {/* Arrow */}
                <Text style={styles.arrow}>→</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
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
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  userAvatarText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 3,
  },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  templateBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(59,130,246,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  templateBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
  },
  arrow: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.3)',
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 40,
  },
});