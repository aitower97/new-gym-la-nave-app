/**
 * BookButton.tsx - Botón de reserva/cancelar para clases
 *
 * Uso:
 * <BookButton type="book" onPress={fn} />
 * <BookButton type="booked" onPress={fn} />
 * <BookButton type="change" onPress={fn} />
 * <BookButton type="full" onPress={fn} />
 * <BookButton type="cancel" onPress={fn} />  ← botón ancho de cancelar
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

type BookButtonType = 'book' | 'booked' | 'change' | 'full' | 'cancel';

interface BookButtonProps {
    type: BookButtonType;
    onPress: () => void;
    label?: string; // solo para type="cancel"
}

const CONFIG: Record<BookButtonType, {
    gradient: [string, string];
    icon?: string;
    glow: string;
    disabled?: boolean;
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
};

export function BookButton({ type, onPress, label = 'Cancelar reserva' }: BookButtonProps) {
    const scale = useSharedValue(1);
    const glowOp = useSharedValue(type === 'cancel' ? 0.3 : 0.4);

    const cfg = CONFIG[type];
    const isCancel = type === 'cancel';
    const isDisabled = cfg.disabled;

    const pressIn = () => {
        if (isDisabled) return;
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
                // borderRadius (si no, la sombra sale cuadrada). Queda tapado
                // por el LinearGradient de abajo.
                backgroundColor: cfg.gradient[0],
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

    return (
        <Animated.View style={[containerStyle, {
            width: 40, height: 40,
            borderRadius: 12,
            backgroundColor: cfg.gradient[0],
            shadowColor: cfg.glow,
            shadowOffset: { width: 0, height: 3 },
            shadowRadius: 8,
            elevation: isDisabled ? 0 : 4,
        }]}>
            <Pressable
                onPress={isDisabled ? undefined : onPress}
                onPressIn={pressIn}
                onPressOut={pressOut}
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
            </Pressable>
        </Animated.View>
    );
}
