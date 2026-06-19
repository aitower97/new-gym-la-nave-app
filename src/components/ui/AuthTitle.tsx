import { View, Text } from 'react-native';

interface AuthTitleProps {
  title: string;
  subtitle: string;
}

export function AuthTitle({ title, subtitle }: AuthTitleProps) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 28 }}>
      <Text style={{
        fontSize: 26,
        fontWeight: '900',
        color: 'white',
        letterSpacing: 0.5,
        marginBottom: 6,
      }}>
        {title}
      </Text>
      <Text style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        textAlign: 'center',
        maxWidth: 300,
      }}>
        {subtitle}
      </Text>
    </View>
  );
}
