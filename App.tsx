import { useEffect } from 'react';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { initSentry } from './src/lib/sentry';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  useEffect(() => {
    // Inicializar Sentry al arrancar la app
    initSentry();
  }, []);

  return (
    <ErrorBoundary>
      <AppNavigator />
    </ErrorBoundary>
  );
}