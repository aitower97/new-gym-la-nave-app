import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { AuthTitle, BrandHeader, Button, FormCard, FormFooterLink, Input, ScreenWrapper } from '../components/ui';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { registerSchema } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
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
      const birthDateIso = result.data.birth_date
        ? (() => {
            const parts = result.data.birth_date!.split('/');
            return `${parts[2]}-${parts[1]}-${parts[0]}`;
          })()
        : '';

      const { data, error } = await supabase.auth.signUp({
        email: result.data.email,
        password: result.data.password,
        options: {
          data: {
            full_name: result.data.full_name,
            phone: result.data.phone || '',
            birth_date: birthDateIso,
          },
        },
      });

      if (error) {
        Alert.alert('Error de registro', error.message);
        return;
      }
      if (!data.user) {
        Alert.alert('Error', 'No se pudo crear el usuario');
        return;
      }

      navigation.navigate('EmailVerification', { email: result.data.email });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper onBackPress={() => navigation.navigate('Welcome')}>
      <View style={{ alignItems: 'center' }}>
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
        />

        <AuthTitle
          title="Crear cuenta"
          subtitle="Únete a La Nave Strength Center y gestiona tus clases desde el móvil."
        />
      </View>

      <FormCard style={{ marginBottom: 20 }}>
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
          placeholder="Mín. 8 car., mayús., número y símbolo"
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

        <FormFooterLink
          prompt="¿Ya tienes cuenta?"
          link="Inicia sesión"
          onPress={() => navigation.navigate('Login')}
        />
      </FormCard>
    </ScreenWrapper>
  );
}
