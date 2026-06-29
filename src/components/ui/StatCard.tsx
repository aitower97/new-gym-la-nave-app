import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Colors, Radius, moderateScale, scale } from '../../theme';

interface StatCardProps {
  number: number;
  label: string;
  index?: number;
  icon?: React.ReactNode;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function StatCard({ number, label, index = 0, icon }: StatCardProps) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);
  const startTime = useRef<number>(0);
  const from = useRef(0);
  const duration = 900;

  useEffect(() => {
    from.current = display;
    startTime.current = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(from.current + (number - from.current) * eased);
      setDisplay(current);
      if (progress < 1) {
        raf.current = requestAnimationFrame(tick);
      }
    }

    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [number]);

  return (
    <Animated.View
      entering={FadeIn.duration(280).delay(index * 50)}
      style={{
        flex: 1,
        paddingVertical: scale(16),
        paddingHorizontal: scale(10),
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.cardBorder,
        alignItems: 'center',
        gap: scale(6),
      }}
    >
      {icon && (
        <View style={{
          width: scale(32), height: scale(32),
          borderRadius: Radius.sm,
          backgroundColor: 'rgba(37,99,235,0.1)',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: scale(2),
        }}>
          {icon}
        </View>
      )}
      <Text style={{
        fontSize: moderateScale(28),
        fontWeight: '800',
        color: Colors.blue400,
        letterSpacing: -0.5,
        includeFontPadding: false,
      }}>
        {display}
      </Text>
      <Text style={{
        fontSize: moderateScale(10),
        color: Colors.textMuted,
        fontWeight: '600',
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label}
      </Text>
    </Animated.View>
  );
}
