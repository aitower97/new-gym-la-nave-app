import { 
  View, 
  Text, 
  Pressable, 
  StyleSheet, 
  Image,
  Dimensions,
} from 'react-native';
import { useState, useEffect } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { supabase } from '../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { getUnreadCount } from '../utils/notifications';
import { supabase } from '../lib/supabase';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainMenu'>;
  route: RouteProp<RootStackParamList, 'MainMenu'>;
};

const { width } = Dimensions.get('window');

export default function MainMenuScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadUnreadCount();

    // Suscripción en tiempo real
    const channel = supabase
      .channel('notifications_count')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadUnreadCount() {
    const count = await getUnreadCount();
    setUnreadCount(count);
  }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .single();

      if (profile?.avatar_url) {
        setAvatarUrl(profile.avatar_url);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  async function loadStats() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Total de reservas
      const { count: total } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Reservas de esta semana
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      
      const { count: week } = await supabase
        .from('bookings')
        .select('*, classes!inner(*)', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('classes.class_date', startOfWeek.toISOString().split('T')[0]);

      setStats({
        totalBookings: total || 0,
        thisWeek: week || 0,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 20) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const displayName = name || email.split('@')[0];

  return (
    <View style={styles.container}>
      {/* Gradient Background */}
      <View style={styles.gradientContainer}>
        <View style={styles.gradientCircle1} />
        <View style={styles.gradientCircle2} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <Pressable 
            style={styles.avatarContainer}
            onPress={() => navigation.navigate('Profile', { email, name })}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {displayName[0].toUpperCase()}
                </Text>
              </View>
            )}
          </Pressable>
          
          <View style={styles.greetingContainer}>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.userName}>{displayName}</Text>
          </View>
        </View>

        <Pressable 
          style={styles.logoutBtn}
          onPress={async () => {
            await supabase.auth.signOut();
            navigation.navigate('Welcome');
          }}
        >
          <Text style={styles.logoutIcon}>⎋</Text>
        </Pressable>
      </View>
      {/* Notificaciones */}
      <Pressable
        style={styles.notificationsBtn}
        onPress={() => navigation.navigate('Notifications')}
      >
        <Text style={styles.notificationsBtnIcon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.notificationsBadge}>
            <Text style={styles.notificationsBadgeText}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </Text>
          </View>
        )}
      </Pressable>
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.thisWeek}</Text>
          <Text style={styles.statLabel}>Esta semana</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalBookings}</Text>
          <Text style={styles.statLabel}>Total clases</Text>
        </View>
      </View>

      {/* Main Action Cards */}
      <View style={styles.actionsContainer}>
        {/* Reservar Clases Card */}
        <Pressable 
          style={({ pressed }) => [
            styles.actionCard,
            styles.actionCardPrimary,
            pressed && styles.actionCardPressed,
          ]}
          onPress={() => navigation.navigate('Home', { email, name })}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <Text style={styles.cardIcon}>📅</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Reservar Clases</Text>
              <Text style={styles.cardSubtitle}>
                Encuentra tu próximo entrenamiento
              </Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </Pressable>

        {/* Mi Perfil Card */}
        <Pressable 
          style={({ pressed }) => [
            styles.actionCard,
            styles.actionCardSecondary,
            pressed && styles.actionCardPressed,
          ]}
          onPress={() => navigation.navigate('Profile', { email, name })}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardIconContainer}>
              <Text style={styles.cardIcon}>👤</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Mi Perfil</Text>
              <Text style={styles.cardSubtitle}>
                Edita tu información personal
              </Text>
            </View>
            <Text style={styles.cardArrow}>→</Text>
          </View>
        </Pressable>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>La Nave Strength Center</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1a',
  },
  gradientContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  gradientCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(59,130,246,0.1)',
    opacity: 0.5,
  },
  gradientCircle2: {
    position: 'absolute',
    bottom: -150,
    left: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(245,158,11,0.08)',
    opacity: 0.5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarContainer: {
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: '#3B82F6',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#3B82F6',
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  greetingContainer: {
    gap: 4,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.5,
  },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  logoutIcon: {
    fontSize: 20,
    color: 'rgba(255,255,255,0.6)',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  actionsContainer: {
    flex: 1,
    paddingHorizontal: 24,
    gap: 16,
  },
  actionCard: {
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
  },
  actionCardPrimary: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  actionCardSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.15)',
  },
  actionCardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIcon: {
    fontSize: 28,
  },
  cardText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  cardArrow: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 'bold',
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});