import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { APPLE_AUTH_ENABLED } from '../../config/socialAuth';
import {
  isAppleAvailable,
  isGoogleConfigured,
  signInWithApple,
  signInWithGoogle,
  SocialSignInResult,
} from '../../utils/socialAuth';

interface Props {
  /** Se llama con la sesión ya abierta en Supabase. */
  onSignedIn: (result: SocialSignInResult) => void | Promise<void>;
  /** Bloquea los botones mientras el formulario de email está trabajando. */
  disabled?: boolean;
  /** Avisa al padre para que bloquee su formulario mientras tanto. */
  onBusyChange?: (busy: boolean) => void;
  /** Dónde va el separador "o": debajo si los botones van antes del formulario. */
  separator?: 'top' | 'bottom';
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/**
 * "Continuar con Google / Apple" + separador "o". No pinta nada si ningún
 * proveedor está configurado (ver src/config/socialAuth.ts), así las pantallas
 * se quedan como antes hasta tener los IDs de cliente.
 */
export function SocialLoginButtons({ onSignedIn, disabled, onBusyChange, separator = 'top' }: Props) {
  // null = aún comprobando (solo iOS): se reserva el hueco para que no salte el layout
  const [appleAvailable, setAppleAvailable] = useState<boolean | null>(Platform.OS === 'ios' && APPLE_AUTH_ENABLED ? null : false);
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const showGoogle = isGoogleConfigured();

  useEffect(() => {
    isAppleAvailable().then(setAppleAvailable);
  }, []);

  if (!showGoogle && !appleAvailable) return null;

  const run = async (provider: 'google' | 'apple') => {
    if (busy || disabled) return;
    setBusy(provider);
    onBusyChange?.(true);
    try {
      const result = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (result) await onSignedIn(result);
    } catch (error: any) {
      Alert.alert('No se pudo entrar', error?.message || 'Inténtalo de nuevo.');
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  };

  const blocked = !!busy || !!disabled;

  // El botón de Apple tiene que ser el oficial (guías de Apple); se carga solo
  // cuando está disponible para no tocar el módulo nativo en Android.
  let AppleButton: any = null;
  let appleConsts: any = null;
  if (appleAvailable) {
    const AppleAuthentication = require('expo-apple-authentication');
    AppleButton = AppleAuthentication.AppleAuthenticationButton;
    appleConsts = AppleAuthentication;
  }

  const divider = (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginHorizontal: 12 }}>o</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
    </View>
  );

  return (
    <View style={{ marginTop: separator === 'top' ? 4 : 0, marginBottom: separator === 'top' ? 12 : 0 }}>
      {separator === 'top' && divider}

      {appleAvailable === null && <View style={{ height: 64 }} />}

      {appleAvailable && AppleButton && (
        <View
          style={{ marginBottom: 12, opacity: blocked && busy !== 'apple' ? 0.5 : 1 }}
          pointerEvents={blocked ? 'none' : 'auto'}
        >
          <AppleButton
            buttonType={appleConsts.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={appleConsts.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={14}
            style={{ width: '100%', height: 52 }}
            onPress={() => run('apple')}
          />
          {busy === 'apple' && (
            <View
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 14, backgroundColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <ActivityIndicator color="#1F1F1F" />
            </View>
          )}
        </View>
      )}

      {showGoogle && (
        <Pressable
          onPress={() => run('google')}
          disabled={blocked}
          accessibilityRole="button"
          accessibilityLabel="Continuar con Google"
        >
          {({ pressed }) => (
            <View
              style={{
                height: 52,
                borderRadius: 14,
                backgroundColor: '#FFFFFF',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: blocked && busy !== 'google' ? 0.5 : pressed ? 0.85 : 1,
              }}
            >
              {busy === 'google' ? (
                <ActivityIndicator color="#1F1F1F" />
              ) : (
                <>
                  <GoogleLogo />
                  <Text style={{ color: '#1F1F1F', fontSize: 16, fontWeight: '600', marginLeft: 10 }}>
                    Continuar con Google
                  </Text>
                </>
              )}
            </View>
          )}
        </Pressable>
      )}

      {separator === 'bottom' && divider}
    </View>
  );
}
