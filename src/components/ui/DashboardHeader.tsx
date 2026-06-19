import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LogoutIcon } from '../Icons';
import { Colors, moderateScale, scale } from '../../theme';

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
  topInset: number;
  logo?: React.ReactNode;
  onLogout?: () => void;
  rightElement?: React.ReactNode;
}

export function DashboardHeader({
  title,
  subtitle,
  topInset,
  logo,
  onLogout,
  rightElement,
}: DashboardHeaderProps) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify()}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: scale(20),
        paddingTop: topInset + scale(12),
        paddingBottom: scale(16),
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
        {logo}
        <View>
          <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3 }}>
            {title}
          </Text>
          {subtitle && (
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, fontWeight: '500' }}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      {rightElement ? rightElement : onLogout ? (
        <Pressable
          onPress={onLogout}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: scale(6),
            paddingHorizontal: scale(12),
            paddingVertical: scale(8),
            borderRadius: scale(10),
            borderWidth: 1,
            borderColor: pressed ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.2)',
            backgroundColor: pressed ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
          })}
        >
          <LogoutIcon size={scale(16)} color="#EF4444" strokeWidth={2} />
          <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: '#EF4444' }}>
            Salir
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
