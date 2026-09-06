/**
 * ClassTypeSelector.tsx - Selector de tipo de clase con color, alta y baja
 * Centraliza lo que antes estaba duplicado en 4 pantallas de admin.
 *
 * Uso:
 * <ClassTypeSelector types={types} onTypesChange={setTypes} selected={classType} onSelect={setClassType} />
 */

import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { PlusIcon } from '../Icons';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { CLASS_TYPE_PALETTE, ClassTypeInfo, createClassType, deleteClassType, setClassTypeColor } from '../../utils/classTypes';
import { ColorPicker } from './ColorPicker';
import { SpringPressable } from './SpringPressable';

interface ClassTypeSelectorProps {
  types: ClassTypeInfo[];
  onTypesChange: (types: ClassTypeInfo[]) => void;
  selected: string;
  onSelect: (name: string) => void;
}

export function ClassTypeSelector({ types, onTypesChange, selected, onSelect }: ClassTypeSelectorProps) {
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeColor, setNewTypeColor] = useState(CLASS_TYPE_PALETTE[0]);
  const [editingColorFor, setEditingColorFor] = useState<string | null>(null);
  const [draftColor, setDraftColor] = useState(CLASS_TYPE_PALETTE[0]);

  async function handleAddType() {
    const trimmed = newTypeName.trim().toUpperCase();
    setShowNewType(false);
    setNewTypeName('');
    if (!trimmed || types.some(t => t.name === trimmed)) return;
    try {
      await createClassType(trimmed, newTypeColor);
      onTypesChange([...types, { name: trimmed, color: newTypeColor }].sort((a, b) => a.name.localeCompare(b.name)));
      onSelect(trimmed);
      setNewTypeColor(CLASS_TYPE_PALETTE[0]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  function handleDeleteType(name: string) {
    Alert.alert(
      'Eliminar tipo',
      `¿Borrar "${name}"? Las clases existentes no se verán afectadas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive', onPress: async () => {
            try {
              await deleteClassType(name);
              const next = types.filter(t => t.name !== name);
              onTypesChange(next);
              if (selected === name) onSelect(next[0]?.name ?? '');
              if (editingColorFor === name) setEditingColorFor(null);
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
        },
      ]
    );
  }

  async function handleConfirmRecolor() {
    if (!editingColorFor) return;
    const name = editingColorFor;
    const color = draftColor;
    setEditingColorFor(null);
    try {
      await setClassTypeColor(name, color);
      onTypesChange(types.map(t => t.name === name ? { ...t, color } : t));
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  }

  const editingType = types.find(t => t.name === editingColorFor) ?? null;

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
        {types.map((type) => {
          const isSelected = selected === type.name;
          return (
            <SpringPressable
              key={type.name}
              onPress={() => onSelect(type.name)}
              onLongPress={() => handleDeleteType(type.name)}
              style={{
                borderRadius: Radius.sm, borderWidth: 1,
                backgroundColor: isSelected ? 'rgba(59,130,246,0.2)' : Colors.card,
                borderColor: isSelected ? Colors.blue500 : Colors.cardBorder,
              }}
            >
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: scale(9),
                paddingHorizontal: scale(14), paddingVertical: scale(10),
              }}>
                <Pressable
                  hitSlop={{ top: scale(12), bottom: scale(12), left: scale(12), right: scale(4) }}
                  onPress={(e) => { e.stopPropagation(); setShowNewType(false); setDraftColor(type.color); setEditingColorFor(type.name); }}
                  style={{ width: scale(20), height: scale(20), borderRadius: scale(10), backgroundColor: type.color }}
                />
                <Text style={{
                  fontSize: moderateScale(13), fontWeight: '600',
                  color: isSelected ? Colors.blue500 : Colors.textMuted,
                }}>
                  {type.name}
                </Text>
              </View>
            </SpringPressable>
          );
        })}
        <SpringPressable
          onPress={() => { setEditingColorFor(null); setShowNewType(v => !v); }}
          style={{
            paddingHorizontal: scale(14), paddingVertical: scale(10),
            borderRadius: Radius.sm, borderWidth: 1, borderStyle: 'dashed',
            borderColor: Colors.cardBorder,
            backgroundColor: Colors.card,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <PlusIcon size={scale(16)} color={Colors.textMuted} />
        </SpringPressable>
      </View>

      {/* Recolor de un tipo existente — fuera de la fila de chips a propósito:
          anidado dentro de esa fila (flexWrap) competía por ancho/alto con los
          chips vecinos y el toque sobre los swatches no llegaba a registrarse. */}
      {editingType && (
        <View style={{
          marginTop: scale(12), padding: scale(12), gap: scale(10),
          borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.cardBorder,
          backgroundColor: Colors.card,
        }}>
          <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.textSecondary }}>
            Color de "{editingType.name}"
          </Text>
          <ColorPicker value={draftColor} onChange={setDraftColor} />
          <View style={{ flexDirection: 'row', gap: scale(10) }}>
            <SpringPressable
              onPress={handleConfirmRecolor}
              style={{
                paddingHorizontal: scale(16), paddingVertical: scale(8),
                borderRadius: Radius.sm, backgroundColor: Colors.blue500,
              }}
            >
              <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: '#fff' }}>Confirmar</Text>
            </SpringPressable>
            <SpringPressable
              onPress={() => setEditingColorFor(null)}
              style={{
                paddingHorizontal: scale(16), paddingVertical: scale(8),
                borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.cardBorder,
              }}
            >
              <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textMuted }}>Cancelar</Text>
            </SpringPressable>
          </View>
        </View>
      )}

      {showNewType && (
        <View style={{
          marginTop: scale(12), padding: scale(12), gap: scale(12),
          borderRadius: Radius.sm, borderWidth: 1,
          borderColor: Colors.blue500,
          backgroundColor: 'rgba(59,130,246,0.1)',
        }}>
          <TextInput
            autoFocus
            value={newTypeName}
            onChangeText={setNewTypeName}
            placeholder="Nombre del nuevo tipo"
            placeholderTextColor={Colors.placeholder}
            style={{ fontSize: moderateScale(14), fontWeight: '600', color: Colors.blue500, padding: 0 }}
            onSubmitEditing={handleAddType}
          />
          <ColorPicker value={newTypeColor} onChange={setNewTypeColor} />
          <SpringPressable
            onPress={handleAddType}
            style={{
              alignSelf: 'flex-start',
              paddingHorizontal: scale(16), paddingVertical: scale(8),
              borderRadius: Radius.sm, backgroundColor: Colors.blue500,
            }}
          >
            <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: '#fff' }}>Añadir tipo</Text>
          </SpringPressable>
        </View>
      )}

      <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(8) }}>
        Mantén pulsado un tipo para eliminarlo · toca el punto de color para cambiarlo
      </Text>
    </View>
  );
}
