/**
 * ColorPicker.tsx - Fila de swatches de color para elegir el color de un tipo de clase
 *
 * Uso:
 * <ColorPicker value={color} onChange={setColor} />
 */

import { View } from 'react-native';
import { CheckIcon } from '../Icons';
import { scale } from '../../theme';
import { CLASS_TYPE_PALETTE } from '../../utils/classTypes';
import { SpringPressable } from './SpringPressable';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(10) }}>
      {CLASS_TYPE_PALETTE.map((color) => {
        const selected = value.toUpperCase() === color.toUpperCase();
        return (
          <SpringPressable
            key={color}
            onPress={() => onChange(color)}
            style={{
              width: scale(42), height: scale(42), borderRadius: scale(21),
              backgroundColor: color,
            }}
          >
            {/*
              width/height fijos (no '100%') y SIN borderWidth aquí: el
              Pressable interior de SpringPressable no tiene tamaño propio —
              si el hijo se renderiza solo a veces (antes: {selected &&
              <CheckIcon/>}) o el borde cambia de grosor según selección
              (0 vs 3, como antes), el área de contenido real se descuadra y
              el tick queda descentrado o el área táctil colapsa. Este View
              siempre mide 42×42 sin importar lo que haya dentro — el anillo
              de selección se pinta como capa absoluta (no consume espacio de
              layout), así el tick siempre queda centrado y el hit area
              siempre coincide con el círculo completo.
            */}
            <View style={{ width: scale(42), height: scale(42), alignItems: 'center', justifyContent: 'center' }}>
              {selected && (
                <View pointerEvents="none" style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  borderRadius: scale(21), borderWidth: 3, borderColor: '#fff',
                }} />
              )}
              {selected && <CheckIcon size={scale(18)} color="#fff" strokeWidth={3} />}
            </View>
          </SpringPressable>
        );
      })}
    </View>
  );
}
