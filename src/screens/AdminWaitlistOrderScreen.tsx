import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, PlusIcon, SearchIcon, XIcon } from '../components/Icons';
import { Avatar, Bone, Button, ScreenHeader, SkeletonGroup } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { getDisplayName } from '../utils/user';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminWaitlistOrder'>;

interface Member {
  id: string;
  username: string | null;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Orden fijo de la lista de espera de un horario (día + hora + tipo), para
 * todas las semanas. No apunta a nadie: decide el puesto de quien entra en
 * la cola. Se guarda entera con admin_set_slot_order.
 */
export default function AdminWaitlistOrderScreen({ route, navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const { dayOfWeek, classTime, classType } = route.params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      const [membersRes, orderRes] = await Promise.all([
        supabase.from('profiles').select('id, username, full_name, email, avatar_url').eq('role', 'user').order('full_name'),
        supabase.from('waitlist_slot_order').select('user_id, position')
          .eq('day_of_week', dayOfWeek).eq('class_time', classTime).eq('class_type', classType)
          .order('position'),
      ]);
      if (membersRes.error || orderRes.error) {
        Alert.alert('Error', 'No se pudo cargar.');
      } else {
        setMembers(membersRes.data || []);
        const ids = (orderRes.data || []).map(r => r.user_id);
        setOrder(ids);
        setSaved(ids);
      }
      setLoading(false);
    })();
  }, []);

  const byId = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const changed = order.join() !== saved.join();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter(m => !order.includes(m.id))
      .filter(m => !q
        || getDisplayName(m).toLowerCase().includes(q)
        || m.username?.toLowerCase().includes(q)
        || m.email?.toLowerCase().includes(q));
  }, [members, order, query]);

  function move(index: number, delta: number) {
    const next = [...order];
    const [id] = next.splice(index, 1);
    next.splice(index + delta, 0, id);
    setOrder(next);
  }

  async function save() {
    setSaving(true);
    const { data, error } = await supabase.rpc('admin_set_slot_order', {
      p_day_of_week: dayOfWeek, p_class_time: classTime, p_class_type: classType, p_user_ids: order,
    });
    setSaving(false);
    if (error || data !== 'ok') {
      Alert.alert('Error', 'No se pudo guardar.');
      return;
    }
    navigation.goBack();
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const subtitle = `${DAYS[dayOfWeek]} ${classTime.slice(0, 5)} · ${classType}`;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader title="Orden fijo de espera" subtitle={subtitle} onBack={() => navigation.goBack()} topInset={insets.top} />

        {loading ? (
          <SkeletonGroup style={{ flex: 1 }}>
            <View style={{ padding: scale(20), gap: scale(10) }}>
              {[0, 1, 2].map(i => (
                <Bone key={i} height={scale(64)} radius={Radius.md} style={{ width: undefined }} />
              ))}
            </View>
          </SkeletonGroup>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: scale(24) }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(12) }}>
              Todas las semanas. Van primero en la espera, en este orden.
            </Text>

            {order.length === 0 && (
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, marginBottom: scale(12) }}>
                Sin orden fijo.
              </Text>
            )}

            {order.map((id, index) => {
              const m = byId.get(id);
              const name = m ? getDisplayName(m) : 'Socio';
              return (
                <View
                  key={id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: scale(12), marginBottom: scale(8),
                    backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: '#8B5CF640',
                  }}
                >
                  <View style={{
                    width: scale(24), height: scale(24), borderRadius: scale(12), backgroundColor: '#8B5CF61F',
                    alignItems: 'center', justifyContent: 'center', marginRight: scale(10),
                  }}>
                    <Text style={{ fontSize: moderateScale(12), fontWeight: '800', color: '#8B5CF6' }}>{index + 1}</Text>
                  </View>
                  <Avatar uri={m?.avatar_url || null} size={scale(34)} name={name} />
                  <Text style={{ flex: 1, marginLeft: scale(10), fontSize: moderateScale(15), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>
                    {name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginLeft: scale(8) }}>
                    <Pressable
                      onPress={() => move(index, -1)}
                      disabled={index === 0}
                      hitSlop={6}
                      style={{ padding: scale(6), borderRadius: Radius.sm, backgroundColor: Colors.inputBg, opacity: index === 0 ? 0.3 : 1 }}
                    >
                      <View style={{ transform: [{ rotate: '90deg' }] }}>
                        <ChevronLeftIcon size={scale(16)} color={Colors.textPrimary} />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      hitSlop={6}
                      style={{ padding: scale(6), borderRadius: Radius.sm, backgroundColor: Colors.inputBg, opacity: index === order.length - 1 ? 0.3 : 1 }}
                    >
                      <View style={{ transform: [{ rotate: '-90deg' }] }}>
                        <ChevronLeftIcon size={scale(16)} color={Colors.textPrimary} />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => setOrder(order.filter(x => x !== id))}
                      hitSlop={6}
                      style={{ padding: scale(6), borderRadius: Radius.sm, backgroundColor: 'rgba(239,68,68,0.12)' }}
                    >
                      <XIcon size={scale(16)} color={Colors.danger} />
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {!adding ? (
              <Pressable onPress={() => setAdding(true)} style={{ alignSelf: 'flex-start', marginTop: scale(4) }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: scale(6),
                  paddingHorizontal: scale(14), paddingVertical: scale(8), borderRadius: scale(16), backgroundColor: '#8B5CF61F',
                }}>
                  <PlusIcon size={scale(14)} color="#A78BFA" strokeWidth={2.5} />
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: '#A78BFA' }}>Añadir</Text>
                </View>
              </Pressable>
            ) : (
              <View style={{ marginTop: scale(8) }}>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(10),
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                  borderRadius: Radius.md, paddingHorizontal: scale(14), paddingVertical: scale(10),
                }}>
                  <SearchIcon size={scale(16)} color={Colors.textMuted} strokeWidth={2} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Buscar socio..."
                    placeholderTextColor={Colors.placeholder}
                    autoFocus
                    style={{ flex: 1, fontSize: moderateScale(14), color: Colors.textPrimary, padding: 0 }}
                  />
                  <Pressable onPress={() => { setAdding(false); setQuery(''); }} hitSlop={8}>
                    <XIcon size={scale(16)} color={Colors.textMuted} />
                  </Pressable>
                </View>
                {results.slice(0, 30).map(m => (
                  <Pressable key={m.id} onPress={() => setOrder([...order, m.id])}>
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: scale(10), padding: scale(10), marginBottom: scale(6),
                      backgroundColor: Colors.card, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder,
                    }}>
                      <Avatar uri={m.avatar_url} size={scale(32)} name={getDisplayName(m)} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>
                          {getDisplayName(m)}
                        </Text>
                        <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }} numberOfLines={1}>{m.email}</Text>
                      </View>
                      <PlusIcon size={scale(16)} color="#A78BFA" strokeWidth={2.5} />
                    </View>
                  </Pressable>
                ))}
                {results.length === 0 && (
                  <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: moderateScale(13), marginTop: scale(12) }}>
                    No se encontraron socios
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        )}

        <View style={{
          paddingHorizontal: scale(20), paddingTop: scale(14), paddingBottom: insets.bottom + scale(16),
          borderTopWidth: 1, borderTopColor: Colors.border,
        }}>
          <Button label="Guardar" onPress={save} loading={saving} disabled={loading || saving || !changed} variant="primary" size="lg" />
        </View>
      </View>
    </View>
  );
}
