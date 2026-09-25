import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader, SpringPressable } from '../components/ui';
import { RulesTab } from '../components/notifications/RulesTab';
import { Draft, MemberOption, PlanOption, SendTab } from '../components/notifications/SendTab';
import { TemplatesTab } from '../components/notifications/TemplatesTab';
import { NotificationTemplate } from '../components/notifications/shared';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminNotifications'>;
};

type Tab = 'send' | 'rules' | 'templates';

/**
 * Tres cosas distintas, cada una en su pestaña: enviar ahora (lo que más se
 * usa, por eso va primero), reglas que se envían solas, y plantillas para
 * reutilizar. Antes era un único scroll con las cuatro secciones mezcladas y
 * el botón de enviar visible incluso mientras se editaba una regla.
 */
export default function AdminNotificationsScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>('send');
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  // El borrador vive aquí y no en SendTab para que "Usar para enviar" desde
  // la pestaña Plantillas pueda rellenarlo.
  const [draft, setDraft] = useState<Draft>({ title: '', message: '', iconKey: 'bell' });
  const [scrollToTopSignal, setScrollToTopSignal] = useState(0);

  // Las pestañas ocultas siguen montadas: sin cerrar el teclado, lo que se
  // tecleara iría a un campo que ya no se ve.
  function goToTab(t: Tab) {
    Keyboard.dismiss();
    setTab(t);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      const [membersRes, plansRes, templatesRes] = await Promise.all([
        supabase.from('profiles')
          .select('id, username, full_name, email, avatar_url, plan_id, plan_assigned_at, created_at')
          .eq('role', 'user')
          .order('full_name'),
        // Todos, no solo los activos: un socio puede seguir con un plan ya
        // retirado y su nombre tiene que salir en la vista previa.
        supabase.from('membership_plans').select('id, name, is_active').order('name'),
        supabase.from('notification_templates').select('*').order('created_at'),
      ]);
      if (membersRes.error) throw membersRes.error;
      if (plansRes.error) throw plansRes.error;
      if (templatesRes.error) throw templatesRes.error;
      setMembers(membersRes.data || []);
      setPlans(plansRes.data || []);
      setTemplates((templatesRes.data || []) as NotificationTemplate[]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  }

  const upsert = (t: NotificationTemplate) =>
    setTemplates((prev) => (prev.some((p) => p.id === t.id) ? prev.map((p) => (p.id === t.id ? t : p)) : [...prev, t]));
  const remove = (id: string) => setTemplates((prev) => prev.filter((p) => p.id !== id));

  const rules = templates.filter((t) => t.trigger_kind !== 'manual');
  const manualTemplates = templates.filter((t) => t.trigger_kind === 'manual');

  function applyTemplate(t: NotificationTemplate) {
    const replace = () => {
      setDraft({ title: t.title, message: t.message, iconKey: t.icon_key });
      goToTab('send');
      setScrollToTopSignal((n) => n + 1);
    };
    if (draft.title.trim() || draft.message.trim()) {
      Alert.alert('Sustituir mensaje', 'Ya tienes un mensaje a medias en Enviar. ¿Lo sustituyes por esta plantilla?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sustituir', onPress: replace },
      ]);
    } else {
      replace();
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'send', label: 'Enviar' },
    { key: 'rules', label: 'Automáticas', count: rules.filter((r) => r.enabled).length },
    { key: 'templates', label: 'Plantillas', count: manualTemplates.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Notificaciones"
          subtitle="Avisos a los socios"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        <View style={{
          flexDirection: 'row', marginHorizontal: scale(20), marginTop: scale(14), marginBottom: scale(4),
          padding: scale(4), borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
        }}>
          {TABS.map(({ key, label, count }) => {
            const active = tab === key;
            return (
              <SpringPressable key={key} onPress={() => goToTab(key)} style={{ flex: 1 }} scaleTo={0.97}>
                <View style={{
                  paddingVertical: scale(10), paddingHorizontal: scale(4), borderRadius: Radius.sm, alignItems: 'center',
                  backgroundColor: active ? Colors.blue500 : 'transparent',
                }}>
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: active ? '#fff' : Colors.textSecondary }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {label}{count != null ? ` · ${count}` : ''}
                  </Text>
                </View>
              </SpringPressable>
            );
          })}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : (
          // Las tres pestañas se quedan montadas (solo se ocultan) para no
          // perder lo que el admin lleva escrito al cambiar de una a otra.
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, display: tab === 'send' ? 'flex' : 'none' }}>
              <SendTab
                members={members}
                plans={plans}
                templates={manualTemplates}
                draft={draft}
                setDraft={setDraft}
                onTemplateSaved={upsert}
                bottomInset={insets.bottom}
                scrollToTopSignal={scrollToTopSignal}
              />
            </View>
            <View style={{ flex: 1, display: tab === 'rules' ? 'flex' : 'none' }}>
              <RulesTab rules={rules} onUpdated={upsert} onCreated={upsert} onDeleted={remove} bottomInset={insets.bottom} />
            </View>
            <View style={{ flex: 1, display: tab === 'templates' ? 'flex' : 'none' }}>
              <TemplatesTab
                templates={manualTemplates}
                onUse={applyTemplate}
                onSaved={upsert}
                onCreated={upsert}
                onDeleted={remove}
                bottomInset={insets.bottom}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
