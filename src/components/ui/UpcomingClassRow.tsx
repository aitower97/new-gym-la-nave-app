import { Text, View } from 'react-native';
import Animated, { FadeInLeft } from 'react-native-reanimated';
import { Colors, Radius, moderateScale, scale } from '../../theme';

interface UpcomingClassRowProps {
  time: string;
  name: string;
  booked: number;
  capacity: number;
  index?: number;
}

function barColor(pct: number): string {
  if (pct >= 80) return Colors.danger;
  if (pct >= 60) return Colors.warning;
  return Colors.success;
}

export function UpcomingClassRow({ time, name, booked, capacity, index = 0 }: UpcomingClassRowProps) {
  const percentage = Math.round((booked / capacity) * 100);
  const fillCount = Math.round((percentage / 100) * 4);

  return (
    <Animated.View
      entering={FadeInLeft.duration(350).delay(index * 80).springify()}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: scale(12),
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        marginBottom: scale(8),
        borderWidth: 1,
        borderColor: Colors.cardBorder,
      }}
    >
      <View style={{ flex: 1, gap: scale(2) }}>
        <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.blue400 }}>
          {time}
        </Text>
        <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600' }}>
          {name}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: scale(4) }}>
        <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }}>
          {booked}/{capacity}
        </Text>
        <View style={{ flexDirection: 'row', gap: scale(4) }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View
              key={i}
              style={{
                width: scale(8), height: scale(8),
                borderRadius: scale(4),
                backgroundColor: i < fillCount ? barColor(percentage) : Colors.card,
              }}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
