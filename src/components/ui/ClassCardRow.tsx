import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { SpringPressable } from './SpringPressable';

interface ClassCardRowProps {
  time: string;
  name: string;
  booked: number;
  capacity: number;
  onPress: () => void;
  index?: number;
}

function barColor(pct: number): string {
  if (pct >= 100) return Colors.danger;
  if (pct >= 80) return Colors.warning;
  return Colors.success;
}

export function ClassCardRow({ time, name, booked, capacity, onPress, index = 0 }: ClassCardRowProps) {
  const percentage = Math.round((booked / capacity) * 100);

  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(200 + index * 60).springify()}
    >
      <SpringPressable
        onPress={onPress}
        style={{
          padding: scale(16),
          backgroundColor: Colors.card,
          borderRadius: Radius.md,
          borderWidth: 1, borderColor: Colors.cardBorder,
          marginBottom: scale(8),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: scale(10) }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: scale(8) }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.blue500 }}>
              {time}
            </Text>
            <Text style={{ fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600' }} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: barColor(percentage) }}>
            {booked}/{capacity}
          </Text>
        </View>
        <View style={{
          width: '100%', height: scale(4),
          backgroundColor: 'rgba(255,255,255,0.08)',
          borderRadius: scale(2), overflow: 'hidden',
        }}>
          <View style={{
            width: `${percentage}%`, height: '100%',
            backgroundColor: barColor(percentage),
            borderRadius: scale(2),
          }} />
        </View>
      </SpringPressable>
    </Animated.View>
  );
}
