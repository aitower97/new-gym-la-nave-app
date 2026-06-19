import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackButton } from './BackButton';

interface ScreenWrapperProps {
  children: React.ReactNode;
  onBackPress?: () => void;
}

export function ScreenWrapper({ children, onBackPress }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: '#08111f' }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 24,
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {onBackPress && (
          <View style={{ position: 'absolute', top: insets.top + 16, left: 24 }}>
            <BackButton onPress={onBackPress} />
          </View>
        )}
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
