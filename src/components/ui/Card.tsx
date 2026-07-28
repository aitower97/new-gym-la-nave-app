/**
 * Card.tsx - Card pressable reutilizable con animación spring
 *
 * Uso:
 * <Card onPress={fn} variant="primary" icon={<Icon />} title="Reservar" subtitle="texto" />
 * <Card onPress={fn} variant="secondary" icon={<Icon />} title="Mis Clases" subtitle="texto" />
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Image, ImageSourcePropType, Pressable, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

type CardVariant = 'primary' | 'secondary' | 'danger';

interface CardProps {
    onPress: () => void;
    variant?: CardVariant;
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    rightElement?: React.ReactNode;
    badge?: number;
    image?: ImageSourcePropType;
}

const GRADIENTS: Record<CardVariant, [string, string]> = {
    primary:   ['#2563EB', '#1a40a8'],
    secondary: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'],
    danger:    ['#DC2626', '#991b1b'],
};

// Igual que GRADIENTS pero translúcido, para dejar entrever la foto de fondo
// (difuminada) sin perder el color de marca ni el contraste del texto.
const IMAGE_GRADIENTS: Record<CardVariant, [string, string]> = {
    primary:   ['rgba(37,99,235,0.45)', 'rgba(26,64,168,0.6)'],
    secondary: ['rgba(13,25,45,0.35)', 'rgba(13,25,45,0.62)'],
    danger:    ['rgba(220,38,38,0.45)', 'rgba(153,27,27,0.6)'],
};

const ICON_BG: Record<CardVariant, string> = {
    primary:   'rgba(255,255,255,0.15)',
    secondary: 'rgba(37,99,235,0.12)',
    danger:    'rgba(255,255,255,0.15)',
};

// Fondo del icono cuando hay foto detrás: más opaco y cuadrado para que
// destaque sobre una imagen con muchos elementos, en vez del chip translúcido
// que se usa sobre el degradado plano.
const ICON_BG_ON_IMAGE: Record<CardVariant, string> = {
    primary:   'rgba(8,17,31,0.68)',
    secondary: 'rgba(8,17,31,0.75)',
    danger:    'rgba(8,17,31,0.68)',
};

const ICON_BORDER_ON_IMAGE: Record<CardVariant, string> = {
    primary:   'rgba(255,255,255,0.4)',
    secondary: 'rgba(59,130,246,0.5)',
    danger:    'rgba(255,255,255,0.4)',
};

const BORDER: Record<CardVariant, string> = {
    primary:   'rgba(59,130,246,0.4)',
    secondary: 'rgba(255,255,255,0.07)',
    danger:    'rgba(220,38,38,0.4)',
};

const TITLE_COLOR: Record<CardVariant, string> = {
    primary:   '#ffffff',
    secondary: 'rgba(255,255,255,0.9)',
    danger:    '#ffffff',
};

const SUBTITLE_COLOR: Record<CardVariant, string> = {
    primary:   'rgba(255,255,255,0.65)',
    secondary: 'rgba(255,255,255,0.4)',
    danger:    'rgba(255,255,255,0.65)',
};

export function Card({
    onPress,
    variant = 'secondary',
    icon,
    title,
    subtitle,
    rightElement,
    image,
}: CardProps) {
    const scale = useSharedValue(1);
    const shadowOp = useSharedValue(variant === 'primary' ? 0.35 : 0.15);

    const pressIn = () => {
        scale.value = withSpring(0.965, { damping: 14, stiffness: 300, mass: 0.6 });
        shadowOp.value = withTiming(0.6, { duration: 120 });
    };

    const pressOut = () => {
        scale.value = withSpring(1, { damping: 11, stiffness: 200, mass: 0.6 });
        shadowOp.value = withTiming(variant === 'primary' ? 0.35 : 0.15, { duration: 350 });
    };

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        shadowOpacity: shadowOp.value,
    }));

    return (
        <Animated.View style={[
            animStyle,
            {
                borderRadius: 18,
                shadowColor: variant === 'primary' ? '#2563EB' : '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: 12,
                elevation: variant === 'primary' ? 8 : 3,
            }
        ]}>
            <Pressable
                onPress={onPress}
                onPressIn={pressIn}
                onPressOut={pressOut}
                style={{ borderRadius: 18, overflow: 'hidden' }}
            >
                {image && (
                    <Image
                        source={image}
                        resizeMode="cover"
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 }}
                    />
                )}
                <LinearGradient
                    colors={image ? IMAGE_GRADIENTS[variant] : GRADIENTS[variant]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 18,
                        gap: 14,
                        borderWidth: 1,
                        borderColor: BORDER[variant],
                        borderRadius: 18,
                    }}
                >
                    {/* Icon box */}
                    <View style={{
                        width: 48, height: 48,
                        borderRadius: 10,
                        backgroundColor: image ? ICON_BG_ON_IMAGE[variant] : ICON_BG[variant],
                        borderWidth: image ? 1 : 0,
                        borderColor: image ? ICON_BORDER_ON_IMAGE[variant] : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {icon}
                    </View>

                    {/* Text */}
                    <View style={{ flex: 1, gap: 3 }}>
                        <Text style={{
                            fontSize: 16,
                            fontWeight: '700',
                            color: TITLE_COLOR[variant],
                            letterSpacing: -0.2,
                        }}>
                            {title}
                        </Text>
                        {subtitle && (
                            <Text style={{
                                fontSize: 13,
                                color: SUBTITLE_COLOR[variant],
                                fontWeight: '500',
                            }}>
                                {subtitle}
                            </Text>
                        )}
                    </View>

                    {/* Right element */}
                    {rightElement}
                </LinearGradient>
            </Pressable>
        </Animated.View>
    );
}
