import { FadeInDown } from 'react-native-reanimated';

/**
 * Entrada animada de una fila de lista. Solo las primeras filas se animan:
 * las de más abajo no se ven al abrir, y animar decenas a la vez que la
 * pantalla entra deslizándose es lo que daba tirones (sobre todo en Android).
 */
export const MAX_ANIMATED_ROWS = 8;

export function rowEntering(index: number, baseDelay = 0, step = 40) {
  if (index >= MAX_ANIMATED_ROWS) return undefined;
  return FadeInDown.duration(280).delay(baseDelay + index * step);
}
