import { useEffect, useMemo, useState } from 'react';
import { Dimensions, FlatList, Keyboard, KeyboardEvent, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, SearchIcon, XIcon } from '../Icons';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { CatalogExercise } from '../../utils/exerciseCatalog';

interface Props {
  visible: boolean;
  title: string;
  /** Oficiales donde elegir (los archivados no se ofrecen) */
  options: CatalogExercise[];
  /** No ofrecer este (el propio ejercicio que se une) */
  excludeId?: string | null;
  onClose: () => void;
  onPick: (exercise: CatalogExercise) => void;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Hoja para elegir un ejercicio oficial, con buscador. */
export function OfficialExercisePicker({ visible, title, options, excludeId, onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const keyboardHeight = useSharedValue(0);

  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: KeyboardEvent) => { keyboardHeight.value = withTiming(e.endCoordinates.height, { duration: 250 }); }
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => { keyboardHeight.value = withTiming(0, { duration: 250 }); }
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Alto de la ventana una sola vez: con el teclado, Android puede devolver ya
  // la altura reducida y se descontaría dos veces
  const windowHeight = useMemo(() => Dimensions.get('window').height, []);
  // Fuera del worklet: dentro de useAnimatedStyle (hilo gráfico) solo se pueden
  // usar números, no funciones normales como scale() — si no, la app se cae
  const bottomInset = insets.bottom;
  const capHeight = windowHeight * 0.75;
  const availableHeight = windowHeight - insets.top - scale(20);
  // Sube con el teclado Y encoge: si solo subiera, en móviles bajos el título y
  // el buscador se saldrían por arriba
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboardHeight.value - bottomInset) }],
    maxHeight: Math.min(capHeight, availableHeight - keyboardHeight.value),
  }));

  const list = useMemo(() => {
    const q = fold(query.trim());
    return options.filter((o) => !o.archived && o.id !== excludeId && (!q || fold(o.name).includes(q)));
  }, [options, excludeId, query]);

  const close = () => { Keyboard.dismiss(); onClose(); };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <Animated.View style={[sheetStyle, {
          backgroundColor: '#0d1929',
          borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
          padding: scale(20), paddingBottom: insets.bottom + scale(12),
          borderWidth: 1, borderColor: Colors.cardBorder,
        }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(14) }}>
            <Text style={{ flex: 1, fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={2}>
              {title}
            </Text>
            <Pressable onPress={close} style={{ padding: scale(4) }}>
              <XIcon size={scale(20)} color={Colors.textMuted} />
            </Pressable>
          </View>

          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: scale(8),
            backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.inputBorder,
            borderRadius: Radius.md, paddingHorizontal: scale(12), height: scale(44), marginBottom: scale(10),
          }}>
            <SearchIcon size={scale(16)} color={Colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar"
              placeholderTextColor={Colors.placeholder}
              style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary }}
            />
          </View>

          <FlatList
            data={list}
            keyExtractor={(o) => o.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted, paddingVertical: scale(16), textAlign: 'center' }}>
                Sin resultados
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => { Keyboard.dismiss(); onPick(item); }}>
                {({ pressed }) => (
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: scale(10),
                    paddingVertical: scale(12), paddingHorizontal: scale(6),
                    borderBottomWidth: 1, borderBottomColor: Colors.cardBorder,
                    backgroundColor: pressed ? 'rgba(59,130,246,0.12)' : 'transparent',
                  }}>
                    <BarbellIcon size={scale(15)} color={Colors.blue400} />
                    <Text style={{ flex: 1, fontSize: moderateScale(15), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
                      {item.members} {item.members === 1 ? 'socio' : 'socios'}
                    </Text>
                  </View>
                )}
              </Pressable>
            )}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}
