/**
 * ContextBar.tsx - Barra de contexto: fecha + contador de clases animado
 *
 * Uso:
 * <ContextBar dateLabel="Lun 9 · junio" count={3} loading={false} />
 */

import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

interface ContextBarProps {
    dateLabel: string;
    count: number;
    loading: boolean;
}

export function ContextBar({ dateLabel, count, loading }: ContextBarProps) {
    const countOpacity = useSharedValue(1);
    const countScale = useSharedValue(1);

    // Pulso sutil cada vez que cambia el conteo (cambio de día)
    useEffect(() => {
        countOpacity.value = withSequence(
            withTiming(0.3, { duration: 100 }),
            withTiming(1, { duration: 200 })
        );
        countScale.value = withSequence(
            withTiming(0.9, { duration: 100 }),
            withTiming(1, { duration: 200 })
        );
    }, [count, loading]);

    const countStyle = useAnimatedStyle(() => ({
        opacity: countOpacity.value,
        transform: [{ scale: countScale.value }],
    }));

    return (
        <View style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 20, paddingHorizontal: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
        }}>
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: '500' }}>
                {dateLabel}
            </Text>
            <Animated.Text style={[countStyle, {
                fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace',
            }]}>
                {loading ? '...' : `${count} ${count === 1 ? 'clase' : 'clases'}`}
            </Animated.Text>
        </View>
    );
}
