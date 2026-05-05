import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Colors, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { isUserAdmin } from '../utils/auth';
import { loginSchema, signUpSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();

  const handleLogin = async () => {
    // Validar inputs
    const validated = validateOrAlert(
      loginSchema,
      { email, password },
      Alert
    );
    
    if (!validated) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });

      if (error) {
        Alert.alert('Error de login', error.message);
        return;
      }

      if (data.user) {
        // Verificar si es admin
        const isAdmin = await isUserAdmin();
        
        console.log('Login exitoso');
        console.log('Email:', data.user.email);
        console.log('Es admin:', isAdmin);

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
      Alert.alert('Error completo', JSON.stringify(error));
      console.error('Error detallado:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    // Validar inputs
    const validated = validateOrAlert(
      signUpSchema,
      { email, password },
      Alert
    );
    
    if (!validated) return;

    setLoading(true);

    try {
      // 1. Registrar usuario en auth
      const { data, error } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.password,
      });

      if (error) {
        Alert.alert('Error de registro', error.message);
        return;
      }

      if (!data.user) {
        Alert.alert('Error', 'No se pudo crear el usuario');
        return;
      }

      // 2. Crear perfil manualmente (por si el trigger falla)
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: data.user.email || validated.email,
          full_name: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      // Ignorar error si el perfil ya existe (el trigger funcionó)
      if (profileError && profileError.code !== '23505') {
        console.error('Error creando perfil:', profileError);
        Alert.alert('Advertencia', 'Usuario creado pero hubo un problema con el perfil');
      }

      Alert.alert(
        '¡Registro exitoso!',
        'Revisa tu email para confirmar tu cuenta',
        [{ text: 'OK' }]
      );
      
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Algo salió mal');
      console.error('Error completo:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.flex}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + scale(32), paddingBottom: insets.bottom + scale(32) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <View style={styles.logoWrapper}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandName}>LA NAVE</Text>
          <Text style={styles.brandSub}>STRENGTH CENTER</Text>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Accede a tu cuenta</Text>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={Colors.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Contraseña</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!loading}
            />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
            onPress={handleSignUp}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>
              ¿No tienes cuenta?{' '}
              <Text style={styles.secondaryButtonHighlight}>Regístrate</Text>
            </Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>La Nave Strength Center · Todos los derechos reservados</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: scale(24),
    justifyContent: 'center',
    minHeight: '100%',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: scale(40),
  },
  logoWrapper: {
    width: scale(88),
    height: scale(88),
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(16),
    borderWidth: 1,
    borderColor: Colors.borderBlue,
    shadowColor: Colors.blue600,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  logo: {
    width: scale(60),
    height: scale(60),
    borderRadius: Radius.lg,
  },
  brandName: {
    fontSize: moderateScale(28),
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 6,
    marginBottom: scale(2),
  },
  brandSub: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: Colors.blue400,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xxl,
    padding: scale(24),
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: scale(32),
  },
  formTitle: {
    fontSize: moderateScale(20),
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: scale(24),
    textAlign: 'center',
  },
  inputWrapper: {
    marginBottom: scale(16),
  },
  inputLabel: {
    fontSize: moderateScale(13),
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: scale(6),
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: Colors.inputBg,
    color: Colors.textPrimary,
    paddingVertical: scale(14),
    paddingHorizontal: scale(16),
    borderRadius: Radius.md,
    fontSize: moderateScale(15),
    borderWidth: 1,
    borderColor: Colors.inputBorder,
  },
  button: {
    backgroundColor: Colors.blue600,
    paddingVertical: scale(16),
    borderRadius: Radius.md,
    marginTop: scale(8),
    alignItems: 'center',
    shadowColor: Colors.blue600,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: Colors.textPrimary,
    fontSize: moderateScale(16),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    marginTop: scale(16),
    paddingVertical: scale(10),
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.textMuted,
    fontSize: moderateScale(14),
    fontWeight: '500',
  },
  secondaryButtonHighlight: {
    color: Colors.blue400,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    paddingTop: scale(8),
  },
  footerText: {
    fontSize: moderateScale(11),
    color: Colors.textDisabled,
    textAlign: 'center',
  },
});