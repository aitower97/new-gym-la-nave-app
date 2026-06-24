/**
 * Button.tsx - Botón con animaciones visibles pero fluidas
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
    label: string;
    onPress: () => void;
    variant?: ButtonVariant;
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    size?: ButtonSize;
    icon?: React.ReactNode;
}

const SIZES: Record<ButtonSize, { py: number; fontSize: number; radius: number }> = {
    sm: { py: 11, fontSize: 13, radius: 10 },
    md: { py: 15, fontSize: 15, radius: 12 },
    lg: { py: 17, fontSize: 16, radius: 14 },
};

// Loading dots con ola
function PulsingDots() {
    const dots = [
        useSharedValue(0.3),
        useSharedValue(0.3),
        useSharedValue(0.3),
    ];

    useEffect(() => {
        dots.forEach((d, i) => {
            d.value = withDelay(i * 160, withRepeat(
                withSequence(
                    withTiming(1, { duration: 400, easing: Easing.inOut(Easing.sin) }),
                    withTiming(0.3, { duration: 400, easing: Easing.inOut(Easing.sin) })
                ), -1, false
            ));
        });

        return () => {
            dots.forEach((d) => cancelAnimation(d));
        };
    }, []);

    return (
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            {dots.map((d, i) => {
                const s = useAnimatedStyle(() => ({
                    opacity: d.value,
                    transform: [{ translateY: (1 - d.value) * 3 }],
                }));
                return (
                    <Animated.View key={i} style={[s, {
                        width: 7, height: 7, borderRadius: 4,
                        backgroundColor: 'white',
                    }]} />
                );
            })}
        </View>
    );
}

export function Button({
    label,
    onPress,
    variant = 'primary',
    loading = false,
    disabled = false,
    fullWidth = true,
    size = 'md',
    icon,
}: ButtonProps) {
    const scale = useSharedValue(1);
    const glowRadius = useSharedValue(12);
    const glowOpacity = useSharedValue(0.35);
    const shimmerX = useSharedValue(-200);
    const innerBrightness = useSharedValue(0);

    const isDisabled = disabled || loading;
    const isPrimary = variant === 'primary';
    const isDanger = variant === 'danger';
    const isOutline = variant === 'outline';
    const { py, fontSize, radius } = SIZES[size];

    useEffect(() => {
        if (isPrimary && !isDisabled) {
            shimmerX.value = withRepeat(
                withTiming(400, { duration: 2800, easing: Easing.inOut(Easing.quad) }),
                -1, false
            );
        }

        return () => {
            cancelAnimation(shimmerX);
        };
    }, [isPrimary, isDisabled]);

    const pressIn = () => {
        // Escala claramente visible pero no abrupta
        scale.value = withSpring(0.94, { damping: 12, stiffness: 280, mass: 0.7 });
        glowRadius.value = withTiming(28, { duration: 150 });
        glowOpacity.value = withTiming(0.75, { duration: 150 });
        innerBrightness.value = withTiming(1, { duration: 100 });
    };

    const pressOut = () => {
        scale.value = withSpring(1, { damping: 10, stiffness: 180, mass: 0.7 });
        glowRadius.value = withTiming(12, { duration: 400 });
        glowOpacity.value = withTiming(0.35, { duration: 400 });
        innerBrightness.value = withTiming(0, { duration: 250 });
    };

    const containerStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        shadowRadius: glowRadius.value,
        shadowOpacity: isDisabled ? 0 : glowOpacity.value,
    }));

    const shimmerStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: shimmerX.value }, { skewX: '-18deg' }],
    }));

    const overlayStyle = useAnimatedStyle(() => ({
        opacity: innerBrightness.value * 0.15,
    }));

    // Gradientes con contraste visible pero suave
    const gradientColors = (() => {
        if (isDisabled) return ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)'] as [string, string];
        if (isPrimary) return ['#2563EB', '#1741b5'] as [string, string];
        if (isDanger)  return ['#DC2626', '#991b1b'] as [string, string];
        if (isOutline) return ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.03)'] as [string, string];
        return ['transparent', 'transparent'] as [string, string];
    })();

    const glowColor = isPrimary ? '#3B82F6' : isDanger ? '#EF4444' : 'transparent';
    const textColor = isDisabled ? 'rgba(255,255,255,0.3)' : isOutline ? 'rgba(255,255,255,0.8)' : 'white';

    return (
        <Animated.View style={[
            containerStyle,
            {
                width: fullWidth ? '100%' : undefined,
                borderRadius: radius,
                shadowColor: glowColor,
                shadowOffset: { width: 0, height: 4 },
                elevation: isPrimary && !isDisabled ? 8 : 0,
                marginVertical: 10,
            }
        ]}>
            <Pressable
                onPress={isDisabled ? undefined : onPress}
                onPressIn={isDisabled ? undefined : pressIn}
                onPressOut={isDisabled ? undefined : pressOut}
                style={{ borderRadius: radius, overflow: 'hidden' }}
            >
                <LinearGradient
                    colors={gradientColors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        paddingVertical: py,
                        paddingHorizontal: 24,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 8,
                        borderWidth: isOutline ? 1 : 0,
                        borderColor: 'rgba(255,255,255,0.15)',
                        overflow: 'hidden',
                    }}
                >
                    {/* Shimmer sweep */}
                    {isPrimary && !isDisabled && (
                        <Animated.View style={[shimmerStyle, {
                            position: 'absolute',
                            top: 0, bottom: 0,
                            width: 80,
                            backgroundColor: 'rgba(255,255,255,0.18)',
                        }]} />
                    )}

                    {/* Brightness overlay al presionar */}
                    <Animated.View style={[overlayStyle, {
                        position: 'absolute', inset: 0,
                        backgroundColor: 'white',
                    }]} />

                    {loading ? <PulsingDots /> : (
                        <>
                            {icon}
                            <Text style={{
                                color: textColor,
                                fontSize,
                                fontWeight: '800',
                                letterSpacing: 1.5,
                                textTransform: 'uppercase',
                            }}>
                                {label}
                            </Text>
                        </>
                    )}
                </LinearGradient>
            </Pressable>
        </Animated.View>
    );
}
