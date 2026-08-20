/**
 * BackButton.tsx - Botón volver con spring muy suave
 *
 * Mismo icono (SVG, no texto) y mismos estilos escalados que el resto de
 * botones de atrás de la app, para que se vea idéntico en todas las
 * pantallas y en iOS/Android por igual — antes usaba una flecha de texto
 * Unicode ("←") con tamaños fijos sin escalar, que Android centraba peor
 * que iOS por depender de métricas de fuente en vez de un icono vectorial.
 */

import { Pressable } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { ChevronLeftIcon } from '../Icons';
import { Colors, scale } from '../../theme';

export function BackButton({ onPress }: { onPress: () => void }) {
    const scaleVal = useSharedValue(1);
    const opacity = useSharedValue(1);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: scaleVal.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={style}>
            <Pressable
                onPress={onPress}
                onPressIn={() => {
                    scaleVal.value = withSpring(0.9, { damping: 18, stiffness: 350 });
                    opacity.value = withTiming(0.6, { duration: 100 });
                }}
                onPressOut={() => {
                    scaleVal.value = withSpring(1, { damping: 14, stiffness: 200 });
                    opacity.value = withTiming(1, { duration: 250 });
                }}
                style={{
                    width: scale(40), height: scale(40), borderRadius: scale(20),
                    backgroundColor: Colors.card,
                    borderWidth: 1, borderColor: Colors.cardBorder,
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
            </Pressable>
        </Animated.View>
    );
}
