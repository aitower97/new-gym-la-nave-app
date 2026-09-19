/**
 * ClassCard.tsx - Card de clase con spring real al presionar
 * Mismo diseño base que el original + profundidad y feedback táctil
 *
 * Uso:
 * <ClassCard classItem={cls} isExpanded={bool} isAdmin={bool} classes={allClasses}
 *   accentColor={typeColorMap[cls.name]} onToggle={fn} onBook={fn} onDelete={fn} onRemoveUser={fn} />
 */

import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { scale as s } from '../../theme';
import { LockIcon, TrashIcon, XIcon } from '../Icons';
import { formatUnlockCountdown } from '../../utils/bookingSettings';
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
    unlockAt?: string | null;
}

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
    /** Color del tipo de clase, elegido por el admin (utils/classTypes.ts). */
    accentColor: string;
    onToggle: () => void;
    onBook: () => void;
    onDelete: () => void;
    onRemoveUser: (userId: string) => void;
    /** Admin: ir a elegir usuarios para meter en esta clase (huecos "Libre" del desplegable). */
    onAddUser?: () => void;
}

export function ClassCard({
    classItem, isExpanded, isAdmin, classes, accentColor,
    onToggle, onBook, onDelete, onRemoveUser, onAddUser,
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
    const occColor = getOccupancyColor(classItem.bookedUsers.length, classItem.max_spots);
    const free = classItem.max_spots - classItem.bookedUsers.length;
    const unlockDate = classItem.unlockAt ? new Date(classItem.unlockAt) : null;
    const unlockTime = unlockDate ? unlockDate.getTime() : null;

    // Reloj propio de la card, en marcha solo mientras esté bloqueada — así el
    // candado se quita exactamente al llegar la hora y la cuenta atrás baja
    // segundo a segundo, sin depender de que el padre recargue datos.
    const [liveNow, setLiveNow] = useState(() => new Date());
    useEffect(() => {
        if (!unlockTime) return;
        setLiveNow(new Date());
        const id = setInterval(() => {
            const nowMs = Date.now();
            setLiveNow(new Date(nowMs));
            if (nowMs >= unlockTime) clearInterval(id);
        }, 1000);
        return () => clearInterval(id);
    }, [unlockTime]);

    // Uniforme para todas las cards del día bloqueado, esté alguien ya
    // reservado por plantilla o no — si no, se verían perfiles/avatares
    // de gente ya reservada asomando en unas cards sí y en otras no.
    const isLocked = !!unlockDate && liveNow < unlockDate;
    // El tipo 'locked' de BookButton ya no se usa: mientras isLocked el botón
    // ni se renderiza (lo cubre el overlay de toda la card), así que bookType
    // solo importa para el resto de estados.
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
                shadowColor: accentColor,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 10,
                elevation: isExpanded ? 6 : 3,
            },
        ]}>
            <Pressable
                disabled={isLocked}
                onPress={onToggle}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                style={{
                    flex: 1,
                    backgroundColor: isExpanded ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    borderRadius: 14,
                    padding: 18,
                    borderLeftWidth: 3,
                    borderLeftColor: accentColor,
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
                                <Avatar key={user.id} uri={user.avatar} size={28} index={i} name={user.name} />
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
                        ) : !isFinished && !isLocked ? (
                            <BookButton type={bookType} onPress={onBook} />
                        ) : null}
                    </View>
                </View>

                {/* Botón cancelar reserva */}
                {!isAdmin && isBooked && !isLocked && (
                    <BookButton type="cancel" onPress={onBook} label="Cancelar reserva" />
                )}

                {/* Expanded */}
                {isExpanded && (
                    <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                            {classItem.bookedUsers.map((user, i) => (
                                <View key={user.id} style={{ width: '30%', alignItems: 'center' }}>
                                    <View style={{ position: 'relative' }}>
                                        <Avatar uri={user.avatar} size={isAdmin ? 56 : 80} index={i} name={user.fullName || user.name} />
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
                            {(() => {
                                // El hueco solo es "tocar aquí" cuando esa acción tiene sentido:
                                // para el usuario, reservar (igual que el botón principal — no
                                // admin, no ya reservado a esta clase, no bloqueada, no terminada);
                                // para el admin, meter a un usuario concreto (reutiliza la pantalla
                                // de pre-reserva). Si no aplica ninguna, ni se muestra la cruz:
                                // parecía pulsable sin estar disponible desde ahí.
                                const canBookFromSlot = !isAdmin && !isBooked && !isLocked && !isFinished;
                                const canAddFromSlot = isAdmin && !isFinished && !!onAddUser;
                                const isTappable = canBookFromSlot || canAddFromSlot;
                                const handleSlotPress = canBookFromSlot ? onBook : onAddUser;
                                return Array.from({ length: free }).map((_, i) => {
                                    const slotBox = (
                                        <View style={{
                                            width: '100%', aspectRatio: 1, borderRadius: 12,
                                            backgroundColor: 'rgba(255,255,255,0.03)',
                                            borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
                                            borderStyle: 'dashed',
                                            alignItems: 'center', justifyContent: 'center', marginBottom: 6,
                                        }}>
                                            {isTappable && (
                                                <Text style={{ fontSize: 24, color: 'rgba(255,255,255,0.2)' }}>+</Text>
                                            )}
                                        </View>
                                    );
                                    return (
                                        <View key={`empty-${i}`} style={{ width: '30%', alignItems: 'center' }}>
                                            {isTappable && handleSlotPress ? (
                                                // width:'100%' explícito: sin él, este Pressable sin
                                                // tamaño propio colapsa a 0 y el width:'100%' del
                                                // slotBox de dentro se resuelve contra ese 0.
                                                <Pressable style={{ width: '100%' }} onPress={(e) => { e.stopPropagation(); handleSlotPress(); }}>
                                                    {slotBox}
                                                </Pressable>
                                            ) : slotBox}
                                            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', textAlign: 'center' }}>Libre</Text>
                                        </View>
                                    );
                                });
                            })()}
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

                {/* Overlay de bloqueo — cubre toda la card mientras falta antelación para reservar.
                    Color sólido (sin alpha) a propósito: nada de lo de detrás (avatares de gente
                    ya reservada por plantilla, barra de ocupación...) debe asomar. */}
                {!isAdmin && isLocked && unlockDate && (
                    <View pointerEvents="none" style={{
                        // left:-3 para tapar también la franja de acento (borderLeftWidth
                        // del Pressable, fuera del padding-box donde caería un left:0).
                        position: 'absolute', top: 0, left: -3, right: 0, bottom: 0,
                        borderRadius: 14,
                        backgroundColor: '#0a1220',
                        alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                        <LockIcon size={s(22)} color="rgba(255,255,255,0.55)" strokeWidth={2} />
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: '600', letterSpacing: 0.3 }}>
                            SE DESBLOQUEA EN
                        </Text>
                        <Text style={{ fontSize: 20, color: '#fff', fontWeight: '800', fontFamily: 'monospace', letterSpacing: 0.5 }}>
                            {formatUnlockCountdown(unlockDate, liveNow)}
                        </Text>
                    </View>
                )}
            </Pressable>
        </Animated.View>
    );
}
