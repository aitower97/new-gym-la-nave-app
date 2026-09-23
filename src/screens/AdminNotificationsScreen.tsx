import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ComponentType, useState, useEffect } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, BellIcon, CalendarIcon, CheckIcon, ChevronRightIcon, ClockIcon, CreditCardIcon, EditIcon, HourglassIcon, PlusIcon, SearchIcon, ShieldIcon, TrashIcon, UserIcon } from '../components/Icons';
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
  plan_id: string | null;
  plan_assigned_at: string | null;
  created_at: string;
}

interface PlanOption {
  id: string;
  name: string;
}

type TriggerKind = 'manual' | 'inactivity' | 'payment_due' | 'payment_blocked' | 'birthday' | 'signup_anniversary' | 'bono_expiring'
  | 'no_plan_assigned' | 'no_booking_template' | 'no_avatar' | 'no_workout_logs' | 'quota_low';

interface NotificationTemplate {
  id: string;
  key: string | null;
  trigger_kind: TriggerKind;
  offset_days: number | null;
  enabled: boolean;
  title: string;
  message: string;
  icon_key: string;
}

const TRIGGER_LABELS: Record<TriggerKind, string> = {
  payment_due: 'Cuota pendiente (aviso)',
  payment_blocked: 'Reservas bloqueadas (corte)',
  inactivity: 'Recordatorio de inactividad',
  signup_anniversary: 'Aniversario de alta',
  birthday: 'Cumpleaños',
  bono_expiring: 'Bono a punto de caducar',
  no_plan_assigned: 'Sin plan asignado',
  no_booking_template: 'Sin plantilla de reservas',
  no_avatar: 'Sin foto de perfil',
  no_workout_logs: 'Sin registrar entrenamientos',
  quota_low: 'Cupo casi agotado',
  manual: 'Manual',
};

const OFFSET_DAYS_LABEL: Partial<Record<TriggerKind, string>> = {
  inactivity: 'Días sin asistir para avisar',
  payment_blocked: 'Día del periodo en que se bloquean reservas',
  signup_anniversary: 'Días desde el alta (una sola vez)',
  birthday: 'Días antes del cumpleaños (cada año)',
  bono_expiring: 'Días antes de que caduque el bono',
  no_plan_assigned: 'Días desde el alta sin plan (una sola vez)',
  no_booking_template: 'Días desde el plan sin plantilla fija (una sola vez)',
  no_avatar: 'Días desde el alta sin foto (una sola vez)',
  no_workout_logs: 'Días sin registrar un entreno',
  quota_low: 'Avisar cuando queden ≤ N clases',
};

/** Tipos de evento que el admin puede crear él mismo — constructor de
 * condiciones seguro (campo de una lista + número: de días, o de clases
 * restantes en quota_low), nunca texto libre ejecutado contra la base de
 * datos. payment_due/payment_blocked se quedan fuera: están acoplados al
 * ciclo de facturación real. */
const CREATABLE_EVENT_TYPES: { kind: TriggerKind; label: string; hint: string }[] = [
  { kind: 'inactivity', label: 'Inactividad', hint: 'Días sin que el socio venga a una clase' },
  { kind: 'signup_anniversary', label: 'Aniversario de alta', hint: 'Días desde que se registró — una sola vez' },
  { kind: 'birthday', label: 'Cumpleaños', hint: 'Días antes de su cumpleaños — se repite cada año' },
  { kind: 'bono_expiring', label: 'Bono a punto de caducar', hint: 'Días antes de que caduque un bono (open box, etc.)' },
  { kind: 'no_plan_assigned', label: 'Sin plan asignado', hint: 'Se registró pero nadie le ha asignado un plan todavía' },
  { kind: 'no_booking_template', label: 'Sin plantilla de reservas', hint: 'Tiene plan pero no ha configurado su rutina semanal' },
  { kind: 'no_avatar', label: 'Sin foto de perfil', hint: 'No ha puesto foto — ya existe un aviso parecido dentro de la app' },
  { kind: 'no_workout_logs', label: 'Sin registrar entrenamientos', hint: 'Lleva tiempo sin apuntar ningún entreno en su diario' },
  { kind: 'quota_low', label: 'Cupo casi agotado', hint: 'Le quedan pocas clases en su plan o bono actual' },
];

const ICON_OPTIONS: { key: string; Icon: ComponentType<{ size: number; color: string; strokeWidth: number }>; label: string }[] = [
  { key: 'bell', Icon: BellIcon, label: 'General' },
  { key: 'calendar', Icon: CalendarIcon, label: 'Fecha' },
  { key: 'hourglass', Icon: HourglassIcon, label: 'Caducidad' },
  { key: 'clock', Icon: ClockIcon, label: 'Recordatorio' },
  { key: 'credit-card', Icon: CreditCardIcon, label: 'Pago' },
  { key: 'barbell', Icon: BarbellIcon, label: 'Entreno' },
  { key: 'shield', Icon: ShieldIcon, label: 'Importante' },
  { key: 'user', Icon: UserIcon, label: 'Personal' },
];

const PLACEHOLDER_HINT = 'Puedes usar {{nombre}}, {{apodo}} y {{plan}} — se sustituyen por los datos de cada socio.';

function IconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginBottom: scale(10) }}>
      {ICON_OPTIONS.map(({ key, Icon }) => {
        const active = value === key;
        return (
          <SpringPressable
            key={key}
            onPress={() => onChange(key)}
            style={{
              width: scale(36), height: scale(36), borderRadius: Radius.sm,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1,
              backgroundColor: active ? 'rgba(59,130,246,0.15)' : Colors.background,
              borderColor: active ? Colors.blue500 : Colors.cardBorder,
            }}
          >
            <Icon size={scale(16)} color={active ? Colors.blue500 : Colors.textMuted} strokeWidth={2} />
          </SpringPressable>
        );
      })}
    </View>
  );
}

/**
 * Desplegable en vez de una fila de chips: con solo 4 tipos hoy ya se nota
 * mejor como lista, y si el catálogo crece (CREATABLE_EVENT_TYPES es
 * fácilmente ampliable) una fila de chips dejaría de caber.
 */
function EventTypeDropdown({ value, onChange }: { value: TriggerKind; onChange: (k: TriggerKind) => void }) {
  const [open, setOpen] = useState(false);
  const selected = CREATABLE_EVENT_TYPES.find(e => e.kind === value);

  return (
    <>
      <SpringPressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
          borderRadius: Radius.sm, paddingHorizontal: scale(14), paddingVertical: scale(12),
          marginBottom: scale(6),
        }}
      >
        <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
          {selected?.label}
        </Text>
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <ChevronRightIcon size={scale(15)} color={Colors.textMuted} strokeWidth={2} />
        </View>
      </SpringPressable>
      <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
        {selected?.hint}
      </Text>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: scale(24) }}
          onPress={() => setOpen(false)}
        >
          <View style={{
            width: '100%', maxWidth: 340, maxHeight: '70%',
            backgroundColor: '#0d1929',
            borderRadius: Radius.xl,
            borderWidth: 1, borderColor: Colors.cardBorder,
          }}>
            <ScrollView style={{ padding: scale(8) }} showsVerticalScrollIndicator={CREATABLE_EVENT_TYPES.length > 5}>
              {CREATABLE_EVENT_TYPES.map(({ kind, label, hint }) => {
                const active = value === kind;
                return (
                  <SpringPressable
                    key={kind}
                    onPress={() => { onChange(kind); setOpen(false); }}
                    style={{
                      padding: scale(14), borderRadius: Radius.sm,
                      backgroundColor: active ? 'rgba(59,130,246,0.15)' : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: active ? Colors.blue500 : Colors.textPrimary }}>
                      {label}
                    </Text>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>
                      {hint}
                    </Text>
                  </SpringPressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// Se disparan como efecto de una acción del admin (cancelar/editar una clase
// o reserva), con datos concretos de ese evento interpolados en el momento —
// no son plantillas reutilizables, solo referencia de qué existe y cuándo salta.
const READONLY_NOTIFICATIONS = [
  { title: 'Clase cancelada', trigger: 'Al cancelar una clase — individual o en bloque' },
  { title: 'Horario cancelado', trigger: 'Al cancelar una clase recurrente completa' },
  { title: 'Clase modificada', trigger: 'Al editar fecha, hora o tipo de una clase con reservas' },
  { title: 'Reserva cancelada', trigger: 'Al quitarle una reserva a un socio, o al cambiar su plantilla fija' },
  { title: 'Reserva confirmada', trigger: 'Al reservarle una clase a un socio desde el panel' },
];

export default function AdminNotificationsScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [planFilter, setPlanFilter] = useState<string | null>(null);
  const [inactiveDays, setInactiveDays] = useState('15');
  const [applyingInactiveFilter, setApplyingInactiveFilter] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const [newTplTitle, setNewTplTitle] = useState('');
  const [newTplMessage, setNewTplMessage] = useState('');
  const [newTplIcon, setNewTplIcon] = useState('bell');
  const [creatingTpl, setCreatingTpl] = useState(false);

  const [newRuleKind, setNewRuleKind] = useState<TriggerKind>('inactivity');
  const [newRuleOffsetDays, setNewRuleOffsetDays] = useState('15');
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleMessage, setNewRuleMessage] = useState('');
  const [newRuleIcon, setNewRuleIcon] = useState('bell');
  const [creatingRule, setCreatingRule] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [showNewRule, setShowNewRule] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      const [usersRes, plansRes, templatesRes] = await Promise.all([
        supabase.from('profiles').select('id, username, full_name, email, avatar_url, plan_id, plan_assigned_at, created_at').eq('role', 'user').order('full_name'),
        supabase.from('membership_plans').select('id, name').eq('is_active', true).order('name'),
        supabase.from('notification_templates').select('*'),
      ]);
      if (usersRes.error) throw usersRes.error;
      if (templatesRes.error) throw templatesRes.error;
      setUsers(usersRes.data || []);
      setPlans(plansRes.data || []);
      setTemplates((templatesRes.data || []) as NotificationTemplate[]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  function updateTemplateLocal(updated: NotificationTemplate) {
    setTemplates(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  }

  function removeTemplateLocal(id: string) {
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  function useTemplate(t: NotificationTemplate) {
    // Se copian los placeholders tal cual — createNotificationsForUsers los
    // interpola por destinatario al enviar, ya no hace falta quitarlos aquí.
    setTitle(t.title);
    setMessage(t.message);
  }

  async function createTemplate() {
    if (!newTplTitle.trim() || !newTplMessage.trim()) return;
    try {
      setCreatingTpl(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('notification_templates')
        .insert({ trigger_kind: 'manual', title: newTplTitle.trim(), message: newTplMessage.trim(), icon_key: newTplIcon, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      setTemplates(prev => [...prev, data as NotificationTemplate]);
      setNewTplTitle('');
      setNewTplMessage('');
      setNewTplIcon('bell');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setCreatingTpl(false);
    }
  }

  async function createRule() {
    const days = parseInt(newRuleOffsetDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      Alert.alert('Valor no válido', 'Los días deben ser un número mayor que 0.');
      return;
    }
    if (!newRuleTitle.trim() || !newRuleMessage.trim()) return;
    try {
      setCreatingRule(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('notification_templates')
        .insert({
          trigger_kind: newRuleKind,
          offset_days: days,
          title: newRuleTitle.trim(),
          message: newRuleMessage.trim(),
          icon_key: newRuleIcon,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      setTemplates(prev => [...prev, data as NotificationTemplate]);
      setNewRuleTitle('');
      setNewRuleMessage('');
      setNewRuleOffsetDays('15');
      setNewRuleIcon('bell');
      setShowNewRule(false);
      setSelectedRuleId(data.id);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setCreatingRule(false);
    }
  }

  function deleteTemplate(t: NotificationTemplate) {
    Alert.alert('Borrar', `¿Borrar "${t.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.from('notification_templates').delete().eq('id', t.id);
            if (error) throw error;
            removeTemplateLocal(t.id);
            if (selectedRuleId === t.id) setSelectedRuleId(null);
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  }

  function applyPlanFilter(planId: string) {
    const next = planFilter === planId ? null : planId;
    setPlanFilter(next);
    if (next) {
      setSelectedUsers(new Set(users.filter(u => u.plan_id === next).map(u => u.id)));
      setSendToAll(false);
    } else {
      setSelectedUsers(new Set());
    }
  }

  async function applyInactiveFilter() {
    const days = parseInt(inactiveDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      Alert.alert('Valor no válido', 'Introduce un número de días mayor que 0.');
      return;
    }
    try {
      setApplyingInactiveFilter(true);
      const cutoff = Date.now() - days * 86_400_000;
      const pool = planFilter ? users.filter(u => u.plan_id === planFilter) : users;

      const results = await Promise.all(pool.map(async (u) => {
        const { data: lastAttendance } = await supabase.rpc('last_attendance', { p_user_id: u.id });
        const fallback = u.plan_assigned_at || u.created_at;
        const reference = lastAttendance ? new Date(lastAttendance).getTime() : new Date(fallback).getTime();
        return reference < cutoff ? u.id : null;
      }));

      const matchIds = results.filter((id): id is string => id !== null);
      setSelectedUsers(new Set(matchIds));
      setSendToAll(false);
      if (matchIds.length === 0) Alert.alert('Sin resultados', 'Nadie cumple ese criterio ahora mismo.');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setApplyingInactiveFilter(false);
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

  const automatedTemplates = templates.filter(t => t.trigger_kind !== 'manual');
  const manualTemplates = templates.filter(t => t.trigger_kind === 'manual');

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Notificaciones"
          subtitle="Automáticas, plantillas y envío a socios"
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
            {/* ── Automáticas ─────────────────────────────────────────── */}
            <SectionTitle>Automáticas</SectionTitle>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginBottom: scale(8) }}>
              {automatedTemplates.map((t) => {
                const isSelected = selectedRuleId === t.id;
                const TplIcon = ICON_OPTIONS.find(o => o.key === t.icon_key)?.Icon ?? BellIcon;
                return (
                  <SpringPressable
                    key={t.id}
                    onPress={() => { setSelectedRuleId(isSelected ? null : t.id); setShowNewRule(false); }}
                    onLongPress={() => deleteTemplate(t)}
                    style={{
                      borderRadius: Radius.sm, borderWidth: 1,
                      backgroundColor: isSelected ? 'rgba(59,130,246,0.2)' : Colors.card,
                      borderColor: isSelected ? Colors.blue500 : Colors.cardBorder,
                      opacity: t.enabled ? 1 : 0.5,
                    }}
                  >
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: scale(8),
                      paddingHorizontal: scale(14), paddingVertical: scale(10),
                    }}>
                      <TplIcon size={scale(14)} color={isSelected ? Colors.blue500 : Colors.textMuted} strokeWidth={2} />
                      <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: isSelected ? Colors.blue500 : Colors.textMuted }}>
                        {t.title}
                      </Text>
                    </View>
                  </SpringPressable>
                );
              })}
              <SpringPressable
                onPress={() => { setShowNewRule(v => !v); setSelectedRuleId(null); }}
                style={{
                  paddingHorizontal: scale(14), paddingVertical: scale(10),
                  borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed',
                  borderColor: showNewRule ? Colors.blue500 : Colors.cardBorder,
                  backgroundColor: Colors.card,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <PlusIcon size={scale(16)} color={showNewRule ? Colors.blue500 : Colors.textMuted} />
              </SpringPressable>
            </View>
            <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(14) }}>
              Toca una regla para editarla · mantén pulsado para borrarla
            </Text>

            {selectedRuleId && (
              <Animated.View entering={FadeInDown.duration(250).springify()}>
                <AutomatedTemplateCard
                  template={automatedTemplates.find(t => t.id === selectedRuleId)!}
                  onSaved={updateTemplateLocal}
                />
              </Animated.View>
            )}

            {showNewRule && (
              <Animated.View entering={FadeInDown.duration(250).springify()} style={{
                backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.blue500,
                borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12),
              }}>
                <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(8) }}>
                  Nueva regla automática
                </Text>
                <EventTypeDropdown value={newRuleKind} onChange={setNewRuleKind} />

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(10) }}>
                  <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, flex: 1 }}>
                    {OFFSET_DAYS_LABEL[newRuleKind]}
                  </Text>
                  <TextInput
                    value={newRuleOffsetDays}
                    onChangeText={(t) => setNewRuleOffsetDays(t.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    style={{
                      width: scale(50), textAlign: 'center', fontSize: moderateScale(14), fontWeight: '700',
                      color: Colors.textPrimary, backgroundColor: Colors.background, borderWidth: 1,
                      borderColor: Colors.cardBorder, borderRadius: Radius.sm, padding: scale(8),
                    }}
                  />
                </View>

                <TextInput
                  value={newRuleTitle}
                  onChangeText={setNewRuleTitle}
                  placeholder="Título"
                  placeholderTextColor={Colors.placeholder}
                  maxLength={80}
                  style={{
                    fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary,
                    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                    borderRadius: Radius.sm, padding: scale(10), marginBottom: scale(8),
                  }}
                />
                <TextInput
                  value={newRuleMessage}
                  onChangeText={setNewRuleMessage}
                  placeholder="Mensaje"
                  placeholderTextColor={Colors.placeholder}
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                  style={{
                    fontSize: moderateScale(13), color: Colors.textPrimary,
                    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                    borderRadius: Radius.sm, padding: scale(10), minHeight: scale(70),
                    textAlignVertical: 'top', marginBottom: scale(6),
                  }}
                />
                <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
                  {PLACEHOLDER_HINT}
                </Text>

                <IconPicker value={newRuleIcon} onChange={setNewRuleIcon} />

                <Button
                  label="Crear regla"
                  onPress={createRule}
                  loading={creatingRule}
                  disabled={creatingRule || !newRuleTitle.trim() || !newRuleMessage.trim()}
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                />
              </Animated.View>
            )}

            {/* ── Plantillas del admin ────────────────────────────────── */}
            <SectionTitle style={{ marginTop: scale(28) }}>Tus plantillas</SectionTitle>
            {manualTemplates.length === 0 && (
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(12) }}>
                Aún no has creado ninguna. Guarda una abajo para reutilizarla más adelante.
              </Text>
            )}
            {manualTemplates.map((t, i) => (
              <Animated.View key={t.id} entering={FadeInDown.duration(300).delay(i * 40).springify()}>
                <ManualTemplateCard
                  template={t}
                  onSaved={updateTemplateLocal}
                  onDeleted={() => deleteTemplate(t)}
                  onUse={() => useTemplate(t)}
                />
              </Animated.View>
            ))}

            <View style={{
              backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
              borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12),
            }}>
              <TextInput
                value={newTplTitle}
                onChangeText={setNewTplTitle}
                placeholder="Título de la nueva plantilla"
                placeholderTextColor={Colors.placeholder}
                maxLength={80}
                style={{
                  fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary,
                  backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.sm, padding: scale(10), marginBottom: scale(8),
                }}
              />
              <TextInput
                value={newTplMessage}
                onChangeText={setNewTplMessage}
                placeholder="Mensaje"
                placeholderTextColor={Colors.placeholder}
                multiline
                numberOfLines={3}
                maxLength={300}
                style={{
                  fontSize: moderateScale(13), color: Colors.textPrimary,
                  backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.sm, padding: scale(10), minHeight: scale(70),
                  textAlignVertical: 'top', marginBottom: scale(6),
                }}
              />
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
                {PLACEHOLDER_HINT}
              </Text>
              <IconPicker value={newTplIcon} onChange={setNewTplIcon} />
              <Button
                label="Guardar plantilla"
                onPress={createTemplate}
                loading={creatingTpl}
                disabled={creatingTpl || !newTplTitle.trim() || !newTplMessage.trim()}
                variant="outline"
                size="sm"
                fullWidth={false}
              />
            </View>

            {/* ── Referencia de solo lectura ──────────────────────────── */}
            <SectionTitle style={{ marginTop: scale(28) }}>Automáticas por evento (referencia)</SectionTitle>
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(12) }}>
              Se disparan solas al cancelar/editar una clase o reserva, con los datos de ese momento. No se editan aquí.
            </Text>
            {READONLY_NOTIFICATIONS.map((n) => (
              <View key={n.title} style={{
                backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.cardBorder,
                borderRadius: Radius.md, padding: scale(12), marginBottom: scale(8),
              }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary }}>{n.title}</Text>
                <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }}>{n.trigger}</Text>
              </View>
            ))}

            {/* ── Envío manual ─────────────────────────────────────────── */}
            <SectionTitle style={{ marginTop: scale(28) }}>Enviar notificación</SectionTitle>

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
                  onPress={() => { setSendToAll(true); setPlanFilter(null); }}
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
                {plans.length > 0 && (
                  <View style={{ marginBottom: scale(10) }}>
                    <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(6) }}>
                      Filtrar por plan
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                      {plans.map((p) => {
                        const active = planFilter === p.id;
                        return (
                          <SpringPressable
                            key={p.id}
                            onPress={() => applyPlanFilter(p.id)}
                            style={{
                              paddingVertical: scale(8), paddingHorizontal: scale(12),
                              borderRadius: Radius.full, borderWidth: 1,
                              backgroundColor: active ? 'rgba(59,130,246,0.15)' : Colors.card,
                              borderColor: active ? Colors.blue500 : Colors.cardBorder,
                            }}
                          >
                            <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: active ? Colors.blue500 : Colors.textMuted }}>
                              {p.name}
                            </Text>
                          </SpringPressable>
                        );
                      })}
                    </View>
                  </View>
                )}

                <View style={{ marginBottom: scale(14) }}>
                  <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(6) }}>
                    Filtrar por inactividad
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary }}>Sin asistir ≥</Text>
                    <TextInput
                      value={inactiveDays}
                      onChangeText={(t) => setInactiveDays(t.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      style={{
                        width: scale(50), textAlign: 'center', fontSize: moderateScale(14), fontWeight: '700',
                        color: Colors.textPrimary, backgroundColor: Colors.card, borderWidth: 1,
                        borderColor: Colors.cardBorder, borderRadius: Radius.sm, padding: scale(8),
                      }}
                    />
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary }}>días</Text>
                    <View style={{ flex: 1 }} />
                    <Button
                      label={applyingInactiveFilter ? '...' : 'Aplicar'}
                      onPress={applyInactiveFilter}
                      loading={applyingInactiveFilter}
                      disabled={applyingInactiveFilter}
                      variant="outline"
                      size="sm"
                      fullWidth={false}
                    />
                  </View>
                </View>

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

function SectionTitle({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text style={[{ fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(12) }, style]}>
      {children}
    </Text>
  );
}

function AutomatedTemplateCard({ template, onSaved }: { template: NotificationTemplate; onSaved: (t: NotificationTemplate) => void }) {
  const [enabled, setEnabled] = useState(template.enabled);
  const [tplTitle, setTplTitle] = useState(template.title);
  const [tplMessage, setTplMessage] = useState(template.message);
  const [offsetDays, setOffsetDays] = useState(template.offset_days != null ? String(template.offset_days) : '');
  const [iconKey, setIconKey] = useState(template.icon_key);
  const [saving, setSaving] = useState(false);

  const dirty = enabled !== template.enabled
    || tplTitle !== template.title
    || tplMessage !== template.message
    || iconKey !== template.icon_key
    || offsetDays !== (template.offset_days != null ? String(template.offset_days) : '');

  async function save() {
    const parsedOffset = template.offset_days != null ? parseInt(offsetDays, 10) : null;
    if (template.offset_days != null && (!Number.isFinite(parsedOffset) || (parsedOffset as number) <= 0)) {
      Alert.alert('Valor no válido', 'Los días deben ser un número mayor que 0.');
      return;
    }
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('notification_templates')
        .update({
          enabled,
          title: tplTitle.trim(),
          message: tplMessage.trim(),
          offset_days: parsedOffset,
          icon_key: iconKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id)
        .select()
        .single();
      if (error) throw error;
      onSaved(data as NotificationTemplate);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: scale(10) }}>
        <Text style={{ flex: 1, fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {TRIGGER_LABELS[template.trigger_kind]}
        </Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: Colors.cardBorder, true: Colors.blue500 }} thumbColor="#fff" />
      </View>

      <TextInput
        value={tplTitle}
        onChangeText={setTplTitle}
        placeholder="Título"
        placeholderTextColor={Colors.placeholder}
        maxLength={80}
        style={{
          fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary,
          backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
          borderRadius: Radius.sm, padding: scale(10), marginBottom: scale(8),
        }}
      />
      <TextInput
        value={tplMessage}
        onChangeText={setTplMessage}
        placeholder="Mensaje"
        placeholderTextColor={Colors.placeholder}
        multiline
        numberOfLines={3}
        maxLength={300}
        style={{
          fontSize: moderateScale(13), color: Colors.textPrimary,
          backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
          borderRadius: Radius.sm, padding: scale(10), minHeight: scale(70),
          textAlignVertical: 'top', marginBottom: scale(6),
        }}
      />
      <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
        {PLACEHOLDER_HINT}
      </Text>

      {template.offset_days != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(10) }}>
          <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, flex: 1 }}>
            {OFFSET_DAYS_LABEL[template.trigger_kind]}
          </Text>
          <TextInput
            value={offsetDays}
            onChangeText={(t) => setOffsetDays(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            style={{
              width: scale(50), textAlign: 'center', fontSize: moderateScale(14), fontWeight: '700',
              color: Colors.textPrimary, backgroundColor: Colors.background, borderWidth: 1,
              borderColor: Colors.cardBorder, borderRadius: Radius.sm, padding: scale(8),
            }}
          />
        </View>
      )}

      <IconPicker value={iconKey} onChange={setIconKey} />

      {dirty && (
        <Button label="Guardar" onPress={save} loading={saving} disabled={saving} variant="outline" size="sm" fullWidth={false} />
      )}
    </View>
  );
}

function ManualTemplateCard({
  template, onSaved, onDeleted, onUse,
}: {
  template: NotificationTemplate;
  onSaved: (t: NotificationTemplate) => void;
  onDeleted: () => void;
  onUse: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tplTitle, setTplTitle] = useState(template.title);
  const [tplMessage, setTplMessage] = useState(template.message);
  const [iconKey, setIconKey] = useState(template.icon_key);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!tplTitle.trim() || !tplMessage.trim()) return;
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('notification_templates')
        .update({ title: tplTitle.trim(), message: tplMessage.trim(), icon_key: iconKey, updated_at: new Date().toISOString() })
        .eq('id', template.id)
        .select()
        .single();
      if (error) throw error;
      onSaved(data as NotificationTemplate);
      setEditing(false);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  const TemplateIcon = ICON_OPTIONS.find(o => o.key === template.icon_key)?.Icon ?? BellIcon;

  if (editing) {
    return (
      <View style={{ backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.blue500, borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12) }}>
        <TextInput
          value={tplTitle}
          onChangeText={setTplTitle}
          maxLength={80}
          style={{
            fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary,
            backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
            borderRadius: Radius.sm, padding: scale(10), marginBottom: scale(8),
          }}
        />
        <TextInput
          value={tplMessage}
          onChangeText={setTplMessage}
          multiline
          numberOfLines={3}
          maxLength={300}
          style={{
            fontSize: moderateScale(13), color: Colors.textPrimary,
            backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.cardBorder,
            borderRadius: Radius.sm, padding: scale(10), minHeight: scale(70),
            textAlignVertical: 'top', marginBottom: scale(6),
          }}
        />
        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(10) }}>
          {PLACEHOLDER_HINT}
        </Text>
        <IconPicker value={iconKey} onChange={setIconKey} />
        <View style={{ flexDirection: 'row', gap: scale(8) }}>
          <Button label="Guardar" onPress={save} loading={saving} disabled={saving} variant="outline" size="sm" fullWidth={false} />
          <Button label="Cancelar" onPress={() => setEditing(false)} variant="ghost" size="sm" fullWidth={false} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(4) }}>
        <TemplateIcon size={scale(14)} color={Colors.textMuted} strokeWidth={2} />
        <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }}>{template.title}</Text>
      </View>
      <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(10) }} numberOfLines={2}>{template.message}</Text>
      <View style={{ flexDirection: 'row', gap: scale(16) }}>
        <SpringPressable onPress={onUse} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
          <BellIcon size={scale(14)} color={Colors.blue500} strokeWidth={2} />
          <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue500 }}>Usar</Text>
        </SpringPressable>
        <SpringPressable onPress={() => setEditing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
          <EditIcon size={scale(14)} color={Colors.textMuted} strokeWidth={2} />
          <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted }}>Editar</Text>
        </SpringPressable>
        <SpringPressable onPress={onDeleted} style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4) }}>
          <TrashIcon size={scale(14)} color={Colors.danger} strokeWidth={2} />
          <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.danger }}>Borrar</Text>
        </SpringPressable>
      </View>
    </View>
  );
}
