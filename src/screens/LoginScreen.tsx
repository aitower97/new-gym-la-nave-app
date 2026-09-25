import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SocialLoginButtons } from '../components/auth/SocialLoginButtons';
import { BrandHeader, Button, FormCard, FormFooterLink, Input, ScreenWrapper } from '../components/ui';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { goHomeAfterLogin } from '../utils/postLogin';
import { loginSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const busy = loading || socialBusy;

  const handleLogin = async () => {
    const validated = validateOrAlert(loginSchema, { email, password }, Alert);
    if (!validated) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });
      if (error) { Alert.alert('Error de login', error.message); return; }
      if (data.user) await goHomeAfterLogin(navigation, data.user);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper onBackPress={() => navigation.navigate('Welcome')}>
      <BrandHeader
        title="LA NAVE"
        subtitle="STRENGTH CENTER"
        variant="plain"
        logoSize={72}
        imageSize={52}
        style={{ marginBottom: 44, overflow: 'visible' }}
        logoContainerStyle={{
          backgroundColor: 'white',
          shadowColor: '#185DBE',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.85,
          shadowRadius: 18,
          elevation: 18,
        }}
      />

      <FormCard title="Accede a tu cuenta" style={{ marginBottom: 32 }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!busy}
        />

        <Input
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          showToggle
          autoComplete="password"
          editable={!busy}
        />

        <Button
          label="Entrar"
          onPress={handleLogin}
          loading={loading}
          disabled={busy}
          size="lg"
        />

        <SocialLoginButtons
          disabled={loading}
          onBusyChange={setSocialBusy}
          onSignedIn={({ user, appleName }) => goHomeAfterLogin(navigation, user, 'navigate', appleName)}
        />

        <FormFooterLink
          prompt="¿Olvidaste tu contraseña?"
          link="Recupérala"
          onPress={() => navigation.navigate('ForgotPassword')}
          disabled={busy}
        />

        <View style={{ marginTop: 12 }}>
          <FormFooterLink
            prompt="¿No tienes cuenta?"
            link="Regístrate"
            onPress={() => navigation.navigate('Register')}
            disabled={busy}
          />
        </View>
      </FormCard>

      <Text style={{
        textAlign: 'center',
        fontSize: 11,
        color: 'rgba(255,255,255,0.15)',
      }}>
        La Nave Strength Center · Todos los derechos reservados
      </Text>
    </ScreenWrapper>
  );
}
