import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Fonts, Radius, moderateScale, scale } from '../../theme';

// Paleta apagada tipo "metal" — antes cada variante tenía un fondo de color
// saturado (neón); ahora todas comparten el mismo fondo neutro (Colors.card)
// y solo el icono + un borde muy sutil llevan el acento, para un look más
// formal/de sala de entreno que de app consumer.
type MenuVariant = 'bronze' | 'steel' | 'oxide' | 'slate';

interface AdminMenuCardProps {
  variant: MenuVariant;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  index?: number;
}

const VARIANTS: Record<MenuVariant, string> = {
  bronze: '#C9A66B',
  steel: '#9CA3C4',
  oxide: '#C08272',
  slate: '#6FA8A3',
};

function usePressAnimation() {
  const scaleVal = useSharedValue(1);
  const opacityVal = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scaleVal.value }],
    opacity: opacityVal.value,
  }));

  const pressIn = () => {
    scaleVal.value = withSpring(0.96, { damping: 10, stiffness: 250, mass: 0.6 });
    opacityVal.value = withSpring(0.85, { damping: 10, stiffness: 250 });
  };
  const pressOut = () => {
    scaleVal.value = withSpring(1, { damping: 8, stiffness: 150, mass: 0.6 });
    opacityVal.value = withSpring(1, { damping: 8, stiffness: 150 });
  };

  return { style, pressIn, pressOut };
}

export function AdminMenuCard({ variant, icon, title, subtitle, onPress, index = 0 }: AdminMenuCardProps) {
  const accent = VARIANTS[variant];
  const { style: animStyle, pressIn, pressOut } = usePressAnimation();

  return (
    <Animated.View entering={FadeIn.duration(280).delay(40 + index * 45)}>
      <Animated.View style={animStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={pressIn}
          onPressOut={pressOut}
          style={{
            padding: scale(16),
            borderRadius: Radius.xl,
            backgroundColor: Colors.card,
            borderWidth: 1,
            borderColor: Colors.cardBorder,
            minHeight: scale(110),
            gap: scale(6),
            alignItems: 'center',
          }}
        >
          <View style={{
            width: scale(48), height: scale(48),
            borderRadius: Radius.md,
            backgroundColor: `${accent}18`,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: scale(4),
          }}>
            {icon}
          </View>
          <Text style={{ fontSize: moderateScale(15), fontFamily: Fonts.semiBold, color: Colors.textPrimary, textAlign: 'center' }}>
            {title}
          </Text>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textSecondary, textAlign: 'center' }}>
            {subtitle}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

interface AdminFeaturedCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/** Tile protagonista a todo lo ancho, para la sección que el cliente quiere destacar sobre el resto. */
export function AdminFeaturedCard({ icon, title, subtitle, onPress }: AdminFeaturedCardProps) {
  const { style: animStyle, pressIn, pressOut } = usePressAnimation();

  return (
    <Animated.View entering={FadeIn.duration(300)}>
      <Animated.View style={animStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={pressIn}
          onPressOut={pressOut}
          style={{
            paddingVertical: scale(24),
            paddingHorizontal: scale(20),
            borderRadius: Radius.xl,
            backgroundColor: 'rgba(59,130,246,0.08)',
            borderWidth: 1,
            borderColor: Colors.borderBlue,
            alignItems: 'center',
          }}
        >
          <View style={{
            width: scale(60), height: scale(60),
            borderRadius: scale(30),
            backgroundColor: 'rgba(59,130,246,0.15)',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: scale(12),
          }}>
            {icon}
          </View>
          <Text style={{ fontSize: moderateScale(19), fontFamily: Fonts.bold, color: Colors.textPrimary, letterSpacing: 0.3 }}>
            {title}
          </Text>
          <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, marginTop: scale(4) }}>
            {subtitle}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
