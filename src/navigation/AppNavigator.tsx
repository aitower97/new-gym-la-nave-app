import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { navigationRef } from './navigationRef';

import AdminClassDetailScreen from '../screens/AdminClassDetailScreen';
import AdminClassesScreen from '../screens/AdminClassesScreen';
import AdminClassPreBookScreen from '../screens/AdminClassPreBookScreen';
import AdminCreateClassScreen from '../screens/AdminCreateClassScreen'; // ← Debe estar
import AdminCreateRecurringClassScreen from '../screens/AdminCreateRecurringClassScreen';
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import AdminEditClassScreen from '../screens/AdminEditClassScreen';
import AdminWorkoutScreen from '../screens/AdminWorkoutScreen';
import AdminUserWorkoutScreen from '../screens/AdminUserWorkoutScreen';
import AdminEditUserScreen from '../screens/AdminEditUserScreen';
import AdminPlansScreen from '../screens/AdminPlansScreen';
import AdminPlanFormScreen from '../screens/AdminPlanFormScreen';
import AdminUsersScreen from '../screens/AdminUsersScreen';
import AdminUserTemplatesScreen from '../screens/AdminUserTemplatesScreen';
import EmailVerificationScreen from '../screens/EmailVerificationScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import LoginScreen from '../screens/LoginScreen';
import MainMenuScreen from '../screens/MainMenuScreen';
import MyClassesScreen from '../screens/MyClassesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ReservationScreen from '../screens/ReservationScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import WorkoutNotesScreen from '../screens/WorkoutNotesScreen';
import WorkoutScreen from '../screens/WorkoutScreen';
import WorkoutProgressScreen from '../screens/WorkoutProgressScreen';
import WorkoutHistoryScreen from '../screens/WorkoutHistoryScreen';



const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
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
          name="ForgotPassword"
          component={ForgotPasswordScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="EmailVerification"
          component={EmailVerificationScreen}
          options={{ headerShown: false }}
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
          name="Reservation" 
          component={ReservationScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminDashboard" 
          component={AdminDashboardScreen}
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
          name="AdminEditUser"
          component={AdminEditUserScreen}
          options={{ headerShown: false }}
        />
        
        <Stack.Screen 
          name="AdminPlans" 
          component={AdminPlansScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="AdminPlanForm"
          component={AdminPlanFormScreen}
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
        <Stack.Screen
          name="Workout"
          component={WorkoutScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WorkoutProgress"
          component={WorkoutProgressScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WorkoutHistory"
          component={WorkoutHistoryScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminWorkout"
          component={AdminWorkoutScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminUserWorkout"
          component={AdminUserWorkoutScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}