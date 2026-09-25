import { ComponentType, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Text, TextInput, TextStyle, View } from 'react-native';
import { BarbellIcon, BellIcon, CalendarIcon, ClockIcon, CreditCardIcon, HourglassIcon, ShieldIcon, UserIcon } from '../Icons';
import { SpringPressable } from '../ui';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { TriggerKind } from '../../utils/notificationRules';

export interface NotificationTemplate {
  id: string;
  /** Solo las reglas que vienen de serie tienen key; las creadas por el admin, null. */
  key: string | null;
  trigger_kind: TriggerKind;
  offset_days: number | null;
  enabled: boolean;
  title: string;
  message: string;
  icon_key: string;
}

type IconComponent = ComponentType<{ size: number; color: string; strokeWidth: number }>;

/** Mismas 8 claves que ICON_BY_KEY en NotificationsScreen (lo que ve el socio). */
export const ICON_OPTIONS: { key: string; Icon: IconComponent }[] = [
  { key: 'bell', Icon: BellIcon },
  { key: 'calendar', Icon: CalendarIcon },
  { key: 'hourglass', Icon: HourglassIcon },
  { key: 'clock', Icon: ClockIcon },
  { key: 'credit-card', Icon: CreditCardIcon },
  { key: 'barbell', Icon: BarbellIcon },
  { key: 'shield', Icon: ShieldIcon },
  { key: 'user', Icon: UserIcon },
];

export function iconFor(key: string | null | undefined): IconComponent {
  return ICON_OPTIONS.find((o) => o.key === key)?.Icon ?? BellIcon;
}

export const inputStyle: TextStyle = {
  fontSize: moderateScale(14), color: Colors.textPrimary,
  backgroundColor: Colors.inputBg, borderWidth: 1, borderColor: Colors.inputBorder,
  borderRadius: Radius.sm, paddingHorizontal: scale(12), paddingVertical: scale(10),
};

/**
 * Botón compacto para filas dentro de tarjetas. El Button de ui/ es grande
 * (mayúsculas, letterSpacing, márgenes fijos y sin encoger): dos o tres
 * seguidos no caben en una card de un móvil de 360pt.
 */
export function SmallButton({ label, onPress, variant = 'primary', loading = false, disabled = false }: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || loading;
  const bg = variant === 'primary' ? (off ? Colors.inputBg : Colors.blue500) : 'transparent';
  const border = variant === 'outline' ? (off ? Colors.inputBorder : Colors.blue500) : 'transparent';
  const color = variant === 'primary' ? (off ? Colors.textMuted : '#fff') : (off ? Colors.textMuted : variant === 'outline' ? Colors.blue400 : Colors.textSecondary);
  return (
    <SpringPressable onPress={onPress} disabled={off} scaleTo={0.96}>
      <View style={{
        minHeight: scale(38), paddingHorizontal: scale(14), borderRadius: Radius.sm,
        borderWidth: 1, borderColor: border, backgroundColor: bg,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {loading
          ? <ActivityIndicator size="small" color={color} />
          : <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color }} numberOfLines={1}>{label}</Text>}
      </View>
    </SpringPressable>
  );
}

/**
 * Altura del teclado en Android. Allí `automaticallyAdjustKeyboardInsets` no
 * existe y con edge-to-edge (SDK 54) la ventana no se redimensiona de forma
 * fiable: sin sumar este hueco al final del ScrollView, los últimos campos
 * quedan tapados sin forma de subirlos. En iOS devuelve 0 (ya lo hace el
 * propio ScrollView con automaticallyAdjustKeyboardInsets).
 */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

/** ¿Está el teclado abierto? En las dos plataformas, para ocultar el pie fijo. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return visible;
}

export function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={{ marginBottom: scale(6) }}>
      <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: Colors.textSecondary }}>{children}</Text>
      {hint ? <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(2) }}>{hint}</Text> : null}
    </View>
  );
}

export function IconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) }}>
      {ICON_OPTIONS.map(({ key, Icon }) => {
        const active = value === key;
        return (
          <SpringPressable key={key} onPress={() => onChange(key)}>
            <View style={{
              width: scale(38), height: scale(38), borderRadius: Radius.sm,
              alignItems: 'center', justifyContent: 'center', borderWidth: 1,
              backgroundColor: active ? 'rgba(59,130,246,0.15)' : Colors.inputBg,
              borderColor: active ? Colors.blue500 : Colors.inputBorder,
            }}>
              <Icon size={scale(17)} color={active ? Colors.blue400 : Colors.textMuted} strokeWidth={2} />
            </View>
          </SpringPressable>
        );
      })}
    </View>
  );
}

const PLACEHOLDERS: { token: string; label: string }[] = [
  { token: '{{nombre}}', label: 'Nombre' },
  { token: '{{apodo}}', label: 'Apodo' },
  { token: '{{plan}}', label: 'Plan' },
];

/**
 * Botones que insertan una variable al final del texto. Mejor que pedirle al
 * admin que escriba "{{nombre}}" a mano sin equivocarse con las llaves.
 */
export function PlaceholderChips({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scale(6), marginTop: scale(8) }}>
      <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted }}>Insertar:</Text>
      {PLACEHOLDERS.map(({ token, label }) => (
        <SpringPressable key={token} onPress={() => onInsert(token)}>
          <View style={{
            paddingHorizontal: scale(10), paddingVertical: scale(4), borderRadius: Radius.full,
            backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 1, borderColor: Colors.borderBlue,
          }}>
            <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.blue400 }}>+ {label}</Text>
          </View>
        </SpringPressable>
      ))}
    </View>
  );
}

/** Añade un token al final del texto, con un espacio si hace falta. */
export function appendToken(text: string, token: string): string {
  if (!text || /\s$/.test(text)) return text + token;
  return `${text} ${token}`;
}

/**
 * Réplica de la tarjeta de NotificationsScreen (estado "no leída"): así ve el
 * socio la notificación. Si se cambia allí, cambiar aquí.
 */
export function NotificationPreview({ title, message, iconKey, caption }: {
  title: string; message: string; iconKey: string; caption?: string;
}) {
  const Icon = iconFor(iconKey);
  return (
    <View>
      {caption ? (
        <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginBottom: scale(6) }}>{caption}</Text>
      ) : null}
      <View style={{
        flexDirection: 'row', padding: scale(16), borderRadius: 12, borderWidth: 1,
        backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(255,255,255,0.1)',
      }}>
        <View style={{
          width: scale(40), height: scale(40), borderRadius: scale(20), marginRight: scale(12),
          backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={scale(18)} color={Colors.blue400} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: moderateScale(15), fontWeight: 'bold', color: '#fff', marginBottom: scale(4) }}>
            {title || 'Título'}
          </Text>
          <Text style={{ fontSize: moderateScale(14), color: 'rgba(255,255,255,0.7)', lineHeight: moderateScale(20), marginBottom: scale(6) }}>
            {message || 'Mensaje'}
          </Text>
          <Text style={{ fontSize: moderateScale(12), color: 'rgba(255,255,255,0.5)' }}>Ahora</Text>
        </View>
      </View>
    </View>
  );
}

/** Título + mensaje + insertar variables + icono: el mismo bloque en envío, reglas y plantillas. */
export function MessageEditor({
  title, message, iconKey, onTitle, onMessage, onIcon, titleVariables = true,
}: {
  title: string; message: string; iconKey: string;
  onTitle: (v: string) => void; onMessage: (v: string) => void; onIcon: (v: string) => void;
  /** Las reglas automáticas se envían desde la base y ahí el título no se personaliza. */
  titleVariables?: boolean;
}) {
  return (
    <View style={{ gap: scale(14) }}>
      <View>
        <FieldLabel>Título</FieldLabel>
        <TextInput
          value={title}
          onChangeText={onTitle}
          placeholder="Ej: Cambio de horario el viernes"
          placeholderTextColor={Colors.placeholder}
          maxLength={80}
          style={[inputStyle, { fontWeight: '600' }]}
        />
        {titleVariables ? <PlaceholderChips onInsert={(t) => onTitle(appendToken(title, t))} /> : null}
      </View>
      <View>
        <FieldLabel>Mensaje</FieldLabel>
        <TextInput
          value={message}
          onChangeText={onMessage}
          placeholder="Escribe lo que verá el socio..."
          placeholderTextColor={Colors.placeholder}
          multiline
          maxLength={300}
          style={[inputStyle, { minHeight: scale(90), textAlignVertical: 'top' }]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: scale(8) }}>
          <View style={{ flex: 1 }}>
            <PlaceholderChips onInsert={(t) => onMessage(appendToken(message, t))} />
          </View>
          <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, marginTop: scale(12) }}>{message.length}/300</Text>
        </View>
      </View>
      <View>
        <FieldLabel>Icono</FieldLabel>
        <IconPicker value={iconKey} onChange={onIcon} />
      </View>
    </View>
  );
}
