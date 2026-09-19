/**
 * BookButton.tsx - Botón de reserva/cancelar para clases
 *
 * Uso:
 * <BookButton type="book" onPress={fn} />
 * <BookButton type="booked" />               ← indicador, no se pulsa
 * <BookButton type="change" onPress={fn} />
 * <BookButton type="full" onPress={fn} />
 * <BookButton type="cancel" onPress={fn} />  ← botón ancho de cancelar
 * <BookButton type="waitlist" onPress={fn} /> ← apuntarse a la lista de espera
 * <BookButton type="waiting" />              ← indicador: ya está en la lista
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

type BookButtonType = 'book' | 'booked' | 'change' | 'full' | 'cancel' | 'waitlist' | 'waiting';

interface BookButtonProps {
    type: BookButtonType;
    /** No se usa en los tipos de solo lectura, como `booked`. */
    onPress?: () => void;
    label?: string; // solo para type="cancel"
}

const CONFIG: Record<BookButtonType, {
    gradient: [string, string];
    icon?: string;
    glow: string;
    disabled?: boolean;
    /**
     * Indicador de estado, no acción: se pinta igual de vivo que un botón pero
     * no responde al tacto. Distinto de `disabled`, que además lo apaga.
     */
    readOnly?: boolean;
}> = {
    book: {
        gradient: ['#2563EB', '#1741b5'],
        icon: '+',
        glow: '#3B82F6',
    },
    booked: {
        gradient: ['#059669', '#047857'],
        icon: '✓',
        glow: '#10B981',
        // El tick solo dice "estás apuntado". Cancelar es una acción
        // destructiva y tiene su propio botón ancho debajo: que un toque
        // accidental en el tick te borrase de la clase no tenía sentido.
        readOnly: true,
    },
    change: {
        gradient: ['#D97706', '#B45309'],
        icon: '↻',
        glow: '#F59E0B',
    },
    full: {
        gradient: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.03)'],
        icon: '⊘',
        glow: 'transparent',
        disabled: true,
    },
    cancel: {
        gradient: ['rgba(220,38,38,0.18)', 'rgba(185,28,28,0.12)'],
        icon: undefined,
        glow: '#EF4444',
    },
    // Clase llena: en vez de un botón muerto, la puerta a la lista de espera.
    waitlist: {
        gradient: ['#7C3AED', '#5B21B6'],
        icon: '＋',
        glow: '#8B5CF6',
    },
    // Ya está en la lista: indicador, no acción. Salir tiene su botón ancho.
    waiting: {
        gradient: ['#6D28D9', '#4C1D95'],
        icon: '⏳',
        glow: '#8B5CF6',
        readOnly: true,
    },
};

export function BookButton({ type, onPress, label = 'Cancelar reserva' }: BookButtonProps) {
    const scale = useSharedValue(1);
    const glowOp = useSharedValue(type === 'cancel' ? 0.3 : 0.4);

    const cfg = CONFIG[type];
    const isCancel = type === 'cancel';
    const isDisabled = cfg.disabled;
    const isReadOnly = !!cfg.readOnly;

    const pressIn = () => {
        if (isDisabled || isReadOnly) return;
        scale.value = withSpring(isCancel ? 0.975 : 0.88, { damping: 14, stiffness: 300 });
        glowOp.value = withTiming(0.8, { duration: 120 });
    };

    const pressOut = () => {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
        glowOp.value = withTiming(isCancel ? 0.3 : 0.4, { duration: 300 });
    };

    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        shadowOpacity: isDisabled ? 0 : glowOp.value,
    }));

    if (isCancel) {
        return (
            <Animated.View style={[containerStyle, {
                marginTop: 10,
                borderRadius: 10,
                // Android: backgroundColor propio para que elevation siga el
                // borderRadius (si no, la sombra sale cuadrada) — pero tiene
                // que ser opaco. cfg.gradient[0] aquí es semitransparente
                // (rgba con alpha 0.18) y Android sigue calculando la sombra
                // como rectángulo con cualquier color no-opaco. Queda tapado
                // por el LinearGradient de abajo, así que el tono exacto no
                // se ve — solo hace falta que sea sólido.
                backgroundColor: '#450A0A',
                shadowColor: '#EF4444',
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 8,
                elevation: 2,
            }]}>
                <Pressable
                    onPress={onPress}
                    onPressIn={pressIn}
                    onPressOut={pressOut}
                    style={{ borderRadius: 10, overflow: 'hidden' }}
                >
                    <LinearGradient
                        colors={cfg.gradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={{
                            paddingVertical: 10,
                            alignItems: 'center',
                            borderWidth: 1,
                            borderColor: 'rgba(239,68,68,0.25)',
                            borderRadius: 10,
                        }}
                    >
                        <Text style={{
                            fontSize: 12,
                            fontWeight: '600',
                            color: 'rgba(252,165,165,0.9)',
                            letterSpacing: 0.3,
                        }}>
                            {label}
                        </Text>
                    </LinearGradient>
                </Pressable>
            </Animated.View>
        );
    }

    // Como indicador no lleva Pressable ni handlers, y deja pasar el toque a la
    // card para que abra el detalle como cualquier otra zona de la tarjeta.
    const Wrapper = isReadOnly ? View : Pressable;
    const wrapperProps = isReadOnly
        ? { pointerEvents: 'none' as const }
        : {
              onPress: isDisabled ? undefined : onPress,
              onPressIn: pressIn,
              onPressOut: pressOut,
          };

    return (
        <Animated.View
            accessibilityRole={isReadOnly ? 'image' : undefined}
            accessibilityLabel={
                isReadOnly
                    ? type === 'waiting'
                        ? 'Estás en la lista de espera de esta clase'
                        : 'Ya tienes reserva en esta clase'
                    : undefined
            }
            style={[containerStyle, {
                width: 40, height: 40,
                borderRadius: 12,
                backgroundColor: cfg.gradient[0],
                shadowColor: cfg.glow,
                shadowOffset: { width: 0, height: 3 },
                shadowRadius: 8,
                elevation: isDisabled ? 0 : 4,
            }]}>
            <Wrapper
                {...wrapperProps}
                style={{ borderRadius: 12, overflow: 'hidden', width: 40, height: 40 }}
            >
                <LinearGradient
                    colors={cfg.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        width: 40, height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 12,
                    }}
                >
                    <Text style={{
                        fontSize: 18,
                        color: isDisabled ? 'rgba(255,255,255,0.3)' : '#fff',
                        fontWeight: '700',
                        lineHeight: 20,
                        textAlign: 'center',
                    }}>
                        {cfg.icon}
                    </Text>
                </LinearGradient>
            </Wrapper>
        </Animated.View>
    );
}
