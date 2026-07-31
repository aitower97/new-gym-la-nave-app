import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, scale } from '../../theme';

interface FABProps {
  onPress: () => void;
}

export function FAB({ onPress }: FABProps) {
  const pressScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.15, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.4, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1, true
    );
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <Animated.View style={[containerStyle, {
      position: 'absolute', right: scale(20), bottom: scale(20),
      width: scale(64), height: scale(64),
      // Android: borderRadius + backgroundColor propios para que la sombra de
      // elevation sea circular en vez de cuadrada (antes no tenía ninguno).
      borderRadius: scale(32),
      backgroundColor: '#2563EB',
      shadowColor: '#2563EB',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 12,
    }]}>
      <Animated.View
        pointerEvents="none"
        style={[pulseStyle, {
          position: 'absolute',
          inset: -scale(6),
          borderRadius: scale(38),
          backgroundColor: '#2563EB',
        }]}
      />
      <Pressable
        onPress={onPress}
        onPressIn={() => { pressScale.value = withSpring(0.88, { damping: 14, stiffness: 300 }); }}
        onPressOut={() => { pressScale.value = withSpring(1, { damping: 10, stiffness: 180 }); }}
        style={{ borderRadius: scale(32), overflow: 'hidden', flex: 1 }}
      >
        <LinearGradient
          colors={['#2563EB', '#1741b5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{
            width: scale(4), height: scale(24),
            borderRadius: scale(2),
            backgroundColor: '#fff',
            position: 'absolute',
          }} />
          <View style={{
            width: scale(24), height: scale(4),
            borderRadius: scale(2),
            backgroundColor: '#fff',
          }} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}
