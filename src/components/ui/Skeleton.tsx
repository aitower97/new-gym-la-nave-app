/**
 * Skeleton.tsx - Placeholders sombreados mientras carga una pantalla
 *
 * En vez de una rueda girando y que luego las tarjetas aparezcan de golpe, se
 * dibuja la forma de lo que va a salir (tarjetas, filas, cifras) con un pulso
 * suave, y el contenido real entra con un fundido (<FadeInView>).
 *
 * Uso:
 * <SkeletonGroup>
 *   <SkeletonCard lines={2} />
 *   <SkeletonRow />
 * </SkeletonGroup>
 *
 * Todos los Bone de un SkeletonGroup comparten el mismo pulso (van a la vez).
 */

import { createContext, ReactNode, useContext, useEffect } from 'react';
import { DimensionValue, StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors, moderateScale, Radius, scale } from '../../theme';

const BONE_COLOR = 'rgba(255,255,255,0.07)';
const CARD_BG = Colors.card;

const PulseContext = createContext<SharedValue<number> | null>(null);

function usePulse(): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);
  return pulse;
}

/** Contenedor que da el mismo pulso a todos los Bone de dentro. */
export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse();
  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <PulseContext.Provider value={pulse}>
      <Animated.View
        style={[style, animStyle]}
        accessibilityRole="progressbar"
        accessibilityLabel="Cargando"
      >
        {children}
      </Animated.View>
    </PulseContext.Provider>
  );
}

interface BoneProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Bloque sombreado. Dentro de un SkeletonGroup el pulso lo pone el grupo. */
export function Bone({ width = '100%', height = scale(14), radius = scale(6), style }: BoneProps) {
  const inGroup = useContext(PulseContext) !== null;
  if (inGroup) {
    return <View style={[{ width, height, borderRadius: radius, backgroundColor: BONE_COLOR }, style]} />;
  }
  return <SoloBone width={width} height={height} radius={radius} style={style} />;
}

function SoloBone({ width, height, radius, style }: BoneProps) {
  const pulse = usePulse();
  const animStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: BONE_COLOR }, style, animStyle]}
    />
  );
}

/** Caja con el fondo y borde de las tarjetas de la app. */
export function SkeletonBox({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: CARD_BG,
          borderWidth: 1,
          borderColor: Colors.cardBorder,
          borderRadius: Radius.lg,
          padding: scale(16),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Fila: círculo (avatar/icono) + dos líneas de texto. Listas de socios, avisos... */
export function SkeletonRow({ avatar = scale(44), trailing = false, style }: {
  avatar?: number;
  trailing?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonBox style={[{ flexDirection: 'row', alignItems: 'center', gap: scale(12), paddingVertical: scale(14) }, style]}>
      {avatar > 0 && <Bone width={avatar} height={avatar} radius={avatar / 2} />}
      <View style={{ flex: 1, gap: scale(8) }}>
        <Bone width="55%" height={scale(14)} />
        <Bone width="35%" height={scale(11)} />
      </View>
      {trailing && <Bone width={scale(56)} height={scale(26)} radius={scale(13)} />}
    </SkeletonBox>
  );
}

/** Tarjeta genérica: título + n líneas. */
export function SkeletonCard({ lines = 2, height, style }: {
  lines?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonBox style={[{ gap: scale(10) }, height ? { height } : null, style]}>
      <Bone width="45%" height={scale(16)} />
      {Array.from({ length: lines }).map((_, i) => (
        <Bone key={i} width={i === lines - 1 ? '60%' : '90%'} height={scale(12)} />
      ))}
    </SkeletonBox>
  );
}

/**
 * Tarjeta de clase con las medidas de ClassCard: nombre y plazas, fila de
 * avatares, barra de ocupación y botón a la derecha.
 */
export function SkeletonClassCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          flex: 1,
          flexDirection: 'row',
          borderRadius: 14,
          padding: 18,
          backgroundColor: 'rgba(255,255,255,0.03)',
          borderLeftWidth: 3,
          borderLeftColor: BONE_COLOR,
        },
        style,
      ]}
    >
      <View style={{ flex: 1, paddingRight: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Bone width="45%" height={19} />
          <Bone width={58} height={11} />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
          {[0, 1, 2].map(i => <Bone key={i} width={28} height={28} radius={14} />)}
        </View>
        <Bone width="100%" height={3} radius={2} style={{ marginTop: 10, marginBottom: 10 }} />
      </View>
      <Bone width={40} height={40} radius={10} />
    </View>
  );
}

/** Horario del día (Reservar): columna de horas + tarjetas de clase. */
export function SkeletonClassTimeline({ count = 4 }: { count?: number }) {
  return (
    <SkeletonGroup>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 16 }}>
          <View style={{ width: 52, alignItems: 'center', paddingTop: 2 }}>
            <Bone width={36} height={13} />
            {i < count - 1 && (
              <View style={{ width: 2, flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginTop: 8, borderRadius: 1 }} />
            )}
          </View>
          <SkeletonClassCard />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Rejilla de cifras (dashboard): n cajas en filas de `columns`. */
export function SkeletonStats({ count = 4, columns = 2, style }: {
  count?: number;
  columns?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = Math.ceil(count / columns);
  return (
    <View style={[{ gap: scale(10) }, style]}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: scale(10) }}>
          {Array.from({ length: Math.min(columns, count - r * columns) }).map((__, c) => (
            // Mismas medidas que StatCard
            <View
              key={c}
              style={{
                flex: 1,
                paddingVertical: scale(16),
                paddingHorizontal: scale(10),
                backgroundColor: Colors.surface,
                borderRadius: Radius.lg,
                borderWidth: 1,
                borderColor: Colors.cardBorder,
                alignItems: 'center',
                gap: scale(6),
              }}
            >
              <Bone width={scale(32)} height={scale(32)} radius={Radius.sm} style={{ marginBottom: scale(2) }} />
              <Bone width={scale(36)} height={moderateScale(28)} />
              <Bone width="70%" height={moderateScale(10)} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Calendario mensual con la rejilla de CalendarGrid (admin): cabecera de días
 * y `rows` semanas de celdas con aspectRatio 0.85.
 */
export function SkeletonCalendar({ monthDays, style }: {
  /** Días del mes con null en los huecos, como los recibe CalendarGrid */
  monthDays: (number | null)[];
  style?: StyleProp<ViewStyle>;
}) {
  const rows = Math.ceil(monthDays.length / 7);
  return (
    <SkeletonGroup style={style}>
      <View style={{ flexDirection: 'row' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
            <Bone width={18} height={12} />
          </View>
        ))}
      </View>
      {Array.from({ length: rows }).map((_, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {Array.from({ length: 7 }).map((__, d) => (
            <View key={d} style={{ flex: 1, padding: 1 }}>
              {/* Huecos antes del día 1 y tras el último: vacíos, como en CalendarGrid */}
              <View style={{
                width: '100%', aspectRatio: 0.85, borderRadius: 8,
                backgroundColor: monthDays[w * 7 + d] == null ? 'transparent' : BONE_COLOR,
              }} />
            </View>
          ))}
        </View>
      ))}
    </SkeletonGroup>
  );
}

/**
 * Pantalla de formulario completa (ficha de socio, plan, clase...): cabecera
 * con botón de volver y título, avatar opcional y `fields` campos de
 * etiqueta + caja de texto. Ocupa toda la pantalla, con el fondo de la app.
 */
export function SkeletonFormScreen({ topInset, avatar = false, fields = 4, rows = 0, maxWidth }: {
  topInset: number;
  avatar?: boolean;
  fields?: number;
  /** Filas de lista (avatar + dos líneas) debajo de los campos */
  rows?: number;
  maxWidth?: number;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <SkeletonGroup style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: scale(12),
          paddingTop: topInset + scale(12), paddingBottom: scale(16), paddingHorizontal: scale(20),
          borderBottomWidth: 1, borderBottomColor: Colors.border,
        }}>
          <Bone width={scale(40)} height={scale(40)} radius={scale(20)} />
          <Bone width="45%" height={moderateScale(18)} />
        </View>
        {avatar && (
          <View style={{ alignItems: 'center', paddingTop: scale(36), paddingBottom: scale(16) }}>
            <Bone width={80} height={80} radius={40} />
          </View>
        )}
        {fields > 0 && <FieldBones fields={fields} />}
        {rows > 0 && (
          <View style={{ paddingHorizontal: scale(20), paddingTop: fields > 0 ? 0 : scale(20), gap: scale(8) }}>
            {Array.from({ length: rows }).map((_, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'center', gap: scale(12), padding: scale(14),
                backgroundColor: CARD_BG, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.cardBorder,
              }}>
                <Bone width={scale(36)} height={scale(36)} radius={scale(18)} />
                <View style={{ flex: 1, gap: scale(6) }}>
                  <Bone width="50%" height={moderateScale(14)} />
                  <Bone width="70%" height={moderateScale(12)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </SkeletonGroup>
    </View>
  );
}

function FieldBones({ fields }: { fields: number }) {
  return (
    <View style={{ padding: scale(20), gap: scale(20) }}>
      {Array.from({ length: fields }).map((_, i) => (
        <View key={i} style={{ gap: scale(6) }}>
          <Bone width={scale(110)} height={moderateScale(13)} />
          <Bone height={scale(50)} radius={Radius.md} />
        </View>
      ))}
    </View>
  );
}

/** Solo los campos de un formulario, para pantallas que ya pintan su cabecera. */
export function SkeletonFields({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonGroup>
      <FieldBones fields={fields} />
    </SkeletonGroup>
  );
}

/** Altura de una línea de texto de ese tamaño de letra (no el tamaño en sí). */
const line = (fontSize: number) => Math.round(fontSize * 1.25);

/**
 * Sesión de entreno con la forma de ExerciseCard: nombre con icono, chips de
 * objetivo, fila(s) de Peso/Series/Reps/RPE, "Añadir otra serie", notas y
 * "Ver progreso". Mismo padding que las listas de entreno.
 */
export function SkeletonWorkout({ count = 3, sets = 1, style }: {
  count?: number;
  sets?: number;
  /** Para igualar el padding de la lista real si no es el de por defecto */
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonGroup style={[{ padding: scale(20) }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{
          marginBottom: scale(12), padding: scale(16), borderRadius: Radius.lg,
          backgroundColor: CARD_BG, borderWidth: 1, borderColor: Colors.cardBorder,
          borderLeftWidth: 3, borderLeftColor: BONE_COLOR,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: scale(4) }}>
            <Bone width={scale(18)} height={scale(18)} radius={scale(9)} />
            <Bone width="55%" height={line(moderateScale(18))} />
          </View>
          <View style={{ flexDirection: 'row', gap: scale(8), marginLeft: scale(26), marginBottom: scale(12) }}>
            <Bone width={scale(64)} height={line(moderateScale(11)) + scale(8)} radius={Radius.sm} />
            <Bone width={scale(56)} height={line(moderateScale(11)) + scale(8)} radius={Radius.sm} />
          </View>
          {Array.from({ length: sets }).map((__, j) => (
            <View key={j} style={{ marginBottom: scale(8) }}>
              {j === 0 && (
                <View style={{ flexDirection: 'row', gap: scale(8), marginBottom: scale(4) }}>
                  <Bone height={line(moderateScale(11))} width="30%" style={{ flex: 1.3 }} />
                  {[0, 1, 2].map(k => <Bone key={k} width={scale(52)} height={line(moderateScale(11))} />)}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: scale(8) }}>
                <Bone height={scale(44)} radius={Radius.sm} style={{ flex: 1.3 }} />
                {[0, 1, 2].map(k => <Bone key={k} width={scale(52)} height={scale(44)} radius={Radius.sm} />)}
              </View>
            </View>
          ))}
          <View style={{ alignItems: 'center', paddingVertical: scale(8), marginBottom: scale(12) }}>
            <Bone width={scale(120)} height={line(moderateScale(12))} />
          </View>
          <Bone height={scale(40)} radius={Radius.sm} />
          <Bone height={line(moderateScale(13)) + scale(20)} radius={Radius.sm} style={{ marginTop: scale(12) }} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Lista de n elementos con el mismo placeholder. */
export function SkeletonList({ count = 5, gap = scale(10), render, style }: {
  count?: number;
  gap?: number;
  render: (i: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SkeletonGroup style={[{ gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i}>{render(i)}</View>
      ))}
    </SkeletonGroup>
  );
}

/**
 * Envuelve el contenido real para que entre con un fundido al sustituir al
 * skeleton, en vez de aparecer de golpe.
 */
export function FadeInView({ children, style, duration = 260 }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}) {
  return (
    <Animated.View entering={FadeIn.duration(duration)} style={style}>
      {children}
    </Animated.View>
  );
}
