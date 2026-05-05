import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initSentry } from './src/lib/sentry';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    initSentry();
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <AppNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}