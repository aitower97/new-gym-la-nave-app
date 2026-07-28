import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Radius, isTablet, moderateScale, scale } from '../../theme';

type MenuVariant = 'blue' | 'amber' | 'green' | 'purple' | 'teal' | 'rose';

interface AdminMenuCardProps {
  variant: MenuVariant;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  index?: number;
}

const VARIANTS: Record<MenuVariant, { accent: string; bg: string; border: string; iconBg: string }> = {
  blue:   { accent: '#3B82F6', bg: 'rgba(37,99,235,0.1)', border: 'rgba(59,130,246,0.25)', iconBg: 'rgba(37,99,235,0.12)' },
  amber:  { accent: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', iconBg: 'rgba(245,158,11,0.12)' },
  green:  { accent: '#10B981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', iconBg: 'rgba(16,185,129,0.12)' },
  purple: { accent: '#8B5CF6', bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.25)', iconBg: 'rgba(139,92,246,0.12)' },
  teal:   { accent: '#2DD4BF', bg: 'rgba(20,184,166,0.08)', border: 'rgba(20,184,166,0.25)', iconBg: 'rgba(20,184,166,0.12)' },
  rose:   { accent: '#F43F5E', bg: 'rgba(244,63,94,0.08)', border: 'rgba(244,63,94,0.25)', iconBg: 'rgba(244,63,94,0.12)' },
};

export function AdminMenuCard({ variant, icon, title, subtitle, onPress, index = 0 }: AdminMenuCardProps) {
  const v = VARIANTS[variant];
  const scaleVal = useSharedValue(1);
  const opacityVal = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleVal.value }],
    opacity: opacityVal.value,
  }));

  const pressIn = () => {
    scaleVal.value = withSpring(0.94, { damping: 10, stiffness: 250, mass: 0.6 });
    opacityVal.value = withSpring(0.7, { damping: 10, stiffness: 250 });
  };

  const pressOut = () => {
    scaleVal.value = withSpring(1, { damping: 8, stiffness: 150, mass: 0.6 });
    opacityVal.value = withSpring(1, { damping: 8, stiffness: 150 });
  };

  return (
    <Animated.View
      entering={FadeIn.duration(280).delay(40 + index * 45)}
      style={{ width: isTablet ? '30%' : '47%' }}
    >
      <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={{
          padding: scale(16),
          borderRadius: Radius.xl,
          backgroundColor: v.bg,
          borderWidth: 1,
          borderColor: v.border,
          minHeight: scale(110),
          gap: scale(6),
        }}
      >
        <View style={{
          width: scale(40), height: scale(40),
          borderRadius: Radius.md,
          backgroundColor: v.iconBg,
          alignItems: 'center', justifyContent: 'center',
          marginBottom: scale(4),
        }}>
          {icon}
        </View>
        <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.textPrimary }}>
          {title}
        </Text>
        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>
          {subtitle}
        </Text>
      </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
