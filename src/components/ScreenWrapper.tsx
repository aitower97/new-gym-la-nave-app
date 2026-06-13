import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Edge, SafeAreaView } from 'react-native-safe-area-context';
import { MAX_CONTENT_WIDTH } from '../theme';

interface ScreenWrapperProps {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  backgroundColor?: string;
  /**
   * centerContent: centres children in a max-width column.
   * Use for form / login screens so they don't stretch on iPad.
   */
  centerContent?: boolean;
}

/**
 * ScreenWrapper - Envuelve todas las pantallas con SafeAreaView
 * para evitar que los botones del sistema Android se superpongan al contenido.
 *
 * En tablet, si centerContent=true el contenido se centra con un maxWidth.
 */
export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  edges = ['top', 'bottom'],
  style,
  backgroundColor = '#0a0f1a',
  centerContent = false,
}) => {
  return (
    <SafeAreaView
      style={[{ flex: 1, backgroundColor }, style]}
      edges={edges}
    >
      {centerContent && MAX_CONTENT_WIDTH ? (
        <View
          style={{
            flex: 1,
            alignSelf: 'center',
            width: '100%',
            maxWidth: MAX_CONTENT_WIDTH,
          }}
        >
          {children}
        </View>
      ) : (
        children
      )}
    </SafeAreaView>
  );
};
