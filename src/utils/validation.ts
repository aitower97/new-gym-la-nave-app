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
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'Contraseña demasiado larga')
    .regex(/[a-z]/, 'Debe contener al menos una letra minúscula')
    .regex(/[A-Z]/, 'Debe contener al menos una letra mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial (!@#$...)'),
});

export const registerSchema = z.object({
  full_name: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'Nombre demasiado largo')
    .trim(),
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('Email inválido')
    .toLowerCase()
    .trim(),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^(\+34)?[6-9]\d{8}$/.test(val.replace(/\s/g, '')),
      'Teléfono inválido (formato español: 6XXXXXXXX)'
    ),
  birth_date: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return /^\d{2}\/\d{2}\/\d{4}$/.test(val);
      },
      'Formato de fecha inválido (DD/MM/AAAA)'
    ),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'Contraseña demasiado larga')
    .regex(/[a-z]/, 'Debe contener al menos una letra minúscula')
    .regex(/[A-Z]/, 'Debe contener al menos una letra mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial (!@#$...)'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm_password'],
});

// Password Recovery
export const recoveryEmailSchema = z.object({
  email: z
    .string()
    .min(1, 'El email es requerido')
    .email('Email inválido')
    .toLowerCase()
    .trim(),
});

export const recoveryOtpSchema = z.object({
  token: z
    .string()
    .length(8, 'El código debe tener 8 dígitos')
    .regex(/^\d+$/, 'El código solo debe contener números'),
});

export const recoveryPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(100, 'Contraseña demasiado larga')
    .regex(/[a-z]/, 'Debe contener al menos una letra minúscula')
    .regex(/[A-Z]/, 'Debe contener al menos una letra mayúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número')
    .regex(/[^A-Za-z0-9]/, 'Debe contener al menos un carácter especial (!@#$...)'),
  confirm_password: z.string(),
}).refine((data) => data.password === data.confirm_password, {
  message: 'Las contraseñas no coinciden',
  path: ['confirm_password'],
});

// Profile
export const profileUpdateSchema = z.object({
  username: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[a-zA-Z0-9_]{3,30}$/.test(val),
      'Apodo: 3-30 caracteres, solo letras, números y _'
    ),
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
    .max(10, 'Máximo 10 plazas'),
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
    .max(10, 'Máximo 10 plazas'),
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