import { Image, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

interface BrandHeaderProps {
  title?: string;
  subtitle?: string;
  logoSize?: number;
  imageSize?: number;
  variant?: 'plain' | 'filled';
  style?: StyleProp<ViewStyle>;
  logoContainerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
}

export function BrandHeader({
  title = 'LA NAVE',
  subtitle = 'STRENGTH CENTER',
  logoSize = 90,
  imageSize = 62,
  variant = 'plain',
  style,
  logoContainerStyle,
  titleStyle,
  subtitleStyle,
}: BrandHeaderProps) {
  const isFilled = variant === 'filled';

  return (
    <View style={[{ alignItems: 'center', overflow: 'visible' }, style]}>
      <View style={[
        {
          width: logoSize,
          height: logoSize,
          borderRadius: logoSize * 0.25,
          backgroundColor: isFilled ? '#0d1929' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 18,
          borderWidth: isFilled ? 1 : 0,
          borderColor: isFilled ? 'rgba(59,130,246,0.3)' : 'transparent',
          shadowColor: '#2563EB',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: isFilled ? 0.5 : 0,
          shadowRadius: isFilled ? 20 : 0,
          elevation: isFilled ? 12 : 0,
          overflow: 'visible',
        },
        logoContainerStyle,
      ]}>
        <Image
          source={require('../../../assets/logo-white.jpeg')}
          style={{ width: imageSize, height: imageSize, borderRadius: 14 }}
          resizeMode="contain"
        />
      </View>

      <Text style={[
        {
          fontSize: 28,
          fontWeight: '900',
          color: 'white',
          letterSpacing: 7,
          marginBottom: 3,
          textAlign: 'center',
        },
        titleStyle,
      ]}>
        {title}
      </Text>
      <Text style={[
        {
          fontSize: 11,
          fontWeight: '600',
          color: '#3B82F6',
          letterSpacing: 4,
          textAlign: 'center',
        },
        subtitleStyle,
      ]}>
        {subtitle}
      </Text>
    </View>
  );
}
