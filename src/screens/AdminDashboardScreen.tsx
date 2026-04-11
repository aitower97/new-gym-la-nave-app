import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, } from 'react-native';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { DashboardStats, getDashboardStats, getTodayUpcomingClasses } from '../utils/adminStats';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminDashboard'>;
  route: RouteProp<RootStackParamList, 'AdminDashboard'>;
};

export default function AdminDashboardScreen({ navigation, route }: Props) {
  const { email, name } = route.params;
  const [stats, setStats] = useState<DashboardStats>({
    classesToday: 0,
    totalBookings: 0,
    totalUsers: 0,
    occupancyRate: 0,
  });
  const [upcomingClasses, setUpcomingClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      setLoading(true);
      
      const [statsData, classesData] = await Promise.all([
        getDashboardStats(),
        getTodayUpcomingClasses(),
      ]);

      setStats(statsData);
      setUpcomingClasses(classesData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigation.navigate('Welcome');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Panel de Administración</Text>
          <Text style={styles.subtitle}>La Nave Strength Center</Text>
        </View>
        
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutIcon}>⎋</Text>
        </Pressable>
      </View>

      {/* Welcome */}
      <View style={styles.welcomeCard}>
        <Text style={styles.welcomeEmoji}>👋</Text>
        <Text style={styles.welcomeTitle}>Bienvenido, {name || email.split('@')[0]}</Text>
        <Text style={styles.welcomeText}>Panel de gestión del gimnasio</Text>
      </View>

      {/* Menu Grid */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.menuGrid}>
          {/* Plantillas */}
          <Pressable 
            style={({ pressed }) => [
              styles.menuCard,
              styles.menuCardPrimary,
              pressed && styles.menuCardPressed,
            ]}
            onPress={() => {
              // TODO: Navegación a TemplatesScreen
              console.log('Ir a Plantillas');
            }}
          >
            <Text style={styles.menuIcon}>📋</Text>
            <Text style={styles.menuTitle}>Plantillas</Text>
            <Text style={styles.menuSubtitle}>Reservas automáticas</Text>
          </Pressable>

          {/* Clases */}
          <Pressable 
            style={({ pressed }) => [
              styles.menuCard,
              styles.menuCardSecondary,
              pressed && styles.menuCardPressed,
            ]}
            onPress={() => {
              // TODO: Navegación a ClassesScreen
              console.log('Ir a Clases');
            }}
          >
            <Text style={styles.menuIcon}>📅</Text>
            <Text style={styles.menuTitle}>Clases</Text>
            <Text style={styles.menuSubtitle}>Crear y gestionar</Text>
          </Pressable>

          {/* Usuarios */}
          <Pressable 
            style={({ pressed }) => [
              styles.menuCard,
              styles.menuCardTertiary,
              pressed && styles.menuCardPressed,
            ]}
            onPress={() => {
              // TODO: Navegación a UsersScreen
              console.log('Ir a Usuarios');
            }}
          >
            <Text style={styles.menuIcon}>👥</Text>
            <Text style={styles.menuTitle}>Usuarios</Text>
            <Text style={styles.menuSubtitle}>Gestión de miembros</Text>
          </Pressable>

          {/* Planes */}
          <Pressable 
            style={({ pressed }) => [
              styles.menuCard,
              styles.menuCardQuaternary,
              pressed && styles.menuCardPressed,
            ]}
            onPress={() => {
              // TODO: Navegación a PlansScreen
              console.log('Ir a Planes');
            }}
          >
            <Text style={styles.menuIcon}>💳</Text>
            <Text style={styles.menuTitle}>Planes</Text>
            <Text style={styles.menuSubtitle}>Tarifas y membresías</Text>
          </Pressable>
        </View>

        {/* Stats Preview */}
        <View style={styles.statsSection}>
          <View style={styles.statsSectionHeader}>
            <Text style={styles.statsTitle}>Vista Rápida</Text>
            <Pressable onPress={loadDashboardData}>
              <Text style={styles.refreshIcon}>↻</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3B82F6" />
            </View>
          ) : (
            <>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{stats.classesToday}</Text>
                  <Text style={styles.statLabel}>Clases hoy</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{stats.totalBookings}</Text>
                  <Text style={styles.statLabel}>Reservas hoy</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{stats.totalUsers}</Text>
                  <Text style={styles.statLabel}>Usuarios</Text>
                </View>
              </View>

              {/* Occupancy Rate */}
              <View style={styles.occupancyCard}>
                <Text style={styles.occupancyLabel}>Ocupación promedio hoy</Text>
                <View style={styles.occupancyBarContainer}>
                  <View 
                    style={[
                      styles.occupancyBar, 
                      { 
                        width: `${stats.occupancyRate}%`,
                        backgroundColor: 
                          stats.occupancyRate >= 80 ? '#EF4444' : 
                          stats.occupancyRate >= 60 ? '#F59E0B' : 
                          '#10B981'
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.occupancyText}>{stats.occupancyRate}%</Text>
              </View>

              {/* Upcoming Classes */}
              {upcomingClasses.length > 0 && (
                <View style={styles.upcomingSection}>
                  <Text style={styles.upcomingTitle}>Próximas clases</Text>
                  {upcomingClasses.map((cls) => {
                    const booked = cls.bookings?.length || 0;
                    const capacity = cls.max_spots;
                    const percentage = Math.round((booked / capacity) * 100);

                    return (
                      <View key={cls.id} style={styles.upcomingClass}>
                        <View style={styles.upcomingClassLeft}>
                          <Text style={styles.upcomingTime}>
                            {cls.class_time.slice(0, 5)}
                          </Text>
                          <Text style={styles.upcomingName}>{cls.name}</Text>
                        </View>
                        <View style={styles.upcomingClassRight}>
                          <Text style={styles.upcomingCount}>
                            {booked}/{capacity}
                          </Text>
                          <View style={styles.upcomingDots}>
                            {Array.from({ length: 4 }).map((_, i) => (
                              <View
                                key={i}
                                style={[
                                  styles.upcomingDot,
                                  {
                                    backgroundColor:
                                      i < Math.round((percentage / 100) * 4)
                                        ? percentage >= 80
                                          ? '#EF4444'
                                          : percentage >= 60
                                          ? '#F59E0B'
                                          : '#10B981'
                                        : 'rgba(255,255,255,0.2)',
                                  },
                                ]}
                              />
                            ))}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
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
  scrollView: {
    flex: 1,
  },
  welcomeCard: {
    margin: 20,
    padding: 24,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    alignItems: 'center',
  },
  welcomeEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  welcomeText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  menuCard: {
    width: '48%',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 120,
  },
  menuCardPrimary: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  menuCardSecondary: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  menuCardTertiary: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  menuCardQuaternary: {
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderColor: 'rgba(139,92,246,0.3)',
  },
  menuCardPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  menuIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  menuSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  statsSection: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  statsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshIcon: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.6)',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    textAlign: 'center',
  },
  occupancyCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  occupancyLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    marginBottom: 8,
  },
  occupancyBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  occupancyBar: {
    height: '100%',
    borderRadius: 4,
  },
  occupancyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  upcomingSection: {
    marginTop: 24,
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  upcomingClass: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  upcomingClassLeft: {
    flex: 1,
  },
  upcomingTime: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3B82F6',
    marginBottom: 2,
  },
  upcomingName: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },
  upcomingClassRight: {
    alignItems: 'flex-end',
  },
  upcomingCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  upcomingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
