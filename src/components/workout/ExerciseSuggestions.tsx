import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BarbellIcon } from '../Icons';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { ExerciseOption, suggestExercises } from '../../utils/exerciseCatalog';

interface Props {
  /** Lo que lleva escrito el campo de nombre */
  query: string;
  /** Ejercicio ya elegido (se ocultan las sugerencias mientras el texto sea su nombre) */
  selectedId: string | null;
  onSelect: (option: ExerciseOption) => void;
  /** Etiqueta de los propios (el socio ve "Tuyo"; el admin no tiene propios) */
  ownLabel?: string;
}

/**
 * Sugerencias bajo el campo de nombre al añadir un ejercicio: primero los del
 * entrenador, luego los propios. Elegir uno evita crear un duplicado con otra
 * forma de escribirlo; si no se elige, se guarda por el nombre como siempre.
 */
export function ExerciseSuggestions({ query, selectedId, onSelect, ownLabel = 'Tuyo' }: Props) {
  const [options, setOptions] = useState<ExerciseOption[]>([]);
  const requestRef = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    const id = ++requestRef.current;
    if (trimmed.length < 2) { setOptions([]); return; }
    const timer = setTimeout(() => {
      suggestExercises(trimmed)
        .then((list) => { if (requestRef.current === id) setOptions(list); })
        .catch(() => { if (requestRef.current === id) setOptions([]); });
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const chosen = selectedId ? options.find((o) => o.id === selectedId) : undefined;
  if (options.length === 0 || (chosen && chosen.name === trimmed)) return null;

  return (
    <View style={{
      marginTop: -scale(8), marginBottom: scale(16),
      borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder,
      backgroundColor: 'rgba(255,255,255,0.03)', overflow: 'hidden',
    }}>
      {options.map((o, i) => (
        <Pressable key={o.id} onPress={() => onSelect(o)}>
          {({ pressed }) => (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: scale(10),
              paddingHorizontal: scale(12), paddingVertical: scale(11),
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: Colors.cardBorder,
              backgroundColor: pressed ? 'rgba(59,130,246,0.12)' : 'transparent',
            }}>
              <BarbellIcon size={scale(14)} color={o.is_official ? Colors.blue400 : Colors.textMuted} />
              <Text style={{ flex: 1, fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }} numberOfLines={1}>
                {o.name}
              </Text>
              <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: o.is_official ? Colors.blue400 : Colors.textMuted }}>
                {o.is_official ? 'Entrenador' : ownLabel}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}
