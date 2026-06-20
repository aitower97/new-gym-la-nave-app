import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { SpringPressable } from '../ui/SpringPressable';

interface PlanCardProps {
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billingPeriod: string;
  category: string;
  classesPerWeek: number | null;
  isActive: boolean;
  onPress: () => void;
  index?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  gym: 'Sala de Gym',
  classes: 'Clases',
  both: 'Gym + Clases',
};

const CATEGORY_COLORS: Record<string, { accent: string; bg: string }> = {
  gym: { accent: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  classes: { accent: '#A78BFA', bg: 'rgba(139,92,246,0.12)' },
  both: { accent: '#10B981', bg: 'rgba(16,185,129,0.12)' },
};

const BILLING_LABELS: Record<string, string> = {
  daily: '/día',
  monthly: '/mes',
  yearly: '/año',
};

export function PlanCard({ name, description, price, currency, billingPeriod, category, classesPerWeek, isActive, onPress, index = 0 }: PlanCardProps) {
  const cc = CATEGORY_COLORS[category] || CATEGORY_COLORS.gym;
  return (
    <Animated.View
      entering={FadeInDown.duration(350).delay(80 + index * 60).springify()}
    >
      <SpringPressable onPress={onPress} style={{
        padding: scale(16),
        backgroundColor: Colors.card,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: isActive ? 'rgba(59,130,246,0.3)' : Colors.cardBorder,
        marginBottom: scale(10),
        opacity: isActive ? 1 : 0.6,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, marginRight: scale(12) }}>
            <Text style={{ fontSize: moderateScale(16), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(4) }}>
              {name}
            </Text>
            {description && (
              <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, lineHeight: scale(18) }} numberOfLines={2}>
                {description}
              </Text>
            )}
            {classesPerWeek != null && (
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(6) }}>
                {classesPerWeek} clase{classesPerWeek !== 1 ? 's' : ''} por semana
              </Text>
            )}
          </View>

          <View style={{ alignItems: 'flex-end', gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(22), fontWeight: '800', color: cc.accent }}>
              {price.toFixed(2)} {currency}
            </Text>
            <View style={{
              paddingHorizontal: scale(8), paddingVertical: scale(3),
              borderRadius: Radius.full,
              backgroundColor: cc.bg,
            }}>
              <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: cc.accent }}>
                {BILLING_LABELS[billingPeriod] || billingPeriod}
              </Text>
            </View>
          </View>
        </View>
      </SpringPressable>
    </Animated.View>
  );
}
