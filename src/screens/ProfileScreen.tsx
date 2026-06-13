import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraIcon, ChevronLeftIcon } from '../components/Icons';
import { supabase } from '../lib/supabase';
import { Colors, MAX_CONTENT_WIDTH, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { profileUpdateSchema, validateOrAlert } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
  route: RouteProp<RootStackParamList, 'Profile'>;
};

export default function ProfileScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const insets = useSafeAreaInsets();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [userId, setUserId] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  

  async function loadProfile() {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigation.navigate('Login');
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setFullName(data.full_name || '');
        setPhone(data.phone || '');
        setBirthDate(data.birth_date || '');
        setAvatarUrl(data.avatar_url);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  async function pickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permisos necesarios', 'Necesitamos acceso a tu galería');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], 
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('Imagen seleccionada:', result.assets[0].uri);
        await uploadAvatar(result.assets[0].uri);
      }
    } catch (error: any) {
      console.error('Pick error:', error);
      Alert.alert('Error', error.message);
    }
  }

  async function uploadAvatar(uri: string) {
    try {
      setUploadingImage(true);

      console.log('=== UPLOAD SEGURO CON SUPABASE CLIENT ===');
      console.log('URI:', uri);

      // 1. Preparar archivo
      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${fileName}`;

      console.log('Archivo:', fileName);
      console.log('Ruta:', filePath);

      // 2. Leer archivo como ArrayBuffer (React Native)
      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      console.log('Archivo leído, tamaño:', arrayBuffer.byteLength, 'bytes');

      // 3. Upload usando Supabase Storage client (maneja auth automáticamente)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, arrayBuffer, {
          contentType: fileExt === 'png' ? 'image/png' : 'image/jpeg',
          upsert: false, // No sobrescribir si existe
        });

      if (uploadError) {
        console.error('Error en upload:', uploadError);
        throw uploadError;
      }

      console.log('✅ Upload exitoso:', uploadData.path);

      // 4. Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;
      console.log('URL pública:', publicUrl);

      // 5. Actualizar perfil en BD
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) {
        console.error('Error actualizando BD:', updateError);
        throw updateError;
      }

      console.log('✅ BD actualizada');

      // 6. Actualizar UI
      setAvatarUrl(`${publicUrl}?t=${Date.now()}`);
      
      console.log('=== COMPLETADO ===');
      Alert.alert('¡Listo! 📸', 'Foto de perfil actualizada');

    } catch (error: any) {
      console.error('💥 ERROR:', error);
      Alert.alert('Error al subir imagen', error.message);
    } finally {
      setUploadingImage(false);
    }
  }

  async function saveProfile() {
    // Validar inputs
    const validated = validateOrAlert(
      profileUpdateSchema,
      { 
        full_name: fullName,
        phone: phone || undefined, // Convertir string vacío a undefined
      },
      Alert
    );
    
    if (!validated) return;

    try {
      setSaving(true);
      
      const updates = {
        id: userId,
        email: email,
        full_name: validated.full_name,
        phone: validated.phone || null,
        birth_date: birthDate || null,
        updated_at: new Date().toISOString(),
      };
      
      const { error } = await supabase
        .from('profiles')
        .upsert(updates);
      
      if (error) throw error;
      
      Alert.alert('¡Guardado!', 'Tu perfil se ha actualizado correctamente');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setSaving(false);
    }
  }

  function deleteAccount() {
    Alert.alert(
      'Eliminar cuenta',
      '¿Estás seguro de que quieres eliminar tu cuenta? Esta acción no se puede deshacer. Todos tus datos serán eliminados permanentemente.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ Llamando a Edge Function para eliminar cuenta...');

              // Llamar a Edge Function que borra TODO (incluido auth)
              const { data: { session } } = await supabase.auth.getSession();
              
              const response = await fetch(
                'https://llkcidbbadjgrrquexqd.supabase.co/functions/v1/delete-user',
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              const result = await response.json();

              if (!response.ok) {
                throw new Error(result.error || 'Error al eliminar cuenta');
              }

              console.log('✅ Cuenta eliminada completamente');

              // Cerrar sesión local
              await supabase.auth.signOut();

              Alert.alert(
                'Cuenta eliminada',
                'Tu cuenta ha sido eliminada completamente. No podrás volver a acceder con estas credenciales.'
              );
              
              navigation.navigate('Login');
            } catch (error: any) {
              console.error('💥 Error eliminando cuenta:', error);
              Alert.alert(
                'Error',
                `No se pudo eliminar la cuenta: ${error.message}. Contacta con soporte: arrocham97@gmail.com`
              );
            }
          },
        },
      ]
    );
  }

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: Colors.background }}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + scale(40), alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + scale(12) }]}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}
            onPress={() => navigation.goBack()}
          >
            <ChevronLeftIcon size={scale(22)} color={Colors.textSecondary} />
          </Pressable>
          <Text style={styles.headerTitle}>Mi Perfil</Text>
          <View style={{ width: scale(40) }} />
        </View>

        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <Pressable 
            style={styles.avatarContainer}
            onPress={pickImage}
            disabled={uploadingImage}
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                  {fullName[0]?.toUpperCase() || email[0].toUpperCase()}
                </Text>
              </View>
            )}
            
            {uploadingImage ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator color="#fff" />
              </View>
            ) : (
              <View style={styles.avatarEditBadge}>
                <CameraIcon size={scale(18)} color="#fff" strokeWidth={2} />
              </View>
            )}
          </Pressable>
          
          <Text style={styles.avatarHint}>Toca para cambiar foto</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Nombre completo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Juan Pérez"
              placeholderTextColor="#6B7280"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>

          {/* Email (solo lectura) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={email}
              editable={false}
            />
            <Text style={styles.hint}>El email no se puede cambiar</Text>
          </View>

          {/* Teléfono */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Teléfono (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: 612 345 678"
              placeholderTextColor="#6B7280"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          {/* Fecha de nacimiento */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de nacimiento (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="AAAA-MM-DD (Ej: 1990-05-15)"
              placeholderTextColor="#6B7280"
              value={birthDate}
              onChangeText={setBirthDate}
            />
            <Text style={styles.hint}>Formato: AAAA-MM-DD</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable 
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              saving && styles.saveButtonDisabled,
            ]}
            onPress={saveProfile}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Text>
          </Pressable>

          <Pressable 
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </Pressable>
        </View>

        {/* Danger Zone */}
        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>Zona de peligro</Text>
          <Pressable 
            style={styles.logoutButton}
            onPress={async () => {
              Alert.alert(
                'Cerrar sesión',
                '¿Estás seguro?',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { 
                    text: 'Cerrar sesión', 
                    style: 'destructive',
                    onPress: async () => {
                      await supabase.auth.signOut();
                      navigation.navigate('Login');
                    }
                  },
                ]
              );
            }}
          >
            <Text style={styles.logoutButtonText}>Cerrar Sesión</Text>
          </Pressable>
          <Pressable 
            style={styles.deleteButton}
            onPress={deleteAccount}
          >
            <Text style={styles.deleteButtonText}>Eliminar Cuenta</Text>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(20),
    paddingBottom: scale(16),
  },
  backButton: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(20),
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#3B82F6',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#3B82F6',
  },
  avatarInitial: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  avatarLoading: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0a0f1a',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#0a0f1a',
  },
  avatarEditIcon: {
    fontSize: 18,
  },
  avatarHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  form: {
    paddingHorizontal: 20,
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  inputDisabled: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.5)',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 32,
    gap: 12,
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonPressed: {
    opacity: 0.8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  dangerZone: {
    marginTop: 40,
    paddingHorizontal: 20,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,68,68,0.2)',
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(239,68,68,0.8)',
    marginBottom: 12,
  },
  logoutButton: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
  deleteButton: {
    backgroundColor: '#dc2626', // rojo
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 32,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});