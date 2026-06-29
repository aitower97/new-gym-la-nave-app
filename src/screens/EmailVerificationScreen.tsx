import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  BrandHeader,
  Button,
  FormCard,
  FormFooterLink,
  ScreenWrapper,
} from '../components/ui';
import { supabase } from '../lib/supabase';
import { Colors, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EmailVerification'>;
  route: RouteProp<RootStackParamList, 'EmailVerification'>;
};

const OTP_LENGTH = 8;

export default function EmailVerificationScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const [loading, setLoading] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const otpRefs = useRef<(TextInput | null)[]>([]);

  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
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

  async function handleVerify() {
    const token = otpDigits.join('');
    if (token.length !== OTP_LENGTH) {
      Alert.alert('Código incompleto', `Introduce los ${OTP_LENGTH} dígitos del código`);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'signup',
      });

      if (error) {
        Alert.alert('Código inválido', 'El código es incorrecto o ha expirado. Solicita uno nuevo.');
        return;
      }

      await supabase.auth.signOut();

      Alert.alert(
        '¡Cuenta verificada!',
        'Tu email ha sido confirmado correctamente. Ya puedes iniciar sesión.',
        [{ text: 'Iniciar sesión', onPress: () => navigation.navigate('Login') }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo verificar el código');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
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

  return (
    <ScreenWrapper onBackPress={() => navigation.navigate('Login')}>
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

      <FormCard title="Confirma tu email" style={{ marginBottom: 32 }}>
        <Text style={{
          fontSize: moderateScale(13),
          color: Colors.textSecondary,
          textAlign: 'center',
          marginBottom: scale(24),
          lineHeight: moderateScale(18),
        }}>
          Te hemos enviado un código de {OTP_LENGTH} dígitos a{'\n'}
          <Text style={{ color: Colors.textPrimary, fontWeight: '700' }}>{email}</Text>
        </Text>

        <Animated.View entering={FadeInDown.duration(350).springify()}>
          <View style={{
            flexDirection: 'row',
            justifyContent: 'center',
            gap: scale(6),
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
                  width: scale(34),
                  height: scale(48),
                  borderRadius: 10,
                  backgroundColor: digit
                    ? 'rgba(59,130,246,0.15)'
                    : 'rgba(255,255,255,0.05)',
                  borderWidth: 2,
                  borderColor: digit
                    ? Colors.blue500
                    : 'rgba(255,255,255,0.1)',
                  fontSize: moderateScale(20),
                  fontWeight: '800',
                  color: Colors.textPrimary,
                  textAlign: 'center',
                }}
              />
            ))}
          </View>

          <Button
            label="Confirmar cuenta"
            onPress={handleVerify}
            loading={loading}
            disabled={loading || otpDigits.some(d => !d)}
            size="lg"
          />

          <FormFooterLink
            prompt="¿No recibiste el código?"
            link="Reenviar"
            onPress={handleResend}
            disabled={loading}
          />
        </Animated.View>
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
