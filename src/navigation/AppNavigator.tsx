import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

import AdminClassesScreen from '../screens/AdminClassesScreen';
import AdminCreateClassScreen from '../screens/AdminCreateClassScreen'; // ← Debe estar
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminPlansScreen from '../screens/AdminPlansScreen';
import AdminTemplatesScreen from '../screens/AdminTemplatesScreen';
import AdminUsersScreen from '../screens/AdminUsersScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import MainMenuScreen from '../screens/MainMenuScreen';
import ProfileScreen from '../screens/ProfileScreen';
import WelcomeScreen from '../screens/WelcomeScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Welcome"
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
          name="Welcome" 
          component={WelcomeScreen}
          options={{ headerShown: false }}
        />
        
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
          name="AdminPlans" 
          component={AdminPlansScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminCreateClass" 
          component={AdminCreateClassScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}