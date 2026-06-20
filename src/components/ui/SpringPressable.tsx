import { Pressable, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

interface SpringPressableProps {
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  children: React.ReactNode;
  scaleTo?: number;
}

export function SpringPressable({ onPress, onLongPress, disabled, style, children, scaleTo = 0.94 }: SpringPressableProps) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={disabled}
        onPressIn={() => { s.value = withSpring(scaleTo, { damping: 12, stiffness: 280 }); }}
        onPressOut={() => { s.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
