/**
 * Input.tsx - Input con transiciones muy suaves
 * Focus gradual, sin saltos bruscos
 */

import { useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import Animated, {
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

interface InputProps extends TextInputProps {
    label: string;
    hint?: string;
    optional?: boolean;
    error?: string;
    showToggle?: boolean;
}

export function Input({
    label,
    hint,
    optional,
    error,
    showToggle,
    secureTextEntry,
    ...props
}: InputProps) {
    const [hidden, setHidden] = useState(secureTextEntry ?? false);
    const focus = useSharedValue(0);

    const handleFocus = () => {
        focus.value = withTiming(1, { duration: 250 });
    };
    const handleBlur = () => {
        focus.value = withTiming(0, { duration: 350 });
    };

    const borderStyle = useAnimatedStyle(() => ({
        borderColor: interpolateColor(
            focus.value,
            [0, 1],
            [
                error ? '#7f1d1d' : 'rgba(255,255,255,0.08)',
                error ? '#EF4444' : 'rgba(96,165,250,0.6)',
            ]
        ),
        shadowOpacity: focus.value * 0.2,
    }));

    const labelStyle = useAnimatedStyle(() => ({
        opacity: 0.45 + focus.value * 0.35,
    }));

    return (
        <View style={{ marginBottom: 16 }}>
            <Animated.Text style={[
                labelStyle,
                {
                    fontSize: 11,
                    fontWeight: '600',
                    color: error ? '#EF4444' : '#93C5FD',
                    letterSpacing: 0.8,
                    marginBottom: 7,
                    textTransform: 'uppercase',
                }
            ]}>
                {label}
                {optional && (
                    <Text style={{ fontWeight: '400', color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>
                        {' '}(opcional)
                    </Text>
                )}
            </Animated.Text>

            <Animated.View style={[
                borderStyle,
                {
                    borderRadius: 12,
                    borderWidth: 1,
                    shadowColor: '#3B82F6',
                    shadowOffset: { width: 0, height: 0 },
                    shadowRadius: 10,
                    elevation: 0,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    overflow: 'hidden',
                    paddingRight: 10,
                }
            ]}>
                <TextInput
                    {...props}
                    secureTextEntry={hidden}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    placeholderTextColor="rgba(255,255,255,0.18)"
                    style={[
                        {
                            flex: 1,
                            color: 'white',
                            paddingVertical: 14,
                            paddingLeft: 16,
                            paddingRight: 18,
                            fontSize: 15,
                        },
                        props.style,
                    ]}
                />

                {showToggle && (
                    <Pressable
                        onPress={() => setHidden(v => !v)}
                        style={({ pressed }) => ({
                            minWidth: 88,
                            paddingVertical: 14,
                            paddingHorizontal: 18,
                            opacity: pressed ? 0.5 : 0.75,
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            borderLeftWidth: 2,
                            borderLeftColor: 'rgba(255,255,255,0.06)',
                            justifyContent: 'center',
                            alignItems: 'center',
                            marginRight: 8,
                        })}
                    >
                        <Text style={{ color: '#60A5FA', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 }}>
                            {hidden ? 'VER' : 'OCULTAR'}
                        </Text>
                    </Pressable>
                )}
            </Animated.View>

            {(hint || error) && (
                <Text style={{
                    fontSize: 11,
                    color: error ? '#EF4444' : 'rgba(255,255,255,0.25)',
                    marginTop: 5,
                    marginLeft: 2,
                }}>
                    {error ?? hint}
                </Text>
            )}
        </View>
    );
}
