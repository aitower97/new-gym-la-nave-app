import { Pressable, Text } from 'react-native';

interface FormFooterLinkProps {
  onPress: () => void;
  prompt: string;
  link: string;
  disabled?: boolean;
}

export function FormFooterLink({ onPress, prompt, link, disabled }: FormFooterLinkProps) {
  return (
    <Pressable
      style={({ pressed }) => ({
        marginTop: 20,
        paddingVertical: 10,
        alignItems: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
      onPress={disabled ? undefined : onPress}
    >
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
        {prompt}{' '}
        <Text style={{ color: '#3B82F6', fontWeight: '700' }}>{link}</Text>
      </Text>
    </Pressable>
  );
}
