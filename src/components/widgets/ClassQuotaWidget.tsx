/**
 * ClassQuotaWidget.tsx - Bloque "hero" de cupo de clases del plan, en MainMenu.
 *
 * Se embebe dentro de la card de stats ya existente en MainMenuScreen, como
 * un bloque encima de la fila de "Esta semana / Total clases" (separado por
 * un borde inferior). Solo se renderiza si el plan del usuario tiene un
 * límite de clases (classes_per_month != null); planes ilimitados o sin plan
 * no muestran nada (el padre no lo monta). Lleva el número grande de clases
 * disponibles por delante — lo que el socio realmente quiere saber al entrar
 * — y un contador circular de días hasta que caduca el cupo. El cupo y la
 * fecha de caducidad vienen de getClassQuotaStatus (utils/planEnforcement.ts),
 * que ya usa el periodo de facturación real del plan (mensual/trimestral/
 * anual/bono), no siempre mes natural.
 */

import { Text, View } from 'react-native';
import { Colors, moderateScale, scale } from '../../theme';
import { ClassQuotaStatus } from '../../utils/planEnforcement';

interface ClassQuotaWidgetProps {
    status: ClassQuotaStatus;
}

function formatUntil(periodEnd: Date): string {
    return periodEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function daysUntil(periodEnd: Date): number {
    const diffMs = periodEnd.getTime() - Date.now();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function ClassQuotaWidget({ status }: ClassQuotaWidgetProps) {
    const { used, total, remaining, periodEnd } = status;
    const progressPct = total > 0 ? Math.min(1, used / total) : 0;
    const low = remaining <= Math.max(1, Math.round(total * 0.15));
    const accentColor = remaining === 0 ? Colors.danger : low ? Colors.warning : Colors.blue400;
    const daysLeft = Math.max(0, daysUntil(periodEnd));

    return (
        <View style={{ marginBottom: scale(10), paddingBottom: scale(10), borderBottomWidth: 1, borderBottomColor: Colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(12) }}>
                <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                        <Text style={{ fontSize: moderateScale(29), fontWeight: '900', color: accentColor, letterSpacing: -0.5, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>
                            {remaining}
                        </Text>
                        <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: Colors.textMuted, marginLeft: scale(4), flexShrink: 0 }} numberOfLines={1}>
                            / {total}
                        </Text>
                    </View>
                    <Text style={{ fontSize: moderateScale(11), fontWeight: '600', color: Colors.textSecondary, marginTop: scale(1) }} numberOfLines={1}>
                        clase{remaining !== 1 ? 's' : ''} para reservar
                    </Text>
                </View>

                <View style={{
                    width: scale(46), height: scale(46), borderRadius: scale(23),
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: `${accentColor}1A`,
                    borderWidth: 1.5, borderColor: `${accentColor}55`,
                }}>
                    <Text style={{ fontSize: moderateScale(15), fontWeight: '900', color: accentColor, letterSpacing: -0.5 }} numberOfLines={1}>
                        {daysLeft}
                    </Text>
                    <Text style={{ fontSize: moderateScale(7), fontWeight: '700', color: accentColor, letterSpacing: 0.5 }} numberOfLines={1}>
                        DÍAS
                    </Text>
                </View>
            </View>

            <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: scale(8) }}>
                <View style={{ width: `${Math.round(progressPct * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: accentColor }} />
            </View>
            <Text style={{ fontSize: moderateScale(9), color: Colors.textMuted, marginTop: scale(5) }} numberOfLines={1}>
                Disponibles hasta el {formatUntil(periodEnd)}
            </Text>
        </View>
    );
}
