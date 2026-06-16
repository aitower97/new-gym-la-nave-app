/**
 * NextClassWidget.tsx - Widget countdown próxima clase reservada
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
import { supabase } from '../../lib/supabase';
import { Colors, moderateScale, scale } from '../../theme';
import { CalendarIcon } from '../Icons';

interface NextClass {
    name: string;
    class_date: string;
    class_time: string;
}

function getCountdown(date: string, time: string): { label: string; urgent: boolean } {
    const [h, m] = time.split(':').map(Number);
    const target = new Date(date);
    target.setHours(h, m, 0, 0);
    const now = new Date();
    const diff = target.getTime() - now.getTime();

    if (diff <= 0) return { label: '¡En curso ahora!', urgent: true };

    const totalMin = Math.floor(diff / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    const days = Math.floor(hours / 24);

    if (days > 0) return { label: `${days}d ${hours % 24}h`, urgent: false };
    if (hours > 0) return { label: `${hours}h ${mins}m`, urgent: hours < 2 };
    return { label: `${mins} min`, urgent: true };
}

export function NextClassWidget() {
    const [nextClass, setNextClass] = useState<NextClass | null>(null);
    const [countdown, setCountdown] = useState({ label: '', urgent: false });
    const [loading, setLoading] = useState(true);

    const pulseOpacity = useSharedValue(1);
    const dotScale = useSharedValue(1);

    useEffect(() => {
        loadNextClass();
    }, []);

    useEffect(() => {
        if (!nextClass) return;
        const update = () => {
            setCountdown(getCountdown(nextClass.class_date, nextClass.class_time));
        };
        update();
        const timer = setInterval(update, 30000); // cada 30 seg
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

    async function loadNextClass() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const todayStr = new Date().toISOString().split('T')[0];

            // Traer todas las clases futuras y ordenar en cliente
            const { data } = await supabase
                .from('bookings')
                .select('classes(name, class_date, class_time)')
                .eq('user_id', user.id)
                .gte('classes.class_date', todayStr);

            if (!data || data.length === 0) return;

            // Ordenar por fecha+hora y coger la más próxima
            const now = new Date();
            const upcoming = data
                .map((b: any) => b.classes)
                .filter(Boolean)
                .filter((cls: any) => {
                    const [h, m] = cls.class_time.split(':').map(Number);
                    const classDate = new Date(cls.class_date);
                    classDate.setHours(h, m, 0, 0);
                    return classDate > now;
                })
                .sort((a: any, b: any) => {
                    const dateA = new Date(`${a.class_date}T${a.class_time}`);
                    const dateB = new Date(`${b.class_date}T${b.class_time}`);
                    return dateA.getTime() - dateB.getTime();
                });

            if (upcoming.length > 0) {
                setNextClass({
                    name: upcoming[0].name,
                    class_date: upcoming[0].class_date,
                    class_time: upcoming[0].class_time,
                });
            }
        } catch (e) {
            console.error('Error:', e);
        } finally {
            setLoading(false);
        }
    }

    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
    const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

    if (loading || !nextClass) return null;

    const isToday = nextClass.class_date === new Date().toISOString().split('T')[0];
    const dateLabel = isToday ? 'Hoy' : new Date(nextClass.class_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' });
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
                        backgroundColor: countdown.urgent ? 'rgba(245,158,11,0.12)' : 'rgba(37,99,235,0.12)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarIcon size={18} color={urgentColor} />
                    </View>

                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: urgentColor, letterSpacing: 0.8, marginBottom: 2 }}>
                            PRÓXIMA CLASE
                        </Text>
                        <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
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
                        {countdown.urgent && countdown.label !== '¡En curso ahora!' ? '¡Prepárate!' : 'para tu clase'}
                    </Text>
                </View>
            </View>
        </View>
    );
}
