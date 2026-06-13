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
import { ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale, verticalScale } from '../theme';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const formatBirthDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
    setBirthDate(formatted.slice(0, 10));
  };

  const handleRegister = async () => {
    // Validación manual con zod
    const result = registerSchema.safeParse({
      full_name: fullName,
      email,
      phone: phone || undefined,
      birth_date: birthDate || undefined,
      password,
      confirm_password: confirmPassword,
    });

    if (!result.success) {
      const firstError = result.error.errors[0];
      Alert.alert('Error de validación', firstError.message);
      return;
    }

    setLoading(true);

    try {
      // 1. Registrar en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email: result.data.email,
        password: result.data.password,
        options: {
          data: { full_name: result.data.full_name },
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

      // 2. Crear perfil con todos los datos
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
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

      Alert.alert(
        '¡Cuenta creada!',
        'Revisa tu email para confirmar tu cuenta y luego inicia sesión.',
        [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Algo salió mal');
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
          { paddingTop: insets.top + scale(16), paddingBottom: insets.bottom + scale(32) },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            onPress={() => navigation.goBack()}
          >
            <ChevronLeftIcon size={22} color={Colors.textSecondary} />
          </Pressable>
          <Image
            source={require('../../assets/logo-white.jpeg')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={{ width: 40 }} />
        </View>

        {/* Title */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Únete a La Nave Strength Center</Text>
        </View>

        {/* Form */}
        <View style={styles.formCard}>
          {/* Nombre */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Nombre completo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Juan García"
              placeholderTextColor={Colors.placeholder}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
              editable={!loading}
            />
          </View>

          {/* Email */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Email *</Text>
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

          {/* Teléfono */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Teléfono <Text style={styles.optional}>(opcional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="600 000 000"
              placeholderTextColor={Colors.placeholder}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!loading}
            />
          </View>

          {/* Fecha de nacimiento */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Fecha de nacimiento <Text style={styles.optional}>(opcional)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={Colors.placeholder}
              value={birthDate}
              onChangeText={formatBirthDate}
              keyboardType="numeric"
              maxLength={10}
              editable={!loading}
            />
          </View>

          {/* Contraseña */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Contraseña *</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={Colors.placeholder}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
                editable={!loading}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
              >
                <Text style={styles.eyeText}>{showPassword ? 'Ocultar' : 'Ver'}</Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>Mínimo 6 caracteres, una letra y un número</Text>
          </View>

          {/* Confirmar contraseña */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>Confirmar contraseña *</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Repite la contraseña"
                placeholderTextColor={Colors.placeholder}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirm}
                autoComplete="new-password"
                editable={!loading}
              />
              <Pressable
                style={styles.eyeBtn}
                onPress={() => setShowConfirm(v => !v)}
              >
                <Text style={styles.eyeText}>{showConfirm ? 'Ocultar' : 'Ver'}</Text>
              </Pressable>
            </View>
          </View>

          {/* Botón */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.loginLink, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginLinkText}>
              ¿Ya tienes cuenta?{' '}
              <Text style={styles.loginLinkHighlight}>Inicia sesión</Text>
            </Text>
          </Pressable>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(8),
  },
  backBtn: {
    width: scale(40),
    height: scale(40),
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: scale(48),
    height: scale(48),
  },
  titleSection: {
    marginBottom: verticalScale(20),
  },
  title: {
    fontFamily: 'Oswald_700Bold',
    fontSize: moderateScale(26),
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: moderateScale(13),
    color: Colors.textSecondary,
    marginTop: scale(4),
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: scale(20),
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  inputWrapper: {
    marginBottom: verticalScale(14),
  },
  inputLabel: {
    fontSize: moderateScale(12),
    fontFamily: 'Oswald_600SemiBold',
    color: Colors.textSecondary,
    marginBottom: scale(6),
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  optional: {
    fontFamily: undefined,
    fontWeight: '400' as const,
    fontSize: moderateScale(11),
    color: Colors.textMuted,
    textTransform: 'none',
  },
  input: {
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(11),
    fontSize: moderateScale(14),
    color: Colors.textPrimary,
    flex: 1,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  passwordInput: {
    flex: 1,
  },
  eyeBtn: {
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(11),
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: Radius.md,
  },
  eyeText: {
    fontSize: moderateScale(12),
    color: Colors.blue400,
    fontFamily: 'Oswald_400Regular',
  },
  hint: {
    fontSize: moderateScale(11),
    color: Colors.textMuted,
    marginTop: scale(4),
  },
  button: {
    backgroundColor: Colors.blue600,
    borderRadius: Radius.md,
    paddingVertical: verticalScale(14),
    alignItems: 'center',
    marginTop: verticalScale(8),
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: 'Oswald_700Bold',
    fontSize: moderateScale(15),
    color: Colors.textPrimary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  loginLink: {
    alignItems: 'center',
    marginTop: verticalScale(16),
    paddingVertical: verticalScale(8),
  },
  loginLinkText: {
    fontSize: moderateScale(13),
    color: Colors.textSecondary,
  },
  loginLinkHighlight: {
    color: Colors.blue400,
    fontFamily: 'Oswald_600SemiBold',
  },
});
