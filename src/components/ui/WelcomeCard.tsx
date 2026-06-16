import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

interface WelcomeCardProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export function WelcomeCard({ label, onPress, variant = 'primary' }: WelcomeCardProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const backgroundColor = variant === 'primary' ? '#185DBE' : 'transparent';
  const borderColor = variant === 'primary' ? '#185DBE' : 'rgba(255,255,255,0.2)';
  const textColor = variant === 'primary' ? 'white' : 'rgba(255,255,255,0.8)';

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.98, { damping: 16, stiffness: 260 });
          opacity.value = withTiming(0.8, { duration: 120 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 12, stiffness: 180 });
          opacity.value = withTiming(1, { duration: 180 });
        }}
        style={{
          width: '100%',
          borderRadius: 24,
          paddingVertical: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
          borderWidth: 1,
          borderColor,
        }}
      >
        <Text style={{ color: textColor, fontWeight: '700', fontSize: 16, letterSpacing: 0.6 }}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
