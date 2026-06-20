import { Text, View } from 'react-native';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { SpringPressable } from './SpringPressable';

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}

export function ActionButton({ icon, label, onPress }: ActionButtonProps) {
  return (
    <SpringPressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: 'rgba(59,130,246,0.15)',
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: 'rgba(59,130,246,0.3)',
      }}
    >
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: scale(4),
        paddingVertical: scale(8),
        paddingHorizontal: scale(12),
      }}>
        {icon}
        <Text style={{ color: Colors.blue400, fontSize: moderateScale(12), fontWeight: '700' }}>
          {label}
        </Text>
      </View>
    </SpringPressable>
  );
}
