import { Oswald_400Regular, Oswald_600SemiBold, Oswald_700Bold, useFonts } from '@expo-google-fonts/oswald';
import { useEffect, useRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import "./global.css";
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TutorialOverlay } from './src/components/tutorial/TutorialOverlay';
import { UpdateAvailableModal } from './src/components/UpdateAvailableModal';
import { clearUser, identifyUser, initSentry } from './src/lib/sentry';
import { supabase } from './src/lib/supabase';
import AppNavigator from './src/navigation/AppNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { TutorialProvider } from './src/tutorial/TutorialContext';
import { registerForPushNotificationsAsync, savePushToken, setupAndroidNotificationChannel } from './src/utils/pushNotifications';

let Notifications: any;
try { Notifications = require('expo-notifications'); } catch {}

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

  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    initSentry();
    setupAndroidNotificationChannel();

    // Registrar push token cuando el usuario se autentica.
    // onAuthStateChange cubre login y sesión restaurada al abrir la app.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        registerForPushNotificationsAsync().then(token => {
          if (token) savePushToken(token);
        });
        identifyUser(session.user.id, session.user.email);
      } else if (event === 'SIGNED_OUT') {
        clearUser();
      }
    });

    // Fallback: INITIAL_SESSION puede disparar antes de que el listener esté listo.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        registerForPushNotificationsAsync().then(token => {
          if (token) savePushToken(token);
        });
      }
    });

    if (Notifications) {
      // Notificación recibida con la app ABIERTA en primer plano
      notificationListener.current = Notifications.addNotificationReceivedListener(() => {
        // setNotificationHandler ya muestra el banner con shouldShowAlert: true
      });

      // Usuario toca una notificación (app en segundo plano o primer plano)
      responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Notifications');
        }
      });

      // App abierta DESDE una notificación (estaba cerrada)
      // Delay para dar tiempo al navigator y a que se restaure la sesión
      setTimeout(async () => {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response && navigationRef.isReady()) {
          navigationRef.navigate('Notifications');
        }
      }, 1500);
    }

    return () => {
      subscription.unsubscribe();
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  // Wait for fonts before rendering to avoid font flash
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#08111f' }} />;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <TutorialProvider>
          <AppNavigator />
          <TutorialOverlay />
          <UpdateAvailableModal />
        </TutorialProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}