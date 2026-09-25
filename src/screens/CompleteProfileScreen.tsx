import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Text, View } from 'react-native';
import { AuthTitle, Button, ConsentCheckbox, FormCard, Input, ScreenWrapper } from '../components/ui';
import { LEGAL } from '../config/legal';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types/navigation';
import { isApplePrivateRelay, suggestedFullName } from '../utils/profileCompletion';
import { signOutFromGoogle } from '../utils/socialAuth';
import { completeProfileSchema } from '../utils/validation';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CompleteProfile'>;
  route: RouteProp<RootStackParamList, 'CompleteProfile'>;
};

/** "2000-05-31" → "31/05/2000" */
const isoToDisplay = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};

/**
 * Alta obligatoria antes de usar la app, para quien no tiene consentimiento
 * registrado: el que entra por primera vez con Google/Apple y los socios
 * antiguos dados de alta sin formulario. Pide los mismos datos que el
 * registro (menos email y contraseña) y deja constancia del consentimiento.
 * No se puede saltar: "Salir" cierra la sesión.
 */
export default function CompleteProfileScreen({ navigation, route }: Props) {
  const appleName = route.params?.appleName;
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Precarga lo que ya haya: del proveedor (nombre) y del perfil (socios antiguos)
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
          return;
        }
        setEmail(user.email || '');
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username, phone, birth_date')
          .eq('id', user.id)
          .maybeSingle();
        setFullName(profile?.full_name || suggestedFullName(user, appleName));
        setUsername(profile?.username || '');
        setPhone(profile?.phone || '');
        setBirthDate(isoToDisplay(profile?.birth_date));
      } finally {
        setLoadingData(false);
      }
    })();
  }, []);

  const doExit = async () => {
    await signOutFromGoogle();
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  // Un toque sin querer en "atrás" no debe tirar lo escrito y la sesión
  const exit = () => {
    Alert.alert('¿Salir?', 'Se cerrará la sesión y no se guardarán los datos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: doExit },
    ]);
  };

  // Atrás en Android = salir (cerrando sesión), nunca volver a una pantalla
  // de la app sin haber completado el alta.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!saving) exit();
      return true;
    });
    return () => sub.remove();
  }, [saving]);

  const formatBirthDate = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length > 2) formatted = cleaned.slice(0, 2) + '/' + cleaned.slice(2);
    if (cleaned.length > 4) formatted = formatted.slice(0, 5) + '/' + cleaned.slice(4, 8);
    setBirthDate(formatted.slice(0, 10));
  };

  const handleSave = async () => {
    const result = completeProfileSchema.safeParse({
      full_name: fullName,
      username: username.trim() || undefined,
      phone,
      birth_date: birthDate,
      accept_terms: acceptedTerms,
    });
    if (!result.success) {
      Alert.alert('Revisa los datos', result.error.issues[0].message);
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('La sesión ha caducado. Vuelve a entrar.');

      const [d, m, y] = result.data.birth_date.split('/');

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: result.data.full_name,
          username: result.data.username || null,
          phone: result.data.phone.replace(/\s/g, ''),
          birth_date: `${y}-${m}-${d}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (profileError) {
        if (profileError.code === '23505') throw new Error('Ese apodo ya lo usa otra persona. Prueba con otro.');
        throw profileError;
      }

      // El consentimiento va lo último: es lo que marca el alta como completa
      const { data: updated, error: metaError } = await supabase.auth.updateUser({
        data: {
          full_name: result.data.full_name,
          accepted_terms_at: new Date().toISOString(),
          accepted_terms_version: LEGAL.termsVersion,
        },
      });
      if (metaError) throw metaError;

      navigation.reset({
        index: 0,
        routes: [{
          name: 'MainMenu',
          params: { email: updated.user?.email || user.email || '', name: result.data.full_name },
        }],
      });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo guardar. Inténtalo de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <View style={{ flex: 1, backgroundColor: '#08111f', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  }

  const privateRelay = isApplePrivateRelay(email);

  return (
    <ScreenWrapper onBackPress={saving ? undefined : exit}>
      <View style={{ alignItems: 'center', marginTop: 48 }}>
        <AuthTitle
          title="Completa tu alta"
          subtitle="Solo una vez: necesitamos estos datos para gestionar tu cuenta en La Nave."
        />
      </View>

      {privateRelay && (
        <View
          style={{
            backgroundColor: 'rgba(245,158,11,0.12)',
            borderColor: 'rgba(245,158,11,0.35)',
            borderWidth: 1,
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#F59E0B', fontSize: 14, fontWeight: '700', marginBottom: 4 }}>
            Has ocultado tu correo con Apple
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19 }}>
            Si ya eras socio de La Nave, sal y entra con tu email de siempre para no perder tu plan
            ni tus reservas. Esta cuenta sería nueva.
          </Text>
        </View>
      )}

      <FormCard style={{ marginBottom: 20 }}>
        {!!email && (
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}
          >
            Cuenta: <Text style={{ color: 'rgba(255,255,255,0.85)' }}>{email}</Text>
          </Text>
        )}

        <Input
          label="Nombre completo"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Juan García"
          autoCapitalize="words"
          autoComplete="name"
          editable={!saving}
        />

        <Input
          label="Apodo (opcional)"
          hint="Es el nombre con el que te verá el resto de gente en la app. Tu nombre completo y teléfono solo los ve el gimnasio."
          value={username}
          onChangeText={setUsername}
          placeholder="juangarcia"
          autoCapitalize="none"
          autoComplete="username"
          editable={!saving}
        />

        <Input
          label="Teléfono"
          value={phone}
          onChangeText={setPhone}
          placeholder="600 000 000"
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!saving}
        />

        <Input
          label="Fecha de nacimiento"
          hint={`DD/MM/AAAA — debes tener al menos ${LEGAL.minAge} años`}
          value={birthDate}
          onChangeText={formatBirthDate}
          placeholder="DD/MM/AAAA"
          keyboardType="numeric"
          maxLength={10}
          editable={!saving}
        />

        <ConsentCheckbox
          checked={acceptedTerms}
          onToggle={() => setAcceptedTerms(v => !v)}
          onPressPrivacy={() => Linking.openURL(LEGAL.privacyPolicyUrl)}
          onPressTerms={() => Linking.openURL(LEGAL.termsUrl)}
          disabled={saving}
        />

        {/* Primera capa de información (art. 13 RGPD / art. 11 LOPDGDD) */}
        <Text
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: 10,
            lineHeight: 15,
            marginBottom: 16,
          }}
        >
          Responsable: La Nave Strength Center · Finalidad: gestión de tu cuenta y
          reservas de clases · Derechos: acceso, rectificación, supresión y otros
          según se detalla en la Política de Privacidad.
        </Text>

        <Button
          label={saving ? 'Guardando...' : 'Entrar'}
          onPress={handleSave}
          loading={saving}
          disabled={saving || !acceptedTerms}
          size="lg"
          fullWidth
        />

        <Button
          label="Salir"
          onPress={exit}
          variant="outline"
          disabled={saving}
          fullWidth
        />
      </FormCard>
    </ScreenWrapper>
  );
}
