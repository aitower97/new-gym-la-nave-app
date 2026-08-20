/**
 * TodayWorkoutWidget.tsx - Widget persistente en MainMenu para la sesión de hoy
 *
 * Complementa al pop-up de "Hoy toca entrenar" (que solo se ve una vez al día):
 * si el usuario lo cierra o vuelve más tarde, este widget sigue visible mientras
 * el admin tenga una sesión preparada para hoy. Estados posibles:
 *  1. Sin reserva hoy      → CTA para reservar clase (ver [[workoutAccess.ts]]).
 *  2. Bloqueada            → countdown en vivo hasta la hora de la clase.
 *  3. Desbloqueada, sin ejercicios preparados → invita a registrar el entreno
 *     igualmente (entrenador no dejó sesión) — sigue visible todo el día.
 *  4. Desbloqueada, 0 logs → recordatorio de apuntar pesos.
 *  5. Desbloqueada, parcial→ progreso "X/Y registrados" con barra.
 *  6. Desbloqueada, completa → tarjeta de celebración.
 *
 * Dentro de los estados 3-5 hay además un matiz de tono según cuánto ha
 * pasado desde que se desbloqueó: durante la primera hora (CLASS_DURATION_MIN,
 * se asume que la clase está en curso) el mensaje es "estás entrenando, ve
 * apuntando" con una etiqueta "EN DIRECTO"; pasada esa hora es un recordatorio
 * más neutro, y así se queda hasta que acabe el día — al día siguiente el
 * ciclo vuelve a empezar solo porque todo esto se recalcula por fecha.
 */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { Colors, moderateScale, scale } from '../../theme';
import { CalendarIcon, CheckIcon, ChevronRightIcon, ClipboardIcon, LockIcon } from '../Icons';
import { TodayWorkoutAccess, formatUnlockTime } from '../../utils/workoutAccess';
import { SpringPressable } from '../ui/SpringPressable';

interface TodayWorkoutWidgetProps {
    exercises: string[];
    loggedCount?: number;
    access?: TodayWorkoutAccess | null;
    isLoading?: boolean;
    onPress?: () => void;
    /** Sin clase reservada hoy: navega a reservar en vez de al entreno. */
    onReserve?: () => void;
    /** Se llama una vez cuando el countdown local llega a 0, para recargar el desbloqueo real. */
    onUnlock?: () => void;
}

// Las clases no tienen hora de fin en la BD, así que se asume una duración
// fija para saber si el usuario está "en clase ahora" o ya ha terminado.
const CLASS_DURATION_MIN = 60;

function getMinutesSince(time: string): number {
    const [h, m, s] = time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, s || 0, 0);
    return Math.floor((Date.now() - target.getTime()) / 60000);
}

function getUnlockCountdown(time: string): { label: string; urgent: boolean; reached: boolean } {
    const [h, m, s] = time.split(':').map(Number);
    const target = new Date();
    target.setHours(h, m, s || 0, 0);
    const diff = target.getTime() - Date.now();

    if (diff <= 0) return { label: '¡Ya puedes entrenar!', urgent: true, reached: true };

    const totalMin = Math.floor(diff / 60000);
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;

    if (hours > 0) return { label: `${hours}h ${mins}m`, urgent: hours < 1, reached: false };
    return { label: `${mins} min`, urgent: true, reached: false };
}

// padding sin escalar (18, como Card.tsx) para que la caja de icono quede
// exactamente alineada en horizontal con los iconos de las cards de debajo.
// Sin marginHorizontal/marginBottom aquí a propósito: los aplica el
// contenedor que usa este widget (MainMenuScreen), para que el wrapper de
// medición del tutorial mida exactamente el mismo rectángulo que se ve en
// pantalla (si el margen vive dentro, measureInWindow lo incluye en la
// altura/anchura medida y el anillo de foco queda descuadrado).
const CARD_BASE = {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
} as const;

export function TodayWorkoutWidget({
    exercises, loggedCount = 0, access, isLoading, onPress, onReserve, onUnlock,
}: TodayWorkoutWidgetProps) {
    const sv = useSharedValue(1);
    const style = useAnimatedStyle(() => ({ transform: [{ scale: sv.value }] }));

    const shimmerOpacity = useSharedValue(0.5);
    useEffect(() => {
        if (isLoading) {
            shimmerOpacity.value = withRepeat(
                withSequence(
                    withTiming(0.9, { duration: 700, easing: Easing.inOut(Easing.sin) }),
                    withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.sin) })
                ), -1, false
            );
        }
    }, [isLoading]);
    const shimmerStyle = useAnimatedStyle(() => ({ opacity: shimmerOpacity.value }));

    const hasBookingToday = !!access?.hasBookingToday;
    const locked = hasBookingToday && !access!.isUnlocked;
    const unlockTime = access?.unlockTime ?? null;

    const [countdown, setCountdown] = useState({ label: '', urgent: false, reached: false });
    const pulseOpacity = useSharedValue(1);
    const dotScale = useSharedValue(1);
    const unlockFiredRef = useRef(false);

    useEffect(() => {
        unlockFiredRef.current = false;
        if (!locked || !unlockTime) return;
        const update = () => {
            const next = getUnlockCountdown(unlockTime);
            setCountdown(next);
            if (next.reached && !unlockFiredRef.current) {
                unlockFiredRef.current = true;
                onUnlock?.();
            }
        };
        update();
        const timer = setInterval(update, 30000);
        return () => clearInterval(timer);
    }, [locked, unlockTime]);

    // "En directo": dentro de la ventana de duración asumida de la clase,
    // justo después de desbloquearse. Pasada esa ventana pasa a ser un
    // recordatorio normal el resto del día.
    const [isLive, setIsLive] = useState(false);
    useEffect(() => {
        if (locked || !unlockTime) { setIsLive(false); return; }
        const update = () => {
            const mins = getMinutesSince(unlockTime);
            setIsLive(mins >= 0 && mins < CLASS_DURATION_MIN);
        };
        update();
        const timer = setInterval(update, 30000);
        return () => clearInterval(timer);
    }, [locked, unlockTime]);

    useEffect(() => {
        if ((locked && countdown.urgent) || isLive) {
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
    }, [locked, countdown.urgent, isLive]);

    const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
    const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

    if (isLoading) {
        return (
            <Animated.View style={[shimmerStyle, CARD_BASE, {
                borderColor: Colors.cardBorder,
                flexDirection: 'row',
                alignItems: 'center',
                gap: scale(10),
            }]}>
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: Colors.cardBorder }} />
                <View style={{ flex: 1, gap: 6 }}>
                    <View style={{ width: '35%', height: 8, borderRadius: 4, backgroundColor: Colors.cardBorder }} />
                    <View style={{ width: '50%', height: 13, borderRadius: 4, backgroundColor: Colors.cardBorder }} />
                    <View style={{ width: '70%', height: 8, borderRadius: 4, backgroundColor: Colors.cardBorder }} />
                </View>
            </Animated.View>
        );
    }

    // Sin clase reservada hoy: no hay hora de referencia, pero en vez de
    // desaparecer del todo, ofrecemos reservar O entrenar por tu cuenta.
    if (!hasBookingToday) {
        return (
            <View style={{
                ...CARD_BASE,
                borderColor: Colors.cardBorder,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: scale(12) }}>
                    <View style={{
                        width: 48, height: 48, borderRadius: 10,
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CalendarIcon size={20} color={Colors.blue400} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, marginBottom: 2 }} numberOfLines={1}>
                            SESIÓN DE HOY
                        </Text>
                        <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                            Sin clase reservada
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                            Reserva para ver la sesión, o entrena por tu cuenta
                        </Text>
                    </View>
                </View>
                <View style={{ flexDirection: 'row', gap: scale(8) }}>
                    <SpringPressable
                        onPress={() => onReserve?.()}
                        style={{
                            flex: 1, borderRadius: scale(10),
                            backgroundColor: 'rgba(59,130,246,0.12)',
                            borderWidth: 1, borderColor: 'rgba(59,130,246,0.35)',
                        }}
                    >
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: scale(9) }}>
                            <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400 }} numberOfLines={1}>
                                Reserva
                            </Text>
                        </View>
                    </SpringPressable>
                    <SpringPressable
                        onPress={() => onPress?.()}
                        style={{
                            flex: 1, borderRadius: scale(10),
                            backgroundColor: 'rgba(167,139,250,0.1)',
                            borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)',
                        }}
                    >
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: scale(9) }}>
                            <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: '#A78BFA' }} numberOfLines={1}>
                                Entrenar solo
                            </Text>
                        </View>
                    </SpringPressable>
                </View>
            </View>
        );
    }

    if (locked) {
        const urgentColor = countdown.urgent ? '#F59E0B' : Colors.blue400;
        return (
            <View style={{
                ...CARD_BASE,
                borderColor: countdown.urgent ? 'rgba(245,158,11,0.25)' : Colors.cardBorder,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), flex: 1 }}>
                    <View style={{
                        width: 48, height: 48, borderRadius: 10,
                        backgroundColor: countdown.urgent ? 'rgba(245,158,11,0.12)' : 'rgba(37,99,235,0.12)',
                        borderWidth: 1, borderColor: countdown.urgent ? 'rgba(245,158,11,0.4)' : 'rgba(59,130,246,0.35)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <LockIcon size={20} color={urgentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: urgentColor, letterSpacing: 0.8, marginBottom: 2 }} numberOfLines={1}>
                            SESIÓN DE HOY
                        </Text>
                        <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                            Bloqueada
                        </Text>
                        {unlockTime && (
                            <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                                Se desbloquea a las {formatUnlockTime(unlockTime)}
                            </Text>
                        )}
                    </View>
                </View>

                {unlockTime && (
                    <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
                            <Animated.View style={[dotStyle, { width: 6, height: 6, borderRadius: 3, backgroundColor: urgentColor }]} />
                            <Animated.Text
                                numberOfLines={1}
                                style={[pulseStyle, {
                                    fontSize: moderateScale(countdown.reached ? 13 : 18),
                                    fontWeight: '800',
                                    color: urgentColor,
                                    letterSpacing: -0.5,
                                    flexShrink: 1,
                                }]}
                            >
                                {countdown.label}
                            </Animated.Text>
                        </View>
                        {!countdown.reached && (
                            <Text style={{ fontSize: 10, color: Colors.textMuted }} numberOfLines={1}>para entrenar</Text>
                        )}
                    </View>
                )}
            </View>
        );
    }

    // Desbloqueada pero sin ejercicios preparados por el entrenador: antes
    // el widget desaparecía del todo aquí, dejando al usuario sin forma de
    // llegar a apuntar sus pesos ni recordárselo el resto del día.
    if (exercises.length === 0) {
        return (
            <Animated.View style={style}>
                <Pressable
                    onPress={onPress}
                    onPressIn={() => sv.value = withSpring(0.97, { damping: 14, stiffness: 300 })}
                    onPressOut={() => sv.value = withSpring(1, { damping: 12, stiffness: 200 })}
                    style={{
                        ...CARD_BASE,
                        borderColor: 'rgba(167,139,250,0.3)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: scale(10),
                    }}
                >
                    <View style={{
                        width: 48, height: 48, borderRadius: 10,
                        backgroundColor: 'rgba(167,139,250,0.12)',
                        borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ClipboardIcon size={20} color="#A78BFA" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            {isLive && (
                                <Animated.View style={[dotStyle, { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#F59E0B' }]} />
                            )}
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isLive ? '#F59E0B' : '#A78BFA', letterSpacing: 0.8 }} numberOfLines={1}>
                                {isLive ? 'EN DIRECTO' : 'SESIÓN DE HOY'}
                            </Text>
                        </View>
                        <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }} numberOfLines={1}>
                            {isLive ? '¡A tope con el entreno!' : '¡Apunta tus pesos!'}
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                            {isLive ? 'Ve apuntando tus pesos' : 'Tu entrenador no dejó ejercicios'}
                        </Text>
                    </View>
                    <ChevronRightIcon size={20} color="rgba(255,255,255,0.25)" strokeWidth={2} />
                </Pressable>
            </Animated.View>
        );
    }

    const total = exercises.length;
    const logged = Math.min(loggedCount, total);
    const completed = logged >= total;

    if (completed) {
        return (
            <Animated.View entering={FadeIn.duration(400)}>
                <Pressable
                    onPress={onPress}
                    style={{
                        borderRadius: 16,
                        padding: 18,
                        borderWidth: 1,
                        borderColor: 'rgba(34,197,94,0.3)',
                        backgroundColor: 'rgba(34,197,94,0.06)',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: scale(10),
                    }}
                >
                    <View style={{
                        width: 48, height: 48, borderRadius: 24,
                        backgroundColor: 'rgba(34,197,94,0.18)',
                        borderWidth: 1, borderColor: 'rgba(34,197,94,0.45)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CheckIcon size={20} color="#22C55E" strokeWidth={3} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#22C55E', letterSpacing: 0.8, marginBottom: 2 }} numberOfLines={1}>
                            SESIÓN DE HOY
                        </Text>
                        <Text style={{ fontSize: moderateScale(14), fontWeight: '800', color: Colors.textPrimary }} numberOfLines={1}>
                            ¡Sesión completada!
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }} numberOfLines={1}>
                            Registraste tus {total} ejercicio{total > 1 ? 's' : ''}
                        </Text>
                    </View>
                    <ChevronRightIcon size={20} color="rgba(255,255,255,0.25)" strokeWidth={2} />
                </Pressable>
            </Animated.View>
        );
    }

    const started = logged > 0;
    const progressPct = total > 0 ? logged / total : 0;

    return (
        <Animated.View style={style}>
            <Pressable
                onPress={onPress}
                onPressIn={() => sv.value = withSpring(0.97, { damping: 14, stiffness: 300 })}
                onPressOut={() => sv.value = withSpring(1, { damping: 12, stiffness: 200 })}
                style={{
                    backgroundColor: Colors.surface,
                    borderRadius: 16,
                    padding: 18,
                    borderWidth: 1,
                    borderColor: 'rgba(59,130,246,0.25)',
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10) }}>
                    <View style={{
                        width: 48, height: 48, borderRadius: 10,
                        backgroundColor: 'rgba(59,130,246,0.15)',
                        borderWidth: 1, borderColor: 'rgba(59,130,246,0.4)',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ClipboardIcon size={20} color={Colors.blue400} />
                    </View>

                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            {isLive && (
                                <Animated.View style={[dotStyle, { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#F59E0B' }]} />
                            )}
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isLive ? '#F59E0B' : Colors.blue400, letterSpacing: 0.8 }} numberOfLines={1}>
                                {isLive ? 'EN DIRECTO' : 'SESIÓN DE HOY'}
                            </Text>
                        </View>
                        <Text
                            style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textPrimary }}
                            numberOfLines={1}
                        >
                            {isLive && !started ? '¡A tope con el entreno!' : started ? `${logged}/${total} registrados` : '¡Apunta tus pesos!'}
                        </Text>
                        <Text
                            style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}
                            numberOfLines={1}
                        >
                            {isLive && !started ? 'Ve apuntando tus pesos' : `${total} ejercicio${total > 1 ? 's' : ''} de hoy`}
                        </Text>
                    </View>

                    <ChevronRightIcon size={20} color="rgba(255,255,255,0.25)" strokeWidth={2} />
                </View>

                {started && (
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: scale(10), overflow: 'hidden' }}>
                        <View style={{ width: `${Math.round(progressPct * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: Colors.blue400 }} />
                    </View>
                )}
            </Pressable>
        </Animated.View>
    );
}
