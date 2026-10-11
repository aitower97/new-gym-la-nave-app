import { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardEvent, Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from '../Icons';
import { Button } from '../ui';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { renameExerciseById } from '../../utils/exerciseCatalog';

interface Props {
  /** Ejercicio del catálogo a renombrar; null = cerrado. */
  exercise: { id: string; name: string } | null;
  onClose: () => void;
  onRenamed: (newName: string) => void;
}

/**
 * Cambia el nombre de un ejercicio en todo el historial. Si el nombre nuevo ya
 * existe, pregunta antes de juntar los dos. Quién puede renombrar qué lo
 * decide la base de datos (rename_exercise_by_id): el socio solo sus propios.
 */
export function RenameExerciseSheet({ exercise, onClose, onRenamed }: Props) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useSharedValue(0);

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

  // El teclado ya cubre la zona segura inferior: no se suma dos veces
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -Math.max(0, keyboardHeight.value - insets.bottom) }],
  }));

  return (
    <Modal transparent visible={exercise !== null} animationType="slide" onRequestClose={onClose}>
      {exercise !== null && (
        <SheetBody
          key={exercise.id}
          exerciseId={exercise.id}
          oldName={exercise.name}
          onClose={onClose}
          onRenamed={onRenamed}
          sheetStyle={sheetStyle}
          bottomInset={insets.bottom}
        />
      )}
    </Modal>
  );
}

function SheetBody({ exerciseId, oldName, onClose, onRenamed, sheetStyle, bottomInset }: {
  exerciseId: string;
  oldName: string;
  onClose: () => void;
  onRenamed: (newName: string) => void;
  sheetStyle: ReturnType<typeof useAnimatedStyle>;
  bottomInset: number;
}) {
  const [name, setName] = useState(oldName);
  const [saving, setSaving] = useState(false);

  const close = () => {
    if (saving) return;
    Keyboard.dismiss();
    onClose();
  };

  async function run(newName: string, merge: boolean) {
    setSaving(true);
    try {
      const result = await renameExerciseById(exerciseId, newName, merge);
      if (result === 'official') {
        Alert.alert('Es del entrenador', 'Solo el gimnasio puede cambiarle el nombre.');
        return;
      }
      if (result === 'needs_merge') {
        Alert.alert('¿Juntar?', `Ya existe «${newName}». Se unirán sus historiales.`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Juntar', onPress: () => run(newName, true) },
        ]);
        return;
      }
      if (result !== 'ok') throw new Error(result);
      Keyboard.dismiss();
      onRenamed(newName);
      onClose();
    } catch (error) {
      console.error('Error renombrando ejercicio:', error);
      Alert.alert('Error', 'No se pudo cambiar el nombre.');
    } finally {
      setSaving(false);
    }
  }

  const trimmed = name.trim();
  const canSave = !saving && !!trimmed && trimmed !== oldName.trim();

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={close} />
      <Animated.View style={[sheetStyle, {
        backgroundColor: '#0d1929',
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        padding: scale(20),
        paddingBottom: bottomInset + scale(20),
        borderWidth: 1,
        borderColor: Colors.cardBorder,
      }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(20) }}>
          <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, flex: 1 }}>
            Renombrar ejercicio
          </Text>
          <Pressable onPress={close} style={{ padding: scale(4) }}>
            <XIcon size={scale(20)} color={Colors.textMuted} />
          </Pressable>
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ej: Press militar"
          placeholderTextColor={Colors.placeholder}
          autoFocus
          maxLength={100}
          editable={!saving}
          returnKeyType="done"
          onSubmitEditing={() => { if (canSave) run(trimmed, false); }}
          style={{
            backgroundColor: Colors.inputBg,
            borderWidth: 1, borderColor: Colors.inputBorder,
            borderRadius: Radius.md,
            paddingHorizontal: scale(14),
            height: scale(48),
            fontSize: moderateScale(15),
            color: Colors.textPrimary,
            marginBottom: scale(8),
          }}
        />
        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(20) }}>
          Cambia en todo el historial.
        </Text>

        <Button
          label={saving ? 'Guardando...' : 'Guardar'}
          onPress={() => run(trimmed, false)}
          loading={saving}
          disabled={!canSave}
          fullWidth
        />
      </Animated.View>
    </View>
  );
}
