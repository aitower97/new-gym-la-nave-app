import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://llkcidbbadjgrrquexqd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsa2NpZGJiYWRqZ3JycXVleHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODg0NjEsImV4cCI6MjA5MDQ2NDQ2MX0.0NEOYVSFZs-54AJ2nna-GyWaHVLVymQkHNvd6JxmQzw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
    },
  },
});