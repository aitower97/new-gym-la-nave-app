/**
 * WaitlistOfferModal.tsx — "Se ha liberado una plaza": decide en X minutos.
 *
 * Vive a nivel de app (App.tsx), no en una pantalla: el socio llega desde una
 * push o abre la app en cualquier sitio, y la oferta tiene que salirle esté
 * donde esté. Busca ofertas pendientes al abrir la app, al volver a primer
 * plano, al llegar una notificación y al navegar (como mucho cada 15 s).
 *
 * Si cierra sin decidir ("Decidir luego") la oferta sigue en pie y el modal
 * vuelve a salir en la siguiente comprobación, hasta que conteste o caduque.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { navigationRef } from '../navigation/navigationRef';
import { Colors, moderateScale, Radius, scale as s } from '../theme';
import { emitWaitlistOfferResolved, fetchMyPendingOffer, respondToOffer } from '../utils/waitlistOffers';
import { offerClock, OfferOption, offerOptions, offerResultMessage, PendingOffer } from '../utils/waitlistOfferModel';
import { HourglassIcon } from './Icons';

let Notifications: any;
try { Notifications = require('expo-notifications'); } catch {}

const MIN_CHECK_INTERVAL_MS = 15_000;
// Al arrancar, dejar pasar los pop-ups del menú (entreno de hoy, foto): en
// iOS dos Modal presentándose a la vez pueden hacer que uno no salga.
const FIRST_CHECK_DELAY_MS = 2500;
// Un Alert lanzado mientras el Modal se cierra puede no verse en iOS
const ALERT_AFTER_CLOSE_MS = 350;

function formatDay(classDate: string): string {
  const d = new Date(`${classDate}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function WaitlistOfferModal() {
  const insets = useSafeAreaInsets();
  const [offer, setOffer] = useState<PendingOffer | null>(null);
  const [visible, setVisible] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const lastCheckRef = useRef(0);
  const checkingRef = useRef(false);

  const check = useCallback(async (force = false) => {
    if (checkingRef.current) return;
    if (!force && Date.now() - lastCheckRef.current < MIN_CHECK_INTERVAL_MS) return;
    checkingRef.current = true;
    lastCheckRef.current = Date.now();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setOffer(null); setVisible(false); return; }
      const found = await fetchMyPendingOffer(session.user.id);
      setOffer(found);
      setVisible(!!found);
    } catch {
      // Sin red: se volverá a intentar en la siguiente comprobación
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const firstCheck = setTimeout(() => check(true), FIRST_CHECK_DELAY_MS);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setOffer(null); setVisible(false); }
      else if (event === 'SIGNED_IN') setTimeout(() => check(true), FIRST_CHECK_DELAY_MS);
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(true);
    });
    // Con la app abierta: al llegar la push de la oferta, o el recordatorio
    const received = Notifications?.addNotificationReceivedListener?.(() => check(true));
    // Tocar la push abre Notificaciones: el cambio de pantalla dispara la comprobación
    const unsubNav = navigationRef.addListener('state', () => check(false));
    return () => {
      clearTimeout(firstCheck);
      subscription.unsubscribe();
      appStateSub.remove();
      received?.remove?.();
      unsubNav();
    };
  }, [check]);

  // Reloj en marcha solo con el modal a la vista
  useEffect(() => {
    if (!visible) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!offer) return null;

  const busy = busyKey !== null;
  const clock = offerClock(offer, now);
  const expired = clock.phase === 'expired';
  const options = offerOptions(offer);
  const otherTimes = offer.otherClasses.map((c) => c.time.slice(0, 5)).join(' y ');
  const keyOf = (opt: OfferOption) => `${opt.action}-${opt.bookingId ?? ''}`;

  async function choose(option: OfferOption) {
    if (!offer || busy) return;
    setBusyKey(keyOf(option));
    try {
      const result = await respondToOffer(offer.id, option.action, option.bookingId);
      const { title, message } = offerResultMessage(result, offer);
      if (result === 'not_allowed') {
        // La oferta sigue abierta: puede probar otra opción
        Alert.alert(title, message);
        return;
      }
      setVisible(false);
      setOffer(null);
      emitWaitlistOfferResolved();
      setTimeout(() => Alert.alert(title, message), ALERT_AFTER_CLOSE_MS);
    } catch {
      Alert.alert('Error', 'No se pudo enviar tu respuesta. Comprueba la conexión e inténtalo de nuevo.');
    } finally {
      setBusyKey(null);
    }
  }

  function closeExpired() {
    setVisible(false);
    setOffer(null);
    emitWaitlistOfferResolved();
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      // Con la respuesta en vuelo, el botón atrás de Android no cierra
      onRequestClose={() => { if (!busy) setVisible(false); }}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' }}>
        {/* ScrollView: con 3-4 opciones la tarjeta no cabe en móviles pequeños */}
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1, alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: s(24),
            paddingTop: insets.top + s(24), paddingBottom: insets.bottom + s(24),
          }}
          showsVerticalScrollIndicator={false}
        >
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
              backgroundColor: 'rgba(139,92,246,0.15)',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: s(14),
            }}>
              <HourglassIcon size={s(24)} color="#A78BFA" strokeWidth={2} />
            </View>

            <Text style={{ fontSize: moderateScale(18), fontWeight: '800', color: Colors.textPrimary, marginBottom: s(6), textAlign: 'center' }}>
              {expired ? 'Se acabó el tiempo' : 'Se ha liberado una plaza'}
            </Text>
            <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: Colors.blue400, textAlign: 'center' }}>
              {offer.className} · {offer.classTime.slice(0, 5)}
            </Text>
            <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center', marginTop: s(2) }}>
              {formatDay(offer.classDate)}
            </Text>

            {expired ? (
              <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', marginTop: s(14), marginBottom: s(18), lineHeight: moderateScale(20) }}>
                La plaza ha pasado al siguiente de la lista. Sigues en la lista de espera.
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: moderateScale(14), color: Colors.textSecondary, textAlign: 'center', marginTop: s(14), lineHeight: moderateScale(20) }}>
                  {offer.otherClasses.length > 0
                    ? `Eres el primero de la lista y ese día ya tienes la de las ${otherTimes}. Te guardamos la plaza mientras decides.`
                    : 'Eres el primero de la lista. Te guardamos la plaza mientras decides.'}
                </Text>

                {/* Reloj */}
                <View style={{
                  marginTop: s(14), marginBottom: s(18),
                  paddingVertical: s(8), paddingHorizontal: s(14),
                  borderRadius: Radius.md,
                  backgroundColor: clock.phase === 'running' && clock.secondsLeft <= 300 ? 'rgba(245,158,11,0.12)' : 'rgba(139,92,246,0.12)',
                  alignItems: 'center',
                }}>
                  {clock.phase === 'running' ? (
                    <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, textAlign: 'center' }}>
                      Tienes{' '}
                      <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: clock.secondsLeft <= 300 ? '#F59E0B' : '#A78BFA', fontVariant: ['tabular-nums'] }}>
                        {clock.label}
                      </Text>
                      {' '}para decidir
                    </Text>
                  ) : (
                    <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: '#A78BFA', textAlign: 'center' }}>
                      {clock.label}
                    </Text>
                  )}
                </View>
              </>
            )}

            {expired ? (
              <Pressable
                onPress={closeExpired}
                style={({ pressed }) => ({ width: '100%', opacity: pressed ? 0.8 : 1 })}
              >
                <View style={{ backgroundColor: Colors.blue500, borderRadius: Radius.md, paddingVertical: s(13), alignItems: 'center' }}>
                  <Text style={{ fontSize: moderateScale(15), fontWeight: '700', color: '#fff' }}>Entendido</Text>
                </View>
              </Pressable>
            ) : (
              <View style={{ width: '100%', gap: s(10) }}>
                {options.map((opt) => {
                  const isBusy = busyKey === keyOf(opt);
                  const textColor = opt.primary ? '#fff' : opt.action === 'decline' ? Colors.textSecondary : Colors.textPrimary;
                  return (
                    // El Pressable solo gestiona el toque; la superficie la pinta el View
                    <Pressable
                      key={keyOf(opt)}
                      onPress={() => choose(opt)}
                      disabled={busy}
                      style={({ pressed }) => ({ width: '100%', opacity: busy && !isBusy ? 0.5 : pressed ? 0.8 : 1 })}
                    >
                      <View style={{
                        borderRadius: Radius.md,
                        paddingVertical: s(12), paddingHorizontal: s(12),
                        minHeight: s(46),
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: opt.primary ? Colors.blue500 : opt.action === 'decline' ? 'transparent' : 'rgba(255,255,255,0.06)',
                        borderWidth: opt.action === 'decline' ? 1 : 0,
                        borderColor: Colors.cardBorder,
                      }}>
                        {isBusy ? (
                          <ActivityIndicator color={textColor} />
                        ) : (
                          <Text style={{ fontSize: moderateScale(15), fontWeight: '700', textAlign: 'center', color: textColor }}>
                            {opt.label}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => setVisible(false)}
                  disabled={busy}
                  style={({ pressed }) => ({ paddingVertical: s(6), alignItems: 'center', opacity: busy ? 0.5 : pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textMuted }}>
                    Decidir luego
                  </Text>
                </Pressable>
                <Text style={{ fontSize: moderateScale(11), color: Colors.textMuted, textAlign: 'center' }}>
                  Si no contestas a tiempo, la plaza pasa al siguiente y tú sigues en la lista.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
