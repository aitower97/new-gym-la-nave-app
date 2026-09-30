import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface SpringPressableProps {
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
  scaleTo?: number;
}

/**
 * Lo que coloca el botón en la pantalla va en la capa animada de fuera; lo
 * que se pinta (fondo, borde, relleno, cómo se colocan los hijos) va en un
 * View de dentro que no se anima.
 *
 * Antes todo el style iba en el Animated.View y, en el botón recién pulsado
 * (el que acababa de animar la escala), los cambios de estilo dejaban de
 * repintarse: un chip seleccionado no se ponía azul hasta salir y volver a
 * la pantalla. Y flexDirection/alignItems no llegaban a los hijos, que
 * cuelgan del Pressable interior.
 */
const OUTER_KEYS = new Set<string>([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'minWidth', 'maxWidth', 'height', 'minHeight', 'maxHeight', 'aspectRatio',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'marginBlock', 'marginBlockStart', 'marginBlockEnd', 'marginInline', 'marginInlineStart', 'marginInlineEnd',
  'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'inset', 'zIndex', 'display',
]);

function splitStyle(style?: ViewStyle): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) || {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

export function SpringPressable({ onPress, onLongPress, disabled, style, children, scaleTo = 0.94 }: SpringPressableProps) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const { outer, inner } = splitStyle(style);

  return (
    <Animated.View style={[outer, anim]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        onPressIn={() => { s.value = withSpring(scaleTo, { damping: 12, stiffness: 280 }); }}
        onPressOut={() => { s.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
        // flexGrow: si el botón tiene alto fijo o flex, el Pressable y la
        // superficie lo llenan; sin tamaño propio no cambian nada.
        style={({ pressed }) => ({ flexGrow: 1, opacity: pressed ? 0.75 : 1 })}
      >
        <View style={[styles.surface, inner]}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  surface: { flexGrow: 1 },
});
