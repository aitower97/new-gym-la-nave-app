import { Pressable, Text, View } from 'react-native';

interface ConsentCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  onPressPrivacy: () => void;
  onPressTerms: () => void;
  disabled?: boolean;
}

/**
 * Checkbox de consentimiento RGPD para el registro.
 * No viene premarcado (art. 7 RGPD: el consentimiento debe ser un acto afirmativo).
 */
export function ConsentCheckbox({
  checked,
  onToggle,
  onPressPrivacy,
  onPressTerms,
  disabled,
}: ConsentCheckboxProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: checked ? '#3B82F6' : 'rgba(255,255,255,0.25)',
          backgroundColor: checked ? '#3B82F6' : 'rgba(255,255,255,0.03)',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
          marginTop: 1,
        }}
      >
        {checked && (
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '700', lineHeight: 16 }}>
            ✓
          </Text>
        )}
      </View>

      <Text style={{ flex: 1, color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18 }}>
        He leído y acepto la{' '}
        <Text
          style={{ color: '#3B82F6', fontWeight: '700' }}
          onPress={disabled ? undefined : onPressPrivacy}
        >
          Política de Privacidad
        </Text>
        {' '}y los{' '}
        <Text
          style={{ color: '#3B82F6', fontWeight: '700' }}
          onPress={disabled ? undefined : onPressTerms}
        >
          Términos y Condiciones
        </Text>
      </Text>
    </Pressable>
  );
}
