import { Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronLeftIcon, ChevronRightIcon } from '../Icons';
import { Colors, moderateScale, scale } from '../../theme';
import { SpringPressable } from './SpringPressable';

interface MonthNavigatorProps {
  month: string;
  year: number;
  onPrev: () => void;
  onNext: () => void;
}

export function MonthNavigator({ month, year, onPrev, onNext }: MonthNavigatorProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(80).springify()}
      style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: scale(20),
        paddingTop: scale(16),
        paddingBottom: scale(8),
      }}
    >
      <SpringPressable
        onPress={onPrev}
        style={{
          width: scale(44), height: scale(44),
          borderRadius: scale(22),
          backgroundColor: Colors.card,
          borderWidth: 1, borderColor: Colors.cardBorder,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronLeftIcon size={scale(20)} color={Colors.textSecondary} strokeWidth={2.5} />
      </SpringPressable>

      <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary }}>
        {month} {year}
      </Text>

      <SpringPressable
        onPress={onNext}
        style={{
          width: scale(44), height: scale(44),
          borderRadius: scale(22),
          backgroundColor: Colors.card,
          borderWidth: 1, borderColor: Colors.cardBorder,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronRightIcon size={scale(20)} color={Colors.textSecondary} strokeWidth={2.5} />
      </SpringPressable>
    </Animated.View>
  );
}
