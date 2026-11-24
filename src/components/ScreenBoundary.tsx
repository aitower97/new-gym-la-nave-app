import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, moderateScale, scale } from '../theme';
import { ErrorBoundary } from './ErrorBoundary';
import { AlertIcon } from './Icons';

/**
 * Cada pantalla lleva su propio ErrorBoundary (screenLayout del Stack): si
 * una pantalla falla, se puede volver atrás y el resto de la app sigue.
 */
export function ScreenBoundary({ name, canGoBack, onBack, children }: {
  name: string;
  canGoBack: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      name={`pantalla:${name}`}
      fallback={(_error, reset) => <ScreenError canGoBack={canGoBack} onBack={onBack} onRetry={reset} />}
    >
      {children}
    </ErrorBoundary>
  );
}

function ScreenError({ canGoBack, onBack, onRetry }: { canGoBack: boolean; onBack: () => void; onRetry: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{
      flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: scale(32), paddingTop: insets.top, paddingBottom: insets.bottom,
    }}>
      <AlertIcon size={scale(44)} color={Colors.danger} strokeWidth={1.6} />
      <Text style={{ marginTop: scale(14), fontSize: moderateScale(17), fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' }}>
        Algo ha fallado
      </Text>
      <View style={{ flexDirection: 'row', gap: scale(10), marginTop: scale(22) }}>
        {canGoBack && (
          <Pressable onPress={onBack}>
            <View style={{ paddingHorizontal: scale(20), paddingVertical: scale(11), borderRadius: Radius.md, backgroundColor: Colors.inputBg }}>
              <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: Colors.textPrimary }}>Volver</Text>
            </View>
          </Pressable>
        )}
        <Pressable onPress={onRetry}>
          <View style={{ paddingHorizontal: scale(20), paddingVertical: scale(11), borderRadius: Radius.md, backgroundColor: Colors.blue400 }}>
            <Text style={{ fontSize: moderateScale(14), fontWeight: '700', color: '#fff' }}>Reintentar</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
