/**
 * BackButton.tsx - Botón volver con spring muy suave
 */

import { Pressable, Text } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

export function BackButton({ onPress }: { onPress: () => void }) {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const style = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Animated.View style={style}>
            <Pressable
                onPress={onPress}
                onPressIn={() => {
                    scale.value = withSpring(0.9, { damping: 18, stiffness: 350 });
                    opacity.value = withTiming(0.6, { duration: 100 });
                }}
                onPressOut={() => {
                    scale.value = withSpring(1, { damping: 14, stiffness: 200 });
                    opacity.value = withTiming(1, { duration: 250 });
                }}
                style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
                    alignItems: 'center', justifyContent: 'center',
                }}
            >
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 19, lineHeight: 21 }}>←</Text>
            </Pressable>
        </Animated.View>
    );
}
