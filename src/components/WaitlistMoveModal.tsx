/**
 * WaitlistMoveModal.tsx — "Estás dentro": mantener o volver a tu hora.
 *
 * Si se libera plaza y el primero de la cola ya tenía otra clase ese día, la
 * base le cambia directamente. Al abrir la app (o tocar la push) se le
 * pregunta si lo mantiene. Vive a nivel de app (App.tsx) para salir esté
 * donde esté. Busca al abrir la app, al volver a primer plano, al llegar una
 * notificación y al navegar (como mucho cada 15 s).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { navigationRef } from '../navigation/navigationRef';
import { Colors, moderateScale, Radius, scale as s } from '../theme';
import { emitWaitlistMoveResolved, fetchMyPendingMove, resolveMove } from '../utils/waitlistMoves';
import { closePopup, tryOpenPopup, whenFree } from '../utils/popupGate';
import { moveClassLine, MoveOption, moveOptions, moveResultMessage, PendingMove } from '../utils/waitlistMoveModel';
import { CalendarCheckIcon } from './Icons';

let Notifications: any;
try { Notifications = require('expo-notifications'); } catch {}

const MIN_CHECK_INTERVAL_MS = 15_000;
// Al arrancar, dejar pasar los pop-ups del menú: en iOS dos Modal
// presentándose a la vez pueden hacer que uno no salga.
const FIRST_CHECK_DELAY_MS = 2500;
// Un Alert lanzado mientras el Modal se cierra puede no verse en iOS
const ALERT_AFTER_CLOSE_MS = 350;
const NAV_CHECK_DELAY_MS = 1000;

export function WaitlistMoveModal() {
  const [move, setMove] = useState<PendingMove | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const check = useCallback(async (force = false) => {
    if (checkingRef.current) return;
    if (!force && Date.now() - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    checkingRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setMove(null); setVisible(false); return; }
      const found = await fetchMyPendingMove(session.user.id);
      setMove(found);
      if (!found) return;
      // Si hay otro pop-up (Novedades) abierto, espera a que se cierre
      whenFree(() => { if (tryOpenPopup('waitlist-move')) setVisible(true); });
    } catch {
      // Sin red: se vuelve a intentar en la siguiente comprobación
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const firstCheck = setTimeout(() => check(true), FIRST_CHECK_DELAY_MS);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setMove(null); setVisible(false); }
      else if (event === 'SIGNED_IN') setTimeout(() => check(true), FIRST_CHECK_DELAY_MS);
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(true);
    });
    const received = Notifications?.addNotificationReceivedListener?.(() => check(true));
    // Tocar la push abre Notificaciones: el cambio de pantalla dispara la comprobación
    // Con retraso: que la consulta no compita con la animación del cambio de pantalla
    let navCheck: ReturnType<typeof setTimeout> | undefined;
    const unsubNav = navigationRef.addListener('state', () => {
      clearTimeout(navCheck);
      navCheck = setTimeout(() => check(false), NAV_CHECK_DELAY_MS);
    });
    return () => {
      clearTimeout(firstCheck);
      clearTimeout(navCheck);
      subscription.unsubscribe();
      appStateSub.remove();
      received?.remove?.();
      unsubNav();
    };
  }, [check]);

  // Libera el turno de pop-up al ocultarse
  useEffect(() => {
    if (!visible) closePopup('waitlist-move');
  }, [visible]);

  if (!move) return null;

  async function choose(option: MoveOption) {
    if (!move || busy) return;
    setBusy(option.action);
    try {
      const result = await resolveMove(move.id, option.action);
      const aviso = moveResultMessage(result, move);
      if (result === 'full' || result === 'not_allowed') {
        // Sigue pendiente: puede mantener o probar otra opción
        if (aviso) Alert.alert(aviso.title, aviso.message);
        return;
      }
      setVisible(false);
      setMove(null);
      emitWaitlistMoveResolved();
      if (aviso) setTimeout(() => Alert.alert(aviso.title, aviso.message), ALERT_AFTER_CLOSE_MS);
    } catch {
      Alert.alert('Sin conexión', 'Inténtalo de nuevo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      // Atrás (Android) = Mantener, que es lo que ya tiene
      onRequestClose={() => { if (!busy) choose({ action: 'keep', label: '', primary: true }); }}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: s(24) }}>
        <View style={{
          width: '100%', maxWidth: 340,
          backgroundColor: '#0d1929',
          borderRadius: Radius.xl,
          borderWidth: 1, borderColor: Colors.cardBorder,
          padding: s(22),
          alignItems: 'center',
        }}>
          <View style={{
            width: s(48), height: s(48), borderRadius: s(24),
            backgroundColor: 'rgba(16,185,129,0.15)',
            alignItems: 'center', justifyContent: 'center',
            marginBottom: s(14),
          }}>
            <CalendarCheckIcon size={s(24)} color="#10B981" />
          </View>

          <Text style={{ fontSize: moderateScale(19), fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' }}>
            Estás dentro
          </Text>
          <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.blue400, textAlign: 'center', marginTop: s(6) }}>
            {move.toClassName}
          </Text>
          <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginTop: s(2), marginBottom: s(20) }}>
            {moveClassLine(move)}
          </Text>

          <View style={{ width: '100%', gap: s(10) }}>
            {moveOptions(move).map((opt) => {
              const isBusy = busy === opt.action;
              const textColor = opt.primary ? '#fff' : Colors.textPrimary;
              return (
                // El Pressable solo gestiona el toque; la superficie la pinta el View
                <Pressable
                  key={opt.action}
                  onPress={() => choose(opt)}
                  disabled={!!busy}
                  style={({ pressed }) => ({ width: '100%', opacity: busy && !isBusy ? 0.5 : pressed ? 0.8 : 1 })}
                >
                  <View style={{
                    borderRadius: Radius.md,
                    minHeight: s(46), paddingVertical: s(12), paddingHorizontal: s(12),
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: opt.primary ? Colors.blue500 : 'rgba(255,255,255,0.06)',
                  }}>
                    {isBusy ? (
                      <ActivityIndicator color={textColor} />
                    ) : (
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: textColor, textAlign: 'center' }}>
                        {opt.label}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
