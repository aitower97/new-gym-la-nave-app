import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarbellIcon, CalendarCheckIcon, CalendarIcon, ChevronRightIcon, UserIcon } from '../components/Icons';
import { FieldLabel, SmallButton, inputStyle, useAndroidKeyboardHeight, useKeyboardVisible } from '../components/notifications/shared';
import { Button, Card, ScreenHeader } from '../components/ui';
import { useRequireAdmin } from '../hooks/useRequireAdmin';
import { Colors, MAX_CONTENT_WIDTH, Radius, moderateScale, scale } from '../theme';
import { RootStackParamList } from '../types/navigation';
import { refreshAppContent, saveAppContent, uploadContentImage } from '../utils/appContent';
import {
  AppContent,
  CONTENT_LIMITS,
  DEFAULT_APP_CONTENT,
  MENU_CARD_KEYS,
  MENU_CARD_LABELS,
  MenuCardKey,
} from '../utils/appContentModel';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AdminContent'>;
};

// Mismas imágenes e iconos que MainMenuScreen: la vista previa es la tarjeta real
const CARD_IMAGES: Record<MenuCardKey, number> = {
  reservar: require('../../assets/gym/card-reservar.png'),
  misclases: require('../../assets/gym/card-misclases.png'),
  progreso: require('../../assets/gym/card-progreso.png'),
  perfil: require('../../assets/gym/card-perfil.png'),
};

function cardIcon(key: MenuCardKey) {
  if (key === 'reservar') return <CalendarIcon size={scale(26)} color="#fff" />;
  if (key === 'misclases') return <CalendarCheckIcon size={scale(22)} color={Colors.blue400} />;
  if (key === 'progreso') return <BarbellIcon size={scale(22)} color={Colors.blue400} />;
  return <UserIcon size={scale(22)} color={Colors.blue400} />;
}

const clone = (c: AppContent): AppContent => JSON.parse(JSON.stringify(c));

/**
 * Contenido de la app editable sin publicar versión: textos de la portada
 * (antes de iniciar sesión) y título, subtítulo e imagen de las tarjetas del
 * menú del socio. Se guarda en app_content; los socios lo ven la próxima vez
 * que abren la app.
 */
export default function AdminContentScreen({ navigation }: Props) {
  const isVerifiedAdmin = useRequireAdmin(navigation);
  const insets = useSafeAreaInsets();
  const androidKeyboard = useAndroidKeyboardHeight();
  // Con el teclado abierto el pie fijo sobra y quita sitio al campo que se escribe
  const keyboardVisible = useKeyboardVisible();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<AppContent>(clone(DEFAULT_APP_CONTENT));
  const savedRef = useRef<string>('');
  const [uploading, setUploading] = useState<MenuCardKey | null>(null);

  useEffect(() => {
    // Siempre de la red al entrar: el admin tiene que editar lo que hay de verdad
    refreshAppContent().then(content => {
      setDraft(clone(content));
      savedRef.current = JSON.stringify(content);
      setLoading(false);
    });
  }, []);

  const dirty = !loading && JSON.stringify(draft) !== savedRef.current;

  const setSlide = (i: number, field: 'title' | 'subtitle', value: string) =>
    setDraft(d => {
      const next = clone(d);
      next.welcomeSlides[i][field] = value;
      return next;
    });

  const setCard = (key: MenuCardKey, patch: Partial<AppContent['menuCards'][MenuCardKey]>) =>
    setDraft(d => {
      const next = clone(d);
      next.menuCards[key] = { ...next.menuCards[key], ...patch };
      return next;
    });

  async function pickImage(key: MenuCardKey) {
    try {
      // Sin permiso previo a propósito (igual que el avatar): el selector del
      // sistema no lo necesita y Google Play rechaza pedirlo para esto.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // En iOS el recorte del sistema es siempre cuadrado (ignora aspect) y
        // la tarjeta es muy apaisada: mejor subir la foto entera y que la
        // tarjeta la recorte, como hace con las originales
        allowsEditing: Platform.OS === 'android',
        aspect: [16, 9],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;
      setUploading(key);
      const url = await uploadContentImage(result.assets[0].uri, key);
      setCard(key, { imageUrl: url });
    } catch (error: any) {
      Alert.alert('No se pudo subir la imagen', error?.message || 'Inténtalo de nuevo.');
    } finally {
      setUploading(null);
    }
  }

  async function handleSave() {
    // Vacío = volver al texto original (mergeAppContent lo rellena), así que
    // solo hay que avisar de lo que no cabe.
    for (const [i, s] of draft.welcomeSlides.entries()) {
      if (s.title.trim().length > CONTENT_LIMITS.slideTitle || s.subtitle.trim().length > CONTENT_LIMITS.slideSubtitle) {
        Alert.alert('Texto demasiado largo', `Revisa la pantalla ${i + 1} de la portada.`);
        return;
      }
    }
    setSaving(true);
    try {
      await saveAppContent(draft);
      const saved = await refreshAppContent();
      setDraft(clone(saved));
      savedRef.current = JSON.stringify(saved);
      Alert.alert('Guardado', 'Los socios lo verán la próxima vez que abran la app.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  function restoreAll() {
    Alert.alert('¿Volver a lo original?', 'Se recuperan los textos e imágenes que traía la app. No se guarda hasta que pulses Guardar.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Recuperar', onPress: () => setDraft(clone(DEFAULT_APP_CONTENT)) },
    ]);
  }

  if (!isVerifiedAdmin) return <View style={{ flex: 1, backgroundColor: Colors.background }} />;

  const counter = (value: string, max: number) => (
    <Text style={{ fontSize: moderateScale(10), color: value.trim().length > max ? Colors.danger : Colors.textMuted, alignSelf: 'flex-end', marginTop: scale(4) }}>
      {value.trim().length}/{max}
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <ScreenHeader
          title="Contenido de la app"
          subtitle="Portada y tarjetas del menú"
          onBack={() => navigation.goBack()}
          topInset={insets.top}
        />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={Colors.blue500} />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: scale(20), paddingBottom: scale(40) + androidKeyboard }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          >
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(20) }}>
              Lo que cambies aquí llega a los socios sin actualizar la app: lo verán la próxima vez que la abran.
              Si dejas un texto vacío, se usa el original.
            </Text>

            {/* ── Portada ── */}
            <Animated.View entering={FadeInDown.duration(350).springify()}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(4) }}>
                Portada
              </Text>
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(12) }}>
                Las 3 pantallas que pasan solas antes de "Iniciar sesión". Pulsa Intro en el título para partirlo en dos líneas.
              </Text>
              {draft.welcomeSlides.map((slide, i) => (
                <View
                  key={i}
                  style={{
                    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                    borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12),
                  }}
                >
                  <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400, marginBottom: scale(10) }}>
                    PANTALLA {i + 1}
                  </Text>
                  <FieldLabel>Título</FieldLabel>
                  <TextInput
                    value={slide.title}
                    onChangeText={v => setSlide(i, 'title', v)}
                    placeholder={DEFAULT_APP_CONTENT.welcomeSlides[i].title.replace('\n', ' ')}
                    placeholderTextColor={Colors.placeholder}
                    multiline
                    style={[inputStyle, { minHeight: scale(56), textAlignVertical: 'top' }]}
                  />
                  {counter(slide.title, CONTENT_LIMITS.slideTitle)}
                  <View style={{ height: scale(8) }} />
                  <FieldLabel>Texto</FieldLabel>
                  <TextInput
                    value={slide.subtitle}
                    onChangeText={v => setSlide(i, 'subtitle', v)}
                    placeholder={DEFAULT_APP_CONTENT.welcomeSlides[i].subtitle}
                    placeholderTextColor={Colors.placeholder}
                    multiline
                    blurOnSubmit
                    returnKeyType="done"
                    style={[inputStyle, { minHeight: scale(64), textAlignVertical: 'top' }]}
                  />
                  {counter(slide.subtitle, CONTENT_LIMITS.slideSubtitle)}
                </View>
              ))}
            </Animated.View>

            {/* ── Tarjetas del menú ── */}
            <Animated.View entering={FadeInDown.duration(350).delay(100).springify()} style={{ marginTop: scale(16) }}>
              <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: Colors.textPrimary, marginBottom: scale(4) }}>
                Tarjetas del menú
              </Text>
              <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted, marginBottom: scale(12) }}>
                La vista previa es la tarjeta tal cual la verá el socio.
              </Text>
              {MENU_CARD_KEYS.map(key => {
                const card = draft.menuCards[key];
                const isUploading = uploading === key;
                return (
                  <View
                    key={key}
                    style={{
                      backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder,
                      borderRadius: Radius.md, padding: scale(14), marginBottom: scale(12),
                    }}
                  >
                    <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.blue400, marginBottom: scale(10) }}>
                      {MENU_CARD_LABELS[key].toUpperCase()}
                    </Text>

                    {/* Vista previa: la tarjeta real del menú, sin acción */}
                    <View pointerEvents="none" style={{ opacity: isUploading ? 0.5 : 1 }}>
                      <Card
                        variant={key === 'reservar' ? 'primary' : 'secondary'}
                        onPress={() => {}}
                        icon={cardIcon(key)}
                        title={card.title.trim() || DEFAULT_APP_CONTENT.menuCards[key].title}
                        subtitle={card.subtitle.trim() || DEFAULT_APP_CONTENT.menuCards[key].subtitle}
                        rightElement={<ChevronRightIcon size={scale(20)} color={key === 'reservar' ? 'rgba(255,255,255,0.5)' : Colors.textMuted} />}
                        image={card.imageUrl ? { uri: card.imageUrl } : CARD_IMAGES[key]}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginTop: scale(10), marginBottom: scale(12) }}>
                      <SmallButton
                        label={isUploading ? 'Subiendo…' : 'Cambiar imagen'}
                        onPress={() => pickImage(key)}
                        variant="outline"
                        disabled={!!uploading || saving}
                      />
                      {card.imageUrl && (
                        <SmallButton
                          label="Imagen original"
                          onPress={() => setCard(key, { imageUrl: null })}
                          variant="ghost"
                          disabled={!!uploading || saving}
                        />
                      )}
                    </View>

                    <FieldLabel>Título</FieldLabel>
                    <TextInput
                      value={card.title}
                      onChangeText={v => setCard(key, { title: v })}
                      placeholder={DEFAULT_APP_CONTENT.menuCards[key].title}
                      placeholderTextColor={Colors.placeholder}
                      maxLength={CONTENT_LIMITS.cardTitle}
                      style={inputStyle}
                    />
                    <View style={{ height: scale(8) }} />
                    <FieldLabel>Subtítulo</FieldLabel>
                    <TextInput
                      value={card.subtitle}
                      onChangeText={v => setCard(key, { subtitle: v })}
                      placeholder={DEFAULT_APP_CONTENT.menuCards[key].subtitle}
                      placeholderTextColor={Colors.placeholder}
                      maxLength={CONTENT_LIMITS.cardSubtitle}
                      style={inputStyle}
                    />
                  </View>
                );
              })}
            </Animated.View>

            <View style={{ alignItems: 'flex-start', marginTop: scale(4) }}>
              <SmallButton label="Volver todo a lo original" onPress={restoreAll} variant="ghost" disabled={saving} />
            </View>
          </ScrollView>
        )}

        {!keyboardVisible && (
          <View style={{
            paddingHorizontal: scale(20), paddingTop: scale(2),
            paddingBottom: insets.bottom + scale(2),
            borderTopWidth: 1, borderTopColor: Colors.border,
          }}>
            <Button
              label={dirty ? 'Guardar cambios' : 'Sin cambios'}
              onPress={handleSave}
              loading={saving}
              disabled={saving || loading || !dirty || !!uploading}
              size="lg"
              fullWidth
            />
          </View>
        )}
      </View>
    </View>
  );
}
