import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { CheckIcon, ChevronRightIcon, MailIcon, SearchIcon, UsersIcon, XIcon } from '../Icons';
import { Avatar, Button, SpringPressable } from '../ui';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { createNotificationsForUsers } from '../../utils/notifications';
import { interpolateTemplate } from '../../utils/interpolateTemplate';
import { filterInactive } from '../../utils/notificationRules';
import { categoryLabel } from '../../utils/planCategories';
import { getDisplayName } from '../../utils/user';
import { FieldLabel, MessageEditor, NotificationPreview, NotificationTemplate, iconFor, inputStyle, useAndroidKeyboardHeight, useKeyboardVisible } from './shared';

export interface MemberOption {
  id: string;
  username: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  plan_id: string | null;
  plan_assigned_at: string | null;
  created_at: string;
}

export interface PlanOption {
  id: string;
  name: string;
  category: string | null;
  is_active: boolean;
}

/**
 * Nombre + categoría: hay planes con el mismo nombre en categorías distintas
 * ("Plan Fundador" de sala y de clases) y solo con el nombre parecen repetidos.
 */
function planLabel(p: PlanOption): string {
  return p.category ? `${p.name} · ${categoryLabel(p.category)}` : p.name;
}

export interface Draft {
  title: string;
  message: string;
  iconKey: string;
}

type AudienceMode = 'all' | 'plan' | 'inactive' | 'manual';

const AUDIENCE_OPTIONS: { mode: AudienceMode; label: string; hint: string }[] = [
  { mode: 'all', label: 'Todos los socios', hint: 'Cualquier socio con cuenta en la app' },
  { mode: 'plan', label: 'Socios de un plan', hint: 'Uno o varios planes, o los que no tienen plan' },
  { mode: 'inactive', label: 'Socios que no vienen', hint: 'Llevan X días sin venir a clase' },
  { mode: 'manual', label: 'Elegir a mano', hint: 'Buscas y marcas a cada socio' },
];

const NO_PLAN = '__sin_plan__';
/** Filas que se pintan sin buscar en "Elegir a mano": cada una lleva su animación. */
const MANUAL_LIST_LIMIT = 50;

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function SendTab({
  members, plans, templates, draft, setDraft, onTemplateSaved, bottomInset, scrollToTopSignal,
}: {
  members: MemberOption[];
  plans: PlanOption[];
  templates: NotificationTemplate[];
  draft: Draft;
  setDraft: (d: Draft) => void;
  onTemplateSaved: (t: NotificationTemplate) => void;
  bottomInset: number;
  /** Cambia cuando se aplica una plantilla desde otra pestaña: hay que volver arriba para verla. */
  scrollToTopSignal: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const kbHeight = useAndroidKeyboardHeight();
  const keyboardVisible = useKeyboardVisible();
  useEffect(() => {
    if (scrollToTopSignal > 0) scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [scrollToTopSignal]);
  const [mode, setMode] = useState<AudienceMode | null>(null);
  const [planIds, setPlanIds] = useState<Set<string>>(new Set());
  const [inactiveDays, setInactiveDays] = useState('15');
  const [inactiveIds, setInactiveIds] = useState<string[] | null>(null);
  /** Días con los que se calculó inactiveIds: si el admin los cambia, el resultado ya no vale. */
  const [inactiveDaysUsed, setInactiveDaysUsed] = useState<string | null>(null);
  const [searchingInactive, setSearchingInactive] = useState(false);
  const [manualIds, setManualIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showRecipients, setShowRecipients] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const planNameById = useMemo(() => new Map(plans.map((p) => [p.id, p.name])), [plans]);
  const planLabelById = useMemo(() => new Map(plans.map((p) => [p.id, planLabel(p)])), [plans]);
  const activePlans = plans.filter((p) => p.is_active);
  const inactiveStale = inactiveIds !== null && inactiveDaysUsed !== inactiveDays;

  const recipientIds: string[] = useMemo(() => {
    switch (mode) {
      case 'all': return members.map((m) => m.id);
      case 'plan': return members
        .filter((m) => (m.plan_id ? planIds.has(m.plan_id) : planIds.has(NO_PLAN)))
        .map((m) => m.id);
      case 'inactive': return inactiveStale ? [] : inactiveIds ?? [];
      case 'manual': return members.filter((m) => manualIds.has(m.id)).map((m) => m.id);
      default: return [];
    }
  }, [mode, members, planIds, inactiveIds, inactiveStale, manualIds]);

  const recipients = useMemo(() => {
    const set = new Set(recipientIds);
    return members.filter((m) => set.has(m.id));
  }, [recipientIds, members]);

  const previewMember = recipients[0] ?? members[0];
  const previewVars = previewMember ? {
    nombre: previewMember.full_name,
    apodo: previewMember.username || previewMember.full_name,
    plan: previewMember.plan_id ? planNameById.get(previewMember.plan_id) || '' : '',
  } : {};

  const missing: string[] = [];
  if (!draft.title.trim()) missing.push('título');
  if (!draft.message.trim()) missing.push('mensaje');
  if (!mode) missing.push('a quién va');
  else if (recipients.length === 0) missing.push('algún destinatario');
  const canSend = missing.length === 0 && !sending;

  function togglePlan(id: string) {
    setPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleManual(id: string) {
    setManualIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function searchInactive() {
    const days = parseInt(inactiveDays, 10);
    if (!Number.isFinite(days) || days <= 0) {
      Alert.alert('Valor no válido', 'Introduce un número de días mayor que 0.');
      return;
    }
    try {
      setSearchingInactive(true);
      const { data, error } = await supabase.rpc('last_attendance_bulk', { p_user_ids: members.map((m) => m.id) });
      if (error) throw error;
      const last = new Map<string, string>(((data || []) as { user_id: string; last_at: string }[]).map((r) => [r.user_id, r.last_at]));
      setInactiveIds(filterInactive(members, last, days));
      setInactiveDaysUsed(inactiveDays);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSearchingInactive(false);
    }
  }

  async function saveAsTemplate() {
    if (!draft.title.trim() || !draft.message.trim()) return;
    try {
      setSavingTemplate(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('notification_templates')
        .insert({ trigger_kind: 'manual', title: draft.title.trim(), message: draft.message.trim(), icon_key: draft.iconKey, created_by: user?.id })
        .select()
        .single();
      if (error) throw error;
      onTemplateSaved(data as NotificationTemplate);
      Alert.alert('Plantilla guardada', 'La tienes en la pestaña Plantillas para reutilizarla.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSavingTemplate(false);
    }
  }

  function confirmSend() {
    const n = recipients.length;
    const channels = sendEmail ? 'en la app y por email' : 'en la app';
    Alert.alert(
      'Enviar notificación',
      `"${draft.title.trim()}"\n\nLe llegará a ${n} socio${n !== 1 ? 's' : ''} ${channels}. No se puede deshacer.`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Enviar', onPress: send }]
    );
  }

  async function send() {
    const targetIds = recipients.map((r) => r.id);
    const title = draft.title.trim();
    const message = draft.message.trim();
    try {
      setSending(true);
      const saved = await createNotificationsForUsers(targetIds, { type: 'admin_message', title, message, iconKey: draft.iconKey });
      if (!saved) throw new Error('No se pudo guardar la notificación. Revisa la conexión e inténtalo de nuevo.');
    } catch (e: any) {
      setSending(false);
      Alert.alert('No se ha enviado', e.message);
      return;
    }

    // La notificación ya ha salido: a partir de aquí un fallo del email no
    // debe presentarse como "no se ha enviado nada".
    let emailNote = '';
    if (sendEmail) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: targetIds, subject: title, html: `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'No se pudo enviar el email');
        emailNote = `\n\nEmail: ${result.sent} enviado${result.sent !== 1 ? 's' : ''}${result.failed > 0 ? `, ${result.failed} fallaron` : ''}.`;
      } catch (e: any) {
        emailNote = `\n\n⚠️ El email ha fallado: ${e.message}`;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('admin_actions').insert({
        admin_id: user.id,
        action_type: 'send_notification',
        target_type: 'user',
        details: { title, recipients_count: targetIds.length, audience: mode, email_sent: sendEmail },
      });
    }

    setSending(false);
    Alert.alert('Enviada', `Notificación enviada a ${targetIds.length} socio${targetIds.length !== 1 ? 's' : ''}.${emailNote}`);
    setDraft({ title: '', message: '', iconKey: 'bell' });
    setMode(null);
    setPlanIds(new Set());
    setManualIds(new Set());
    setInactiveIds(null);
    setShowRecipients(false);
    setSendEmail(false);
  }

  const filteredMembers = members.filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || getDisplayName(m).toLowerCase().includes(q) || m.email?.toLowerCase().includes(q);
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: scale(20), paddingBottom: scale(24) + kbHeight, gap: scale(24) }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* ── 1. Mensaje ─────────────────────────────────────────── */}
        <View>
          <StepTitle n={1} title="Mensaje" />
          {templates.length > 0 && (
            <SpringPressable onPress={() => setPickerOpen(true)}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: scale(14),
                padding: scale(12), borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.borderBlue,
                backgroundColor: 'rgba(59,130,246,0.08)',
              }}>
                <Text style={{ flex: 1, fontSize: moderateScale(13), fontWeight: '700', color: Colors.blue400 }}>
                  Usar una plantilla guardada ({templates.length})
                </Text>
                <ChevronRightIcon size={scale(15)} color={Colors.blue400} strokeWidth={2} />
              </View>
            </SpringPressable>
          )}
          <MessageEditor
            title={draft.title}
            message={draft.message}
            iconKey={draft.iconKey}
            onTitle={(title) => setDraft({ ...draft, title })}
            onMessage={(message) => setDraft({ ...draft, message })}
            onIcon={(iconKey) => setDraft({ ...draft, iconKey })}
          />
        </View>

        {/* ── 2. Destinatarios ───────────────────────────────────── */}
        <View>
          <StepTitle n={2} title="¿A quién?" />
          <View style={{ gap: scale(8) }}>
            {AUDIENCE_OPTIONS.map((opt) => {
              const active = mode === opt.mode;
              return (
                <SpringPressable key={opt.mode} onPress={() => setMode(opt.mode)}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: scale(12), padding: scale(12),
                    borderRadius: Radius.md, borderWidth: 1,
                    borderColor: active ? Colors.blue500 : Colors.cardBorder,
                    backgroundColor: active ? 'rgba(59,130,246,0.1)' : Colors.card,
                  }}>
                    <View style={{
                      width: scale(20), height: scale(20), borderRadius: scale(10), borderWidth: 2,
                      borderColor: active ? Colors.blue500 : Colors.inputBorder,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      {active && <View style={{ width: scale(10), height: scale(10), borderRadius: scale(5), backgroundColor: Colors.blue500 }} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: active ? Colors.textPrimary : Colors.textSecondary }}>
                        {opt.label}{opt.mode === 'all' ? ` (${members.length})` : ''}
                      </Text>
                      <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>{opt.hint}</Text>
                    </View>
                  </View>
                </SpringPressable>
              );
            })}
          </View>

          {mode === 'plan' && (
            <View style={{ marginTop: scale(14) }}>
              <FieldLabel hint="Puedes marcar varios">Planes</FieldLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                {[...activePlans.map((p) => ({ id: p.id, name: planLabel(p) })), { id: NO_PLAN, name: 'Sin plan' }]
                  .map((p) => ({ ...p, count: members.filter((m) => (p.id === NO_PLAN ? !m.plan_id : m.plan_id === p.id)).length }))
                  // Los que tienen socios primero: un plan sin nadie no sirve de filtro.
                  .sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0))
                  .map((p) => {
                  const active = planIds.has(p.id);
                  const count = p.count;
                  return (
                    <SpringPressable key={p.id} onPress={() => togglePlan(p.id)}>
                      <View style={{
                        paddingVertical: scale(8), paddingHorizontal: scale(12), borderRadius: Radius.full, borderWidth: 1,
                        backgroundColor: active ? 'rgba(59,130,246,0.15)' : Colors.card,
                        borderColor: active ? Colors.blue500 : Colors.cardBorder,
                        opacity: count === 0 && !active ? 0.45 : 1,
                      }}>
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: active ? Colors.blue400 : Colors.textMuted }}>
                          {p.name} · {count}
                        </Text>
                      </View>
                    </SpringPressable>
                  );
                })}
              </View>
            </View>
          )}

          {mode === 'inactive' && (
            <View style={{ marginTop: scale(14) }}>
              <FieldLabel hint="Si nunca ha venido, se cuenta desde que se le asignó el plan o desde el alta">
                Días sin venir a clase
              </FieldLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
                <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary }}>Al menos</Text>
                <TextInput
                  value={inactiveDays}
                  onChangeText={(t) => setInactiveDays(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={[inputStyle, { width: scale(60), textAlign: 'center', fontWeight: '700' }]}
                />
                <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, flex: 1 }}>días</Text>
                <Button
                  label="Buscar"
                  onPress={searchInactive}
                  loading={searchingInactive}
                  disabled={searchingInactive}
                  variant="outline"
                  size="sm"
                  fullWidth={false}
                />
              </View>
              {inactiveStale && (
                <Text style={{ fontSize: moderateScale(11), color: Colors.warning, marginTop: scale(8) }}>
                  Has cambiado los días: pulsa "Buscar" de nuevo.
                </Text>
              )}
            </View>
          )}

          {mode === 'manual' && (
            <View style={{ marginTop: scale(14) }}>
              {/* Los elegidos, siempre a la vista: la lista de abajo tiene su
                  propio scroll y un socio marcado puede quedar fuera de vista. */}
              {manualIds.size > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginBottom: scale(10) }}>
                  {members.filter((m) => manualIds.has(m.id)).map((m) => (
                    <SpringPressable key={m.id} onPress={() => toggleManual(m.id)}>
                      <View style={{
                        flexDirection: 'row', alignItems: 'center', gap: scale(6),
                        paddingVertical: scale(6), paddingLeft: scale(10), paddingRight: scale(8), borderRadius: Radius.full,
                        backgroundColor: 'rgba(59,130,246,0.15)', borderWidth: 1, borderColor: Colors.blue500,
                      }}>
                        <Text style={{ maxWidth: scale(140), fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400 }} numberOfLines={1}>
                          {getDisplayName(m)}
                        </Text>
                        <XIcon size={scale(12)} color={Colors.blue400} strokeWidth={2.5} />
                      </View>
                    </SpringPressable>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(10) }}>
                <View style={[inputStyle, { flex: 1, flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingVertical: scale(8) }]}>
                  <SearchIcon size={scale(16)} color={Colors.textMuted} strokeWidth={2} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Buscar socio..."
                    placeholderTextColor={Colors.placeholder}
                    style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textPrimary, padding: 0 }}
                  />
                </View>
                {manualIds.size > 0 && (
                  <SpringPressable onPress={() => setManualIds(new Set())}>
                    <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textMuted, padding: scale(6) }}>Quitar todos</Text>
                  </SpringPressable>
                )}
              </View>
              {/* Scroll propio con altura acotada: con 60 socios en línea, el
                  resto del formulario quedaba a mucho scroll de distancia. */}
              <View style={{ maxHeight: scale(300), borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, overflow: 'hidden' }}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: scale(6) }}>
              {filteredMembers.slice(0, MANUAL_LIST_LIMIT).map((m, i) => {
                const selected = manualIds.has(m.id);
                return (
                  <SpringPressable key={m.id} onPress={() => toggleManual(m.id)}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: scale(10), padding: scale(10), marginBottom: scale(6),
                      borderRadius: Radius.md, borderWidth: 1,
                      borderColor: selected ? Colors.blue500 : Colors.cardBorder,
                      backgroundColor: selected ? 'rgba(59,130,246,0.1)' : Colors.card,
                    }}>
                      <Avatar uri={m.avatar_url} size={scale(34)} index={Math.min(i, 8)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>{getDisplayName(m)}</Text>
                        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }} numberOfLines={1}>
                          {m.plan_id ? planLabelById.get(m.plan_id) ?? 'Plan' : 'Sin plan'}
                        </Text>
                      </View>
                      <View style={{
                        width: scale(22), height: scale(22), borderRadius: scale(5), borderWidth: 2,
                        borderColor: selected ? Colors.blue500 : Colors.inputBorder,
                        backgroundColor: selected ? Colors.blue500 : 'transparent',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {selected && <CheckIcon size={scale(13)} color="#fff" strokeWidth={3} />}
                      </View>
                    </View>
                  </SpringPressable>
                );
              })}
              {filteredMembers.length > MANUAL_LIST_LIMIT && (
                <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, textAlign: 'center', paddingVertical: scale(10) }}>
                  Y {filteredMembers.length - MANUAL_LIST_LIMIT} más: escribe en el buscador para encontrarlos.
                </Text>
              )}
              {filteredMembers.length === 0 && (
                <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, textAlign: 'center', paddingVertical: scale(16) }}>
                  Ningún socio coincide con la búsqueda
                </Text>
              )}
              </ScrollView>
              </View>
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(6) }}>
                {manualIds.size === 0 ? 'Toca un socio para añadirlo' : `${manualIds.size} elegido${manualIds.size !== 1 ? 's' : ''} · toca uno arriba para quitarlo`}
              </Text>
            </View>
          )}

          {mode && mode !== 'manual' && (mode !== 'inactive' || (inactiveIds !== null && !inactiveStale)) && (
            <View style={{ marginTop: scale(14), borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card }}>
              <SpringPressable onPress={() => setShowRecipients((v) => !v)} disabled={recipients.length === 0}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), padding: scale(12) }}>
                  <UsersIcon size={scale(16)} color={recipients.length > 0 ? Colors.blue400 : Colors.textMuted} strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: moderateScale(13), fontWeight: '700', color: recipients.length > 0 ? Colors.textPrimary : Colors.textMuted }}>
                    {recipients.length === 0 ? 'Nadie cumple este criterio' : `Le llegará a ${recipients.length} socio${recipients.length !== 1 ? 's' : ''}`}
                  </Text>
                  {recipients.length > 0 && (
                    <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400 }}>
                      {showRecipients ? 'Ocultar' : 'Ver quiénes'}
                    </Text>
                  )}
                </View>
              </SpringPressable>
              {showRecipients && recipients.length > 0 && (
                <View style={{ paddingHorizontal: scale(12), paddingBottom: scale(12), gap: scale(4) }}>
                  {recipients.map((m) => (
                    <Text key={m.id} style={{ fontSize: moderateScale(12), color: Colors.textSecondary }} numberOfLines={1}>
                      · {getDisplayName(m)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── 3. Canales ─────────────────────────────────────────── */}
        <View>
          <StepTitle n={3} title="¿Por dónde?" />
          <View style={{ borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12), padding: scale(14) }}>
              <CheckIcon size={scale(16)} color={Colors.success} strokeWidth={2.5} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}>En la app, con aviso en el móvil</Text>
                <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>Siempre</Text>
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: Colors.cardBorder }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12), padding: scale(14) }}>
              <MailIcon size={scale(16)} color={sendEmail ? Colors.blue400 : Colors.textMuted} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}>También por email</Text>
                <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>
                  Llega desde info@entrenoenlanave.es; si responden, llega a lanavesc@gmail.com
                </Text>
              </View>
              <Switch value={sendEmail} onValueChange={setSendEmail} trackColor={{ false: Colors.cardBorder, true: Colors.blue500 }} thumbColor="#fff" />
            </View>
          </View>
        </View>

        {/* ── Vista previa ───────────────────────────────────────── */}
        {(draft.title.trim() || draft.message.trim()) && previewMember ? (
          <View>
            <NotificationPreview
              title={interpolateTemplate(draft.title, previewVars)}
              message={interpolateTemplate(draft.message, previewVars)}
              iconKey={draft.iconKey}
              caption={`Así la verá ${getDisplayName(previewMember)}:`}
            />
            <SpringPressable onPress={saveAsTemplate} disabled={savingTemplate || !draft.title.trim() || !draft.message.trim()}>
              <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400, marginTop: scale(10), textAlign: 'center' }}>
                {savingTemplate ? 'Guardando...' : 'Guardar este mensaje como plantilla'}
              </Text>
            </SpringPressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Oculto con el teclado abierto: el pie mide ~150pt y dejaría muy poco
          hueco para el campo que se está escribiendo. */}
      {!keyboardVisible && (
      <View style={{
        paddingHorizontal: scale(20), paddingTop: scale(4), paddingBottom: bottomInset + scale(4),
        borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.background,
      }}>
        {missing.length > 0 && (
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, textAlign: 'center', marginTop: scale(8) }}>
            Falta: {missing.join(', ')}
          </Text>
        )}
        <Button
          label={recipients.length > 0 ? `Enviar a ${recipients.length} socio${recipients.length !== 1 ? 's' : ''}` : 'Enviar'}
          onPress={confirmSend}
          loading={sending}
          disabled={!canSend}
          variant="primary"
          size="lg"
        />
      </View>
      )}

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: scale(24) }}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={{ width: '100%', maxWidth: 380, maxHeight: '75%' }} onPress={() => {}}>
            <View style={{ flexShrink: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.cardBorder, padding: scale(8) }}>
              <Text style={{ fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary, padding: scale(12) }}>Elige una plantilla</Text>
              <ScrollView>
                {templates.map((t) => {
                  const Icon = iconFor(t.icon_key);
                  return (
                    <SpringPressable
                      key={t.id}
                      onPress={() => { setDraft({ title: t.title, message: t.message, iconKey: t.icon_key }); setPickerOpen(false); }}
                    >
                      <View style={{ flexDirection: 'row', gap: scale(10), padding: scale(12), borderRadius: Radius.md }}>
                        <Icon size={scale(16)} color={Colors.blue400} strokeWidth={2} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>{t.title}</Text>
                          <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }} numberOfLines={2}>{t.message}</Text>
                        </View>
                      </View>
                    </SpringPressable>
                  );
                })}
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: scale(12) }}>
      <View style={{
        width: scale(24), height: scale(24), borderRadius: scale(12), backgroundColor: Colors.blue500,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: moderateScale(12), fontWeight: '800', color: '#fff' }}>{n}</Text>
      </View>
      <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary }}>{title}</Text>
    </View>
  );
}
