/**
 * NextClassWidget.tsx - Widget próxima clase (datos desde MainMenu)
 */

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import { Colors, moderateScale, scale } from '../../theme';
import { CalendarIcon } from '../Icons';

interface NextClassWidgetProps {
    nextClass: {
        name: string;
        class_date: string;
        class_time: string;
    } | null;
    isLoading?: boolean;
}

function getCountdown(date: string, time: string): { label: string; urgent: boolean } {
    const [h, m] = time.split(':').map(Number);
    const target = new Date(date);
    target.setHours(h, m, 0, 0);
    const diff = target.getTime() - new Date().getTime();

    if (diff <= 0) return { label: '¡En curso!', urgent: true };

    const totalMin = Math.floor(diff / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const days = Math.floor(hours / 24);

    if (days > 0) return { label: `${days}d ${hours % 24}h`, urgent: false };
    if (hours > 0) return { label: `${hours}h ${mins}m`, urgent: hours < 2 };
    return { label: `${mins} min`, urgent: true };
}

export function NextClassWidget({ nextClass, isLoading }: NextClassWidgetProps) {
    const [countdown, setCountdown] = useState({ label: '', urgent: false });

    const pulseOpacity = useSharedValue(1);
    const dotScale = useSharedValue(1);

    // Actualizar countdown cada 30 segundos
    useEffect(() => {
        if (!nextClass) return;
        const update = () => setCountdown(getCountdown(nextClass.class_date, nextClass.class_time));
        update();
        const timer = setInterval(update, 30000);
        return () => clearInterval(timer);
    }, [nextClass]);

    // Pulso cuando es urgente
    useEffect(() => {
        if (countdown.urgent) {
            pulseOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.sin) }),
                    withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) })
                ), -1, false
            );
            dotScale.value = withRepeat(
                withSequence(
                    withTiming(1.4, { duration: 600 }),
                    withTiming(1, { duration: 600 })
                ), -1, false
            );
        } else {
            pulseOpacity.value = withTiming(1, { duration: 300 });
            dotScale.value = withTiming(1, { duration: 300 });
        }
    }, [countdown.urgent]);

    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
    const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

    if (isLoading) {
        return (
            <View style={{
                marginHorizontal: scale(20),
                marginBottom: scale(12),
                backgroundColor: Colors.surface,
                borderRadius: 16,
                height: scale(70),
                borderWidth: 1,
                borderColor: Colors.cardBorder,
            }} />
        );
    }

    if (!nextClass) return null;

    const isToday = nextClass.class_date === new Date().toISOString().split('T')[0];
    const dateLabel = isToday
        ? 'Hoy'
        : new Date(nextClass.class_date + 'T00:00:00').toLocaleDateString('es-ES', {
            weekday: 'short', day: 'numeric',
        });
    const urgentColor = countdown.urgent ? '#F59E0B' : Colors.blue400;

    return (
        <View style={{
            marginHorizontal: scale(20),
            marginBottom: scale(12),
            backgroundColor: Colors.surface,
            borderRadius: 16,
            padding: scale(14),
            borderWidth: 1,
            borderColor: countdown.urgent ? 'rgba(245,158,11,0.25)' : Colors.cardBorder,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Left */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), flex: 1 }}>
                    <View style={{
                        width: 36, height: 36, borderRadius: 10,
                        backgroundColor: countdown.urgent
                            ? 'rgba(245,158,11,0.12)'
                            : 'rgba(37,99,235,0.12)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarIcon size={18} color={urgentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{
                            fontSize: 10, fontWeight: '700',
                            color: urgentColor, letterSpacing: 0.8, marginBottom: 2,
                        }}>
                            PRÓXIMA CLASE
                        </Text>
                        <Text style={{
                            fontSize: moderateScale(13), fontWeight: '700',
                            color: Colors.textPrimary,
                        }} numberOfLines={1}>
                            {nextClass.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                            {dateLabel} · {nextClass.class_time.slice(0, 5)}
                        </Text>
                    </View>
                </View>

                {/* Countdown */}
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Animated.View style={[dotStyle, {
                            width: 6, height: 6, borderRadius: 3,
                            backgroundColor: urgentColor,
                        }]} />
                        <Animated.Text style={[pulseStyle, {
                            fontSize: moderateScale(18),
                            fontWeight: '800',
                            color: urgentColor,
                            letterSpacing: -0.5,
                        }]}>
                            {countdown.label}
                        </Animated.Text>
                    </View>
                    <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                        {countdown.urgent && countdown.label !== '¡En curso!'
                            ? '¡Prepárate!'
                            : 'para tu clase'}
                    </Text>
                </View>
            </View>
        </View>
    );
}
