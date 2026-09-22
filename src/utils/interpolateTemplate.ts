export interface TemplateVars {
  nombre?: string | null;
  apodo?: string | null;
  plan?: string | null;
}

const PLACEHOLDER_PATTERN = /\{\{(nombre|apodo|plan)\}\}/;

/** ¿El texto usa alguno de los placeholders soportados? Para no pagar el coste
 * de resolver nombre/apodo/plan cuando el mensaje no los necesita. */
export function hasPlaceholder(text: string): boolean {
  return PLACEHOLDER_PATTERN.test(text);
}

/** Sustituye {{nombre}}, {{apodo}} y {{plan}} en el título/mensaje de una notificación. */
export function interpolateTemplate(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{nombre\}\}/g, vars.nombre || '')
    .replace(/\{\{apodo\}\}/g, vars.apodo || '')
    .replace(/\{\{plan\}\}/g, vars.plan || '');
}
