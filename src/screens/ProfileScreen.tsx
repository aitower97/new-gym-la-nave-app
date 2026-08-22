import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraIcon, LogoutIcon } from '../components/Icons';
import { Button, FormCard, Input, ScreenHeader } from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, scale as s } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { useTutorialScrollAction, useTutorialTarget } from '../tutorial/TutorialContext';
import { profileUpdateSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
  route: RouteProp<RootStackParamList, 'Profile'>;
};

export default function ProfileScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const [userId, setUserId] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  const avatarScale = useSharedValue(1);
  const badgePulse = useSharedValue(0.6);
  const avatarRef = useTutorialTarget('profile-avatar');
  const scrollRef = useRef<ScrollView>(null);
  useTutorialScrollAction('profile-avatar', () => scrollRef.current?.scrollTo({ y: 0, animated: true }));

  useEffect(() => {
    badgePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.6, { duration: 1800, easing: Easing.inOut(Easing.sin) })
      ),
      -1, true
    );
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  const avatarAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: avatarScale.value }],
  }));

  const badgeAnimStyle = useAnimatedStyle(() => ({
    opacity: badgePulse.value,
  }));

  async function loadProfile() {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigation.navigate('Login');
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setUsername(data.username || '');
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
        setBirthDate(data.birth_date || '');
        setAvatarUrl(data.avatar_url);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  // Usa el selector de fotos del sistema (Photo Picker en Android 13+, igual
  // en iOS) SIN pedir permiso de galería antes — el selector del sistema da
  // acceso puntual solo a la foto elegida, sin que la app necesite el
  // permiso amplio a toda la galería. Pedir requestMediaLibraryPermissionsAsync
  // antes de abrir el selector es justo lo que Google Play rechaza bajo su
  // política de "Selectores de fotos/vídeo del sistema": declarar y solicitar
  // READ_MEDIA_IMAGES para un caso de uso puntual (foto de perfil) en vez de
  // dejar que el selector del sistema lo resuelva sin permiso alguno.
  async function pickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error: any) {
      console.error('Pick error:', error);
      Alert.alert('Error', error.message);
    }
  }

  async function uploadAvatar(uri: string) {
    try {
      setUploadingImage(true);

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType: fileExt === 'png' ? 'image/png' : 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);

      Alert.alert('¡Listo!', 'Foto de perfil actualizada');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error al subir imagen', error.message);
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveProfile() {
    const validated = validateOrAlert(
      profileUpdateSchema,
      {
        username: username.trim() || undefined,
        full_name: fullName,
        phone: phone || undefined,
      },
      Alert
    );

    if (!validated) return;

    try {
      setSaving(true);

      const updates = {
        id: userId,
        email: email,
        username: validated.username || null,
        full_name: validated.full_name,
        phone: validated.phone || null,
        birth_date: birthDate || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .upsert(updates);

      if (error) throw error;

      Alert.alert('¡Guardado!', 'Tu perfil se ha actualizado correctamente');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteAccount() {
    Alert.alert(
      'Eliminar cuenta',
      '¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer. Todos tus datos serán eliminados permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();

              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.error || 'Error al eliminar cuenta');
              }

              await supabase.auth.signOut();

              Alert.alert(
                'Cuenta eliminada',
                'Tu cuenta ha sido eliminada completamente. No podrás volver a acceder con estas credenciales.'
              );

              navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
            } catch (error: any) {
              console.error('Error deleting account:', error);
              Alert.alert(
                'Error',
                `No se pudo eliminar la cuenta: ${error.message}. Contacta con el gimnasio para asistencia.`
              );
            }
          },
        },
      ]
    );
  }

  const avatarInitial = (fullName[0] || email[0]).toUpperCase();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: Colors.background }}
        contentContainerStyle={{
          paddingBottom: insets.bottom + s(40),
          alignSelf: 'center',
          width: '100%',
          maxWidth: MAX_CONTENT_WIDTH,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Mi Perfil"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        {/* Avatar Section */}
        <View ref={avatarRef} collapsable={false}>
        <Animated.View
          entering={FadeInDown.duration(350).springify()}
          style={{ alignItems: 'center', paddingVertical: s(28) }}
        >
          <Animated.View style={[avatarAnimStyle]}>
            <Pressable
              onPress={pickImage}
              disabled={uploadingImage}
              onPressIn={() => { avatarScale.value = withSpring(0.92, { damping: 14, stiffness: 300 }); }}
              onPressOut={() => { avatarScale.value = withSpring(1, { damping: 10, stiffness: 200 }); }}
            >
              <LinearGradient
                colors={['#2563EB', '#60A5FA']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  width: 128,
                  height: 128,
                  borderRadius: 64,
                  padding: 3,
                  shadowColor: '#2563EB',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 16,
                  elevation: 10,
                }}
              >
                <View style={{ flex: 1, borderRadius: 61, overflow: 'hidden' }}>
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <View style={{
                      flex: 1,
                      backgroundColor: '#0f1c2e',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{
                        fontSize: 48,
                        fontWeight: '800',
                        color: '#60A5FA',
                      }}>
                        {avatarInitial}
                      </Text>
                    </View>
                  )}
                </View>
              </LinearGradient>

              {/* Badge */}
              <View style={{
                position: 'absolute',
                bottom: 2,
                right: 2,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#2563EB',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: Colors.background,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 6,
              }}>
                {uploadingImage ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Animated.View style={[badgeAnimStyle]}>
                    <CameraIcon size={s(18)} color="#fff" strokeWidth={2.5} />
                  </Animated.View>
                )}
              </View>
            </Pressable>
          </Animated.View>

          <Text style={{
            fontSize: s(13),
            color: 'rgba(255,255,255,0.35)',
            marginTop: s(10),
            fontWeight: '500',
          }}>
            Toca para cambiar foto
          </Text>
        </Animated.View>
        </View>

        {/* Form */}
        <Animated.View
          entering={FadeInDown.delay(80).duration(350).springify()}
          style={{ paddingHorizontal: s(20) }}
        >
          <FormCard>
            <Input
              label="Apodo"
              optional
              hint="Se muestra en lugar de tu nombre real"
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="ej: ironman_john"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />

            <Input
              label="Nombre completo"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Ej: Juan Pérez"
              autoCapitalize="words"
              editable={!saving}
            />

            <Input
              label="Email"
              value={email}
              editable={false}
            />

            <Input
              label="Teléfono"
              optional
              value={phone}
              onChangeText={setPhone}
              placeholder="Ej: 612 345 678"
              keyboardType="phone-pad"
              editable={!saving}
            />

            <Input
              label="Fecha de nacimiento"
              optional
              hint="Formato: AAAA-MM-DD"
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="1990-05-15"
              editable={!saving}
            />
          </FormCard>
        </Animated.View>

        {/* Actions */}
        <Animated.View
          entering={FadeInDown.delay(160).duration(350).springify()}
          style={{ paddingHorizontal: s(20), paddingTop: s(20) }}
        >
          <Button
            label={saving ? 'Guardando...' : 'Guardar Cambios'}
            onPress={saveProfile}
            loading={saving}
            disabled={saving}
            size="lg"
          />

          <Pressable
            style={({ pressed }) => ({
              paddingVertical: s(14),
              alignItems: 'center',
              opacity: pressed ? 0.5 : 1,
            })}
            onPress={() => navigation.goBack()}
            disabled={saving}
          >
            <Text style={{
              fontSize: s(15),
              fontWeight: '600',
              color: 'rgba(255,255,255,0.4)',
            }}>
              Cancelar
            </Text>
          </Pressable>
        </Animated.View>

        {/* Danger Zone */}
        <Animated.View
          entering={FadeIn.delay(240).duration(400)}
          style={{ marginTop: s(40), paddingHorizontal: s(20), paddingTop: s(24) }}
        >
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: s(16),
          }}>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(239,68,68,0.15)' }} />
            <Text style={{
              fontSize: s(12),
              fontWeight: '700',
              color: 'rgba(239,68,68,0.6)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}>
              Zona de peligro
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(239,68,68,0.15)' }} />
          </View>

          <Pressable
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: s(14),
              borderRadius: 12,
              borderWidth: 1,
              borderColor: pressed ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)',
              backgroundColor: pressed ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
            })}
            onPress={() => {
              Alert.alert(
                'Cerrar sesión',
                '¿Estás seguro?',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Cerrar sesión',
                    style: 'destructive',
                    onPress: async () => {
                      await supabase.auth.signOut();
                      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
                    },
                  },
                ]
              );
            }}
          >
            <LogoutIcon size={s(16)} color="#EF4444" strokeWidth={2} />
            <Text style={{
              fontSize: s(15),
              fontWeight: '600',
              color: '#EF4444',
            }}>
              Cerrar Sesión
            </Text>
          </Pressable>

          <View style={{ marginTop: s(12) }}>
            <Button
              label="Eliminar Cuenta"
              onPress={deleteAccount}
              variant="danger"
              size="md"
            />
          </View>

          <Text style={{
            fontSize: s(11),
            color: 'rgba(255,255,255,0.2)',
            textAlign: 'center',
            marginTop: s(12),
          }}>
            Esta acción eliminará todos tus datos permanentemente
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
