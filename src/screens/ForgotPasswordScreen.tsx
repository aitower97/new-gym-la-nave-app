import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  BrandHeader,
  Button,
  FormCard,
  FormFooterLink,
  Input,
  ScreenWrapper,
} from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import {
  recoveryEmailSchema,
  recoveryOtpSchema,
  recoveryPasswordSchema,
  validateOrAlert,
} from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;
};

type Step = 'email' | 'otp' | 'password';

const OTP_LENGTH = 6;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [loading, setLoading] = useState(false);

  // Step 1
  const [email, setEmail] = useState('');

  // Step 2
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef<(TextInput | null)[]>([]);

  // Step 3
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // ─── Step 1: Send recovery email ────────────────────────────────────

  async function handleSendCode() {
    const validated = validateOrAlert(recoveryEmailSchema, { email }, Alert);
    if (!validated) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(validated.email);

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      // OWASP: generic message, don't reveal if email exists
      Alert.alert(
        'Código enviado',
        'Si el email está registrado, recibirás un código de 6 dígitos. Revisa tu bandeja de entrada y spam.'
      );
      setStep('otp');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo enviar el código');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: Verify OTP ─────────────────────────────────────────────

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
      // Handle paste: distribute digits across inputs
      const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
      const newOtp = [...otpDigits];
      digits.forEach((d, i) => {
        if (index + i < OTP_LENGTH) newOtp[index + i] = d;
      });
      setOtpDigits(newOtp);
      const nextIdx = Math.min(index + digits.length, OTP_LENGTH - 1);
      otpRefs.current[nextIdx]?.focus();
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newOtp = [...otpDigits];
    newOtp[index] = digit;
    setOtpDigits(newOtp);

    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyPress(index: number, key: string) {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otpDigits];
      newOtp[index - 1] = '';
      setOtpDigits(newOtp);
    }
  }

  async function handleVerifyOtp() {
    const token = otpDigits.join('');
    const validated = validateOrAlert(recoveryOtpSchema, { token }, Alert);
    if (!validated) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: validated.token,
        type: 'recovery',
      });

      if (error) {
        Alert.alert('Código inválido', 'El código es incorrecto o ha expirado. Solicita uno nuevo.');
        return;
      }

      setStep('password');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo verificar el código');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 3: Set new password ───────────────────────────────────────

  async function handleResetPassword() {
    const validated = validateOrAlert(
      recoveryPasswordSchema,
      { password, confirm_password: confirmPassword },
      Alert
    );
    if (!validated) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: validated.password,
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      await supabase.auth.signOut();

      Alert.alert(
        'Contraseña actualizada',
        'Tu contraseña ha sido cambiada correctamente. Inicia sesión con tu nueva contraseña.',
        [{ text: 'Ir a Login', onPress: () => navigation.navigate('Login') }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  }

  // ─── Step 2: Resend code ────────────────────────────────────────────

  async function handleResendCode() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      Alert.alert('Código reenviado', 'Revisa tu bandeja de entrada y spam.');
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      otpRefs.current[0]?.focus();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo reenviar el código');
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    email: 'Recuperar contraseña',
    otp: 'Verificar código',
    password: 'Nueva contraseña',
  };

  const stepSubtitles: Record<Step, string> = {
    email: 'Introduce tu email y te enviaremos un código de verificación',
    otp: `Introduce el código de 6 dígitos enviado a ${email}`,
    password: 'Crea una contraseña segura para tu cuenta',
  };

  return (
    <ScreenWrapper onBackPress={() => {
      if (step === 'otp') setStep('email');
      else if (step === 'password') setStep('otp');
      else navigation.goBack();
    }}>
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

      <FormCard title={stepTitles[step]} style={{ marginBottom: 32 }}>
        <Animated.View entering={FadeIn.duration(300)}>
          <Text style={{
            fontSize: moderateScale(13),
            color: Colors.textSecondary,
            textAlign: 'center',
            marginBottom: scale(24),
            lineHeight: moderateScale(18),
          }}>
            {stepSubtitles[step]}
          </Text>
        </Animated.View>

        {/* Step 1: Email */}
        {step === 'email' && (
          <Animated.View entering={FadeInDown.duration(350).springify()}>
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

            <Button
              label="Enviar código"
              onPress={handleSendCode}
              loading={loading}
              disabled={loading}
              size="lg"
            />

            <FormFooterLink
              prompt="¿Ya tienes cuenta?"
              link="Iniciar sesión"
              onPress={() => navigation.navigate('Login')}
              disabled={loading}
            />
          </Animated.View>
        )}

        {/* Step 2: OTP */}
        {step === 'otp' && (
          <Animated.View entering={FadeInDown.duration(350).springify()}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: scale(8),
              marginBottom: scale(24),
            }}>
              {otpDigits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => { otpRefs.current[i] = ref; }}
                  value={digit}
                  onChangeText={(v) => handleOtpChange(i, v)}
                  onKeyPress={({ nativeEvent }) => handleOtpKeyPress(i, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={i === 0 ? OTP_LENGTH : 1}
                  selectTextOnFocus
                  style={{
                    width: scale(44),
                    height: scale(56),
                    borderRadius: 12,
                    backgroundColor: digit
                      ? 'rgba(59,130,246,0.15)'
                      : 'rgba(255,255,255,0.05)',
                    borderWidth: 2,
                    borderColor: digit
                      ? Colors.blue500
                      : 'rgba(255,255,255,0.1)',
                    fontSize: moderateScale(22),
                    fontWeight: '800',
                    color: Colors.textPrimary,
                    textAlign: 'center',
                  }}
                />
              ))}
            </View>

            <Button
              label="Verificar código"
              onPress={handleVerifyOtp}
              loading={loading}
              disabled={loading || otpDigits.some(d => !d)}
              size="lg"
            />

            <FormFooterLink
              prompt="¿No recibiste el código?"
              link="Reenviar"
              onPress={handleResendCode}
              disabled={loading}
            />
          </Animated.View>
        )}

        {/* Step 3: New Password */}
        {step === 'password' && (
          <Animated.View entering={FadeInDown.duration(350).springify()}>
            <Input
              label="Nueva contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              showToggle
              editable={!loading}
            />

            <Input
              label="Confirmar contraseña"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              secureTextEntry
              showToggle
              editable={!loading}
            />

            <View style={{
              backgroundColor: 'rgba(59,130,246,0.08)',
              borderRadius: 10,
              padding: scale(12),
              marginBottom: scale(16),
              borderWidth: 1,
              borderColor: 'rgba(59,130,246,0.15)',
            }}>
              <Text style={{
                fontSize: moderateScale(11),
                color: Colors.textSecondary,
                lineHeight: moderateScale(16),
              }}>
                La contraseña debe tener:{'\n'}
                - Mínimo 8 caracteres{'\n'}
                - Una letra mayúscula y una minúscula{'\n'}
                - Un número{'\n'}
                - Un carácter especial (!@#$...)
              </Text>
            </View>

            <Button
              label="Cambiar contraseña"
              onPress={handleResetPassword}
              loading={loading}
              disabled={loading}
              size="lg"
            />
          </Animated.View>
        )}

        {/* Step indicator */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: scale(8),
          marginTop: scale(20),
        }}>
          {(['email', 'otp', 'password'] as Step[]).map((s) => (
            <View
              key={s}
              style={{
                width: step === s ? scale(24) : scale(8),
                height: scale(8),
                borderRadius: scale(4),
                backgroundColor: step === s
                  ? Colors.blue500
                  : s === 'email' || (s === 'otp' && step === 'password')
                  ? 'rgba(59,130,246,0.3)'
                  : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
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
