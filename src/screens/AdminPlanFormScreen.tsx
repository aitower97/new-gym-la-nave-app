import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon, PlusIcon, TrashIcon, XIcon } from '../components/Icons';
import { Button, CategoryDot, SpringPressable } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { categoryColor, categoryLabel, collectCategories } from '../utils/planCategories';
import { BillingPeriod, getPeriodMonths } from '../utils/planPayments';

const BILLING_OPTIONS: { key: string; label: string }[] = [
  { key: 'monthly', label: 'Mensual' },
  { key: 'quarterly', label: 'Trimestral' },
  { key: 'yearly', label: 'Anual' },
];

type PlanType = 'recurring' | 'bono';

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
  const [classesPerMonth, setClassesPerMonth] = useState('');
  const [category, setCategory] = useState('gym');
  const [planType, setPlanType] = useState<PlanType>('recurring');
  const [billingPeriod, setBillingPeriod] = useState('monthly');
  const [validityDays, setValidityDays] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [categories, setCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryText, setNewCategoryText] = useState('');

  useEffect(() => {
    if (planId) loadPlan();
    loadCategories();
  }, [planId]);

  async function loadCategories() {
    const { data } = await supabase.from('membership_plans').select('category');
    setCategories(collectCategories((data || []).map((r: any) => r.category)));
  }

  function handleAddCategory() {
    const value = newCategoryText.trim();
    if (!value) return;
    setCategories((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setCategory(value);
    setNewCategoryText('');
    setAddingCategory(false);
  }

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
        setClassesPerMonth(data.classes_per_month != null ? String(data.classes_per_month) : '');
        setCategory(data.category || 'gym');
        if (data.billing_period === 'once') {
          setPlanType('bono');
          setValidityDays(data.validity_days != null ? String(data.validity_days) : '');
        } else {
          setPlanType('recurring');
          setBillingPeriod(data.billing_period || 'monthly');
        }
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
    const validityDaysNum = validityDays ? parseInt(validityDays) : NaN;
    if (planType === 'bono' && (isNaN(validityDaysNum) || validityDaysNum <= 0)) {
      Alert.alert('Error', 'Introduce la validez del bono en días');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        price: priceNum,
        currency: currency.trim() || 'EUR',
        category,
        billing_period: planType === 'bono' ? 'once' : billingPeriod,
        validity_days: planType === 'bono' ? validityDaysNum : null,
        classes_per_month: classesPerMonth ? parseInt(classesPerMonth) : null,
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

  function handleDeletePlan() {
    Alert.alert(
      'Eliminar plan',
      `¿Eliminar "${name}"? Los usuarios que lo tengan asignado se quedarán sin plan. Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              const { error } = await supabase.from('membership_plans').delete().eq('id', planId);
              if (error) throw error;
              navigation.goBack();
            } catch (error: any) {
              console.error('Error deleting plan:', error);
              // 23503 = violación de FK — hay reservas/membresías que aún lo referencian.
              Alert.alert(
                'No se pudo eliminar',
                error.code === '23503'
                  ? 'Este plan sigue en uso por alguna membresía registrada y no se puede borrar.'
                  : error.message
              );
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
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
          {isEditing && (
            <SpringPressable onPress={handleDeletePlan} disabled={saving} style={{
              width: scale(40), height: scale(40),
              borderRadius: scale(20),
              backgroundColor: 'rgba(239,68,68,0.12)',
              borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <TrashIcon size={scale(18)} color="#EF4444" />
            </SpringPressable>
          )}
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
              {categories.map((cat) => {
                const color = categoryColor(cat);
                const selected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setCategory(cat);
                      setAddingCategory(false);
                      setNewCategoryText('');
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: scale(6),
                      paddingHorizontal: scale(14),
                      height: scale(40),
                      borderRadius: Radius.md,
                      borderWidth: 1.5,
                      borderColor: selected ? color : Colors.cardBorder,
                      backgroundColor: selected ? color + '1A' : Colors.card,
                    }}
                  >
                    <CategoryDot color={color} />
                    <Text numberOfLines={1} style={{
                      fontSize: moderateScale(13), fontWeight: '600',
                      color: selected ? color : Colors.textPrimary,
                    }}>
                      {categoryLabel(cat)}
                    </Text>
                  </Pressable>
                );
              })}

              {addingCategory ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: scale(6),
                  height: scale(40),
                }}>
                  <TextInput
                    value={newCategoryText}
                    onChangeText={setNewCategoryText}
                    placeholder="Nueva categoría"
                    placeholderTextColor={Colors.placeholder}
                    autoFocus
                    onSubmitEditing={handleAddCategory}
                    returnKeyType="done"
                    style={{
                      backgroundColor: Colors.inputBg,
                      borderWidth: 1, borderColor: Colors.inputBorder,
                      borderRadius: Radius.md,
                      paddingHorizontal: scale(12),
                      height: scale(40),
                      width: scale(140),
                      fontSize: moderateScale(13),
                      color: Colors.textPrimary,
                    }}
                  />
                  <Pressable
                    onPress={handleAddCategory}
                    style={{
                      width: scale(40), height: scale(40), borderRadius: Radius.md,
                      backgroundColor: 'rgba(16,185,129,0.12)',
                      borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <PlusIcon size={scale(16)} color="#10B981" />
                  </Pressable>
                  <Pressable
                    onPress={() => { setAddingCategory(false); setNewCategoryText(''); }}
                    style={{
                      width: scale(40), height: scale(40), borderRadius: Radius.md,
                      backgroundColor: Colors.card,
                      borderWidth: 1, borderColor: Colors.cardBorder,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <XIcon size={scale(16)} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setAddingCategory(true)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: scale(6),
                    paddingHorizontal: scale(14),
                    height: scale(40),
                    borderRadius: Radius.md,
                    borderWidth: 1.5, borderStyle: 'dashed',
                    borderColor: Colors.cardBorder,
                  }}
                >
                  <PlusIcon size={scale(14)} color={Colors.textSecondary} />
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
                    Nueva
                  </Text>
                </Pressable>
              )}
            </View>
          </Animated.View>

          {/* Tipo de plan */}
          <Animated.View entering={FadeInDown.duration(350).delay(170).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              Tipo de plan *
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(8) }}>
              <Pressable
                onPress={() => setPlanType('recurring')}
                style={{
                  flex: 1,
                  paddingVertical: scale(12),
                  borderRadius: Radius.md,
                  borderWidth: 1.5,
                  borderColor: planType === 'recurring' ? Colors.blue500 : Colors.cardBorder,
                  backgroundColor: planType === 'recurring' ? 'rgba(59,130,246,0.1)' : Colors.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: planType === 'recurring' ? Colors.blue500 : Colors.textPrimary }}>
                  Recurrente
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setPlanType('bono')}
                style={{
                  flex: 1,
                  paddingVertical: scale(12),
                  borderRadius: Radius.md,
                  borderWidth: 1.5,
                  borderColor: planType === 'bono' ? Colors.blue500 : Colors.cardBorder,
                  backgroundColor: planType === 'bono' ? 'rgba(59,130,246,0.1)' : Colors.card,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: planType === 'bono' ? Colors.blue500 : Colors.textPrimary }}>
                  Bono
                </Text>
              </Pressable>
            </View>
            <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(6) }}>
              {planType === 'recurring'
                ? 'Cuota periódica con renovación por calendario (mensual, trimestral o anual).'
                : 'Pago único con un número de clases fijo que caduca a los días que indiques, contados desde que se le asigna a cada socio.'}
            </Text>
          </Animated.View>

          {/* Periodo de facturación (solo planes recurrentes) */}
          {planType === 'recurring' && (
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
          )}

          {/* Validez del bono (solo bonos) */}
          {planType === 'bono' && (
            <Animated.View entering={FadeInDown.duration(350).delay(180).springify()} style={{ marginBottom: scale(20) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
                Validez (días) *
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
                value={validityDays}
                onChangeText={setValidityDays}
                placeholder="Ej: 60"
                placeholderTextColor={Colors.placeholder}
                keyboardType="number-pad"
              />
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(6) }}>
                Días desde que se asigna el bono al socio hasta que caduca, use o no todas las clases.
              </Text>
            </Animated.View>
          )}

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

          {/* Clases */}
          <Animated.View entering={FadeInDown.duration(350).delay(240).springify()} style={{ marginBottom: scale(20) }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(6) }}>
              {planType === 'bono' ? 'Nº de clases del bono' : 'Clases por mes'}
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
              value={classesPerMonth}
              onChangeText={setClassesPerMonth}
              placeholder="Ej: 20"
              placeholderTextColor={Colors.placeholder}
              keyboardType="number-pad"
            />
            {planType === 'recurring' && !!classesPerMonth && getPeriodMonths(billingPeriod as BillingPeriod) > 1 && (
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(6) }}>
                Es una tasa mensual: con periodo {BILLING_OPTIONS.find((o) => o.key === billingPeriod)?.label.toLowerCase()},
                {' '}el socio dispone de {parseInt(classesPerMonth) * getPeriodMonths(billingPeriod as BillingPeriod)} clases
                para gastar en cualquier momento del periodo, no solo {classesPerMonth} al mes.
              </Text>
            )}
            {planType === 'bono' && !!classesPerMonth && !!validityDays && (
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(6) }}>
                El socio dispondrá de {classesPerMonth} clase{classesPerMonth !== '1' ? 's' : ''} en total, válidas durante {validityDays} días desde que se le asigne.
              </Text>
            )}
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
