/**
 * WorkoutNotesWidget.tsx - Widget compacto en MainMenu
 * Solo muestra resumen + navega a WorkoutNotesScreen
 */

import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { Colors, moderateScale, scale } from '../../theme';

interface WorkoutNotesWidgetProps {
    onPress: () => void;
}

export function WorkoutNotesWidget({ onPress }: WorkoutNotesWidgetProps) {
    const [todayCount, setTodayCount] = useState(0);
    const [lastNote, setLastNote] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const sv = useSharedValue(1);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: sv.value }] }));

    const today = new Date().toISOString().split('T')[0];

    useEffect(() => { loadTodayNotes(); }, []);

    async function loadTodayNotes() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('workout_notes')
                .select('content')
                .eq('user_id', user.id)
                .eq('date', today)
                .order('created_at', { ascending: false });

            if (data) {
                setTodayCount(data.length);
                setLastNote(data[0]?.content ?? null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Animated.View style={style}>
            <TouchableOpacity
                onPress={onPress}
                onPressIn={() => sv.value = withSpring(0.97, { damping: 14, stiffness: 300 })}
                onPressOut={() => sv.value = withSpring(1, { damping: 12, stiffness: 200 })}
                activeOpacity={1}
                style={{
                    marginHorizontal: scale(20),
                    marginBottom: scale(12),
                    backgroundColor: Colors.surface,
                    borderRadius: 16,
                    padding: scale(14),
                    borderWidth: 1,
                    borderColor: Colors.cardBorder,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                }}
            >
                {/* Icono */}
                <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: 'rgba(139,92,246,0.12)',
                    alignItems: 'center', justifyContent: 'center',
                }}>
                    <Text style={{ fontSize: 16 }}>📝</Text>
                </View>

                {/* Texto */}
                <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#A78BFA', letterSpacing: 0.8 }}>
                        NOTAS DE HOY
                    </Text>
                    {loading ? (
                        <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>Cargando...</Text>
                    ) : todayCount === 0 ? (
                        <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                            Sin notas · Toca para añadir
                        </Text>
                    ) : (
                        <Animated.View entering={FadeIn.duration(300)}>
                            <Text style={{ fontSize: moderateScale(13), color: Colors.textPrimary, marginTop: 2 }} numberOfLines={1}>
                                {lastNote}
                            </Text>
                            {todayCount > 1 && (
                                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                                    +{todayCount - 1} nota{todayCount > 2 ? 's' : ''} más
                                </Text>
                            )}
                        </Animated.View>
                    )}
                </View>

                {/* Flecha */}
                <Text style={{ color: Colors.textMuted, fontSize: 16 }}>›</Text>
            </TouchableOpacity>
        </Animated.View>
    );
}
