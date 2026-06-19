import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Colors, Radius, moderateScale, scale } from '../../theme';

interface OccupancyBarProps {
  label: string;
  percentage: number;
}

function barColor(pct: number): string {
  'worklet';
  if (pct >= 80) return '#EF4444';
  if (pct >= 60) return '#F59E0B';
  return '#10B981';
}

export function OccupancyBar({ label, percentage }: OccupancyBarProps) {
  const widthVal = useSharedValue(0);

  useEffect(() => {
    widthVal.value = withTiming(percentage, { duration: 1000 });
  }, [percentage]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${widthVal.value}%`,
    backgroundColor: barColor(widthVal.value) as string,
  }));

  return (
    <View style={{
      marginTop: scale(14),
      padding: scale(16),
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: Colors.cardBorder,
    }}>
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: scale(10),
      }}>
        <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, fontWeight: '600' }}>
          {label}
        </Text>
        <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: barColor(percentage) }}>
          {percentage}%
        </Text>
      </View>
      <View style={{
        height: scale(10),
        backgroundColor: Colors.card,
        borderRadius: scale(5),
        overflow: 'hidden',
      }}>
        <Animated.View style={[barStyle, { height: '100%', borderRadius: scale(5) }]} />
      </View>
    </View>
  );
}
