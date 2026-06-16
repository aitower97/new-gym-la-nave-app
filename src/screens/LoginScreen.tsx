import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton, BrandHeader, Button, Input } from '../components/ui';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { isUserAdmin } from '../utils/auth';
import { loginSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

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
      if (data.user) {
        const isAdmin = await isUserAdmin();
        if (isAdmin) {
          navigation.navigate('AdminDashboard', {
            email: data.user.email || '',
            name: data.user.user_metadata?.full_name,
          });
        } else {
          navigation.navigate('MainMenu', {
            email: data.user.email || '',
            name: data.user.user_metadata?.full_name,
          });
        }
      }
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
        {/* Back */}
        <View style={{ position: 'absolute', top: insets.top + 16, left: 24 }}>
          <BackButton onPress={() => navigation.navigate('Welcome')} />
        </View>

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

        {/* Card */}
        <View style={{
          backgroundColor: '#0d1929',
          borderRadius: 24, padding: 24,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
          marginBottom: 32,
          shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.3, shadowRadius: 24, elevation: 8,
        }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: 'white', textAlign: 'center', marginBottom: 24, letterSpacing: 0.3 }}>
            Accede a tu cuenta
          </Text>

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
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            showToggle
            autoComplete="password"
            editable={!loading}
          />

          <Button
            label="Entrar"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            size="lg"
          />

          <Pressable
            style={({ pressed }) => ({
              marginTop: 28, paddingVertical: 10,
              alignItems: 'center', opacity: pressed ? 0.6 : 1,
            })}
            onPress={() => navigation.navigate('Register')}
            disabled={loading}
          >
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
              ¿No tienes cuenta?{' '}
              <Text style={{ color: '#3B82F6', fontWeight: '700' }}>Regístrate</Text>
            </Text>
          </Pressable>
        </View>

        <Text style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.15)' }}>
          La Nave Strength Center · Todos los derechos reservados
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
