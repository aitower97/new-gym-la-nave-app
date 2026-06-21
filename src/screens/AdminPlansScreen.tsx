import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarCheckIcon, ChevronLeftIcon, CreditCardIcon, DumbbellIcon, LightningIcon } from '../components/Icons';
import { PlanCard } from '../components/plans/PlanCard';
import { FAB } from '../components/ui';
import { SpringPressable } from '../components/ui/SpringPressable';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useRequireAdmin } from '../hooks/useRequireAdmin';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminPlans'>;
};

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  billing_period: string;
  category: string;
  classes_per_week: number | null;
  is_active: boolean;
}

const CATEGORY_SECTIONS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  gym: { label: 'Sala de Gym', icon: <DumbbellIcon size={16} color="#3B82F6" strokeWidth={2.5} />, color: '#3B82F6' },
  classes: { label: 'Clases', icon: <CalendarCheckIcon size={16} color="#8B5CF6" strokeWidth={2.5} />, color: '#8B5CF6' },
  both: { label: 'Gym + Clases', icon: <LightningIcon size={16} color="#10B981" strokeWidth={2.5} />, color: '#10B981' },
};

export default function AdminPlansScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadPlans();
    });
    return unsubscribe;
  }, [navigation]);

  async function loadPlans() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      setPlans(data || []);
    } catch (error: any) {
      console.error('Error loading plans:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>

        {/* Header */}
        <Animated.View
          entering={FadeInDown.duration(400).springify()}
          style={{
            flexDirection: 'row', alignItems: 'center',
            paddingTop: insets.top + scale(12),
            paddingBottom: scale(16),
            paddingHorizontal: scale(20),
            borderBottomWidth: 1, borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <SpringPressable onPress={() => navigation.goBack()} style={{
            width: scale(40), height: scale(40),
            borderRadius: scale(20),
            backgroundColor: Colors.card,
            borderWidth: 1, borderColor: Colors.cardBorder,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </SpringPressable>
          <Text style={{ fontSize: moderateScale(20), fontWeight: '800', color: Colors.textPrimary, flex: 1 }}>
            Planes
          </Text>
        </Animated.View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : plans.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(40) }}>
            <View style={{
              width: scale(72), height: scale(72),
              borderRadius: scale(36),
              backgroundColor: Colors.card,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: scale(16),
            }}>
              <CreditCardIcon size={scale(32)} color={Colors.textDisabled} strokeWidth={1.5} />
            </View>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '700', color: Colors.textPrimary, marginBottom: scale(8) }}>
              No hay planes
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', lineHeight: scale(20) }}>
              Toca el botón + para crear el primer plan de membresía
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(100) }}
          >
            {['gym', 'classes', 'both'].map((cat) => {
              const section = CATEGORY_SECTIONS[cat];
              const catPlans = plans.filter(p => p.category === cat);
              if (catPlans.length === 0) return null;
              return (
                <View key={cat} style={{ marginBottom: scale(20) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginBottom: scale(10) }}>
                    {section.icon}
                    <Text style={{
                      fontSize: moderateScale(14), fontWeight: '700', color: Colors.textSecondary,
                      textTransform: 'uppercase', letterSpacing: 1,
                    }}>
                      {section.label}
                    </Text>
                  </View>
                  {catPlans.map((plan, i) => (
                    <PlanCard
                      key={plan.id}
                      name={plan.name}
                      description={plan.description}
                      price={plan.price}
                      currency={plan.currency}
                      billingPeriod={plan.billing_period}
                      category={plan.category}
                      classesPerWeek={plan.classes_per_week}
                      isActive={plan.is_active}
                      onPress={() => navigation.navigate('AdminPlanForm', { planId: plan.id })}
                      index={i}
                    />
                  ))}
                </View>
              );
            })}
          </ScrollView>
        )}

        <FAB onPress={() => navigation.navigate('AdminPlanForm', {})} />
      </View>
    </View>
  );
}
