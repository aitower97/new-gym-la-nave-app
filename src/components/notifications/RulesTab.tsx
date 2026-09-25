import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { ChevronRightIcon, PlusIcon, TrashIcon } from '../Icons';
import { SpringPressable } from '../ui';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import {
  CREATABLE_EVENT_TYPES, OFFSET_FIELD, TRIGGER_LABELS, TriggerKind, describeTrigger, isOneShot, validateOffset,
} from '../../utils/notificationRules';
import { FieldLabel, MessageEditor, NotificationTemplate, SmallButton, iconFor, inputStyle, useAndroidKeyboardHeight } from './shared';

// Se disparan como efecto de una acción del admin (cancelar/editar una clase
// o reserva), con los datos concretos de ese momento: no son plantillas,
// solo referencia de qué existe y cuándo salta.
const SYSTEM_EVENTS = [
  { title: 'Clase cancelada', trigger: 'Al cancelar una clase, suelta o en bloque' },
  { title: 'Horario cancelado', trigger: 'Al cancelar una clase recurrente entera' },
  { title: 'Clase modificada', trigger: 'Al cambiar fecha, hora o tipo de una clase con reservas' },
  { title: 'Reserva cancelada', trigger: 'Al quitarle una reserva a un socio o cambiar su plantilla fija' },
  { title: 'Reserva confirmada', trigger: 'Al reservarle una clase a un socio desde el panel' },
];

export function RulesTab({ rules, onUpdated, onCreated, onDeleted, bottomInset }: {
  rules: NotificationTemplate[];
  onUpdated: (t: NotificationTemplate) => void;
  onCreated: (t: NotificationTemplate) => void;
  onDeleted: (id: string) => void;
  bottomInset: number;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const kbHeight = useAndroidKeyboardHeight();

  const sorted = [...rules].sort((a, b) => Number(b.enabled) - Number(a.enabled));
  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: scale(20), paddingBottom: bottomInset + scale(24) + kbHeight }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, lineHeight: moderateScale(19), marginBottom: scale(16) }}>
        Se comprueban solas cada día a media mañana y le llegan a cada socio que cumpla la condición.
        {' '}Tienes {activeCount} activa{activeCount !== 1 ? 's' : ''} de {rules.length}.
      </Text>

      {creating ? (
        <NewRuleForm onCancel={() => setCreating(false)} onCreated={(t) => { onCreated(t); setCreating(false); }} />
      ) : (
        <SpringPressable onPress={() => { setCreating(true); setExpandedId(null); }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8),
            padding: scale(14), marginBottom: scale(16), borderRadius: Radius.md,
            borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.borderBlue,
          }}>
            <PlusIcon size={scale(16)} color={Colors.blue400} />
            <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.blue400 }}>Nueva regla automática</Text>
          </View>
        </SpringPressable>
      )}

      {sorted.map((rule) => (
        <RuleCard
          key={rule.id}
          rule={rule}
          expanded={expandedId === rule.id}
          onToggleExpand={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
          onUpdated={onUpdated}
          onDeleted={() => { onDeleted(rule.id); setExpandedId(null); }}
        />
      ))}

      {/* ── Avisos del sistema (referencia) ───────────────────────── */}
      <SpringPressable onPress={() => setShowSystem((v) => !v)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginTop: scale(20), paddingVertical: scale(8) }}>
          <Text style={{ flex: 1, fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary }}>
            Avisos que manda la app sola (no editables)
          </Text>
          <View style={{ transform: [{ rotate: showSystem ? '90deg' : '0deg' }] }}>
            <ChevronRightIcon size={scale(15)} color={Colors.textMuted} strokeWidth={2} />
          </View>
        </View>
      </SpringPressable>
      {showSystem && (
        <View style={{ gap: scale(8), marginTop: scale(4) }}>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
            Salen al hacer tú la acción, con los datos de la clase o reserva de ese momento.
          </Text>
          {SYSTEM_EVENTS.map((e) => (
            <View key={e.title} style={{ padding: scale(12), borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder }}>
              <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textSecondary }}>{e.title}</Text>
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }}>{e.trigger}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function RuleCard({ rule, expanded, onToggleExpand, onUpdated, onDeleted }: {
  rule: NotificationTemplate;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdated: (t: NotificationTemplate) => void;
  onDeleted: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const Icon = iconFor(rule.icon_key);

  async function toggleEnabled(enabled: boolean) {
    // Optimista: el interruptor responde al momento y se revierte si falla.
    onUpdated({ ...rule, enabled });
    try {
      setToggling(true);
      const { error } = await supabase
        .from('notification_templates')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', rule.id);
      if (error) throw error;
    } catch (e: any) {
      onUpdated({ ...rule, enabled: !enabled });
      Alert.alert('Error', e.message);
    } finally {
      setToggling(false);
    }
  }

  return (
    <View style={{
      marginBottom: scale(10), borderRadius: Radius.md, borderWidth: 1,
      borderColor: expanded ? Colors.blue500 : Colors.cardBorder, backgroundColor: Colors.card,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12), padding: scale(14) }}>
        <SpringPressable onPress={onToggleExpand} scaleTo={0.98} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
            <View style={{
              width: scale(36), height: scale(36), borderRadius: scale(18), alignItems: 'center', justifyContent: 'center',
              backgroundColor: rule.enabled ? 'rgba(59,130,246,0.15)' : Colors.inputBg,
            }}>
              <Icon size={scale(16)} color={rule.enabled ? Colors.blue400 : Colors.textMuted} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: moderateScale(10), fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: Colors.textMuted }}>
                {TRIGGER_LABELS[rule.trigger_kind]}
              </Text>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: rule.enabled ? Colors.textPrimary : Colors.textMuted, marginTop: scale(2) }} numberOfLines={1}>
                {rule.title}
              </Text>
              <Text style={{ fontSize: moderateScale(12), color: rule.enabled ? Colors.textSecondary : Colors.textMuted, marginTop: scale(2) }}>
                {describeTrigger(rule.trigger_kind, rule.offset_days)}{isOneShot(rule.trigger_kind) ? ' · una sola vez' : ''}
              </Text>
            </View>
          </View>
        </SpringPressable>
        <Switch
          value={rule.enabled}
          onValueChange={toggleEnabled}
          disabled={toggling}
          trackColor={{ false: Colors.cardBorder, true: Colors.blue500 }}
          thumbColor="#fff"
        />
      </View>

      {!expanded && (
        <SpringPressable onPress={onToggleExpand}>
          <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400, paddingHorizontal: scale(14), paddingBottom: scale(12) }}>
            Editar
          </Text>
        </SpringPressable>
      )}

      {expanded && <RuleEditor rule={rule} onSaved={(t) => { onUpdated(t); onToggleExpand(); }} onDeleted={onDeleted} onCancel={onToggleExpand} />}
    </View>
  );
}

function RuleEditor({ rule, onSaved, onDeleted, onCancel }: {
  rule: NotificationTemplate;
  onSaved: (t: NotificationTemplate) => void;
  onDeleted: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(rule.title);
  const [message, setMessage] = useState(rule.message);
  const [iconKey, setIconKey] = useState(rule.icon_key);
  const [offset, setOffset] = useState(rule.offset_days != null ? String(rule.offset_days) : '');
  const [saving, setSaving] = useState(false);
  const hasOffset = rule.offset_days != null;
  const isSystem = rule.key != null;

  const dirty = title !== rule.title || message !== rule.message || iconKey !== rule.icon_key
    || (hasOffset && offset !== String(rule.offset_days));

  async function save() {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Faltan datos', 'El título y el mensaje no pueden quedar vacíos.');
      return;
    }
    const offsetError = hasOffset ? validateOffset(rule.trigger_kind, offset) : null;
    if (offsetError) {
      Alert.alert('Valor no válido', offsetError);
      return;
    }
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from('notification_templates')
        .update({
          title: title.trim(),
          message: message.trim(),
          icon_key: iconKey,
          offset_days: hasOffset ? parseInt(offset, 10) : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rule.id)
        .select()
        .single();
      if (error) throw error;
      onSaved(data as NotificationTemplate);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Borrar regla', `¿Borrar "${rule.title}"? Dejará de enviarse.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('notification_templates').delete().eq('id', rule.id);
          if (error) Alert.alert('Error', error.message);
          else onDeleted();
        },
      },
    ]);
  }

  const field = OFFSET_FIELD[rule.trigger_kind];
  // Las de pago las envía la edge function payment-reminders, que sí
  // personaliza el título; el resto sale de la base y solo el mensaje.
  const isPayment = rule.trigger_kind === 'payment_due' || rule.trigger_kind === 'payment_blocked';

  return (
    <View style={{ paddingHorizontal: scale(14), paddingBottom: scale(14), gap: scale(14) }}>
      <View style={{ height: 1, backgroundColor: Colors.cardBorder }} />
      {hasOffset && field && (
        <OffsetField label={field.label} unit={field.unit} value={offset} onChange={setOffset} />
      )}
      {isPayment && (
        <Text style={{ fontSize: moderateScale(11), color: Colors.warning, lineHeight: moderateScale(16) }}>
          El día de bloqueo se configura en "Reservas bloqueadas por impago". Si lo cambias, revisa que el
          mensaje de "Cuota pendiente" no siga diciendo un día distinto.
        </Text>
      )}
      <MessageEditor
        title={title} message={message} iconKey={iconKey}
        onTitle={setTitle} onMessage={setMessage} onIcon={setIconKey}
        titleVariables={isPayment}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scale(8) }}>
        <SmallButton label="Guardar" onPress={save} loading={saving} disabled={!dirty} />
        <SmallButton label="Cancelar" onPress={onCancel} variant="ghost" />
        <View style={{ flexGrow: 1 }} />
        {!isSystem && (
          <SpringPressable onPress={confirmDelete}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4), padding: scale(6) }}>
              <TrashIcon size={scale(14)} color={Colors.danger} strokeWidth={2} />
              <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.danger }}>Borrar</Text>
            </View>
          </SpringPressable>
        )}
      </View>
      {isSystem && (
        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
          Es una regla de serie: no se puede borrar, pero sí desactivar con el interruptor.
        </Text>
      )}
    </View>
  );
}

function OffsetField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          maxLength={3}
          style={[inputStyle, { width: scale(70), textAlign: 'center', fontWeight: '700' }]}
        />
        <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary }}>{unit}</Text>
      </View>
    </View>
  );
}

function NewRuleForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (t: NotificationTemplate) => void }) {
  const [kind, setKind] = useState<TriggerKind>('inactivity');
  const [offset, setOffset] = useState('15');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [iconKey, setIconKey] = useState('bell');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = CREATABLE_EVENT_TYPES.find((e) => e.kind === kind)!;
  const field = OFFSET_FIELD[kind];
  const offsetError = validateOffset(kind, offset);

  function pickKind(k: TriggerKind) {
    setKind(k);
    setOffset(String(CREATABLE_EVENT_TYPES.find((e) => e.kind === k)?.defaultOffset ?? 15));
    setPickerOpen(false);
  }

  async function create() {
    if (offsetError) {
      Alert.alert('Valor no válido', offsetError);
      return;
    }
    if (!title.trim() || !message.trim()) return;
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('notification_templates')
        .insert({
          trigger_kind: kind,
          offset_days: parseInt(offset, 10),
          title: title.trim(),
          message: message.trim(),
          icon_key: iconKey,
          created_by: user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      onCreated(data as NotificationTemplate);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{
      marginBottom: scale(16), padding: scale(14), gap: scale(14),
      borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.blue500, backgroundColor: Colors.card,
    }}>
      <Text style={{ fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary }}>Nueva regla automática</Text>

      <View>
        <FieldLabel>¿Cuándo se envía?</FieldLabel>
        <SpringPressable onPress={() => setPickerOpen(true)}>
          <View style={[inputStyle, { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingVertical: scale(12) }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }}>{selected.label}</Text>
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>{selected.hint}</Text>
            </View>
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <ChevronRightIcon size={scale(15)} color={Colors.textMuted} strokeWidth={2} />
            </View>
          </View>
        </SpringPressable>
      </View>

      {field && <OffsetField label={field.label} unit={field.unit} value={offset} onChange={setOffset} />}

      <View style={{ padding: scale(10), borderRadius: Radius.sm, backgroundColor: 'rgba(59,130,246,0.08)' }}>
        <Text style={{ fontSize: moderateScale(12), color: offsetError ? Colors.warning : Colors.blue300 }}>
          {offsetError ?? `Se enviará: ${describeTrigger(kind, parseInt(offset, 10))}${isOneShot(kind) ? ' (una sola vez por socio)' : ''}.`}
        </Text>
      </View>

      <MessageEditor
        title={title} message={message} iconKey={iconKey}
        onTitle={setTitle} onMessage={setMessage} onIcon={setIconKey}
        titleVariables={false}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
        <SmallButton
          label="Crear regla"
          onPress={create}
          loading={saving}
          disabled={!title.trim() || !message.trim() || !!offsetError}
        />
        <SmallButton label="Cancelar" onPress={onCancel} variant="ghost" />
      </View>

      <Modal transparent visible={pickerOpen} animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: scale(24) }}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable style={{ width: '100%', maxWidth: 380, maxHeight: '75%' }} onPress={() => {}}>
            <View style={{ flexShrink: 1, backgroundColor: Colors.surfaceElevated, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.cardBorder, padding: scale(8) }}>
              <ScrollView>
                {CREATABLE_EVENT_TYPES.map((e) => {
                  const active = e.kind === kind;
                  return (
                    <SpringPressable key={e.kind} onPress={() => pickKind(e.kind)}>
                      <View style={{ padding: scale(14), borderRadius: Radius.sm, backgroundColor: active ? 'rgba(59,130,246,0.15)' : 'transparent' }}>
                        <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: active ? Colors.blue400 : Colors.textPrimary }}>{e.label}</Text>
                        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>{e.hint}</Text>
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
