import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

interface WelcomeSlideProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  width: number;
}

export function WelcomeSlide({ icon, title, subtitle, width }: WelcomeSlideProps) {
  return (
    <View
      style={{
        width,
        flex: 1,
        paddingHorizontal: 32,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
      <Text
        style={{
          color: 'white',
          fontWeight: 'bold',
          textAlign: 'center',
          marginBottom: 12,
          fontSize: 28,
          lineHeight: 36,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          textAlign: 'center',
          color: 'rgba(255,255,255,0.55)',
          fontSize: 15,
          lineHeight: 24,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}
