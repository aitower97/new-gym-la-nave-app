import { Text, View } from 'react-native';
import { scale as s } from '../../theme';
import { CANCELLED_BY_LABEL, LATE_CANCEL_HOURS } from '../../utils/cancellations';
import { ClassCancellation } from '../../utils/cancellationsData';
import { UserMinusIcon } from '../Icons';
import { Avatar } from '../ui/Avatar';

// Ámbar: una baja no es un error (rojo) ni una espera (violeta)
const TONE = '#F59E0B';
const LATE = '#EF4444';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Resumen de una línea para la card cerrada: "2 bajas · 1 a última hora".
 * Nada si no hay bajas, para no añadir ruido a cada clase.
 */
export function CancellationSummary({ items }: { items?: ClassCancellation[] }) {
  if (!items?.length) return null;
  const late = items.filter(c => c.late).length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
      <UserMinusIcon size={s(13)} color={late ? LATE : TONE} strokeWidth={2} />
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: late ? LATE : TONE, flexShrink: 1 }}>
        {items.length} {items.length === 1 ? 'baja' : 'bajas'}
        {late > 0 ? ` · ${late} a última hora` : ''}
      </Text>
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
  return (
    <View style={divider
      ? { marginBottom: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(245,158,11,0.25)' }
      : null}>
      {showHeader && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <UserMinusIcon size={s(13)} color={TONE} strokeWidth={2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: TONE, letterSpacing: 0.3 }}>
            BAJAS ({items.length})
          </Text>
        </View>
      )}

      {items.map((c, i) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <View style={{ opacity: c.rebooked ? 1 : 0.6, marginTop: 1 }}>
            <Avatar uri={c.avatar} size={30} index={i} name={c.name} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }} numberOfLines={1}>
              {c.name}
            </Text>
            {/* Dos líneas cortas en vez de una larga: a ~170pt se partía por cualquier sitio */}
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }} numberOfLines={1}>
              {CANCELLED_BY_LABEL[c.by]} · {c.notice}
            </Text>
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
      ))}

      {items.some(c => c.late) && (
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
          Última hora = se borró con menos de {LATE_CANCEL_HOURS} h: su plaza ya no pasa a la lista de espera.
        </Text>
      )}
    </View>
  );
}
