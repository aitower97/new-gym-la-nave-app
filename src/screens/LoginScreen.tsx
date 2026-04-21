import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Iniciar Sesión</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6B7280"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#6B7280"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          editable={!loading}
        />

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
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.secondaryButtonText}>
            ¿No tienes cuenta? Regístrate
          </Text>
        </Pressable>

        <Pressable 
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.5 }
          ]}
        >
          <Text style={styles.backText}>← Volver</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0E1A',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1a1f35',
    color: '#ffffff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 16,
    padding: 12,
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '600',
  },
  backButton: {
    marginTop: 30,
    padding: 10,
  },
  backText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
  },
});