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
import RegisterScreen from '../screens/RegisterScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import WorkoutNotesScreen from '../screens/WorkoutNotesScreen';


const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Welcome"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#08111f' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen 
          name="Welcome" 
          component={WelcomeScreen}
        />
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
        />
        <Stack.Screen 
          name="Register" 
          component={RegisterScreen}
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
          name="WorkoutNotes"
          component={WorkoutNotesScreen}
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