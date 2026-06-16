import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, BrandHeader, Button, Input } from '../components/ui';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { registerSchema } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const formatBirthDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
    setBirthDate(formatted.slice(0, 10));
  };

  const handleRegister = async () => {
    const result = registerSchema.safeParse({
      full_name: fullName,
      email,
      phone: phone || undefined,
      birth_date: birthDate || undefined,
      password,
      confirm_password: confirmPassword,
    });

    if (!result.success) {
      Alert.alert('Error de validación', result.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: result.data.email,
        password: result.data.password,
        options: { data: { full_name: result.data.full_name } },
      });

      if (error) {
        Alert.alert('Error de registro', error.message);
        return;
      }
      if (!data.user) {
        Alert.alert('Error', 'No se pudo crear el usuario');
        return;
      }

      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email: result.data.email,
        full_name: result.data.full_name,
        phone: result.data.phone || null,
        birth_date: result.data.birth_date
          ? (() => {
              const parts = result.data.birth_date!.split('/');
              return `${parts[2]}-${parts[1]}-${parts[0]}`;
            })()
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (profileError && profileError.code !== '23505') {
        console.error('Error creando perfil:', profileError);
      }

      Alert.alert('¡Cuenta creada!', 'Revisa tu email para confirmar tu cuenta y luego inicia sesión.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#08111f' }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ position: 'absolute', top: insets.top + 16, left: 24 }}>
          <BackButton onPress={() => navigation.navigate('Welcome')} />
        </View>

        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <BrandHeader
            title="LA NAVE"
            subtitle="STRENGTH CENTER"
            variant="plain"
            logoSize={72}
            imageSize={48}
            style={{ marginBottom: 18 }}
            logoContainerStyle={{
              backgroundColor: 'white',
              shadowColor: '#185DBE',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.85,
              shadowRadius: 18,
              elevation: 20,
            }}
            titleStyle={{ fontSize: 26, letterSpacing: 6 }}
            subtitleStyle={{ fontSize: 10, letterSpacing: 3 }}
          />

          <Text style={{ fontSize: 26, fontWeight: '900', color: 'white', letterSpacing: 0.5, marginBottom: 6 }}>
            Crear cuenta
          </Text>
          <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 300 }}>
            Únete a La Nave Strength Center y gestiona tus clases desde el móvil.
          </Text>
        </View>

        <View style={{
          backgroundColor: '#0f1a2e',
          borderRadius: 24,
          padding: 20,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          marginBottom: 20,
        }}>
          <Input
            label="Nombre completo"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Juan García"
            autoCapitalize="words"
            autoComplete="name"
            editable={!loading}
          />

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!loading}
          />

          <Input
            label="Teléfono"
            optional
            value={phone}
            onChangeText={setPhone}
            placeholder="600 000 000"
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!loading}
          />

          <Input
            label="Fecha de nacimiento"
            optional
            hint="DD/MM/AAAA"
            value={birthDate}
            onChangeText={formatBirthDate}
            placeholder="DD/MM/AAAA"
            keyboardType="numeric"
            maxLength={10}
            editable={!loading}
          />

          <Input
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 6 caracteres"
            secureTextEntry
            showToggle
            autoComplete="new-password"
            editable={!loading}
          />

          <Input
            label="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repite la contraseña"
            secureTextEntry
            showToggle
            autoComplete="new-password"
            editable={!loading}
          />

          <Button
            label={loading ? 'Creando cuenta...' : 'Crear cuenta'}
            onPress={handleRegister}
            loading={loading}
            disabled={loading}
            size="lg"
            fullWidth
          />

          <Pressable
            style={({ pressed }) => ({ marginTop: 10, paddingVertical: 8, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              ¿Ya tienes cuenta?{' '}
              <Text style={{ color: '#3B82F6', fontWeight: '700' }}>Inicia sesión</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
