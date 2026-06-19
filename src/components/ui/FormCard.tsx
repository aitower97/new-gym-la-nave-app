import { Text, View, ViewStyle } from 'react-native';

interface FormCardProps {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
}

export function FormCard({ children, title, style }: FormCardProps) {
  return (
    <View style={[{
      backgroundColor: '#0f1a2e',
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
    }, style]}>
      {title && (
        <Text style={{
          fontSize: 20,
          fontWeight: '700',
          color: 'white',
          textAlign: 'center',
          marginBottom: 24,
          letterSpacing: 0.3,
        }}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}
