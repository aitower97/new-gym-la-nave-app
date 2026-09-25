import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { EditIcon, PlusIcon, TrashIcon } from '../Icons';
import { SpringPressable } from '../ui';
import { supabase } from '../../lib/supabase';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { MessageEditor, NotificationTemplate, SmallButton, iconFor, useAndroidKeyboardHeight } from './shared';

export function TemplatesTab({ templates, onUse, onSaved, onCreated, onDeleted, bottomInset }: {
  templates: NotificationTemplate[];
  /** Copia la plantilla al formulario de envío y cambia a la pestaña Enviar. */
  onUse: (t: NotificationTemplate) => void;
  onSaved: (t: NotificationTemplate) => void;
  onCreated: (t: NotificationTemplate) => void;
  onDeleted: (id: string) => void;
  bottomInset: number;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const kbHeight = useAndroidKeyboardHeight();

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: scale(20), paddingBottom: bottomInset + scale(24) + kbHeight }}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, lineHeight: moderateScale(19), marginBottom: scale(16) }}>
        Mensajes que mandas a menudo, para no escribirlos cada vez. Guardarlos no envía nada: se usan desde la pestaña Enviar.
      </Text>

      {creating ? (
        <TemplateForm
          heading="Nueva plantilla"
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { data, error } = await supabase
              .from('notification_templates')
              .insert({ trigger_kind: 'manual', title: v.title, message: v.message, icon_key: v.iconKey, created_by: user?.id })
              .select()
              .single();
            if (error) throw error;
            onCreated(data as NotificationTemplate);
            setCreating(false);
          }}
        />
      ) : (
        <SpringPressable onPress={() => { setCreating(true); setEditingId(null); }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8),
            padding: scale(14), marginBottom: scale(16), borderRadius: Radius.md,
            borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.borderBlue,
          }}>
            <PlusIcon size={scale(16)} color={Colors.blue400} />
            <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.blue400 }}>Nueva plantilla</Text>
          </View>
        </SpringPressable>
      )}

      {templates.length === 0 && !creating && (
        <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, textAlign: 'center', paddingVertical: scale(24) }}>
          Todavía no tienes ninguna.
        </Text>
      )}

      {templates.map((t) => editingId === t.id ? (
        <TemplateForm
          key={t.id}
          heading="Editar plantilla"
          initial={{ title: t.title, message: t.message, iconKey: t.icon_key }}
          onCancel={() => setEditingId(null)}
          onSubmit={async (v) => {
            const { data, error } = await supabase
              .from('notification_templates')
              .update({ title: v.title, message: v.message, icon_key: v.iconKey, updated_at: new Date().toISOString() })
              .eq('id', t.id)
              .select()
              .single();
            if (error) throw error;
            onSaved(data as NotificationTemplate);
            setEditingId(null);
          }}
        />
      ) : (
        <TemplateCard
          key={t.id}
          template={t}
          onUse={() => onUse(t)}
          onEdit={() => { setEditingId(t.id); setCreating(false); }}
          onDelete={() => Alert.alert('Borrar plantilla', `¿Borrar "${t.title}"?`, [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Borrar', style: 'destructive', onPress: async () => {
                const { error } = await supabase.from('notification_templates').delete().eq('id', t.id);
                if (error) Alert.alert('Error', error.message);
                else onDeleted(t.id);
              },
            },
          ])}
        />
      ))}
    </ScrollView>
  );
}

function TemplateCard({ template, onUse, onEdit, onDelete }: {
  template: NotificationTemplate; onUse: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const Icon = iconFor(template.icon_key);
  return (
    <View style={{ marginBottom: scale(10), padding: scale(14), borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
        <Icon size={scale(15)} color={Colors.blue400} strokeWidth={2} />
        <Text style={{ flex: 1, fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
          {template.title}
        </Text>
      </View>
      <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(6), lineHeight: moderateScale(17) }} numberOfLines={3}>
        {template.message}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scale(8), marginTop: scale(12) }}>
        <SmallButton label="Usar para enviar" onPress={onUse} variant="outline" />
        <View style={{ flexGrow: 1 }} />
        <SpringPressable onPress={onEdit}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4), padding: scale(6) }}>
            <EditIcon size={scale(14)} color={Colors.textSecondary} strokeWidth={2} />
            <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary }}>Editar</Text>
          </View>
        </SpringPressable>
        <SpringPressable onPress={onDelete}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4), padding: scale(6) }}>
            <TrashIcon size={scale(14)} color={Colors.danger} strokeWidth={2} />
            <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.danger }}>Borrar</Text>
          </View>
        </SpringPressable>
      </View>
    </View>
  );
}

function TemplateForm({ heading, initial, onCancel, onSubmit }: {
  heading: string;
  initial?: { title: string; message: string; iconKey: string };
  onCancel: () => void;
  onSubmit: (v: { title: string; message: string; iconKey: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [message, setMessage] = useState(initial?.message ?? '');
  const [iconKey, setIconKey] = useState(initial?.iconKey ?? 'bell');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || !message.trim()) return;
    try {
      setSaving(true);
      await onSubmit({ title: title.trim(), message: message.trim(), iconKey });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ marginBottom: scale(16), padding: scale(14), gap: scale(14), borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.blue500, backgroundColor: Colors.card }}>
      <Text style={{ fontSize: moderateScale(15), fontWeight: '800', color: Colors.textPrimary }}>{heading}</Text>
      <MessageEditor
        title={title} message={message} iconKey={iconKey}
        onTitle={setTitle} onMessage={setMessage} onIcon={setIconKey}
      />
      <View style={{ flexDirection: 'row', gap: scale(8) }}>
        <SmallButton
          label="Guardar"
          onPress={submit}
          loading={saving}
          disabled={!title.trim() || !message.trim()}
        />
        <SmallButton label="Cancelar" onPress={onCancel} variant="ghost" />
      </View>
    </View>
  );
}
