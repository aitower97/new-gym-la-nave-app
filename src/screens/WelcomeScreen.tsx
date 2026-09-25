import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    ScrollView,
    StatusBar,
    View
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
    cancelAnimation,
    Easing,
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BrandHeader, Button, WelcomeSlide } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { goHomeAfterLogin } from '../utils/postLogin';

const { width, height } = Dimensions.get('window');

type Props = {
    navigation: NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
};

// ─── SVG EMOJIS CON GLOW NEON ────────────────────────────────────────

function EmojiDumbbell({ size = 90, glow = 8 }: { size?: number; glow?: number }) {
    const c = '#3B82F6'; const c2 = '#60A5FA'; const dark = '#1E3A5F';
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
            <Defs>
                <RadialGradient id="g1" cx="50%" cy="40%" r="60%">
                    <Stop offset="0%" stopColor={c2} /><Stop offset="100%" stopColor={c} />
                </RadialGradient>
            </Defs>
            <Rect x="5" y="42" width="90" height="16" rx="8" fill={c} opacity="0.15" />
            <Rect x="28" y="45" width="44" height="10" rx="5" fill="url(#g1)" />
            <Rect x="28" y="45" width="44" height="3" rx="2" fill={c2} opacity="0.5" />
            <Rect x="6" y="30" width="16" height="40" rx="8" fill="url(#g1)" />
            <Rect x="6" y="30" width="16" height="8" rx="4" fill={c2} opacity="0.4" />
            <Rect x="8" y="30" width="4" height="40" rx="2" fill={dark} opacity="0.3" />
            <Rect x="22" y="36" width="6" height="28" rx="3" fill={c} />
            <Rect x="72" y="36" width="6" height="28" rx="3" fill={c} />
            <Rect x="78" y="30" width="16" height="40" rx="8" fill="url(#g1)" />
            <Rect x="78" y="30" width="16" height="8" rx="4" fill={c2} opacity="0.4" />
            <Rect x="88" y="30" width="4" height="40" rx="2" fill={dark} opacity="0.3" />
            <Rect x="6" y="30" width="16" height="40" rx="8" fill="none" stroke={c2} strokeWidth={glow * 0.3} opacity="0.8" />
            <Rect x="78" y="30" width="16" height="40" rx="8" fill="none" stroke={c2} strokeWidth={glow * 0.3} opacity="0.8" />
            <Rect x="28" y="45" width="44" height="10" rx="5" fill="none" stroke={c2} strokeWidth={glow * 0.2} opacity="0.6" />
        </Svg>
    );
}

function EmojiCalendar({ size = 90, glow = 8 }: { size?: number; glow?: number }) {
    const c = '#8B5CF6'; const c2 = '#A78BFA'; const cLight = '#C4B5FD';
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
            <Defs>
                <RadialGradient id="g2" cx="50%" cy="30%" r="70%">
                    <Stop offset="0%" stopColor={c2} /><Stop offset="100%" stopColor={c} />
                </RadialGradient>
            </Defs>
            <Rect x="10" y="20" width="80" height="68" rx="10" fill="url(#g2)" opacity="0.9" />
            <Rect x="10" y="20" width="80" height="26" rx="10" fill={c} />
            <Rect x="10" y="34" width="80" height="12" fill={c} />
            <Rect x="10" y="44" width="80" height="3" fill={c2} opacity="0.6" />
            <Rect x="28" y="10" width="8" height="20" rx="4" fill={cLight} />
            <Rect x="64" y="10" width="8" height="20" rx="4" fill={cLight} />
            {[0, 1, 2, 3].map(col =>
                [0, 1, 2].map(row => (
                    <Circle key={`${col}-${row}`} cx={24 + col * 18} cy={58 + row * 14}
                        r={col === 1 && row === 0 ? 5 : 3.5}
                        fill={col === 1 && row === 0 ? cLight : c2}
                        opacity={col === 1 && row === 0 ? 1 : 0.6} />
                ))
            )}
            <Rect x="10" y="20" width="80" height="68" rx="10" fill="none" stroke={cLight} strokeWidth={glow * 0.3} opacity="0.9" />
            <Rect x="28" y="10" width="8" height="20" rx="4" fill="none" stroke={cLight} strokeWidth={glow * 0.25} opacity="0.7" />
            <Rect x="64" y="10" width="8" height="20" rx="4" fill="none" stroke={cLight} strokeWidth={glow * 0.25} opacity="0.7" />
        </Svg>
    );
}

function EmojiBolt({ size = 90, glow = 8 }: { size?: number; glow?: number }) {
    const c = '#F59E0B'; const c2 = '#FCD34D'; const c3 = '#FEF08A';
    return (
        <Svg width={size} height={size} viewBox="0 0 100 100">
            <Defs>
                <RadialGradient id="g3" cx="40%" cy="30%" r="70%">
                    <Stop offset="0%" stopColor={c2} /><Stop offset="100%" stopColor={c} />
                </RadialGradient>
            </Defs>
            <Path d="M56 8 L30 52 L46 52 L44 92 L70 48 L54 48 Z" fill={c} opacity="0.2" />
            <Path d="M56 8 L30 52 L46 52 L44 92 L70 48 L54 48 Z" fill="url(#g3)" />
            <Path d="M54 12 L36 48 L46 48" fill="none" stroke={c3} strokeWidth="4" strokeLinecap="round" opacity="0.7" />
            <Path d="M56 8 L30 52 L46 52 L44 92 L70 48 L54 48 Z" fill="none"
                stroke={c2} strokeWidth={glow * 0.35} strokeLinejoin="round" opacity="0.9" />
        </Svg>
    );
}

// ─── WRAPPER NEON PULSANTE ───────────────────────────────────────────

function NeonIcon({ children, color }: { children: React.ReactNode; color: string }) {
    const scale = useSharedValue(1);
    const glowOpacity = useSharedValue(0.4);

    useEffect(() => {
        scale.value = withRepeat(
            withSequence(
                withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
                withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) })
            ), -1, false
        );
        glowOpacity.value = withRepeat(
            withSequence(
                withTiming(0.9, { duration: 1400 }),
                withTiming(0.2, { duration: 1400 })
            ), -1, false
        );

        return () => {
            cancelAnimation(scale);
            cancelAnimation(glowOpacity);
        };
    }, []);

    const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const glowStyle = useAnimatedStyle(() => ({
        opacity: glowOpacity.value,
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 24,
    }));

    return (
        <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
            <Animated.View style={glowStyle}>
                <Animated.View style={iconStyle}>{children}</Animated.View>
            </Animated.View>
        </View>
    );
}

// ─── PARTÍCULA FLOTANTE ──────────────────────────────────────────────

function FloatingParticle({ delay, x, size, opacity, color }: {
    delay: number; x: number; size: number; opacity: number; color: string;
}) {
    const translateY = useSharedValue(height * 0.9);
    const particleOpacity = useSharedValue(0);

    useEffect(() => {
        translateY.value = withDelay(
            delay,
            withRepeat(
                withTiming(-50, { duration: 5000 + Math.random() * 4000, easing: Easing.linear }),
                -1, false
            )
        );
        particleOpacity.value = withDelay(
            delay,
            withRepeat(
                withSequence(
                    withTiming(opacity, { duration: 1200 }),
                    withTiming(0, { duration: 1200 })
                ), -1, false
            )
        );

        return () => {
            cancelAnimation(translateY);
            cancelAnimation(particleOpacity);
        };
    }, []);

    const style = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: particleOpacity.value,
        position: 'absolute',
        left: x,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
    }));

    return <Animated.View style={style} />;
}

// ─── SLIDES ──────────────────────────────────────────────────────────

const SLIDES = [
    {
        icon: <EmojiDumbbell />,
        color: '#3B82F6',
        title: 'Entrena sin\ncomplicaciones',
        subtitle: 'Reserva tu clase favorita en segundos desde cualquier lugar.',
    },
    {
        icon: <EmojiCalendar />,
        color: '#8B5CF6',
        title: 'Plantillas\nautomáticas',
        subtitle: 'Configura tu semana una vez. El sistema reserva por ti cada semana.',
    },
    {
        icon: <EmojiBolt />,
        color: '#F59E0B',
        title: 'Siempre\nal día',
        subtitle: 'Notificaciones en tiempo real. Nunca te pierdas una clase.',
    },
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────

export default function WelcomeScreen({ navigation }: Props) {
    const insets = useSafeAreaInsets();
    const [checking, setChecking] = useState(true);
    const currentSlide = useSharedValue(0);
    const scrollRef = useRef<ScrollView>(null);
    const slideIndex = useRef(0);
    const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const logoScale = useSharedValue(0);
    const logoRotate = useSharedValue(-10);
    const glowOpacity = useSharedValue(0.3);

    const particles = useRef(Array.from({ length: 18 }, (_, i) => ({
        id: i,
        delay: i * 400,
        x: (width / 18) * i + Math.random() * 15,
        size: 3 + Math.random() * 6,
        opacity: 0.2 + Math.random() * 0.35,
        color: ['#185DBE', '#3B82F6', '#8B5CF6', '#F59E0B'][i % 4],
    }))).current;

    // Comprobar sesión activa al arrancar — si existe, saltar el Welcome
    useEffect(() => {
        supabase.auth.getSession().then(async ({ data: { session } }) => {
            if (session?.user) {
                await goHomeAfterLogin(navigation, session.user, 'replace');
            } else {
                setChecking(false);
            }
        });
    }, []);

    useEffect(() => {
        if (checking) return;
        logoScale.value = withDelay(300, withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.5)) }));
        logoRotate.value = withDelay(300, withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1.2)) }));
        glowOpacity.value = withRepeat(
            withSequence(withTiming(0.5, { duration: 2000 }), withTiming(0.15, { duration: 2000 })),
            -1, false
        );

        autoPlayRef.current = setInterval(() => {
            const next = (slideIndex.current + 1) % SLIDES.length;
            goToSlide(next);
        }, 7500);

        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current);
            cancelAnimation(logoScale);
            cancelAnimation(logoRotate);
            cancelAnimation(glowOpacity);
        };
    }, [checking]);

    function goToSlide(index: number) {
        const clamped = Math.max(0, Math.min(SLIDES.length - 1, index));
        slideIndex.current = clamped;
        currentSlide.value = clamped;
        scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    }

    function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
        const page = Math.round(e.nativeEvent.contentOffset.x / width);
        if (page !== slideIndex.current) {
            slideIndex.current = page;
            currentSlide.value = page;
            // Reiniciar autoplay tras swipe manual
            if (autoPlayRef.current) clearInterval(autoPlayRef.current);
            autoPlayRef.current = setInterval(() => {
                const next = (slideIndex.current + 1) % SLIDES.length;
                goToSlide(next);
            }, 3500);
        }
    }

    const logoStyle = useAnimatedStyle(() => ({
        transform: [{ scale: logoScale.value }, { rotate: `${logoRotate.value}deg` }],
    }));
    const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

    if (checking) {
        return (
            <View style={{ flex: 1, backgroundColor: '#08111f', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
                <StatusBar barStyle="light-content" backgroundColor="#08111f" />
                <BrandHeader
                    title="LA NAVE"
                    subtitle="STRENGTH CENTER"
                    logoSize={96}
                    imageSize={72}
                    variant="plain"
                    logoContainerStyle={{
                        backgroundColor: 'white',
                        shadowColor: '#185DBE',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 18,
                        elevation: 22,
                    }}
                    titleStyle={{ marginTop: 8, fontSize: 30, letterSpacing: 5 }}
                    subtitleStyle={{ fontSize: 12, letterSpacing: 3 }}
                />
                <ActivityIndicator size="large" color={Colors.blue500} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#08111f' }}>
            <StatusBar barStyle="light-content" backgroundColor="#08111f" />

            {/* Partículas */}
            <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
                {particles.map((p) => (
                    <FloatingParticle key={p.id} delay={p.delay} x={p.x} size={p.size} opacity={p.opacity} color={p.color} />
                ))}
            </View>

            {/* Círculo glow fondo */}
            <Animated.View style={[glowStyle, {
                position: 'absolute',
                width: width * 1.2, height: width * 1.2,
                borderRadius: width * 0.6,
                backgroundColor: '#185DBE',
                top: -width * 0.5, left: -width * 0.1,
            }]} />

            <View style={{ flex: 1, alignItems: 'center', paddingTop: insets.top + 8 }}>

                <Animated.View style={[logoStyle, { alignItems: 'center', marginTop: 8, marginBottom: 0 }]}> 
                    <BrandHeader
                        title="LA NAVE"
                        subtitle="STRENGTH CENTER"
                        logoSize={96}
                        imageSize={72}
                        variant="plain"
                        style={{ marginBottom: 0 }}
                        logoContainerStyle={{
                            backgroundColor: 'white',
                            shadowColor: '#185DBE',
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.8,
                            shadowRadius: 18,
                            elevation: 22,
                        }}
                        titleStyle={{ marginTop: 8, fontSize: 30, letterSpacing: 5 }}
                        subtitleStyle={{ fontSize: 12, letterSpacing: 3 }}
                    />
                </Animated.View>

                <Animated.View
                    entering={FadeIn.delay(800).duration(600)}
                    style={{ flex: 1, width: '100%', marginTop: 16 }}
                >
                    <ScrollView
                        ref={scrollRef}
                        horizontal
                        pagingEnabled
                        showsHorizontalScrollIndicator={false}
                        onMomentumScrollEnd={handleScroll}
                        scrollEventThrottle={16}
                        decelerationRate="fast"
                        style={{ flex: 1 }}
                    >
                                {SLIDES.map((slide, index) => (
                            <WelcomeSlide
                                key={index}
                                icon={
                                    <NeonIcon color={slide.color}>
                                        {slide.icon}
                                    </NeonIcon>
                                }
                                title={slide.title}
                                subtitle={slide.subtitle}
                                width={width}
                            />
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* Dots */}
                <Animated.View
                    entering={FadeIn.delay(1000).duration(600)}
                    style={{ flexDirection: 'row', marginBottom: 20 }}
                >
                    {SLIDES.map((slide, index) => (
                        <DotIndicator
                            key={index}
                            index={index}
                            color={slide.color}
                            currentSlide={currentSlide}
                            onPress={() => {
                                if (autoPlayRef.current) clearInterval(autoPlayRef.current);
                                goToSlide(index);
                            }}
                            isLast={index === SLIDES.length - 1}
                        />
                    ))}
                </Animated.View>

                {/* BOTONES */}
                <View style={{ width: '100%', paddingHorizontal: 24, paddingBottom: insets.bottom + 20 }}>
                    <Animated.View entering={FadeIn.delay(1200).duration(500)}>
                        <Button
                            label="Iniciar Sesión"
                            onPress={() => navigation.navigate('Login')}
                            size="lg"
                            fullWidth
                        />
                    </Animated.View>
                    <Animated.View entering={FadeIn.delay(1400).duration(500)}>
                        <Button
                            label="Crear cuenta"
                            onPress={() => navigation.navigate('Register')}
                            variant="outline"
                            size="lg"
                            fullWidth
                        />
                    </Animated.View>
                </View>
            </View>
        </View>
    );
}

// ─── DOT INDICATOR ───────────────────────────────────────────────────

function DotIndicator({ index, color, currentSlide, onPress, isLast = false }: {
    index: number; color: string; currentSlide: SharedValue<number>;
    onPress: () => void; isLast?: boolean;
}) {
    const style = useAnimatedStyle(() => {
        const isActive = Math.round(currentSlide.value) === index;
        return {
            width: withTiming(isActive ? 28 : 8, { duration: 300 }),
            height: 8, borderRadius: 4,
            backgroundColor: withTiming(isActive ? color : 'rgba(255,255,255,0.25)', { duration: 300 }),
        };
    });

    return (
        <Pressable onPress={onPress} style={{ marginRight: isLast ? 0 : 8 }}>
            <Animated.View style={style} />
        </Pressable>
    );
}