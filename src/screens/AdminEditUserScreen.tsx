import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminEditUser'>;
  route: RouteProp<RootStackParamList, 'AdminEditUser'>;
};

export default function AdminEditUserScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');

  const backScale = useSharedValue(1);
  const saveScale = useSharedValue(1);
  const userScale = useSharedValue(1);
  const adminScale = useSharedValue(1);

  const backAnim = useAnimatedStyle(() => ({ transform: [{ scale: backScale.value }] }));
  const saveAnim = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const userAnim = useAnimatedStyle(() => ({ transform: [{ scale: userScale.value }] }));
  const adminAnim = useAnimatedStyle(() => ({ transform: [{ scale: adminScale.value }] }));

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('id', userId)
        .single();

      if (error) throw error;
      if (data) {
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        setRole(data.role || 'user');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'El nombre no puede estar vacío');
      return;
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), role })
        .eq('id', userId);

      if (error) throw error;
      Alert.alert('Guardado', 'Perfil actualizado correctamente');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

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
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            gap: scale(12),
          }}
        >
          <Animated.View style={[backAnim]}>
            <Pressable
              onPress={() => navigation.goBack()}
              onPressIn={() => { backScale.value = withSpring(0.88, { damping: 14, stiffness: 300 }); }}
              onPressOut={() => { backScale.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
              style={({ pressed }) => ({
                width: scale(40), height: scale(40),
                borderRadius: scale(20),
                backgroundColor: Colors.card,
                borderWidth: 1, borderColor: Colors.cardBorder,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
            </Pressable>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary }}>
              Editar Usuario
            </Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={{ padding: scale(20), gap: scale(20) }} keyboardShouldPersistTaps="handled">
          {/* Avatar */}
          <Animated.View
            entering={FadeInDown.duration(400).delay(100).springify()}
            style={{ alignItems: 'center', paddingVertical: scale(16) }}
          >
            <View style={{
              width: scale(80), height: scale(80),
              borderRadius: scale(40),
              backgroundColor: 'rgba(59,130,246,0.15)',
              borderWidth: 2, borderColor: Colors.borderBlue,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: moderateScale(32), fontWeight: '700', color: Colors.blue400 }}>
                {(fullName || email)?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          </Animated.View>

          {/* Name */}
          <Animated.View entering={FadeInDown.duration(400).delay(150).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Nombre completo
            </Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nombre del usuario"
              placeholderTextColor={Colors.placeholder}
              style={{
                backgroundColor: Colors.inputBg,
                borderWidth: 1, borderColor: Colors.inputBorder,
                borderRadius: Radius.md,
                paddingHorizontal: scale(16),
                height: scale(50),
                fontSize: moderateScale(15),
                color: Colors.textPrimary,
              }}
            />
          </Animated.View>

          {/* Email (read-only) */}
          <Animated.View entering={FadeInDown.duration(400).delay(200).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Email
            </Text>
            <View style={{
              backgroundColor: Colors.card,
              borderWidth: 1, borderColor: Colors.cardBorder,
              borderRadius: Radius.md,
              paddingHorizontal: scale(16),
              height: scale(50),
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: moderateScale(15), color: Colors.textMuted }}>{email}</Text>
            </View>
          </Animated.View>

          {/* Role toggle */}
          <Animated.View entering={FadeInDown.duration(400).delay(250).springify()} style={{ gap: scale(6) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textSecondary }}>
              Rol
            </Text>
            <View style={{ flexDirection: 'row', gap: scale(10) }}>
              <Animated.View style={[userAnim, { flex: 1 }]}>
                <Pressable
                  onPress={() => setRole('user')}
                  onPressIn={() => { userScale.value = withSpring(0.95, { damping: 14, stiffness: 300 }); }}
                  onPressOut={() => { userScale.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
                  style={({ pressed }) => ({
                    paddingVertical: scale(14),
                    borderRadius: Radius.md,
                    borderWidth: 1.5,
                    borderColor: role === 'user' ? Colors.blue500 : Colors.cardBorder,
                    backgroundColor: role === 'user' ? 'rgba(59,130,246,0.12)' : Colors.card,
                    alignItems: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{
                    fontSize: moderateScale(14),
                    fontWeight: '700',
                    color: role === 'user' ? Colors.blue400 : Colors.textMuted,
                  }}>
                    Usuario
                  </Text>
                </Pressable>
              </Animated.View>
              <Animated.View style={[adminAnim, { flex: 1 }]}>
                <Pressable
                  onPress={() => setRole('admin')}
                  onPressIn={() => { adminScale.value = withSpring(0.95, { damping: 14, stiffness: 300 }); }}
                  onPressOut={() => { adminScale.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
                  style={({ pressed }) => ({
                    paddingVertical: scale(14),
                    borderRadius: Radius.md,
                    borderWidth: 1.5,
                    borderColor: role === 'admin' ? Colors.blue500 : Colors.cardBorder,
                    backgroundColor: role === 'admin' ? 'rgba(59,130,246,0.12)' : Colors.card,
                    alignItems: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{
                    fontSize: moderateScale(14),
                    fontWeight: '700',
                    color: role === 'admin' ? Colors.blue400 : Colors.textMuted,
                  }}>
                    Admin
                  </Text>
                </Pressable>
              </Animated.View>
            </View>
          </Animated.View>

          {/* Save button */}
          <Animated.View entering={FadeInDown.duration(400).delay(300).springify()} style={[saveAnim, { marginTop: scale(12) }]}>
            <Pressable
              onPress={handleSave}
              disabled={saving}
              onPressIn={() => { saveScale.value = withSpring(0.95, { damping: 14, stiffness: 300 }); }}
              onPressOut={() => { saveScale.value = withSpring(1, { damping: 8, stiffness: 150 }); }}
              style={({ pressed }) => ({
                backgroundColor: Colors.blue600,
                paddingVertical: scale(16),
                borderRadius: Radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed || saving ? 0.8 : 1,
              })}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: '#fff', letterSpacing: 1, textTransform: 'uppercase' }}>
                  Guardar Cambios
                </Text>
              )}
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    </View>
  );
}
