/**
 * ScreenHeader.tsx - Header de pantalla con BackButton + título + subtítulo
 * Entrada animada FadeInDown
 *
 * Uso:
 * <ScreenHeader title="Reservar Clases" subtitle="Encuentra tu..." onBack={fn} />
 */

import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BackButton } from './BackButton';
import { moderateScale, scale as s } from '../../theme';

interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    onBack: () => void;
    topInset: number;
    rightElement?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, onBack, topInset, rightElement }: ScreenHeaderProps) {
    return (
        <Animated.View
            entering={FadeInDown.duration(350).springify()}
            style={{
                flexDirection: 'row', alignItems: 'center',
                paddingTop: topInset + s(12),
                paddingBottom: s(16),
                paddingHorizontal: s(20),
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.07)',
                gap: s(12),
            }}
        >
            <BackButton onPress={onBack} />
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: '#fff' }}>
                    {title}
                </Text>
                {subtitle && (
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                        {subtitle}
                    </Text>
                )}
            </View>
            {rightElement}
        </Animated.View>
    );
}
