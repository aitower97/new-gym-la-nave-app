import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { Bone, Button, ClassTypeSelector, SkeletonGroup, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { BillingPeriod, toDateStr } from '../utils/planPayments';
import { estimateTemplateFit } from '../utils/planEnforcement';
import { createNotification } from '../utils/notifications';
import { classTypeColorMap, ClassTypeInfo, DEFAULT_CLASS_TYPE_COLOR, getClassTypes } from '../utils/classTypes';
import { buildTemplateGrid, GridClass, normalizeTime } from '../utils/templateGrid';
import { getCurrentUser } from '../utils/auth';
import {
  EMPTY_PERIOD_MARKER, effectivePeriod, formatDmy, parseDmy, periodFromKey, periodKey, periodLabel, sortPeriods, TemplatePeriod, upcomingWeeks,
} from '../utils/templatePeriods';

type Props = NativeStackScreenProps<any, 'AdminUserTemplates'>;

interface UserInfo {
  id: string;
  full_name: string;
  email: string;
}

interface UserPlan {
  name: string;
  billing_period: BillingPeriod;
  classes_per_month: number | null;
  validity_days: number | null;
}

interface Template {
  id?: string;
  day_of_week: number;
  class_time: string;
  class_type: string;
  valid_from: string | null;
  valid_until: string | null;
}

type NewKind = 'week' | 'from' | 'range';

const DAY_LABELS: Record<number, string> = { 1: 'L', 2: 'M', 3: 'X', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };

// Mismo horizonte que usa el guardado para aplicar la plantilla a clases ya creadas
const GRID_HORIZON_DAYS = 60;

const SIEMPRE_KEY = periodKey({ from: null, until: null });
const templatePeriodOf = (t: Template): TemplatePeriod => ({ from: t.valid_from, until: t.valid_until });

/** Huecos (día-hora → tipo) de una plantilla concreta */
function slotsOf(templates: Template[], key: string): Record<string, string> {
  const out: Record<string, string> = {};
  templates
    .filter(t => periodKey(templatePeriodOf(t)) === key && t.class_type !== EMPTY_PERIOD_MARKER.class_type)
    .forEach(t => { out[`${t.day_of_week}-${normalizeTime(t.class_time)}`] = t.class_type; });
  return out;
}

/** Plantillas distintas (periodos) que aparecen en las filas */
function periodsOf(templates: Template[]): TemplatePeriod[] {
  const map = new Map<string, TemplatePeriod>();
  templates.forEach(t => map.set(periodKey(templatePeriodOf(t)), templatePeriodOf(t)));
  return sortPeriods(Array.from(map.values()));
}

/** ¿Tiene reserva fija este socio ese día en esa clase, con estas filas? */
function coversClass(templates: Template[], cls: { class_date: string; class_time: string; class_type: string }): boolean {
  const eff = effectivePeriod(periodsOf(templates), cls.class_date);
  if (!eff) return false;
  const key = periodKey(eff);
  const day = new Date(cls.class_date + 'T00:00:00').getDay();
  return templates.some(t =>
    periodKey(templatePeriodOf(t)) === key && t.day_of_week === day &&
    normalizeTime(t.class_time) === normalizeTime(cls.class_time) && t.class_type === cls.class_type);
}

/**
 * Una pestaña por plantilla. Cada pestaña guarda su propio borrador (huecos y
 * fechas): se puede pasar de una a otra sin perder nada, y "Guardar" guarda
 * todas a la vez.
 */
interface Tab {
  id: string;
  period: TemplatePeriod;
  slots: Record<string, string>;
  dirty: boolean;
}

function sortTabs(list: Tab[]): Tab[] {
  return [...list].sort((a, b) =>
    (a.period.from ?? '').localeCompare(b.period.from ?? '') || (a.period.until ?? '9999').localeCompare(b.period.until ?? '9999'));
}

export default function AdminUserTemplatesScreen({ route, navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const userId = route.params?.userId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  // Todas las filas del socio tal como están guardadas
  const [templates, setTemplates] = useState<Template[]>([]);
  const [types, setTypes] = useState<ClassTypeInfo[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedId, setSelectedId] = useState(SIEMPRE_KEY);
  const [selectedClassType, setSelectedClassType] = useState('');
  // Clases reales de hoy a GRID_HORIZON_DAYS: de ellas salen las filas (horas)
  // y columnas (días) del cuadrante, en vez de una lista fija.
  const [upcomingClasses, setUpcomingClasses] = useState<GridClass[]>([]);
  // Panel para crear una plantilla con fechas o cambiar las de la actual
  const [panel, setPanel] = useState<{ mode: 'new' | 'edit'; kind: NewKind } | null>(null);
  const [fromText, setFromText] = useState('');
  const [untilText, setUntilText] = useState('');
  const tabsRef = useRef<ScrollView>(null);

  const selectedTab = tabs.find(t => t.id === selectedId) ?? tabs[0];
  const slotTypes = selectedTab?.slots ?? {};
  const anyDirty = tabs.some(t => t.dirty);

  useEffect(() => {
    if (!userId) {
      Alert.alert('Error', 'No se proporcionó ID de usuario');
      navigation.goBack();
      return;
    }
    loadData();
  }, []);

  async function loadData(keepPeriodKey?: string) {
    try {
      setLoading(true);

      // Primera tanda, en paralelo: perfil, plantillas, tipos de clase y clases
      // próximas no dependen entre sí.
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + GRID_HORIZON_DAYS);
      const [userRes, templatesRes, typesData, classesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, plan_id').eq('id', userId).single(),
        supabase.from('booking_templates').select('*').eq('user_id', userId).eq('is_active', true),
        getClassTypes(),
        supabase
          .from('classes')
          .select('class_date, class_time')
          .gte('class_date', toDateStr(new Date()))
          .lte('class_date', toDateStr(horizon))
          .limit(5000),
      ]);

      if (userRes.error) throw userRes.error;
      if (templatesRes.error) throw templatesRes.error;
      if (classesRes.error) throw classesRes.error;
      const userData = userRes.data;
      const rows = (templatesRes.data || []) as Template[];
      setUserInfo(userData);

      // Segunda: el plan necesita el plan_id del perfil
      if (userData?.plan_id) {
        const { data: planData } = await supabase
          .from('membership_plans')
          .select('name, billing_period, classes_per_month, validity_days')
          .eq('id', userData.plan_id)
          .single();
        setUserPlan(planData || null);
      }

      setTemplates(rows);
      // "Siempre" está siempre aunque esté vacía: es la de por defecto
      const saved = periodsOf(rows);
      const all = saved.some(p => periodKey(p) === SIEMPRE_KEY) ? saved : sortPeriods([{ from: null, until: null }, ...saved]);
      const newTabs: Tab[] = all.map(p => ({ id: periodKey(p), period: p, slots: slotsOf(rows, periodKey(p)), dirty: false }));
      setTabs(newTabs);
      // Se abre la que manda hoy (o la que se estaba editando)
      const todayEff = effectivePeriod(saved, toDateStr(new Date()));
      const want = keepPeriodKey ?? (todayEff ? periodKey(todayEff) : SIEMPRE_KEY);
      setSelectedId(newTabs.some(t => t.id === want) ? want : SIEMPRE_KEY);

      setUpcomingClasses(classesRes.data || []);
      setTypes(typesData);
      if (typesData.length > 0) setSelectedClassType(prev => prev || typesData[0].name);
    } catch (error: any) {
      console.error('Error loading data:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateSelected(fn: (t: Tab) => Tab) {
    setTabs(prev => prev.map(t => (t.id === selectedId ? { ...fn(t), dirty: true } : t)));
  }

  function toggleSlot(day: number, time: string) {
    if (!selectedClassType) return;
    const key = `${day}-${time}`;
    updateSelected(t => {
      const next = { ...t.slots };
      // Ya pintado con el tipo activo → despintar; si no, pintar con el activo
      if (next[key] === selectedClassType) delete next[key];
      else next[key] = selectedClassType;
      return { ...t, slots: next };
    });
  }

  function selectTab(id: string) {
    setSelectedId(id);
    setPanel(null);
  }

  function openPanel(mode: 'new' | 'edit') {
    const current = selectedTab?.period ?? { from: null, until: null };
    const kind: NewKind = mode === 'edit' ? (current.from && current.until ? 'range' : 'from') : 'week';
    setFromText(mode === 'edit' && current.from ? formatDmy(current.from) : '');
    setUntilText(mode === 'edit' && current.until ? formatDmy(current.until) : '');
    setPanel({ mode, kind });
  }

  /** Aplica el panel: crea una plantilla nueva o cambia las fechas de la actual. */
  function applyPanel(week?: TemplatePeriod) {
    if (!panel) return;
    let period: TemplatePeriod;
    if (week) {
      period = week;
    } else {
      const from = parseDmy(fromText);
      const until = panel.kind === 'range' ? parseDmy(untilText) : null;
      if (!from || (panel.kind === 'range' && !until)) {
        Alert.alert('Fecha no válida', 'Usa DD/MM/AAAA.');
        return;
      }
      if (until && until < from) {
        Alert.alert('Fechas al revés', 'El fin es antes del inicio.');
        return;
      }
      period = { from, until };
    }
    const key = periodKey(period);
    const clash = tabs.find(t => periodKey(t.period) === key && (panel.mode === 'new' || t.id !== selectedId));
    if (clash) {
      Alert.alert('Ya existe', `Ya hay una plantilla ${periodLabel(period)}.`);
      return;
    }
    if (panel.mode === 'new') {
      // Empieza como copia de la que se estaba viendo, para retocarla
      const id = `nueva-${Date.now()}`;
      setTabs(prev => sortTabs([...prev, { id, period, slots: { ...slotTypes }, dirty: true }]));
      setSelectedId(id);
      setTimeout(() => tabsRef.current?.scrollToEnd({ animated: true }), 50);
    } else {
      updateSelected(t => ({ ...t, period }));
    }
    setPanel(null);
  }

  /** Las filas que quedarían guardadas con las pestañas actuales */
  function rowsFromTabs(list: Tab[]): Template[] {
    const rows: Template[] = [];
    for (const t of list) {
      const entries = Object.entries(t.slots);
      if (entries.length === 0) {
        // Con fechas y sin clases (vacaciones): fila marcadora. "Siempre" vacía no se guarda.
        if (t.period.from || t.period.until) {
          rows.push({ ...EMPTY_PERIOD_MARKER, valid_from: t.period.from, valid_until: t.period.until });
        }
        continue;
      }
      for (const [key, type] of entries) {
        const dashIdx = key.indexOf('-');
        rows.push({
          day_of_week: parseInt(key.substring(0, dashIdx)),
          class_time: key.substring(dashIdx + 1),
          class_type: type,
          valid_from: t.period.from,
          valid_until: t.period.until,
        });
      }
    }
    return rows;
  }

  /**
   * Guarda todas las pestañas (sustituye las plantillas del socio) y ajusta
   * las reservas de los próximos 60 días: se reserva lo que ahora toca y
   * antes no, y se cancela lo que antes tocaba y ahora no. Para cada día
   * cuenta la plantilla que manda ese día (templatePeriods.ts).
   */
  async function saveAll(list: Tab[] = tabs) {
    // Bloqueo duro: una plantilla que por sí sola supera el cupo del plan no
    // se guarda (el admin está creando el desajuste ahora mismo).
    if (userPlan) {
      for (const t of list) {
        const n = Object.keys(t.slots).length;
        if (n === 0) continue;
        const { mismatched, demand, totalLabel } = estimateTemplateFit(n, userPlan);
        if (mismatched) {
          setSelectedId(t.id);
          Alert.alert(
            'La plantilla no encaja con su plan',
            `${periodLabel(t.period)}: ${n} clase${n !== 1 ? 's' : ''}/semana (~${demand}), pero "${userPlan.name}" solo permite ${totalLabel}.`,
            [{ text: 'Entendido' }]
          );
          return;
        }
      }
    }

    try {
      setSaving(true);
      const user = await getCurrentUser();
      const adminId = user?.id;

      const before = templates;
      const after = rowsFromTabs(list);

      // Se sustituyen todas las plantillas del socio por las de las pestañas
      const { error: delError } = await supabase.from('booking_templates').delete().eq('user_id', userId);
      if (delError) throw delError;
      if (after.length > 0) {
        const { error: insertError } = await supabase
          .from('booking_templates')
          .insert(after.map(r => ({ ...r, user_id: userId, created_by: adminId })));
        if (insertError) throw insertError;
      }

      // Reservas de las clases de los próximos 60 días
      const until = new Date();
      until.setDate(until.getDate() + GRID_HORIZON_DAYS);
      const { data: existingClasses } = await supabase
        .from('classes')
        .select('id, class_date, class_time, class_type, max_spots')
        .gte('class_date', toDateStr(new Date()))
        .lte('class_date', toDateStr(until));

      let bookedCount = 0;
      let cancelledCount = 0;
      // Clases de la plantilla que no se han podido reservar por estar llenas
      const fullSkipped: string[] = [];

      if (existingClasses && existingClasses.length > 0) {
        const classIds = existingClasses.map(c => c.id);
        const [{ data: existingBookings }, { data: bajas }] = await Promise.all([
          supabase.from('bookings').select('id, class_id').eq('user_id', userId).in('class_id', classIds),
          // Baja puntual del socio en esa clase: no se le vuelve a apuntar
          supabase.from('booking_cancellations').select('class_id').eq('user_id', userId).in('class_id', classIds),
        ]);
        const bookingIdByClassId = new Map((existingBookings || []).map(b => [b.class_id, b.id as string]));
        const cancelledByMember = new Set((bajas || []).map(b => b.class_id));

        const nowMs = Date.now();
        const candidates = existingClasses.filter(cls =>
          coversClass(after, cls) && !bookingIdByClassId.has(cls.id) && !cancelledByMember.has(cls.id)
          // Las de hoy que ya han empezado no se reservan
          && new Date(`${cls.class_date}T${cls.class_time}`).getTime() > nowMs);

        // Aforo: las llenas se saltan y se avisa al admin
        const occupancy = new Map<string, number>();
        if (candidates.length > 0) {
          const { data: ocupadas } = await supabase.from('bookings').select('class_id').in('class_id', candidates.map(c => c.id));
          (ocupadas || []).forEach(b => occupancy.set(b.class_id, (occupancy.get(b.class_id) || 0) + 1));
        }
        const toBook = candidates.filter(cls => {
          if ((occupancy.get(cls.id) || 0) < cls.max_spots) return true;
          const d = new Date(cls.class_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
          fullSkipped.push(`${d} ${cls.class_time.slice(0, 5)}`);
          return false;
        });
        if (toBook.length > 0) {
          await supabase.from('bookings').insert(toBook.map(cls => ({ class_id: cls.id, user_id: userId })));
          bookedCount = toBook.length;
        }

        // Lo que antes tocaba por plantilla y ya no
        const toCancel = existingClasses.filter(cls =>
          bookingIdByClassId.has(cls.id) && coversClass(before, cls) && !coversClass(after, cls)
          && new Date(`${cls.class_date}T${cls.class_time}`).getTime() > nowMs);
        if (toCancel.length > 0) {
          await supabase.from('bookings').delete().in('id', toCancel.map(cls => bookingIdByClassId.get(cls.id)!));
          cancelledCount = toCancel.length;
          for (const cls of toCancel) {
            const formattedDate = new Date(cls.class_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            await createNotification({
              userId,
              type: 'booking_removed',
              title: 'Reserva cancelada',
              message: `Tu plantilla ha cambiado: se cancela ${cls.class_type} el ${formattedDate} a las ${cls.class_time.slice(0, 5)}.`,
              classId: cls.id,
            });
          }
        }
      }

      if (adminId) {
        await supabase.from('admin_actions').insert({
          admin_id: adminId,
          action_type: 'update_user_template',
          target_type: 'user',
          target_id: userId,
          details: {
            templates: list.map(t => `${periodLabel(t.period)}: ${Object.keys(t.slots).length}`),
            booked: bookedCount,
            cancelled: cancelledCount,
          },
        });
      }

      const extra = [
        fullSkipped.length > 0
          ? `Llenas, sin reservar: ${fullSkipped.slice(0, 5).join(', ')}${fullSkipped.length > 5 ? '…' : ''}.`
          : '',
        bookedCount > 0 ? `${bookedCount} reserva${bookedCount !== 1 ? 's' : ''} nueva${bookedCount !== 1 ? 's' : ''}.` : '',
        cancelledCount > 0 ? `${cancelledCount} cancelada${cancelledCount !== 1 ? 's' : ''}.` : '',
      ].filter(Boolean).join(' ');

      Alert.alert('Guardado', extra || undefined);
      const current = list.find(t => t.id === selectedId);
      await loadData(current ? periodKey(current.period) : undefined);
    } catch (error: any) {
      console.error('Error saving template:', error);
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    saveAll();
  }

  function handleDeletePeriod() {
    if (!selectedTab) return;
    const rest = tabs.filter(t => t.id !== selectedTab.id);
    const isSaved = periodsOf(templates).some(p => periodKey(p) === selectedTab.id);
    if (!isSaved) {
      // Nueva sin guardar: basta con quitarla
      setTabs(rest);
      setSelectedId(SIEMPRE_KEY);
      return;
    }
    Alert.alert(`¿Borrar ${periodLabel(selectedTab.period)}?`, 'Esos días vuelve a mandar la anterior.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: () => { setSelectedId(SIEMPRE_KEY); saveAll(rest); } },
    ]);
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  // Mientras carga se pinta la pantalla de verdad (cabecera y textos no
  // dependen de los datos) con los tipos y la rejilla en sombreado.
  if (!loading && !userInfo) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: moderateScale(16), color: Colors.danger }}>No se pudo cargar el usuario</Text>
      </View>
    );
  }

  const typeColorMap = classTypeColorMap(types);
  const currentPeriod = selectedTab?.period ?? { from: null, until: null };
  const slotCount = Object.keys(slotTypes).length;
  const chip = (selected: boolean) => ({
    paddingHorizontal: scale(14), paddingVertical: scale(8),
    borderRadius: scale(18), borderWidth: 1,
    backgroundColor: selected ? 'rgba(59,130,246,0.15)' : Colors.card,
    borderColor: selected ? Colors.blue500 : Colors.cardBorder,
  });
  const chipText = (selected: boolean) => ({
    fontSize: moderateScale(13), fontWeight: '700' as const,
    color: selected ? Colors.blue400 : Colors.textSecondary,
  });
  const dateInput = {
    flex: 1, fontSize: moderateScale(15), fontWeight: '600' as const, color: Colors.textPrimary,
    backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.inputBorder,
    borderRadius: Radius.sm, paddingHorizontal: scale(12), paddingVertical: 0, height: scale(42),
  };
  const grid = buildTemplateGrid(upcomingClasses, templates.filter(t => t.class_type !== EMPTY_PERIOD_MARKER.class_type));
  const DAYS = grid.days.map(value => ({ value, label: DAY_LABELS[value] }));

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
          <SpringPressable onPress={() => navigation.goBack()} style={{
            width: scale(40), height: scale(40),
            borderRadius: scale(20),
            backgroundColor: Colors.card,
            borderWidth: 1, borderColor: Colors.cardBorder,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </SpringPressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary }}>
              Plantilla de usuario
            </Text>
          </View>
        </Animated.View>

        {/* Plantillas: "Siempre" y las que tienen fechas */}
        <View style={{ paddingTop: scale(14) }}>
          <ScrollView ref={tabsRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: scale(20), gap: scale(8) }}>
            {tabs.map(t => {
              const sel = t.id === selectedTab?.id;
              return (
                <SpringPressable key={t.id} onPress={() => selectTab(t.id)}>
                  <View style={chip(sel)}>
                    {/* • = cambios sin guardar */}
                    <Text style={chipText(sel)}>{periodLabel(t.period)}{t.dirty ? ' •' : ''}</Text>
                  </View>
                </SpringPressable>
              );
            })}
            <SpringPressable onPress={() => openPanel('new')}>
              <View style={{ ...chip(false), borderStyle: 'dashed' }}>
                <Text style={chipText(false)}>+ Con fechas</Text>
              </View>
            </SpringPressable>
          </ScrollView>

          {!!(currentPeriod.from || currentPeriod.until) && !panel && (
            <View style={{ flexDirection: 'row', gap: scale(20), paddingHorizontal: scale(20), marginTop: scale(10) }}>
              <SpringPressable onPress={() => openPanel('edit')} style={{ paddingVertical: scale(6) }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.blue400 }}>Cambiar fechas</Text>
              </SpringPressable>
              <SpringPressable onPress={handleDeletePeriod} style={{ paddingVertical: scale(6) }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.danger }}>Borrar</Text>
              </SpringPressable>
            </View>
          )}

          {panel && (
            <View style={{
              marginHorizontal: scale(20), marginTop: scale(12), padding: scale(14), gap: scale(12),
              backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: Radius.md,
            }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                {(panel.mode === 'new' ? (['week', 'from', 'range'] as NewKind[]) : (['from', 'range'] as NewKind[])).map(k => (
                  <SpringPressable key={k} onPress={() => setPanel({ ...panel, kind: k })}>
                    <View style={chip(panel.kind === k)}>
                      <Text style={chipText(panel.kind === k)}>{k === 'week' ? 'Una semana' : k === 'from' ? 'Desde' : 'Entre fechas'}</Text>
                    </View>
                  </SpringPressable>
                ))}
              </View>

              {panel.kind === 'week' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scale(8) }}>
                  {upcomingWeeks(new Date(), 8).map(w => (
                    <SpringPressable key={periodKey(w)} onPress={() => applyPanel(w)}>
                      <View style={chip(false)}>
                        <Text style={chipText(false)}>{periodLabel(w)}</Text>
                      </View>
                    </SpringPressable>
                  ))}
                </ScrollView>
              ) : (
                <View style={{ flexDirection: 'row', gap: scale(8) }}>
                  <TextInput value={fromText} onChangeText={setFromText} placeholder="DD/MM/AAAA" maxLength={10}
                    placeholderTextColor={Colors.placeholder} keyboardType="numbers-and-punctuation" style={dateInput} />
                  {panel.kind === 'range' && (
                    <TextInput value={untilText} onChangeText={setUntilText} placeholder="DD/MM/AAAA" maxLength={10}
                      placeholderTextColor={Colors.placeholder} keyboardType="numbers-and-punctuation" style={dateInput} />
                  )}
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: scale(20) }}>
                <SpringPressable onPress={() => setPanel(null)}>
                  <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textMuted }}>Cancelar</Text>
                </SpringPressable>
                {panel.kind !== 'week' && (
                  <SpringPressable onPress={() => applyPanel()}>
                    <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.blue400 }}>
                      {panel.mode === 'new' ? 'Crear' : 'Aplicar'}
                    </Text>
                  </SpringPressable>
                )}
              </View>
            </View>
          )}
        </View>

        {/* Tipo de clase (oculto con el panel de fechas abierto: no cabe todo) */}
        {!panel && (
        <Animated.View
          entering={FadeInDown.duration(350).delay(80).springify()}
          style={{ paddingHorizontal: scale(20), paddingTop: scale(16), paddingBottom: scale(8) }}
        >
          <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
            Tipo de clase (pincel activo)
          </Text>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
            Elige un tipo y toca las celdas.
          </Text>
          {types.length === 0 ? (
            <SkeletonGroup style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
              {[scale(96), scale(84), scale(110)].map((w, i) => (
                <Bone key={i} width={w} height={scale(40)} radius={scale(20)} />
              ))}
            </SkeletonGroup>
          ) : (
            <ClassTypeSelector types={types} onTypesChange={setTypes} selected={selectedClassType} onSelect={setSelectedClassType} />
          )}
        </Animated.View>
        )}

        {/* Grid */}
        <ScrollView style={{ flex: 1, paddingHorizontal: scale(20), paddingTop: scale(16) }}>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(14) }}>
            Las celdas apagadas no tienen clase.
          </Text>

          {loading ? (
            <SkeletonGroup style={{
              borderRadius: Radius.lg, overflow: 'hidden', marginBottom: scale(20),
              borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: 'rgba(255,255,255,0.03)',
            }}>
              {[0, 1, 2, 3, 4, 5].map(r => (
                <View key={r} style={{ flexDirection: 'row', borderBottomWidth: r < 5 ? 1 : 0, borderBottomColor: Colors.cardBorder }}>
                  <View style={{ width: scale(60), padding: scale(12), alignItems: 'center', borderRightWidth: 1, borderRightColor: Colors.cardBorder }}>
                    <Bone width={scale(34)} height={Math.round(moderateScale(11) * 1.25)} />
                  </View>
                  {[0, 1, 2, 3, 4].map(c => (
                    <View key={c} style={{ flex: 1, padding: scale(6), minHeight: scale(44), justifyContent: 'center' }}>
                      {r > 0 && <Bone height={scale(28)} radius={scale(8)} />}
                    </View>
                  ))}
                </View>
              ))}
            </SkeletonGroup>
          ) : (
          <Animated.View
            entering={FadeInDown.duration(400).delay(250).springify()}
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderRadius: Radius.lg,
              overflow: 'hidden',
              borderWidth: 1, borderColor: Colors.cardBorder,
              marginBottom: scale(20),
            }}
          >
            {/* Header row */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }}>
              <View style={{
                width: scale(60),
                padding: scale(12),
                justifyContent: 'center', alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRightWidth: 1, borderRightColor: Colors.cardBorder,
              }}>
                <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textMuted }}>Hora</Text>
              </View>
              {DAYS.map(day => (
                <View key={day.value} style={{
                  flex: 1,
                  padding: scale(12),
                  justifyContent: 'center', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}>
                  <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.textSecondary }}>
                    {day.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Time rows */}
            {grid.times.map((time, rowIdx) => (
              <Animated.View
                key={time}
                entering={FadeInDown.duration(300).delay(300 + Math.min(rowIdx, 8) * 50).springify()}
                style={{ flexDirection: 'row', borderBottomWidth: rowIdx < grid.times.length - 1 ? 1 : 0, borderBottomColor: Colors.cardBorder }}
              >
                <View style={{
                  width: scale(60),
                  padding: scale(12),
                  justifyContent: 'center', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.02)',
                  borderRightWidth: 1, borderRightColor: Colors.cardBorder,
                }}>
                  <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textMuted }}>
                    {time.slice(0, 5)}
                  </Text>
                </View>
                {DAYS.map(day => {
                  const key = `${day.value}-${time}`;
                  const slotType = slotTypes[key];

                  return (
                    <SlotCell
                      key={key}
                      color={slotType ? (typeColorMap[slotType] ?? DEFAULT_CLASS_TYPE_COLOR) : null}
                      hasClass={grid.withClasses.has(key)}
                      onPress={() => toggleSlot(day.value, time)}
                    />
                  );
                })}
              </Animated.View>
            ))}
          </Animated.View>
          )}
        </ScrollView>

        {/* Footer */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(500).springify()}
          style={{
            paddingHorizontal: scale(20),
            paddingTop: scale(16),
            paddingBottom: insets.bottom + scale(16),
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}
        >
          <View style={{ marginBottom: scale(12) }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '600', color: Colors.textPrimary }}>
              {slotCount} clase{slotCount !== 1 ? 's' : ''}/semana
            </Text>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }}>
              Se aplican solas cada noche
            </Text>
          </View>

          <Button
            label={anyDirty ? 'Guardar' : 'Guardado'}
            onPress={() => handleSave()}
            loading={saving}
            disabled={saving || loading || !anyDirty}
            variant="primary"
            size="lg"
            icon={<CheckIcon size={scale(18)} color="#fff" strokeWidth={2.5} />}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function SlotCell({ color, hasClass, onPress }: { color: string | null; hasClass: boolean; onPress: () => void }) {
  const isSelected = color !== null;
  const s = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    s.value = withSpring(isSelected ? 1 : 0, { damping: 10, stiffness: 200 });
  }, [isSelected]);

  const checkStyle = useAnimatedStyle(() => ({
    opacity: s.value,
    transform: [{ scale: s.value }],
  }));

  return (
    <SpringPressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: scale(44),
        justifyContent: 'center', alignItems: 'center',
        borderRightWidth: 1, borderRightColor: Colors.cardBorder,
        backgroundColor: isSelected ? `${color}33` : hasClass ? 'transparent' : 'rgba(0,0,0,0.25)',
      }}
    >
      {/* El Pressable interior de SpringPressable no centra: la caja fija
          de 24 centra la rayita de "sin clase" y el check superpuestos */}
      <View style={{ width: scale(24), height: scale(24), alignItems: 'center', justifyContent: 'center' }}>
        {!isSelected && !hasClass && (
          <View style={{ width: scale(10), height: 1, backgroundColor: Colors.textMuted, opacity: 0.4 }} />
        )}
        <Animated.View style={[checkStyle, {
          position: 'absolute',
          width: scale(24), height: scale(24),
          borderRadius: scale(12),
          backgroundColor: isSelected ? color! : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }]}>
          <Text style={{ fontSize: moderateScale(13), color: '#fff', fontWeight: '700' }}>✓</Text>
        </Animated.View>
      </View>
    </SpringPressable>
  );
}
