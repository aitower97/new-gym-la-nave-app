import React from 'react';
import { View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

interface ScreenWrapperProps {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  backgroundColor?: string;
}

/**
 * ScreenWrapper - Envuelve todas las pantallas con SafeAreaView
 * para evitar que los botones del sistema Android se superpongan al contenido.
 * 
 * Uso:
 * <ScreenWrapper>
 *   <YourContent />
 * </ScreenWrapper>
 */
export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  edges = ['top', 'bottom'],
  style,
  backgroundColor = '#0a0f1a',
}) => {
  return (
    <SafeAreaView
      style={[
        {
          flex: 1,
          backgroundColor,
        },
        style,
      ]}
      edges={edges}
    >
      {children}
    </SafeAreaView>
  );
};
