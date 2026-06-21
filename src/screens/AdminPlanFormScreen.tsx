import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarCheckIcon, ChevronLeftIcon, DumbbellIcon, LightningIcon } from '../components/Icons';
import { Button, SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useRequireAdmin } from '../hooks/useRequireAdmin';

const CATEGORY_OPTIONS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'gym', label: 'Sala de Gym', icon: <DumbbellIcon size={18} color="#3B82F6" strokeWidth={2.5} /> },
  { key: 'classes', label: 'Clases', icon: <CalendarCheckIcon size={18} color="#8B5CF6" strokeWidth={2.5} /> },
  { key: 'both', label: 'Gym + Clases', icon: <LightningIcon size={18} color="#10B981" strokeWidth={2.5} /> },
];

const BILLING_OPTIONS: { key: string; label: string }[] = [
  { key: 'monthly', label: 'Mensual' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'yearly', label: 'Anual' },
];

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPlanForm'>;

export default function AdminPlanFormScreen({ route, navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const planId = route.params?.planId;
  const isEditing = !!planId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [classesPerWeek, setClassesPerWeek] = useState('');
  const [category, setCategory] = useState('gym');
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (planId) loadPlan();
  }, [planId]);

  async function loadPlan() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .eq('id', planId)
        .single();
      if (error) throw error;
      if (data) {
        setName(data.name || '');
        setDescription(data.description || '');
        setPrice(String(data.price ?? ''));
        setCurrency(data.currency || 'EUR');
        setClassesPerWeek(data.classes_per_week != null ? String(data.classes_per_week) : '');
        setCategory(data.category || 'gym');
        setBillingPeriod(data.billing_period || 'monthly');
        setIsActive(data.is_active ?? true);
      }
    } catch (error: any) {
      console.error('Error loading plan:', error);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Error', 'El nombre es obligatorio'); return; }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) { Alert.alert('Error', 'Introduce un precio válido'); return; }

    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price: priceNum,
        currency: currency.trim() || 'EUR',
        category,
        billing_period: billingPeriod,
        classes_per_week: classesPerWeek ? parseInt(classesPerWeek) : null,
        is_active: isActive,
      };

      if (isEditing) {
        const { error } = await supabase.from('membership_plans').update(payload).eq('id', planId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('membership_plans').insert([payload]);
        if (error) throw error;
      }

      navigation.goBack();
    } catch (error: any) {
      console.error('Error saving plan:', error);
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.blue500} />
      </View>
    );
  }

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
            {isEditing ? 'Editar Plan' : 'Nuevo Plan'}
          </Text>
        </Animated.View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: scale(20), paddingBottom: insets.bottom + scale(24) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Nombre */}
          <Animated.View entering={FadeInDown.duration(350).delay(80).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Nombre del plan *
            </Text>
            <TextInput
              style={{
                backgroundColor: Colors.inputBg,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.inputBorder,
                paddingHorizontal: scale(14),
                height: scale(48),
                fontSize: scale(15),
                color: Colors.textPrimary,
              }}
              value={name}
              onChangeText={setName}
              placeholder="Ej: Plan Premium"
              placeholderTextColor={Colors.placeholder}
            />
          </Animated.View>

          {/* Descripción */}
          <Animated.View entering={FadeInDown.duration(350).delay(120).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Descripción
            </Text>
            <TextInput
              style={{
                backgroundColor: Colors.inputBg,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.inputBorder,
                paddingHorizontal: scale(14),
                paddingVertical: scale(12),
                minHeight: scale(80),
                fontSize: scale(15),
                color: Colors.textPrimary,
                textAlignVertical: 'top',
              }}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe los beneficios del plan"
              placeholderTextColor={Colors.placeholder}
              multiline
              numberOfLines={3}
            />
          </Animated.View>

          {/* Categoría */}
          <Animated.View entering={FadeInDown.duration(350).delay(160).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Categoría *
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(8), flexWrap: 'wrap' }}>
              {CATEGORY_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setCategory(opt.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: scale(6),
                    paddingHorizontal: scale(16),
                    height: scale(44),
                    borderRadius: Radius.md,
                    borderWidth: 1.5,
                    borderColor: category === opt.key ? Colors.blue500 : Colors.cardBorder,
                    backgroundColor: category === opt.key ? 'rgba(59,130,246,0.1)' : Colors.card,
                  }}
                >
                  {opt.icon}
                  <Text style={{
                    fontSize: moderateScale(14), fontWeight: '600',
                    color: category === opt.key ? Colors.blue500 : Colors.textPrimary,
                  }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Periodo de facturación */}
          <Animated.View entering={FadeInDown.duration(350).delay(180).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Periodo de facturación *
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(8) }}>
              {BILLING_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  onPress={() => setBillingPeriod(opt.key)}
                  style={{
                    flex: 1,
                    paddingVertical: scale(12),
                    borderRadius: Radius.md,
                    borderWidth: 1.5,
                    borderColor: billingPeriod === opt.key ? Colors.blue500 : Colors.cardBorder,
                    backgroundColor: billingPeriod === opt.key ? 'rgba(59,130,246,0.1)' : Colors.card,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{
                    fontSize: moderateScale(13), fontWeight: '600',
                    color: billingPeriod === opt.key ? Colors.blue500 : Colors.textPrimary,
                  }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Precio + Moneda */}
          <Animated.View entering={FadeInDown.duration(350).delay(200).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Precio *
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(12) }}>
              <TextInput
                style={{
                  flex: 1,
                  backgroundColor: Colors.inputBg,
                  borderRadius: Radius.md,
                  borderWidth: 1, borderColor: Colors.inputBorder,
                  paddingHorizontal: scale(14),
                  height: scale(48),
                  fontSize: scale(15),
                  color: Colors.textPrimary,
                }}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00"
                placeholderTextColor={Colors.placeholder}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={{
                  width: scale(80),
                  backgroundColor: Colors.inputBg,
                  borderRadius: Radius.md,
                  borderWidth: 1, borderColor: Colors.inputBorder,
                  paddingHorizontal: scale(14),
                  height: scale(48),
                  fontSize: scale(15),
                  color: Colors.textPrimary,
                }}
                value={currency}
                onChangeText={setCurrency}
                placeholder="EUR"
                placeholderTextColor={Colors.placeholder}
                autoCapitalize="characters"
              />
            </View>
          </Animated.View>

          {/* Clases por semana */}
          <Animated.View entering={FadeInDown.duration(350).delay(240).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Clases por semana
            </Text>
            <TextInput
              style={{
                backgroundColor: Colors.inputBg,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.inputBorder,
                paddingHorizontal: scale(14),
                height: scale(48),
                fontSize: scale(15),
                color: Colors.textPrimary,
              }}
              value={classesPerWeek}
              onChangeText={setClassesPerWeek}
              placeholder="Ej: 5"
              placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad"
            />
          </Animated.View>

          {/* Activo */}
          <Animated.View entering={FadeInDown.duration(350).delay(280).springify()} style={{ marginBottom: scale(24) }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: Colors.card,
              padding: scale(16),
              borderRadius: Radius.md,
              borderWidth: 1, borderColor: Colors.cardBorder,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary }}>
                  Plan activo
                </Text>
                <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(2) }}>
                  Los usuarios podrán ver este plan
                </Text>
              </View>
              <Switch
                value={isActive}
                onValueChange={setIsActive}
                trackColor={{ false: Colors.cardBorder, true: 'rgba(59,130,246,0.4)' }}
                thumbColor={isActive ? Colors.blue500 : Colors.textMuted}
              />
            </View>
          </Animated.View>

          {/* Guardar */}
          <Animated.View entering={FadeInDown.duration(350).delay(320).springify()}>
            <Button
              onPress={handleSave}
              label={saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear plan'}
              loading={saving}
              disabled={saving}
              size="lg"
            />
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
}
