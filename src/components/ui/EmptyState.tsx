/**
 * EmptyState.tsx - Estado vacío reutilizable con icono + entrada animada
 *
 * Uso:
 * <EmptyState icon={<WavesIcon .../>} title="Día de descanso" subtitle="No hay clases programadas" />
 */

import { Text, View } from 'react-native';
import Animated, {
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useEffect } from 'react';

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
    const float = useSharedValue(0);

    useEffect(() => {
        float.value = withDelay(
            300,
            withRepeat(
                withSequence(
                    withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
                    withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) })
                ),
                -1,
                false
            )
        );
    }, []);

    const floatStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: float.value }],
    }));

    return (
        <Animated.View
            entering={FadeIn.duration(400)}
            style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20, gap: 8 }}
        >
            <Animated.View style={[floatStyle, {
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: 'rgba(255,255,255,0.04)',
                alignItems: 'center', justifyContent: 'center',
                marginBottom: 8,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
            }]}>
                {icon}
            </Animated.View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.3)' }}>
                {title}
            </Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
                {subtitle}
            </Text>
        </Animated.View>
    );
}
