import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardEvent, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from '../Icons';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { CatalogExercise, deleteExercise } from '../../utils/exerciseCatalog';

interface Props {
  /** Oficial a eliminar; null = cerrado. */
  exercise: CatalogExercise | null;
  onClose: () => void;
  onDeleted: () => void;
}

// Igual que exercise_key en la base de datos: mayúsculas y espacios dan igual
const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Eliminar un oficial: hay que escribir su nombre para confirmar. La base de
 * datos lo vuelve a comprobar (admin_delete_exercise), no solo la app.
 */
export function DeleteExerciseSheet({ exercise, onClose, onDeleted }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useSharedValue(0);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (exercise) setTyped(''); }, [exercise]);

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

  // Fuera del worklet: solo números dentro de useAnimatedStyle
  const bottomInset = insets.bottom;
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboardHeight.value - bottomInset) }],
  }));

  const matches = !!exercise && key(typed) === key(exercise.name);

  const close = () => { if (busy) return; Keyboard.dismiss(); onClose(); };

  async function submit() {
    if (!exercise || !matches || busy) return;
    setBusy(true);
    try {
      const result = await deleteExercise(exercise.id, typed);
      if (result !== 'ok') throw new Error(result);
      Keyboard.dismiss();
      onDeleted();
      onClose();
    } catch {
      Alert.alert('Error', 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible={exercise !== null} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
        <Animated.View style={[sheetStyle, {
          backgroundColor: '#0d1929',
          borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
          padding: scale(20), paddingBottom: insets.bottom + scale(20),
          borderWidth: 1, borderColor: Colors.cardBorder,
        }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: scale(10) }}>
            <Text style={{ flex: 1, fontSize: moderateScale(17), fontWeight: '700', color: Colors.danger }} numberOfLines={2}>
              ¿Eliminar «{exercise?.name}»?
            </Text>
            <Pressable onPress={close} style={{ padding: scale(4) }}>
              <XIcon size={scale(20)} color={Colors.textMuted} />
            </Pressable>
          </View>

          {exercise && exercise.logs > 0 ? (
            <View style={{
              padding: scale(12), borderRadius: Radius.md, marginBottom: scale(14),
              backgroundColor: Colors.dangerLight, borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)',
            }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }}>
                Se borran {exercise.logs} {exercise.logs === 1 ? 'marca' : 'marcas'} de {exercise.members} {exercise.members === 1 ? 'socio' : 'socios'}.
              </Text>
              <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(4) }}>
                No se puede deshacer. Si es un repetido, mejor «Unir».
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, marginBottom: scale(14) }}>
              Nadie lo ha registrado.
            </Text>
          )}

          <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(6) }}>
            Escribe el nombre para confirmar
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={exercise?.name}
            placeholderTextColor={Colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={submit}
            style={{
              height: scale(46), paddingHorizontal: scale(12), borderRadius: Radius.md,
              backgroundColor: Colors.inputBg, borderWidth: 1,
              borderColor: matches ? Colors.danger : Colors.inputBorder,
              fontSize: moderateScale(15), color: Colors.textPrimary, marginBottom: scale(14),
            }}
          />

          <Pressable onPress={submit} disabled={!matches || busy}>
            <View style={{
              height: scale(48), borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center',
              backgroundColor: Colors.danger, opacity: matches ? 1 : 0.35,
            }}>
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#fff' }}>Eliminar</Text>}
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
