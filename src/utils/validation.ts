import { z } from 'zod';

// ========================================
// SCHEMAS DE VALIDACIÓN
// ========================================

// Auth
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('Email inválido')
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'Contraseña demasiado larga'),
});

export const signUpSchema = loginSchema.extend({
  password: z
    .string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'Contraseña demasiado larga')
    .regex(/[A-Za-z]/, 'Debe contener al menos una letra')
    .regex(/[0-9]/, 'Debe contener al menos un número'),
});

// Profile
export const profileUpdateSchema = z.object({
  full_name: z
    .string()
    .min(1, 'El nombre es requerido')
    .max(100, 'Nombre demasiado largo')
    .trim(),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^(\+34)?[6-9]\d{8}$/.test(val.replace(/\s/g, '')),
      'Teléfono inválido (formato español)'
    ),
});

// Admin - Clases
export const classCapacitySchema = z.object({
  max_spots: z
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 plaza')
    .max(30, 'Máximo 30 plazas'),
});

export const createClassSchema = z.object({
  class_type: z
    .string()
    .min(1, 'El tipo de clase es requerido'),
  class_date: z
    .string()
    .refine(
      (date) => {
        const selected = new Date(date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return selected >= today;
      },
      'La fecha no puede ser en el pasado'
    ),
  max_spots: z
    .number()
    .int()
    .min(1, 'Mínimo 1 plaza')
    .max(30, 'Máximo 30 plazas'),
});

// ========================================
// HELPERS DE VALIDACIÓN
// ========================================

/**
 * Valida datos y retorna errores en formato legible
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  // Tomar el primer error
  const firstError = result.error.issues[0];
  return {
    success: false,
    error: firstError.message,
  };
}

/**
 * Valida y lanza Alert si falla
 */
export function validateOrAlert<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  Alert: any
): T | null {
  const result = validateData(schema, data);
  
  if (!result.success) {
    Alert.alert('Error de validación', result.error);
    return null;
  }
  
  return result.data;
}