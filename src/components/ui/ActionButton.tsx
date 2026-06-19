import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Colors, Radius, moderateScale, scale } from '../../theme';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

export function ActionButton({ icon, label, onPress }: ActionButtonProps) {
  const scaleVal = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleVal.value }],
  }));

  return (
    <Animated.View style={[animStyle, { flex: 1 }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scaleVal.value = withSpring(0.95, { damping: 12, stiffness: 280, mass: 0.5 }); }}
        onPressOut={() => { scaleVal.value = withSpring(1, { damping: 8, stiffness: 150, mass: 0.5 }); }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: scale(8),
          backgroundColor: 'rgba(59,130,246,0.12)',
          borderWidth: 1,
          borderColor: Colors.borderBlue,
          paddingVertical: scale(12),
          paddingHorizontal: scale(16),
          borderRadius: Radius.md,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {icon}
        <Text style={{ color: Colors.blue400, fontSize: moderateScale(14), fontWeight: '700' }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
