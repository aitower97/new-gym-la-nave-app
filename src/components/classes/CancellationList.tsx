import { Text, View } from 'react-native';
import { scale as s } from '../../theme';
import { CANCELLED_BY_LABEL, LATE_CANCEL_HOURS } from '../../utils/cancellations';
import { ClassCancellation } from '../../utils/cancellationsData';
import { SwapIcon, UserMinusIcon } from '../Icons';
import { Avatar } from '../ui/Avatar';

// Ámbar: una baja no es un error (rojo) ni una espera (violeta)
const TONE = '#F59E0B';
const LATE = '#EF4444';
// Azul: un cambio de clase no es una baja, el socio sigue viniendo ese día
const MOVED = '#3B82F6';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Resumen de una línea para la card cerrada: "2 bajas · 1 a última hora".
 * Nada si no hay bajas, para no añadir ruido a cada clase.
 */
export function CancellationSummary({ items }: { items?: ClassCancellation[] }) {
  if (!items?.length) return null;
  const bajas = items.filter(c => !c.movedTo);
  const cambios = items.length - bajas.length;
  const late = bajas.filter(c => c.late).length;
  const bajasColor = late ? LATE : TONE;
  // Una línea por tipo, cada una con su color: en la card cerrada solo caben
  // ~24 caracteres y en una sola línea se cortaba justo lo de los cambios
  return (
    <View style={{ gap: 2, marginBottom: 2 }}>
      {bajas.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <UserMinusIcon size={s(13)} color={bajasColor} strokeWidth={2} />
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: bajasColor, flexShrink: 1 }}>
            {bajas.length} {bajas.length === 1 ? 'baja' : 'bajas'}{late ? ` · ${late} última hora` : ''}
          </Text>
        </View>
      )}
      {cambios > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SwapIcon size={s(13)} color={MOVED} strokeWidth={2} />
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: MOVED, flexShrink: 1 }}>
            {cambios} {cambios === 1 ? 'cambio' : 'cambios'} de clase
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Lista de bajas de una clase (solo admin): quién, cuándo, con cuánta
 * antelación, quién lo hizo y quién ocupó la plaza. Más reciente primero.
 */
export function CancellationList({ items, divider = true, showHeader = true }: {
  items?: ClassCancellation[];
  /** Línea superior: para ir dentro de ClassCard, separada de lo anterior */
  divider?: boolean;
  /** Sin cabecera cuando la pantalla ya pone su propio título */
  showHeader?: boolean;
}) {
  if (!items?.length) return null;
  const bajas = items.filter(c => !c.movedTo);
  const cambios = items.filter(c => !!c.movedTo);

  const row = (c: ClassCancellation, i: number) => (
    <View key={c.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
      <View style={{ opacity: c.rebooked || c.movedTo ? 1 : 0.6, marginTop: 1 }}>
        <Avatar uri={c.avatar} size={30} index={i} name={c.name} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }} numberOfLines={1}>
          {c.name}
        </Text>
        {c.movedTo ? (
          <Text style={{ fontSize: 11, color: MOVED, marginTop: 2 }} numberOfLines={2}>
            Se cambió {c.movedTo}
          </Text>
        ) : (
          // Dos líneas cortas en vez de una larga: a ~170pt se partía por cualquier sitio
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }} numberOfLines={1}>
            {CANCELLED_BY_LABEL[c.by]} · {c.notice}
          </Text>
        )}
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }} numberOfLines={1}>
          {formatWhen(c.cancelledAt)}
        </Text>
        {c.replacedByName && (
          <Text style={{ fontSize: 11, color: '#8B5CF6', marginTop: 2 }} numberOfLines={2}>
            Ocupó su plaza: {c.replacedByName}
          </Text>
        )}
        {(c.late || c.rebooked) && (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
            {c.late && (
              <View style={{ backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: LATE }}>ÚLTIMA HORA</Text>
              </View>
            )}
            {c.rebooked && (
              <View style={{ backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>VOLVIÓ A APUNTARSE</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const groupHeader = (icon: 'baja' | 'cambio', label: string, color: string, first: boolean) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: first ? 0 : 6 }}>
      {icon === 'baja'
        ? <UserMinusIcon size={s(13)} color={color} strokeWidth={2} />
        : <SwapIcon size={s(13)} color={color} strokeWidth={2} />}
      <Text style={{ fontSize: 12, fontWeight: '700', color, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );

  return (
    <View style={divider
      ? { marginBottom: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: bajas.length ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.25)' }
      : null}>
      {/* Con cambios debajo, las bajas llevan cabecera aunque la pantalla ponga su título */}
      {bajas.length > 0 && (showHeader || cambios.length > 0) && groupHeader('baja', `BAJAS (${bajas.length})`, TONE, true)}
      {bajas.map(row)}

      {bajas.some(c => c.late) && (
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, marginBottom: cambios.length ? 8 : 10 }}>
          Última hora = se borró con menos de {LATE_CANCEL_HOURS} h: su plaza ya no pasa a la lista de espera.
        </Text>
      )}

      {/* Cambios: el socio se borró para pasarse a otra clase del mismo día.
          Siempre con su cabecera, para que no se confundan con las bajas. */}
      {cambios.length > 0 && groupHeader('cambio', `CAMBIOS DE CLASE (${cambios.length})`, MOVED, bajas.length === 0)}
      {cambios.map((c, i) => row(c, bajas.length + i))}
    </View>
  );
}
