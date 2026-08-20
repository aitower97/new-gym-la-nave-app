import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, moderateScale, scale } from '../../theme';
import { useTutorial } from '../../tutorial/TutorialContext';
import { SpringPressable } from '../ui/SpringPressable';

const BACKDROP_COLOR = 'rgba(3,7,18,0.82)';

export function TutorialOverlay() {
  const { isActive, isReady, currentStep, stepIndex, totalSteps, spotlightRect, next, skip } = useTutorial();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // El overlay bloquea el toque para que la pantalla real nunca cambie
  // "por debajo" del tutorial — pero el botón físico/gesto de retroceso de
  // Android no pasa por ahí, navega el stack real igualmente y deja el
  // overlay resaltando un paso de una pantalla que ya no está. Se intercepta
  // mientras el tutorial está activo y se sale del tutorial en vez de dejar
  // que la navegación real ocurra por debajo.
  useEffect(() => {
    if (!isActive) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      skip();
      return true;
    });
    return () => sub.remove();
  }, [isActive, skip]);

  // El target se mide con measureInWindow (coordenadas absolutas de ventana),
  // pero este overlay se posiciona con top:0/left:0 relativo a su propio
  // padre — en Android con edge-to-edge esos dos orígenes no siempre
  // coinciden exactamente (a diferencia de iOS), así que el recuadro queda
  // desplazado unos píxeles. Se mide el propio overlay con la MISMA función
  // (measureInWindow) y se resta: así cualquier desfase de plataforma se
  // cancela solo, en vez de asumir que ambos sistemas de coordenadas son
  // siempre el mismo origen (0,0).
  //
  // Se guarda también su ANCHO/ALTO, no solo el origen: useWindowDimensions()
  // en Android puede devolver el tamaño del área de contenido (sin barra de
  // estado ni barra de navegación), que NO es el mismo sistema de coordenadas
  // en el que measureInWindow devuelve las posiciones. Usar screenH para
  // recortar el anillo recortaba de más justo en los elementos pegados abajo
  // (FAB, botón "Añadir ejercicio"): el borde inferior del anillo cortaba por
  // encima del botón y, al quedar el anillo más bajo que ancho, la detección
  // de "forma circular" fallaba y lo pintaba como cuadrado redondeado. En iOS
  // ambos valores coinciden, por eso allí siempre se vio bien.
  const rootRef = useRef<View>(null);
  const [rootBox, setRootBox] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [rootMeasured, setRootMeasured] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    // Se remide en CADA paso, no solo al activar el tutorial: en Android las
    // barras del sistema (edge-to-edge) pueden asentarse un instante después
    // de la primera medición, dejando ese rootOrigin inicial desactualizado
    // para pasos posteriores — remedir siempre es más robusto que confiar en
    // que el origen de ventana no cambia durante todo el recorrido. El coste
    // es despreciable (1 medida nativa más por paso) frente al de un
    // recuadro descolocado en pasos avanzados.
    setRootMeasured(false);
    const raf = requestAnimationFrame(() => {
      rootRef.current?.measureInWindow((x, y, width, height) => {
        setRootBox({ x, y, width, height });
        setRootMeasured(true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, stepIndex]);

  // Si el paso tarda en encontrar su elemento (navegación + carga de datos
  // de la pantalla destino), avisamos con un pequeño indicador pasado un
  // instante — sin esto, una espera de 2-4s en Android se ve como si la app
  // se hubiera quedado colgada, aunque el botón de saltar siga ahí.
  const [showLoadingHint, setShowLoadingHint] = useState(false);
  useEffect(() => {
    if (isReady) { setShowLoadingHint(false); return; }
    const t = setTimeout(() => setShowLoadingHint(true), 600);
    return () => clearTimeout(t);
  }, [isReady, stepIndex]);

  // Altura REAL del tooltip, medida con onLayout — no adivinada. Android
  // renderiza el mismo texto con métricas de fuente distintas a iOS (más
  // alto), así que cualquier estimación por caracteres/nº de líneas se
  // quedaba corta ahí y el contenido acababa desbordando hacia la zona
  // resaltada. Midiendo de verdad antes de colocar, el solape deja de ser
  // posible por construcción, sin depender de adivinar nada por plataforma.
  const [tooltipHeight, setTooltipHeight] = useState<number | null>(null);
  useEffect(() => { setTooltipHeight(null); }, [stepIndex]);

  if (!isActive || !currentStep) return null;

  const isLastStep = stepIndex === totalSteps - 1;
  // rootMeasured evita pintar el recuadro en (0,0) sin corregir durante el
  // primer frame, antes de que se resuelva la medición del propio overlay.
  const rect = spotlightRect && rootMeasured
    ? { x: spotlightRect.x - rootBox.x, y: spotlightRect.y - rootBox.y, width: spotlightRect.width, height: spotlightRect.height }
    : null;

  // Dimensiones del PROPIO overlay, en el mismo espacio de coordenadas que
  // `rect` (ambos salen de measureInWindow). Es la referencia correcta para
  // decidir dónde cabe el tooltip; useWindowDimensions solo sirve de reserva
  // hasta que se resuelve la primera medición.
  const boundsW = rootBox.width || screenW;
  const boundsH = rootBox.height || screenH;

  const tooltip = (
    <View style={{
      backgroundColor: Colors.surface,
      borderRadius: Radius.lg,
      borderWidth: 1, borderColor: Colors.cardBorder,
      padding: scale(18),
      gap: scale(10),
    }}>
      <Text style={{ fontSize: moderateScale(11), fontWeight: '700', color: Colors.blue400, letterSpacing: 0.8 }}>
        PASO {stepIndex + 1} DE {totalSteps}
      </Text>
      <Text style={{ fontSize: moderateScale(17), fontWeight: '800', color: Colors.textPrimary }}>
        {currentStep.title}
      </Text>
      <Text style={{ fontSize: moderateScale(13), color: Colors.textSecondary, lineHeight: moderateScale(19) }}>
        {currentStep.description}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: scale(6) }}>
        {/* El padding va DENTRO del Pressable (como hijo), no en el `style`
            de SpringPressable — ese `style` lo aplica al Animated.View
            EXTERIOR, y el Pressable interior se queda del tamaño de su
            contenido (el texto), sin heredar el padding visual. Resultado:
            solo respondía al toque el texto, no todo el botón que se ve —
            crítico aquí porque es la ÚNICA forma de avanzar en un overlay
            que bloquea todo lo demás. */}
        <SpringPressable onPress={skip}>
          <View style={{ paddingVertical: scale(8), paddingHorizontal: scale(4) }}>
            <Text style={{ fontSize: moderateScale(12), fontWeight: '600', color: Colors.textMuted }}>
              Saltar tutorial
            </Text>
          </View>
        </SpringPressable>
        <SpringPressable onPress={next}>
          <View style={{
            backgroundColor: Colors.blue500,
            borderRadius: Radius.md,
            paddingVertical: scale(10), paddingHorizontal: scale(20),
          }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: '#fff' }}>
              {isLastStep ? 'Entendido' : 'Siguiente'}
            </Text>
          </View>
        </SpringPressable>
      </View>
    </View>
  );

  let content: React.ReactNode;

  // Mientras se navega/mide el siguiente target no hay tarjeta (para no
  // dejarla flotando sobre la pantalla anterior), pero SIEMPRE debe quedar
  // una salida visible — si el target tarda o nunca aparece, el usuario no
  // puede quedarse atrapado mirando una pantalla negra sin botones.
  if (!isReady) {
    content = (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: BACKDROP_COLOR, justifyContent: 'center' }}>
        {showLoadingHint && (
          <View style={{ alignItems: 'center', gap: scale(10) }}>
            <ActivityIndicator size="small" color={Colors.textMuted} />
            <Text style={{ fontSize: moderateScale(12), color: Colors.textMuted }}>Buscando...</Text>
          </View>
        )}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: scale(20), paddingBottom: insets.bottom + scale(20), alignItems: 'center' }}>
          <SpringPressable onPress={skip} style={{ paddingVertical: scale(10), paddingHorizontal: scale(16) }}>
            <Text style={{ fontSize: moderateScale(13), fontWeight: '600', color: Colors.textMuted }}>
              Saltar tutorial
            </Text>
          </SpringPressable>
        </View>
      </View>
    );
  } else if (!rect) {
    content = (
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: BACKDROP_COLOR,
        alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: scale(28),
      }}>
        <View style={{ width: '100%', maxWidth: scale(360) }}>{tooltip}</View>
      </View>
    );
  } else {
    const EDGE_MARGIN = scale(16);
    const RING_PAD = scale(4);
    const GAP = scale(14);
    const TOOLTIP_WIDTH = Math.min(scale(340), boundsW - EDGE_MARGIN * 2);

    // Mientras no se conozca la altura REAL (primer paint de este paso), se
    // usa una estimación solo para reservar sitio con el tooltip invisible
    // — en cuanto onLayout reporta la altura de verdad, se recoloca con esa
    // cifra exacta y se revela. Así el solape con el target es imposible
    // por construcción, sea cual sea la métrica de fuente de la plataforma.
    const measuring = tooltipHeight == null;
    const effectiveHeight = tooltipHeight ?? scale(210);

    // Se resta insets.top/insets.bottom desde el principio: son el hueco
    // REALMENTE utilizable sin invadir la barra de estado/notch arriba ni la
    // zona del gesto/home indicator abajo.
    const spaceBelow = boundsH - insets.bottom - (rect.y + rect.height);
    const spaceAbove = rect.y - insets.top;
    // El hueco que hace falta es la altura REAL del tooltip (effectiveHeight),
    // no una cifra fija — una descripción larga en Android puede pasar de los
    // ~190dp que se usaban antes, y con un umbral fijo `placeBelow` podía
    // salir `true` aunque el tooltip no cupiera, solapando el target al
    // colocarlo (justo lo que el diseño de measure-then-position evita en
    // todo lo demás). Prioriza el lado que realmente tiene sitio suficiente;
    // solo si NINGUNO llega al mínimo se elige el que tenga más espacio.
    const neededSpace = effectiveHeight + GAP * 2;
    const placeBelow = spaceBelow >= neededSpace
      ? true
      : spaceAbove >= neededSpace
        ? false
        : spaceBelow >= spaceAbove;

    const finalTop = placeBelow
      ? Math.min(rect.y + rect.height + GAP, boundsH - insets.bottom - GAP - effectiveHeight)
      : Math.max(rect.y - GAP - effectiveHeight, insets.top + GAP);

    // El tooltip se centra sobre el target (para que quede "al lado", no
    // siempre a lo ancho de toda la pantalla) pero nunca puede tocar los
    // bordes: se recorta dentro de [EDGE_MARGIN, boundsW - EDGE_MARGIN - ancho].
    const targetCenterX = rect.x + rect.width / 2;
    const tooltipLeft = Math.min(
      Math.max(targetCenterX - TOOLTIP_WIDTH / 2, EDGE_MARGIN),
      boundsW - EDGE_MARGIN - TOOLTIP_WIDTH
    );

    // El anillo se deriva SIEMPRE del target medido, sin recortarlo contra
    // ningún límite de pantalla. Recortarlo era justo el bug: el límite
    // inferior venía de useWindowDimensions, que en Android está en otro
    // sistema de coordenadas que measureInWindow, así que en los elementos
    // pegados abajo (FAB, "Añadir ejercicio") el anillo se cortaba por encima
    // del botón y además, al dejar de ser cuadrado, se pintaba con el radio
    // de tarjeta en vez de redondo. Sin recorte, el anillo abraza el target
    // exactamente, siempre. Si el target estuviera parcialmente fuera de la
    // pantalla, el anillo simplemente se recorta solo al pintarse — que es el
    // comportamiento correcto, y nunca deforma la caja.
    const ringLeft = rect.x - RING_PAD;
    const ringTop = rect.y - RING_PAD;
    const ringWidth = rect.width + RING_PAD * 2;
    const ringHeight = rect.height + RING_PAD * 2;
    // Un anillo con el radio de tarjeta habitual (Radius.md) no "abraza" un
    // botón circular (p. ej. el FAB de crear clase/plan): queda casi
    // cuadrado alrededor de un círculo, con huecos visibles en las esquinas.
    // Si el target es aprox. tan ancho como alto y de tamaño de botón/icono
    // (no una tarjeta o fila), se asume circular y el anillo se redondea a
    // juego con su propia forma en vez de usar el radio fijo de tarjeta.
    const isIconShaped = Math.abs(ringWidth - ringHeight) < scale(8) && ringWidth < scale(120);
    const ringBorderRadius = isIconShaped ? Math.min(ringWidth, ringHeight) / 2 : Radius.md;

    content = (
      <>
        {/* Bloquea el toque en TODA la pantalla, incluido el propio elemento
            resaltado — si se dejara pasar el toque ahí, tocar la tarjeta real
            de debajo navegaría de verdad mientras el tutorial sigue "creyendo"
            que sigue en el paso/pantalla anterior, dejándolo hecho un lío
            (overlay mostrando un paso que ya no corresponde a la pantalla
            real). Solo se avanza con los botones del tooltip. */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        {/* 4 bandas que forman el recorte alrededor del target — puramente
            visuales (el bloqueo de toque ya lo hace la capa de arriba). */}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rect.y, backgroundColor: BACKDROP_COLOR }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: rect.y + rect.height, left: 0, right: 0, bottom: 0, backgroundColor: BACKDROP_COLOR }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: rect.y, left: 0, width: rect.x, height: rect.height, backgroundColor: BACKDROP_COLOR }} />
        <View pointerEvents="none" style={{ position: 'absolute', top: rect.y, left: rect.x + rect.width, right: 0, height: rect.height, backgroundColor: BACKDROP_COLOR }} />

        {/* Anillo de foco */}
        <View pointerEvents="none" style={{
          position: 'absolute',
          top: ringTop, left: ringLeft,
          width: ringWidth, height: ringHeight,
          borderRadius: ringBorderRadius, borderWidth: 2, borderColor: Colors.blue400,
        }} />

        <View
          onLayout={(e) => {
            const h = Math.ceil(e.nativeEvent.layout.height);
            if (h > 0 && h !== tooltipHeight) setTooltipHeight(h);
          }}
          style={{
            position: 'absolute', left: tooltipLeft, width: TOOLTIP_WIDTH,
            top: finalTop,
            opacity: measuring ? 0 : 1,
          }}
        >
          {tooltip}
        </View>
      </>
    );
  }

  // pointerEvents="auto" (por defecto): el overlay bloquea el toque en TODA
  // su superficie mientras el tutorial está activo — los 3 estados
  // (cargando, tarjeta centrada, spotlight) bloquean por diseño, así que no
  // hay ningún caso en el que convenga dejar pasar el toque a través de la
  // raíz. NO se envuelve en <Modal>: un Modal usa su propia ventana nativa
  // en Android, con su propio sistema de coordenadas para measureInWindow —
  // se probó y descoloca el recuadro en TODOS los pasos (no solo los
  // afectados por elevation), mucho peor que el problema que intentaba
  // arreglar. El elemento con elevation propia que gana el pintado se
  // neutraliza en el propio componente (ver FAB.tsx / AdminWorkoutScreen.tsx
  // — bajan su elevation a 0 mientras el tutorial está activo).
  return (
    <View ref={rootRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {content}
    </View>
  );
}
