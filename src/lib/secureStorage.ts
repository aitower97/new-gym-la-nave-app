import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 2000; // Bajo el límite de 2048 bytes

/**
 * Adapter de SecureStore con soporte para valores grandes (>2048 bytes)
 * Divide automáticamente en chunks si es necesario
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(key);
      }

      // Intentar leer como chunk único primero
      const singleValue = await SecureStore.getItemAsync(key);
      if (singleValue !== null && !singleValue.startsWith('chunked:')) {
        return singleValue;
      }

      // Si está chunked, reconstruir
      if (singleValue?.startsWith('chunked:')) {
        const chunkCount = parseInt(singleValue.split(':')[1]);
        let fullValue = '';
        
        for (let i = 0; i < chunkCount; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_chunk_${i}`);
          if (chunk) {
            fullValue += chunk;
          }
        }
        
        return fullValue || null;
      }

      return null;
    } catch (error) {
      console.error('SecureStore getItem error:', error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(key, value);
        return;
      }

      // Si el valor es pequeño, guardar directo
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        return;
      }

      // Si es grande, dividir en chunks
      const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
      
      // Guardar metadata
      await SecureStore.setItemAsync(key, `chunked:${chunkCount}`);
      
      // Guardar cada chunk
      for (let i = 0; i < chunkCount; i++) {
        const chunk = value.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_chunk_${i}`, chunk);
      }
    } catch (error) {
      console.error('SecureStore setItem error:', error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(key);
        return;
      }

      // Verificar si está chunked
      const value = await SecureStore.getItemAsync(key);
      
      if (value?.startsWith('chunked:')) {
        const chunkCount = parseInt(value.split(':')[1]);
        
        // Eliminar todos los chunks
        for (let i = 0; i < chunkCount; i++) {
          await SecureStore.deleteItemAsync(`${key}_chunk_${i}`);
        }
      }
      
      // Eliminar la key principal
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('SecureStore removeItem error:', error);
    }
  },
};