import { ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Un bloque de pantalla (widget, card) que, si falla al pintarse, desaparece
 * en vez de tumbar la app entera. El error llega igual a Sentry con su nombre.
 * En 1.23.0 un fallo del widget de cupo dejó la app sin abrir para los socios
 * con plan limitado: con esto solo habría faltado el widget.
 */
export function SafeBlock({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary name={name} fallback={() => null}>
      {children}
    </ErrorBoundary>
  );
}
