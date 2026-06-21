import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarIcon, ChevronRightIcon, ClockIcon, PlusIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { createClassSchema, validateOrAlert } from '../utils/validation';
import { Button, ScreenHeader, SpringPressable } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminCreateClass'>;
  route: RouteProp<RootStackParamList, 'AdminCreateClass'>;
};

export default function AdminCreateClassScreen({ navigation, route }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const { initialDate } = route.params || {};

  const [classTypes, setClassTypes] = useState<string[]>([]);
  const [classType, setClassType] = useState('');
  const [loadingTypes, setLoadingTypes] = useState(true);
  const initDate = initialDate ? new Date(initialDate) : new Date();
  const [dateStr, setDateStr] = useState(
    `${initDate.getDate().toString().padStart(2,'0')}/${(initDate.getMonth()+1).toString().padStart(2,'0')}/${initDate.getFullYear()}`
  );
  const [timeStr, setTimeStr] = useState('07:00');
  const [maxSpots, setMaxSpots] = useState('10');
  const [loading, setLoading] = useState(false);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  useEffect(() => {
    loadClassTypes();
  }, []);

  async function loadClassTypes() {
    try {
      setLoadingTypes(true);
      const { data } = await supabase
        .from('class_types')
        .select('name')
        .order('name');

      const names = (data || []).map(r => r.name).filter(Boolean);
      setClassTypes(names);
      if (names.length > 0) setClassType(names[0]);
    } catch (error) {
      console.error('Error loading class types:', error);
    } finally {
      setLoadingTypes(false);
    }
  }

  async function handleAddType(name: string) {
    const trimmed = name.trim().toUpperCase();
    if (!trimmed || classTypes.includes(trimmed)) return;

    const { error } = await supabase.from('class_types').insert({ name: trimmed });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setClassTypes(prev => [...prev, trimmed].sort());
    setClassType(trimmed);
  }

  async function handleDeleteType(name: string) {
    Alert.alert(
      'Eliminar tipo',
      `¿Borrar "${name}"? Las clases existentes no se verán afectadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('class_types').delete().eq('name', name);
            if (error) {
              Alert.alert('Error', error.message);
              return;
            }
            setClassTypes(prev => prev.filter(t => t !== name));
            if (classType === name) setClassType(classTypes[0] !== name ? classTypes[0] : '');
          },
        },
      ]
    );
  }

  async function handleCreate() {
    const [dd, mm, yyyy] = dateStr.split('/').map(Number);
    if (!dd || !mm || !yyyy || yyyy < 2020 || yyyy > 2100
        || mm < 1 || mm > 12 || dd < 1 || dd > 31) {
      Alert.alert('Fecha inválida', 'Usa el formato DD/MM/AAAA');
      return;
    }
    const testDate = new Date(yyyy, mm - 1, dd);
    if (testDate.getFullYear() !== yyyy || testDate.getMonth() !== mm - 1 || testDate.getDate() !== dd) {
      Alert.alert('Fecha inválida', 'La fecha no existe');
      return;
    }
    const classDate = `${yyyy}-${mm.toString().padStart(2,'0')}-${dd.toString().padStart(2,'0')}`;

    const validated = validateOrAlert(
      createClassSchema,
      { class_type: classType, class_date: classDate, max_spots: parseInt(maxSpots) },
      Alert
    );

    if (!validated) return;

    try {
      setLoading(true);

      const [hh, mins] = timeStr.split(':').map(Number);
      const classTime = `${hh.toString().padStart(2,'0')}:${mins.toString().padStart(2,'0')}:00`;

      const { data: existingClass } = await supabase
        .from('classes')
        .select('id')
        .eq('class_date', validated.class_date)
        .eq('class_time', classTime)
        .single();

      if (existingClass) {
        Alert.alert('Error', 'Ya existe una clase en esa fecha y hora');
        setLoading(false);
        return;
      }

      const classData = {
        name: validated.class_type,
        class_type: validated.class_type,
        class_date: validated.class_date,
        class_time: classTime,
        max_spots: validated.max_spots,
      };

      const { error } = await supabase.from('classes').insert([classData]);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_actions').insert({
          admin_id: user.id,
          action_type: 'create_class',
          target_type: 'class',
          details: classData,
        });
      }

      Alert.alert('✅ Clase creada', 'La clase se ha creado correctamente', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error creating class:', error);
      Alert.alert('Error', error.message || 'No se pudo crear la clase');
    } finally {
      setLoading(false);
    }
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Crear Clase"
          subtitle="Nueva clase puntual"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: scale(20) }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Banner para clases recurrentes */}
          <Animated.View entering={FadeInDown.duration(350).delay(80).springify()}>
            <SpringPressable
              onPress={() => navigation.navigate('AdminCreateRecurringClass')}
              style={{
                marginHorizontal: scale(20),
                marginTop: scale(16), marginBottom: scale(8),
                backgroundColor: 'rgba(245,158,11,0.1)',
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: scale(16) }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.warning }}>
                    Crear clases recurrentes
                  </Text>
                  <Text style={{ fontSize: moderateScale(12), color: Colors.textSecondary, marginTop: scale(3) }}>
                    Genera múltiples clases automáticamente
                  </Text>
                </View>
                <ChevronRightIcon size={scale(22)} color={Colors.warning} />
              </View>
            </SpringPressable>
          </Animated.View>

          <View style={{ padding: scale(20) }}>
            {/* Tipo de clase */}
            <Animated.View entering={FadeInDown.duration(350).delay(120).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Tipo de clase *
              </Text>
              {loadingTypes ? (
                <ActivityIndicator size="small" color={Colors.blue500} style={{ alignSelf: 'flex-start' }} />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
                  {classTypes.map((type) => (
                    <SpringPressable
                      key={type}
                      onPress={() => setClassType(type)}
                      onLongPress={() => handleDeleteType(type)}
                      style={{
                        paddingHorizontal: scale(16), paddingVertical: scale(10),
                        borderRadius: Radius.sm, borderWidth: 1,
                        backgroundColor: classType === type ? 'rgba(59,130,246,0.2)' : Colors.card,
                        borderColor: classType === type ? Colors.blue500 : Colors.cardBorder,
                      }}
                    >
                      <Text style={{
                        fontSize: moderateScale(13), fontWeight: '600',
                        color: classType === type ? Colors.blue500 : Colors.textMuted,
                      }}>
                        {type}
                      </Text>
                    </SpringPressable>
                  ))}
                  <SpringPressable
                    onPress={() => setShowNewType(true)}
                    style={{
                      paddingHorizontal: scale(14), paddingVertical: scale(10),
                      borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed',
                      borderColor: Colors.cardBorder,
                      backgroundColor: Colors.card,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <PlusIcon size={scale(16)} color={Colors.textMuted} />
                  </SpringPressable>
                  {showNewType && (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingHorizontal: scale(12), paddingVertical: scale(8),
                      borderRadius: Radius.sm, borderWidth: 1,
                      borderColor: Colors.blue500,
                      backgroundColor: 'rgba(59,130,246,0.1)',
                    }}>
                      <TextInput
                        autoFocus
                        value={newTypeName}
                        onChangeText={setNewTypeName}
                        placeholder="Nuevo tipo"
                        placeholderTextColor={Colors.placeholder}
                        style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.blue500, minWidth: 100, padding: 0 }}
                        onSubmitEditing={() => {
                          handleAddType(newTypeName);
                          setShowNewType(false);
                          setNewTypeName('');
                        }}
                        onBlur={() => {
                          handleAddType(newTypeName);
                          setShowNewType(false);
                          setNewTypeName('');
                        }}
                      />
                    </View>
                  )}
                </View>
              )}
              <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(8) }}>
                Mantenga pulsado sobre un tipo para eliminarlo
              </Text>
            </Animated.View>

            {/* Fecha */}
            <Animated.View entering={FadeInDown.duration(350).delay(160).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Fecha *
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(16),
                backgroundColor: Colors.card,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <CalendarIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                <TextInput
                  style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Animated.View>

            {/* Hora */}
            <Animated.View entering={FadeInDown.duration(350).delay(200).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Hora *
              </Text>
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                padding: scale(16),
                backgroundColor: Colors.card,
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <ClockIcon size={scale(18)} color={Colors.textSecondary} strokeWidth={1.5} />
                <TextInput
                  style={{ flex: 1, fontSize: moderateScale(15), color: Colors.textPrimary, fontWeight: '600', marginLeft: scale(8) }}
                  value={timeStr}
                  onChangeText={setTimeStr}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </Animated.View>

            {/* Capacidad */}
            <Animated.View entering={FadeInDown.duration(350).delay(240).springify()} style={{ marginBottom: scale(24) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textPrimary, marginBottom: scale(8) }}>
                Capacidad máxima *
              </Text>
              <TextInput
                style={{
                  padding: scale(16),
                  backgroundColor: Colors.card,
                  borderRadius: Radius.md,
                  borderWidth: 1, borderColor: Colors.cardBorder,
                  color: Colors.textPrimary,
                  fontSize: moderateScale(15),
                  fontWeight: '600',
                }}
                value={maxSpots}
                onChangeText={setMaxSpots}
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor={Colors.placeholder}
              />
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginTop: scale(6) }}>
                Número de plazas disponibles (1-10)
              </Text>
            </Animated.View>

            {/* Preview */}
            <Animated.View entering={FadeInDown.duration(400).delay(280).springify()} style={{ marginTop: scale(8) }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.textMuted, marginBottom: scale(12) }}>
                Vista previa
              </Text>
              <View style={{
                padding: scale(20),
                backgroundColor: 'rgba(59,130,246,0.1)',
                borderRadius: Radius.md,
                borderWidth: 1, borderColor: Colors.borderBlue,
              }}>
                <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(8) }}>
                  {classType}
                </Text>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, marginBottom: scale(4) }}>
                  {dateStr} • {timeStr}
                </Text>
                <Text style={{ fontSize: moderateScale(13), color: Colors.textMuted }}>
                  Capacidad: {maxSpots} plazas
                </Text>
              </View>
            </Animated.View>
          </View>
        </ScrollView>

        {/* Botón crear */}
        <Animated.View
          entering={FadeInDown.duration(400).delay(320).springify()}
          style={{
            padding: scale(20),
            paddingBottom: insets.bottom + scale(20),
            backgroundColor: Colors.background,
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}
        >
          <Button
            label={loading ? 'Creando clase...' : 'Añadir clase'}
            onPress={handleCreate}
            loading={loading}
            disabled={loading || !classType || classTypes.length === 0}
            icon={!loading ? <Text style={{ fontSize: moderateScale(18), color: '#fff', fontWeight: '700' }}>✓</Text> : undefined}
          />
        </Animated.View>
      </View>
    </View>
  );
}
