/**
 * ClassCard.tsx - Card de clase con spring real al presionar
 * Mismo diseño base que el original + profundidad y feedback táctil
 *
 * Uso:
 * <ClassCard classItem={cls} isExpanded={bool} isAdmin={bool}
 *   classes={allClasses} onToggle={fn} onBook={fn} onDelete={fn} onRemoveUser={fn} />
 */

import { Pressable, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { scale as s } from '../../theme';
import { TrashIcon, XIcon } from '../Icons';
import { Avatar } from './Avatar';
import { BookButton } from './BookButton';

export interface ClassWithBookingsLike {
    id: string;
    name: string;
    class_time: string;
    max_spots: number;
    bookedUsers: { id: string; name: string; avatar: string | null; fullName?: string | null; email?: string | null }[];
    status: 'available' | 'full' | 'finished';
    isBookedByMe?: boolean;
}

const TYPE_CONFIG: Record<string, { accent: string }> = {
    'CROSS TRAINING': { accent: '#3B82F6' },
    'POWERLIFTING':   { accent: '#F59E0B' },
    'HALTEROFILIA':   { accent: '#EF4444' },
    'OPEN BOX':       { accent: '#10B981' },
};

function getOccupancyColor(booked: number, capacity: number): string {
    const ratio = booked / capacity;
    if (ratio >= 1) return '#EF4444';
    if (ratio >= 0.7) return '#F59E0B';
    return '#10B981';
}

interface ClassCardProps {
    classItem: ClassWithBookingsLike;
    isExpanded: boolean;
    isAdmin: boolean;
    classes: ClassWithBookingsLike[];
    onToggle: () => void;
    onBook: () => void;
    onDelete: () => void;
    onRemoveUser: (userId: string) => void;
}

export function ClassCard({
    classItem, isExpanded, isAdmin, classes,
    onToggle, onBook, onDelete, onRemoveUser,
}: ClassCardProps) {
    // Hooks de Reanimated - seguros aquí porque ClassCard es un componente
    // con identidad estable en su propio archivo, no una función anidada
    // recreada en cada render del padre.
    const pressScale = useSharedValue(1);
    const shadowOp = useSharedValue(0.18);

    const cardAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressScale.value }],
        shadowOpacity: shadowOp.value,
    }));

    const handlePressIn = () => {
        pressScale.value = withSpring(0.982, { damping: 16, stiffness: 320, mass: 0.6 });
        shadowOp.value = withTiming(0.32, { duration: 120 });
    };

    const handlePressOut = () => {
        pressScale.value = withSpring(1, { damping: 13, stiffness: 220, mass: 0.6 });
        shadowOp.value = withTiming(0.18, { duration: 280 });
    };

    const isBooked = classItem.isBookedByMe || false;
    const isFull = classItem.status === 'full';
    const isFinished = classItem.status === 'finished';
    const hasBookingToday = classes.some(c => c.isBookedByMe);
    const config = TYPE_CONFIG[classItem.name] || TYPE_CONFIG['CROSS TRAINING'];
    const occColor = getOccupancyColor(classItem.bookedUsers.length, classItem.max_spots);
    const free = classItem.max_spots - classItem.bookedUsers.length;
    const bookType = isBooked ? 'booked' : isFull ? 'full' : hasBookingToday ? 'change' : 'book';

    return (
        <Animated.View style={[
            cardAnimStyle,
            {
                flex: 1,
                borderRadius: 14,
                // Android: sin backgroundColor aquí, elevation dibuja la sombra
                // como un rectángulo en vez de seguir el borderRadius. Queda
                // tapado exactamente por el Pressable de abajo.
                backgroundColor: isExpanded ? '#1c2a3a' : '#141f2c',
                shadowColor: config.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 10,
                elevation: isExpanded ? 6 : 3,
            },
        ]}>
            <Pressable
                onPress={onToggle}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={{
                    flex: 1,
                    backgroundColor: isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    borderRadius: 14,
                    padding: 18,
                    borderLeftWidth: 3,
                    borderLeftColor: config.accent,
                }}
            >
                {/* Top row */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                        {/* Nombre + plazas */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingRight: 10 }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3, textTransform: 'uppercase', flexShrink: 1 }}>
                                {classItem.name}
                            </Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: occColor }} />
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600' }}>
                                    {isFull ? 'Completa' : `${free} ${free === 1 ? 'plaza' : 'plazas'}`}
                                </Text>
                            </View>
                        </View>

                        {/* Avatares con entrada escalonada */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 12 }}>
                            {classItem.bookedUsers.slice(0, 5).map((user, i) => (
                                <Avatar key={user.id} uri={user.avatar} size={28} index={i} />
                            ))}
                            {classItem.bookedUsers.length > 5 && (
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' }}>
                                    +{classItem.bookedUsers.length - 5}
                                </Text>
                            )}
                        </View>

                        {/* Barra ocupación */}
                        <View style={{ width: '100%', height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 10, marginBottom: 10, overflow: 'hidden' }}>
                            <View style={{ height: '100%', borderRadius: 2, backgroundColor: occColor, width: `${(classItem.bookedUsers.length / classItem.max_spots) * 100}%` }} />
                        </View>
                    </View>

                    {/* Botón derecha */}
                    <View style={{ alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 8 }}>
                        {isAdmin ? (
                            <Pressable
                                onPress={(e) => { e.stopPropagation(); onDelete(); }}
                                style={{
                                    width: 40, height: 40, borderRadius: 10,
                                    backgroundColor: 'rgba(239,68,68,0.12)',
                                    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
                                    alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                <TrashIcon size={s(18)} color="#EF4444" strokeWidth={2} />
                            </Pressable>
                        ) : !isFinished ? (
                            <BookButton type={bookType} onPress={onBook} />
                        ) : null}
                    </View>
                </View>

                {/* Botón cancelar reserva */}
                {!isAdmin && isBooked && (
                    <BookButton type="cancel" onPress={onBook} label="Cancelar reserva" />
                )}

                {/* Expanded */}
                {isExpanded && (
                    <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                            {classItem.bookedUsers.map((user, i) => (
                                <View key={user.id} style={{ width: '30%', alignItems: 'center' }}>
                                    <View style={{ position: 'relative' }}>
                                        <Avatar uri={user.avatar} size={isAdmin ? 56 : 80} index={i} />
                                        {isAdmin && (
                                            <Pressable
                                                onPress={() => onRemoveUser(user.id)}
                                                style={{
                                                    position: 'absolute', top: -4, right: -4,
                                                    width: 18, height: 18, borderRadius: 9,
                                                    backgroundColor: '#EF4444',
                                                    alignItems: 'center', justifyContent: 'center', zIndex: 10,
                                                }}
                                            >
                                                <XIcon size={s(10)} color="#fff" strokeWidth={3} />
                                            </Pressable>
                                        )}
                                    </View>
                                    <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600', textAlign: 'center', marginTop: 6 }} numberOfLines={1}>
                                        {user.name}
                                    </Text>
                                    {isAdmin && user.fullName && user.fullName !== user.name && (
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 1 }} numberOfLines={1}>
                                            {user.fullName}
                                        </Text>
                                    )}
                                    {isAdmin && user.email && (
                                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', marginTop: 1 }} numberOfLines={1}>
                                            {user.email}
                                        </Text>
                                    )}
                                </View>
                            ))}
                            {Array.from({ length: free }).map((_, i) => (
                                <View key={`empty-${i}`} style={{ width: '30%', alignItems: 'center' }}>
                                    <View style={{
                                        width: '100%', aspectRatio: 1, borderRadius: 12,
                                        backgroundColor: 'rgba(255,255,255,0.03)',
                                        borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
                                        borderStyle: 'dashed',
                                        alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                                    }}>
                                        <Text style={{ fontSize: 24, color: 'rgba(255,255,255,0.2)' }}>+</Text>
                                    </View>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center' }}>Libre</Text>
                                </View>
                            ))}
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
                            {[
                                { label: 'Capacidad', value: classItem.max_spots },
                                { label: 'Ocupación', value: `${Math.round((classItem.bookedUsers.length / classItem.max_spots) * 100)}%` },
                                { label: 'Plazas libres', value: free },
                            ].map(({ label, value }) => (
                                <View key={label} style={{ alignItems: 'center' }}>
                                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '500', marginBottom: 4 }}>{label}</Text>
                                    <Text style={{ fontSize: 18, color: '#fff', fontWeight: '700' }}>{value}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </Pressable>
        </Animated.View>
    );
}
