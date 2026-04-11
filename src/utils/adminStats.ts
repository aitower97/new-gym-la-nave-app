import { supabase } from '../lib/supabase';

export interface DashboardStats {
  classesToday: number;
  totalBookings: number;
  totalUsers: number;
  occupancyRate: number;
}

/**
 * Obtener estadísticas del dashboard admin
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Contar clases de hoy
    const { count: classesToday, error: classesError } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .eq('class_date', today);

    if (classesError) throw classesError;

    // 2. Contar reservas de hoy
    const { count: totalBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('*, classes!inner(*)', { count: 'exact', head: true })
      .eq('classes.class_date', today);

    if (bookingsError) throw bookingsError;

    // 3. Contar usuarios totales
    const { count: totalUsers, error: usersError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (usersError) throw usersError;

    // 4. Calcular tasa de ocupación promedio de hoy
    let occupancyRate = 0;

    if (classesToday && classesToday > 0) {
      // Obtener clases con sus capacidades
      const { data: classesData, error: classesDataError } = await supabase
        .from('classes')
        .select(`
          id,
          max_spots,
          bookings (id)
        `)
        .eq('class_date', today);

      if (!classesDataError && classesData) {
        let totalCapacity = 0;
        let totalBooked = 0;

        classesData.forEach((cls: any) => {
          totalCapacity += cls.max_spots;
          totalBooked += cls.bookings?.length || 0;
        });

        occupancyRate = totalCapacity > 0 
          ? Math.round((totalBooked / totalCapacity) * 100) 
          : 0;
      }
    }

    return {
      classesToday: classesToday || 0,
      totalBookings: totalBookings || 0,
      totalUsers: totalUsers || 0,
      occupancyRate,
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return {
      classesToday: 0,
      totalBookings: 0,
      totalUsers: 0,
      occupancyRate: 0,
    };
  }
}

/**
 * Obtener próximas clases de hoy
 */
export async function getTodayUpcomingClasses() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`;

    const { data, error } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        class_time,
        max_spots,
        bookings (id)
      `)
      .eq('class_date', today)
      .gte('class_time', currentTime)
      .order('class_time')
      .limit(3);

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting upcoming classes:', error);
    return [];
  }
}