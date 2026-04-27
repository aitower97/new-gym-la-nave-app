import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

import AdminClassDetailScreen from '../screens/AdminClassDetailScreen';
import AdminClassesScreen from '../screens/AdminClassesScreen';
import AdminClassPreBookScreen from '../screens/AdminClassPreBookScreen';
import AdminCreateClassScreen from '../screens/AdminCreateClassScreen'; // ← Debe estar
import AdminCreateRecurringClassScreen from '../screens/AdminCreateRecurringClassScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminEditClassScreen from '../screens/AdminEditClassScreen';
import AdminPlansScreen from '../screens/AdminPlansScreen';
import AdminTemplatesScreen from '../screens/AdminTemplatesScreen';
import AdminUsersScreen from '../screens/AdminUsersScreen';
import AdminUserTemplatesScreen from '../screens/AdminUserTemplatesScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import MainMenuScreen from '../screens/MainMenuScreen';
import MyClassesScreen from '../screens/MyClassesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#0A0E1A',
          },
          headerTintColor: '#ffffff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
          options={{ title: 'Iniciar Sesión' }}
        />
        
        <Stack.Screen 
          name="MainMenu" 
          component={MainMenuScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="Profile" 
          component={ProfileScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="MyClasses" 
          component={MyClassesScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminDashboard" 
          component={AdminDashboardScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminTemplates" 
          component={AdminTemplatesScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminClasses" 
          component={AdminClassesScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminUsers" 
          component={AdminUsersScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="AdminUserTemplates"
          component={AdminUserTemplatesScreen}
          options={{ title: 'Plantilla Semanal' }}
        />
        
        <Stack.Screen 
          name="AdminPlans" 
          component={AdminPlansScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminCreateClass" 
          component={AdminCreateClassScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminCreateRecurringClass" 
          component={AdminCreateRecurringClassScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminClassDetail" 
          component={AdminClassDetailScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="AdminEditClass" 
          component={AdminEditClassScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminClassPreBook"
          component={AdminClassPreBookScreen}
          options={{ title: 'Pre-reservar Usuarios' }}
        />
        <Stack.Screen 
          name="Notifications" 
          component={NotificationsScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}