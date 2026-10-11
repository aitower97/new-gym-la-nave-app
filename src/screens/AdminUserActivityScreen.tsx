import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ClockIcon, XIcon } from '../components/Icons';
import { Bone, MonthNavigator, ScreenHeader, SkeletonGroup } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { useTransitionDone } from '../hooks/useScreenTransition';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { classTypeColorMap, DEFAULT_CLASS_TYPE_COLOR, getClassTypes } from '../utils/classTypes';
import {
  ActivityClass,
  ActivityStatus,
  WEEKDAY_SHORT,
  attendanceRate,
  classStatus,
  daysSinceLast,
  favoriteSlot,
  hourCounts,
  joinWeekdays,
  pastWindow,
  toDateStr,
  weekdayCounts,
  weekdayIndex,
  weeklyCounts,
} from '../utils/userActivity';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminUserActivity'>;
  route: RouteProp<RootStackParamList, 'AdminUserActivity'>;
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
/** Ventana de las estadísticas: últimos 3 meses */
const STATS_WEEKS = 12;

const STATUS: Record<ActivityStatus, { label: string; color: string }> = {
  done: { label: 'Vino', color: Colors.success },
  missed: { label: 'No vino', color: Colors.danger },
  upcoming: { label: 'Reservada', color: Colors.blue400 },
};

function StatusIcon({ status, size }: { status: ActivityStatus; size: number }) {
  const color = STATUS[status].color;
  if (status === 'done') return <CheckIcon size={size} color={color} strokeWidth={3} />;
  if (status === 'missed') return <XIcon size={size} color={color} strokeWidth={3} />;
  return <ClockIcon size={size} color={color} strokeWidth={2.5} />;
}

/**
 * Clases de un socio para el admin: qué días, a qué hora y qué clase gasta
 * (calendario + lista del mes), y cómo entrena en los últimos 3 meses.
 * Gastada = reserva de una clase (como cuenta el cupo); "No vino" = ✗ del admin.
 */
export default function AdminUserActivityScreen({ navigation, route }: Props) {
  const { userId, userName } = route.params;
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const transitionDone = useTransitionDone(navigation);

  const [classes, setClasses] = useState<ActivityClass[]>([]);
  const [typeColors, setTypeColors] = useState<Record<string, string>>({});
  const [cancellations, setCancellations] = useState(0);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [userId]);

  async function load() {
    try {
      const since = new Date();
      since.setDate(since.getDate() - STATS_WEEKS * 7);
      const [bookingsRes, cancelRes, types] = await Promise.all([
        supabase.from('bookings')
          .select('id, attended, classes!inner(class_date, class_time, name)')
          .eq('user_id', userId),
        // Bajas que hizo él (no las del admin ni los cambios de clase)
        supabase.from('booking_cancellations')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('cancelled_by', userId)
          .is('moved_to_class_id', null)
          .gte('cancelled_at', since.toISOString()),
        getClassTypes().catch(() => []),
      ]);
      if (bookingsRes.error) throw bookingsRes.error;

      const now = new Date();
      const list: ActivityClass[] = (bookingsRes.data || []).map((b: any) => {
        const cls = Array.isArray(b.classes) ? b.classes[0] : b.classes;
        const time = (cls.class_time as string).slice(0, 5);
        return {
          bookingId: b.id,
          date: cls.class_date,
          time,
          name: cls.name,
          status: classStatus(cls.class_date, time, b.attended ?? null, now),
        };
      });
      list.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      setClasses(list);
      setCancellations(cancelRes.count ?? 0);
      setTypeColors(classTypeColorMap(types));
    } catch (error) {
      console.error('Error cargando clases del socio:', error);
    } finally {
      setLoading(false);
    }
  }

  // ── Mes ────────────────────────────────────────────────────────────────
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthClasses = useMemo(() => classes.filter((c) => c.date.startsWith(monthPrefix)), [classes, monthPrefix]);
  const byDay = useMemo(() => {
    const map: Record<string, ActivityClass[]> = {};
    for (const c of monthClasses) (map[c.date] ||= []).push(c);
    return map;
  }, [monthClasses]);
  const monthTotals = useMemo(() => {
    const t: Record<ActivityStatus, number> = { done: 0, missed: 0, upcoming: 0 };
    for (const c of monthClasses) t[c.status]++;
    return t;
  }, [monthClasses]);
  const listed = selectedDay ? byDay[selectedDay] || [] : monthClasses;

  function changeMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDay(null);
  }

  // ── Últimos 3 meses ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const recent = pastWindow(classes, STATS_WEEKS);
    const weeks = weeklyCounts(recent, STATS_WEEKS);
    // La media cuenta desde su primera semana con clase: un socio nuevo no
    // sale penalizado por las semanas en que aún no era socio.
    const first = weeks.findIndex((w) => w.count > 0);
    const activeWeeks = first === -1 ? 0 : weeks.length - first;
    const done = weeks.reduce((s, w) => s + w.count, 0);
    return {
      weeks,
      perWeek: activeWeeks ? done / activeWeeks : 0,
      attendance: attendanceRate(recent),
      missed: recent.filter((c) => c.status === 'missed').length,
      weekdays: weekdayCounts(recent),
      hours: hourCounts(recent),
      favorite: favoriteSlot(recent),
      lastDays: daysSinceLast(classes),
    };
  }, [classes]);

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const header = (
    <ScreenHeader title="Clases" subtitle={userName} onBack={() => navigation.goBack()} topInset={insets.top} />
  );

  if (loading || !transitionDone) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
          {header}
          <SkeletonGroup>
            <View style={{ padding: scale(20), gap: scale(14) }}>
              <Bone height={scale(76)} radius={Radius.lg} />
              <Bone height={scale(44)} radius={Radius.md} />
              <Bone height={scale(260)} radius={Radius.lg} />
              <Bone height={scale(56)} radius={Radius.md} />
              <Bone height={scale(56)} radius={Radius.md} />
            </View>
          </SkeletonGroup>
        </View>
      </View>
    );
  }

  const lastLabel = stats.lastDays === null ? null
    : stats.lastDays === 0 ? 'Última clase: hoy'
    : stats.lastDays === 1 ? 'Última clase: ayer'
    : `Última clase: hace ${stats.lastDays} días`;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        {header}
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + scale(32) }} showsVerticalScrollIndicator={false}>

          {/* Resumen: su horario habitual */}
          <View style={{ paddingHorizontal: scale(20), paddingTop: scale(20) }}>
            <View style={{
              padding: scale(16), borderRadius: Radius.lg,
              backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: Colors.borderBlue,
            }}>
              {stats.favorite ? (
                <>
                  <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.blue400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Suele venir
                  </Text>
                  <Text style={{ fontSize: moderateScale(19), fontWeight: '800', color: Colors.textPrimary, marginTop: scale(4) }}>
                    {capitalize(joinWeekdays(stats.favorite.weekdays))}
                  </Text>
                  <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.blue400, marginTop: scale(2) }}>
                    a las {stats.favorite.time}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary }}>
                  Sin clases en los últimos 3 meses
                </Text>
              )}
              {lastLabel && (
                <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(6) }}>{lastLabel}</Text>
              )}
            </View>
          </View>

          {/* Mes: calendario + lista */}
          <MonthNavigator month={MONTH_NAMES[month]} year={year} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />

          <View style={{ paddingHorizontal: scale(20) }}>
            <View style={{ flexDirection: 'row', gap: scale(8), marginBottom: scale(12) }}>
              {(['done', 'missed', 'upcoming'] as ActivityStatus[]).map((s) => (
                <View key={s} style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(5),
                  paddingVertical: scale(10), paddingHorizontal: scale(6), borderRadius: Radius.md,
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                }}>
                  <StatusIcon status={s} size={scale(13)} />
                  <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary }}>{monthTotals[s]}</Text>
                  <Text style={{ flexShrink: 1, fontSize: moderateScale(11), color: Colors.textSecondary }} numberOfLines={1}>{STATUS[s].label}</Text>
                </View>
              ))}
            </View>

            <MonthCalendar
              year={year}
              month={month}
              byDay={byDay}
              today={toDateStr(today)}
              selected={selectedDay}
              onSelect={(d) => setSelectedDay((cur) => (cur === d ? null : d))}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: scale(18), marginBottom: scale(8) }}>
              <Text style={{ flexShrink: 1, fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary }}>
                {selectedDay ? formatDayTitle(selectedDay) : `${MONTH_NAMES[month]}: ${monthClasses.length} ${monthClasses.length === 1 ? 'clase' : 'clases'}`}
              </Text>
              {selectedDay && (
                <Pressable onPress={() => setSelectedDay(null)} hitSlop={scale(10)}>
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.blue400 }}>Ver todo</Text>
                </Pressable>
              )}
            </View>

            {listed.length === 0 ? (
              <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, paddingVertical: scale(12) }}>
                Sin clases
              </Text>
            ) : (
              listed.map((c) => (
                <View key={c.bookingId} style={{
                  flexDirection: 'row', alignItems: 'center', gap: scale(12),
                  paddingVertical: scale(10), paddingHorizontal: scale(12), marginBottom: scale(6),
                  backgroundColor: Colors.card, borderRadius: Radius.md,
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  borderLeftWidth: 3, borderLeftColor: typeColors[c.name] ?? DEFAULT_CLASS_TYPE_COLOR,
                  opacity: c.status === 'missed' ? 0.75 : 1,
                }}>
                  <View style={{ width: scale(40), alignItems: 'center' }}>
                    <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' }}>
                      {WEEKDAY_LABELS[weekdayIndex(c.date)]}
                    </Text>
                    <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
                      {Number(c.date.slice(8, 10))}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>{c.time}</Text>
                    <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary }} numberOfLines={1}>{c.name}</Text>
                  </View>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: scale(5),
                    paddingHorizontal: scale(9), paddingVertical: scale(5), borderRadius: Radius.sm,
                    backgroundColor: STATUS[c.status].color + '1F',
                  }}>
                    <StatusIcon status={c.status} size={scale(11)} />
                    <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textPrimary }}>{STATUS[c.status].label}</Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* Cómo entrena: últimos 3 meses */}
          <View style={{ paddingHorizontal: scale(20), marginTop: scale(28) }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary }}>Cómo entrena</Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2), marginBottom: scale(12) }}>Últimos 3 meses</Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
              <StatTile label="Por semana" value={stats.perWeek ? stats.perWeek.toFixed(1).replace('.', ',') : '0'} />
              <StatTile label="Asistencia" value={stats.attendance === null ? '—' : `${stats.attendance} %`} />
              <StatTile label="No vino" value={String(stats.missed)} />
              <StatTile label="Bajas" value={String(cancellations)} />
            </View>

            <ChartCard title="Días que viene">
              <WeekdayBars counts={stats.weekdays} />
            </ChartCard>

            <ChartCard title="A qué hora">
              {stats.hours.length === 0
                ? <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted }}>Sin clases</Text>
                : <HourBars hours={stats.hours} />}
            </ChartCard>

            <ChartCard title="Clases por semana">
              <WeekBars weeks={stats.weeks} />
            </ChartCard>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatDayTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const names = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  return `${names[weekdayIndex(date)]} ${d} de ${MONTH_NAMES[m - 1].toLowerCase()}${y !== new Date().getFullYear() ? ` de ${y}` : ''}`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{
      flexGrow: 1, flexBasis: '45%', padding: scale(14), alignItems: 'center',
      backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder,
    }}>
      <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: Colors.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: scale(2) }}>
        {label}
      </Text>
    </View>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{
      marginTop: scale(12), padding: scale(16),
      backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.cardBorder,
    }}>
      <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary, marginBottom: scale(14) }}>{title}</Text>
      {children}
    </View>
  );
}

// Una sola serie por gráfico: un color, y el máximo resaltado (énfasis); el
// resto en gris. El número va junto a cada barra, así no hace falta tocar nada.
const BAR_ACCENT = Colors.blue500;
const BAR_REST = 'rgba(255,255,255,0.16)';

function WeekdayBars({ counts }: { counts: number[] }) {
  const max = Math.max(...counts);
  const H = scale(90);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(6) }}>
      {counts.map((n, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: n ? Colors.textSecondary : Colors.textMuted, marginBottom: scale(4) }}>
            {n}
          </Text>
          <View style={{
            width: '62%', height: max ? Math.max(scale(3), (n / max) * H) : scale(3),
            borderTopLeftRadius: 4, borderTopRightRadius: 4,
            backgroundColor: n > 0 && n === max ? BAR_ACCENT : BAR_REST,
          }} />
          <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary, marginTop: scale(6) }}>
            {WEEKDAY_SHORT[i]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HourBars({ hours }: { hours: { time: string; count: number }[] }) {
  const max = Math.max(...hours.map((h) => h.count));
  return (
    <View style={{ gap: scale(8) }}>
      {hours.map((h) => (
        <View key={h.time} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
          <Text style={{ width: scale(44), fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary }}>{h.time}</Text>
          <View style={{ flex: 1, height: scale(14), justifyContent: 'center' }}>
            <View style={{
              width: `${Math.max(4, (h.count / max) * 100)}%`, height: '100%',
              borderTopRightRadius: 4, borderBottomRightRadius: 4,
              backgroundColor: h.count === max ? BAR_ACCENT : BAR_REST,
            }} />
          </View>
          <Text style={{ width: scale(24), textAlign: 'right', fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary }}>
            {h.count}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WeekBars({ weeks }: { weeks: { weekStart: string; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const H = scale(70);
  const first = weeks[0]?.weekStart;
  const label = (d: string) => `${Number(d.slice(8, 10))} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}`;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(3), height: H + scale(22) }}>
        {weeks.map((w, i) => {
          const isLast = i === weeks.length - 1;
          // Número solo en la semana actual y en las de máximo
          const showValue = isLast || (w.count > 0 && w.count === max);
          return (
            <View key={w.weekStart} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              {showValue && (
                <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary, marginBottom: scale(3), includeFontPadding: false }}>{w.count}</Text>
              )}
              <View style={{
                width: '70%', height: Math.max(scale(3), (w.count / max) * H),
                borderTopLeftRadius: 3, borderTopRightRadius: 3,
                backgroundColor: w.count ? BAR_ACCENT : BAR_REST,
                opacity: isLast ? 1 : 0.75,
              }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: scale(6) }}>
        <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>{first ? label(first) : ''}</Text>
        <Text style={{ fontSize: moderateScale(10), color: Colors.textMuted }}>Esta semana</Text>
      </View>
    </View>
  );
}

function MonthCalendar({ year, month, byDay, today, selected, onSelect }: {
  year: number;
  month: number;
  byDay: Record<string, ActivityClass[]>;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const pad = (n: number) => String(n).padStart(2, '0');
  // Semanas como filas de 7 con flex:1: con width en % y flexWrap, el
  // redondeo de Android podía mandar el domingo a la fila siguiente.
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{
      padding: scale(10), borderRadius: Radius.lg,
      backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
    }}>
      <View style={{ flexDirection: 'row', marginBottom: scale(4) }}>
        {WEEKDAY_SHORT.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: moderateScale(11), fontWeight: '700', color: Colors.textMuted }}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
      <View key={w} style={{ flexDirection: 'row' }}>
        {week.map((day, i) => {
          if (day === null) return <View key={`e${i}`} style={{ flex: 1, aspectRatio: 1 }} />;
          const date = `${year}-${pad(month + 1)}-${pad(day)}`;
          const dayClasses = byDay[date] || [];
          const has = dayClasses.length > 0;
          const isSelected = selected === date;
          return (
            <Pressable
              key={date}
              onPress={has ? () => onSelect(date) : undefined}
              disabled={!has}
              style={{ flex: 1, aspectRatio: 1, padding: scale(2) }}
            >
              <View style={{
                flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm,
                backgroundColor: isSelected ? 'rgba(59,130,246,0.25)' : has ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderWidth: date === today ? 1 : 0, borderColor: Colors.blue400,
              }}>
                <Text style={{
                  fontSize: moderateScale(13), fontWeight: has ? '800' : '500',
                  color: has ? Colors.textPrimary : Colors.textMuted,
                }}>
                  {day}
                </Text>
                {has && (
                  <View style={{ flexDirection: 'row', gap: scale(3), marginTop: scale(3) }}>
                    {dayClasses.slice(0, 3).map((c) => (
                      <View key={c.bookingId} style={{
                        width: scale(6), height: scale(6), borderRadius: scale(3),
                        backgroundColor: STATUS[c.status].color,
                      }} />
                    ))}
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
      ))}
    </View>
  );
}
