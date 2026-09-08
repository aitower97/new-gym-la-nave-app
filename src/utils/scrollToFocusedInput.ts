import { RefObject } from 'react';
import { NativeSyntheticEvent, ScrollView, TargetedEvent } from 'react-native';
import { scale } from '../theme';

/**
 * Lleva el TextInput recién enfocado a la vista dentro de su ScrollView.
 *
 * Hace falta a mano porque el sheet que contiene el ScrollView se desplaza
 * con un translateY animado (Reanimated, en respuesta al teclado) — ese
 * transform confunde el autoscroll nativo de ScrollView, así que sin esto el
 * campo enfocado puede quedar tapado por el teclado. Ver
 * ~/.claude/skills/ui-mobile/references/pitfalls.md #3: KeyboardAvoidingView
 * no resuelve este caso (sheet anclada abajo) en esta app — hay que seguir
 * usando translateY animado para el sheet, y resolver el "centrado en la
 * casilla" aparte, con esto.
 *
 * Usa measureInWindow (no measureLayout): en esta versión de RN,
 * measureLayout(relativeToNode) ya dio el warning "ref.measureLayout must be
 * called with a ref to a native component" en otro punto de este mismo
 * código (ver WorkoutProgressScreen.tsx) — measureInWindow + combinar con el
 * offset de scroll actual es el patrón ya probado sin warnings.
 */
export function scrollFocusedInputIntoView(
  scrollViewRef: RefObject<ScrollView | null>,
  scrollOffsetRef: RefObject<number>,
  event: NativeSyntheticEvent<TargetedEvent>,
  extraTopMargin = scale(16)
) {
  const scroller = scrollViewRef.current;
  const target = event.target as unknown as { measureInWindow?: (cb: (x: number, y: number) => void) => void };
  if (!scroller || !target?.measureInWindow) {
    if (__DEV__) console.warn('scrollFocusedInputIntoView: no se pudo medir el input o el ScrollView, se omite el autoscroll');
    return;
  }
  const scrollerWithMeasure = scroller as unknown as { measureInWindow: (cb: (x: number, y: number) => void) => void };
  // Un frame de margen: el teclado y el propio sheet todavía están animando
  // su posición justo cuando se dispara onFocus.
  requestAnimationFrame(() => {
    target.measureInWindow!((_targetX: number, targetY: number) => {
      scrollerWithMeasure.measureInWindow((_scrollX: number, scrollY: number) => {
        const desiredY = (scrollOffsetRef.current ?? 0) + (targetY - scrollY) - extraTopMargin;
        scroller.scrollTo({ y: Math.max(0, desiredY), animated: true });
      });
    });
  });
}
