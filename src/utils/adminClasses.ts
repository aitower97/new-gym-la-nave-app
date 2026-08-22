import { supabase } from '../lib/supabase';
import { toDateStr } from './planPayments';

export interface ClassWithBookings {
  id: string;
  name: string;
  class_date: string;
  class_time: string;
  max_spots: number;
  bookings: Array<{ id: string }>;
}

/**
 * Obtener todas las clases de un mes específico
 */
export async function getClassesByMonth(year: number, month: number): Promise<ClassWithBookings[]> {
  try {
    // Crear rango de fechas del mes
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    // toDateStr usa año/mes/día LOCALES de startDate/endDate — toISOString()
    // convierte a UTC antes de recortar la fecha, y en España (UTC+1/+2) eso
    // desplaza medianoche local al día ANTERIOR: el mes se pedía desde un día
    // antes hasta un día antes del real, así que el último día de cada mes no
    // aparecía al ver ESE mes (aparecía, erróneamente, al ver el siguiente).
    const startDateStr = toDateStr(startDate);
    const endDateStr = toDateStr(endDate);

    const { data, error } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        class_date,
        class_time,
        max_spots,
        bookings (id)
      `)
      .gte('class_date', startDateStr)
      .lte('class_date', endDateStr)
      .order('class_date')
      .order('class_time');

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error getting classes by month:', error);
    return [];
  }
}

/**
 * Agrupar clases por fecha
 */
export function groupClassesByDate(classes: ClassWithBookings[]): Record<string, ClassWithBookings[]> {
  return classes.reduce((acc, cls) => {
    const date = cls.class_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(cls);
    return acc;
  }, {} as Record<string, ClassWithBookings[]>);
}

/**
 * Obtener días del mes para el calendario (Lunes a Domingo)
 */
export function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const daysInMonth = lastDay.getDate();
  let startDayOfWeek = firstDay.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  
  // Convertir: Domingo (0) → 6, Lunes (1) → 0, ..., Sábado (6) → 5
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;
  
  const days = [];
  
  // Añadir días vacíos al inicio
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null);
  }
  
  // Añadir días del mes
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }
  
  return days;
}

/**
 * Nombres de meses
 */
export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

/**
 * Nombres de días de la semana (Lunes a Domingo)
 */
export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];