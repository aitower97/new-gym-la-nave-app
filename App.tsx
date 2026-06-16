import { Oswald_400Regular, Oswald_600SemiBold, Oswald_700Bold, useFonts } from '@expo-google-fonts/oswald';
import { useEffect } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import "./global.css";
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initSentry } from './src/lib/sentry';
import AppNavigator from './src/navigation/AppNavigator';

// Disable system font scaling globally so the UI looks consistent
// on all Android devices regardless of accessibility font size settings.
// @ts-ignore
Text.defaultProps = { ...(Text.defaultProps || {}), allowFontScaling: false };
// @ts-ignore
TextInput.defaultProps = { ...(TextInput.defaultProps || {}), allowFontScaling: false };

export default function App() {
  const [fontsLoaded] = useFonts({
    Oswald_400Regular,
    Oswald_600SemiBold,
    Oswald_700Bold,
  });

  useEffect(() => {
    initSentry();
  }, []);

  // Wait for fonts before rendering to avoid font flash
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#08111f' }} />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}