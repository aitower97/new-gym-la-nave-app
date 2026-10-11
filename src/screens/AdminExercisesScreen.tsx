import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, SearchIcon } from '../components/Icons';
import { Bone, ScreenHeader, SkeletonGroup, SpringPressable } from '../components/ui';
import { DeleteExerciseSheet } from '../components/workout/DeleteExerciseSheet';
import { OfficialExercisePicker } from '../components/workout/OfficialExercisePicker';
import { RenameExerciseSheet } from '../components/workout/RenameExerciseSheet';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { useTransitionDone } from '../hooks/useScreenTransition';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import {
  CatalogExercise,
  REASON_LABEL,
  ReviewItem,
  acceptMerge,
  archiveExercise,
  dismissReview,
  getCatalog,
  getReviewQueue,
  makeOfficial,
  mergeExercises,
} from '../utils/exerciseCatalog';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'AdminExercises'> };

type Tab = 'review' | 'catalog';

/** Lo que se está eligiendo en el selector de oficiales */
type PickFor =
  | { kind: 'review'; item: ReviewItem }
  | { kind: 'catalog'; exercise: CatalogExercise }
  | null;

/**
 * Ejercicios del gimnasio (admin). "Por revisar": nombres de socios o del
 * entrenador que parecen el mismo ejercicio que otro — el admin decide, nada
 * se une solo. "Catálogo": los oficiales; renombrar, unir o archivar.
 */
export default function AdminExercisesScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const transitionDone = useTransitionDone(navigation);

  const [tab, setTab] = useState<Tab>('review');
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pickFor, setPickFor] = useState<PickFor>(null);
  const [actionsFor, setActionsFor] = useState<CatalogExercise | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<CatalogExercise | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [q, c] = await Promise.all([getReviewQueue(), getCatalog()]);
      setQueue(q);
      setCatalog(c);
    } catch (error) {
      console.error('Error cargando ejercicios:', error);
      Alert.alert('Error', 'No se pudieron cargar los ejercicios.');
    } finally {
      setLoading(false);
    }
  }

  /** Ejecuta una decisión, quita la tarjeta al momento y refresca */
  async function decide(item: ReviewItem, action: () => Promise<void>) {
    setBusyKey(item.source_key);
    try {
      await action();
      setQueue((prev) => prev.filter((q) => q.source_key !== item.source_key));
      load();
    } catch (error) {
      console.error('Error en la decisión:', error);
      Alert.alert('Error', 'No se pudo guardar.');
    } finally {
      setBusyKey(null);
    }
  }

  function confirmMerge(item: ReviewItem, targetId: string, targetName: string) {
    Alert.alert('¿Unir?', `«${item.source_name}» pasa a ser «${targetName}». Sus historiales se juntan.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Unir', onPress: () => decide(item, () => acceptMerge(item.source_key, targetId)) },
    ]);
  }

  function onPicked(target: CatalogExercise) {
    const p = pickFor;
    setPickFor(null);
    if (!p) return;
    if (p.kind === 'review') {
      confirmMerge(p.item, target.id, target.name);
    } else {
      Alert.alert('¿Unir?', `«${p.exercise.name}» pasa a ser «${target.name}». Sus historiales se juntan.`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Unir',
          onPress: async () => {
            try { await mergeExercises(p.exercise.id, target.id); load(); }
            catch { Alert.alert('Error', 'No se pudo unir.'); }
          },
        },
      ]);
    }
  }

  async function toggleArchive(ex: CatalogExercise) {
    setActionsFor(null);
    try { await archiveExercise(ex.id, !ex.archived); load(); }
    catch { Alert.alert('Error', 'No se pudo guardar.'); }
  }

  const filteredCatalog = useMemo(() => {
    const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const q = fold(search.trim());
    const list = q ? catalog.filter((c) => fold(c.name).includes(q) || c.aliases.some((a) => fold(a).includes(q))) : catalog;
    return [...list.filter((c) => !c.archived), ...list.filter((c) => c.archived)];
  }, [catalog, search]);

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader title="Ejercicios" onBack={() => navigation.goBack()} topInset={insets.top} />

        {/* Pestañas */}
        <View style={{
          flexDirection: 'row', marginHorizontal: scale(20), marginTop: scale(16), padding: scale(4),
          borderRadius: Radius.md, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
        }}>
          {([['review', `Por revisar${queue.length ? ` (${queue.length})` : ''}`], ['catalog', 'Catálogo']] as [Tab, string][]).map(([key, label]) => (
            <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1 }}>
              <View style={{
                paddingVertical: scale(10), borderRadius: Radius.sm, alignItems: 'center',
                backgroundColor: tab === key ? 'rgba(59,130,246,0.15)' : 'transparent',
              }}>
                <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: tab === key ? Colors.blue400 : Colors.textMuted }}>
                  {label}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {loading || !transitionDone ? (
          <SkeletonGroup>
            <View style={{ padding: scale(20), gap: scale(10) }}>
              {[0, 1, 2, 3].map((i) => <Bone key={i} height={scale(118)} radius={Radius.lg} />)}
            </View>
          </SkeletonGroup>
        ) : tab === 'review' ? (
          <ScrollView contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(32), gap: scale(10) }}>
            {queue.length === 0 ? (
              <Text style={{ fontSize: moderateScale(14), color: Colors.textMuted, textAlign: 'center', paddingVertical: scale(40) }}>
                Todo en orden
              </Text>
            ) : queue.map((item) => (
              <ReviewCard
                key={item.source_key}
                item={item}
                busy={busyKey === item.source_key}
                onMerge={() => item.target_id && confirmMerge(item, item.target_id, item.target_name || '')}
                onDistinct={() => decide(item, () => dismissReview(item.source_key, item.target_id))}
                onOther={() => setPickFor({ kind: 'review', item })}
                onMakeOfficial={() => decide(item, () => makeOfficial(item.source_key, item.source_name))}
                onKeep={() => decide(item, () => dismissReview(item.source_key, null))}
              />
            ))}
          </ScrollView>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(32) }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(12),
              backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.inputBorder,
              borderRadius: Radius.md, paddingHorizontal: scale(12), height: scale(44),
            }}>
              <SearchIcon size={scale(16)} color={Colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Buscar"
                placeholderTextColor={Colors.placeholder}
                style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary }}
              />
            </View>
            {filteredCatalog.map((ex) => (
              <Pressable key={ex.id} onPress={() => setActionsFor(ex)} style={{ marginBottom: scale(8) }}>
                {({ pressed }) => (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: scale(12),
                    padding: scale(14), borderRadius: Radius.md,
                    backgroundColor: pressed ? 'rgba(255,255,255,0.07)' : Colors.card,
                    borderWidth: 1, borderColor: Colors.cardBorder,
                    opacity: ex.archived ? 0.5 : 1,
                  }}>
                    <BarbellIcon size={scale(16)} color={Colors.blue400} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                        {ex.name}
                      </Text>
                      {(ex.archived || ex.aliases.length > 0) && (
                        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }} numberOfLines={1}>
                          {ex.archived ? 'Archivado' : `También: ${ex.aliases.join(', ')}`}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary }}>
                      {ex.members} {ex.members === 1 ? 'socio' : 'socios'}
                    </Text>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Acciones de un oficial del catálogo */}
      <Modal transparent visible={actionsFor !== null} animationType="fade" onRequestClose={() => setActionsFor(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setActionsFor(null)} />
          <View style={{
            backgroundColor: '#0d1929', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
            padding: scale(20), paddingBottom: insets.bottom + scale(20), borderWidth: 1, borderColor: Colors.cardBorder, gap: scale(8),
          }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(8) }} numberOfLines={1}>
              {actionsFor?.name}
            </Text>
            {actionsFor && ([
              ['Renombrar', () => { setRenaming({ id: actionsFor.id, name: actionsFor.name }); setActionsFor(null); }],
              ['Unir con otro…', () => { setPickFor({ kind: 'catalog', exercise: actionsFor }); setActionsFor(null); }],
              [actionsFor.archived ? 'Recuperar' : 'Archivar', () => toggleArchive(actionsFor)],
            ] as [string, () => void][]).map(([label, fn]) => (
              <SpringPressable key={label} onPress={fn}>
                <View style={{
                  paddingVertical: scale(14), alignItems: 'center', borderRadius: Radius.md,
                  backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                }}>
                  <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>{label}</Text>
                </View>
              </SpringPressable>
            ))}
            {actionsFor && (
              <SpringPressable onPress={() => { setDeleting(actionsFor); setActionsFor(null); }}>
                <View style={{
                  paddingVertical: scale(14), alignItems: 'center', borderRadius: Radius.md, marginTop: scale(8),
                  backgroundColor: Colors.dangerLight, borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
                }}>
                  <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.danger }}>Eliminar</Text>
                </View>
              </SpringPressable>
            )}
          </View>
        </View>
      </Modal>

      <OfficialExercisePicker
        visible={pickFor !== null}
        title={pickFor?.kind === 'review' ? `«${pickFor.item.source_name}» es…` : pickFor?.kind === 'catalog' ? `Unir «${pickFor.exercise.name}» con…` : ''}
        options={catalog}
        excludeId={pickFor?.kind === 'catalog' ? pickFor.exercise.id : pickFor?.kind === 'review' && pickFor.item.source_official ? pickFor.item.source_key.slice(2) : null}
        onClose={() => setPickFor(null)}
        onPick={onPicked}
      />

      <RenameExerciseSheet exercise={renaming} onClose={() => setRenaming(null)} onRenamed={() => load()} />
      <DeleteExerciseSheet exercise={deleting} onClose={() => setDeleting(null)} onDeleted={() => load()} />
    </View>
  );
}

function ReviewCard({ item, busy, onMerge, onDistinct, onOther, onMakeOfficial, onKeep }: {
  item: ReviewItem;
  busy: boolean;
  onMerge: () => void;
  onDistinct: () => void;
  onOther: () => void;
  onMakeOfficial: () => void;
  onKeep: () => void;
}) {
  const isMerge = item.kind === 'merge';
  const who = item.source_official
    ? `Del entrenador · ${item.logs} ${item.logs === 1 ? 'registro' : 'registros'}`
    : `${item.members} ${item.members === 1 ? 'socio' : 'socios'} · ${item.logs} ${item.logs === 1 ? 'registro' : 'registros'}`;
  const buttons: [string, () => void, boolean][] = isMerge
    ? [['Unir', onMerge, true], ['Son distintos', onDistinct, false], ['Otro…', onOther, false]]
    : [['Hacer oficial', onMakeOfficial, true], ['Dejar', onKeep, false], ['Es otro…', onOther, false]];

  return (
    <View style={{
      padding: scale(16), borderRadius: Radius.lg, backgroundColor: Colors.card,
      borderWidth: 1, borderColor: Colors.cardBorder, opacity: busy ? 0.5 : 1,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: scale(8) }}>
        <Text style={{ flex: 1, fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary }}>
          {item.source_name}
        </Text>
        <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: Colors.textSecondary }}>{REASON_LABEL[item.reason]}</Text>
        </View>
      </View>
      <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(2) }}>{who}</Text>
      <Text style={{ fontSize: moderateScale(15), color: Colors.textSecondary, marginTop: scale(10), marginBottom: scale(12) }}>
        {isMerge
          ? <>¿Es <Text style={{ fontWeight: '800', color: Colors.blue400 }}>{item.target_name}</Text>?</>
          : '¿Lo hacemos oficial?'}
      </Text>
      <View style={{ flexDirection: 'row', gap: scale(8) }}>
        {buttons.map(([label, fn, primary]) => (
          <View key={label} style={{ flex: 1 }}>
            <SpringPressable onPress={fn} disabled={busy}>
              <View style={{
                paddingVertical: scale(10), alignItems: 'center', borderRadius: Radius.sm,
                backgroundColor: primary ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.05)',
                borderWidth: 1, borderColor: primary ? Colors.borderBlue : Colors.cardBorder,
              }}>
                <Text
                  style={{ fontSize: moderateScale(12), fontWeight: '700', color: primary ? Colors.blue400 : Colors.textSecondary }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.85}
                >
                  {label}
                </Text>
              </View>
            </SpringPressable>
          </View>
        ))}
      </View>
    </View>
  );
}
