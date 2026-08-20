import { View } from 'react-native';
import { scale } from '../../theme';

interface CategoryDotProps {
  color: string;
  size?: 'sm' | 'md';
}

const SIZES = { sm: 6, md: 8 } as const;

/** Puntito de color de una categoría de plan — un único tamaño/estilo en toda la app. */
export function CategoryDot({ color, size = 'md' }: CategoryDotProps) {
  const px = scale(SIZES[size]);
  return (
    <View style={{ width: px, height: px, borderRadius: px / 2, backgroundColor: color }} />
  );
}
