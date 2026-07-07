/**
 * exerciseClassification.ts — Clasifica un ejercicio (por su nombre en español)
 * en una zona del cuerpo y los músculos que trabaja. Es heurístico por palabras
 * clave: no requiere tocar la base de datos ni que el entrenador rellene nada.
 * El orden de las reglas importa (gana la primera coincidencia): las más
 * específicas van arriba.
 */

export type BodyGroupKey =
  | 'piernas' | 'pecho' | 'espalda' | 'hombros'
  | 'brazos' | 'core' | 'olimpico' | 'otros';

export interface BodyGroup {
  key: BodyGroupKey;
  label: string;
  color: string;
}

// Orden en el que se muestran las secciones
export const BODY_GROUP_ORDER: BodyGroupKey[] = [
  'piernas', 'pecho', 'espalda', 'hombros', 'brazos', 'core', 'olimpico', 'otros',
];

export const BODY_GROUPS: Record<BodyGroupKey, BodyGroup> = {
  piernas:  { key: 'piernas',  label: 'Piernas',        color: '#3B82F6' },
  pecho:    { key: 'pecho',    label: 'Pecho',          color: '#EF4444' },
  espalda:  { key: 'espalda',  label: 'Espalda',        color: '#10B981' },
  hombros:  { key: 'hombros',  label: 'Hombros',        color: '#F59E0B' },
  brazos:   { key: 'brazos',   label: 'Brazos',         color: '#A78BFA' },
  core:     { key: 'core',     label: 'Core',           color: '#EC4899' },
  olimpico: { key: 'olimpico', label: 'Cuerpo completo', color: '#06B6D4' },
  otros:    { key: 'otros',    label: 'Otros',          color: '#6B7280' },
};

interface Rule {
  keywords: string[];
  group: BodyGroupKey;
  muscles: string[];
}

// Quita acentos y pasa a minúsculas (sin depender de String.normalize).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[áàä]/g, 'a')
    .replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o')
    .replace(/[úùü]/g, 'u')
    .replace(/ñ/g, 'n');
}

const RULES: Rule[] = [
  // ----- Piernas (específicas antes que "peso muerto" / "curl" / "elevacion")
  { keywords: ['peso muerto rumano', 'rumano', 'curl femoral', 'femoral'], group: 'piernas', muscles: ['Isquios', 'Glúteos'] },
  { keywords: ['hip thrust', 'empuje de cadera', 'puente de gluteo', 'gluteo'], group: 'piernas', muscles: ['Glúteos', 'Isquios'] },
  { keywords: ['sentadilla', 'squat'], group: 'piernas', muscles: ['Cuádriceps', 'Glúteos', 'Isquios'] },
  { keywords: ['prensa', 'leg press'], group: 'piernas', muscles: ['Cuádriceps', 'Glúteos'] },
  { keywords: ['zancada', 'lunge', 'desplante', 'bulgara', 'split squat'], group: 'piernas', muscles: ['Cuádriceps', 'Glúteos'] },
  { keywords: ['extension de cuadriceps', 'extension de pierna', 'cuadriceps'], group: 'piernas', muscles: ['Cuádriceps'] },
  { keywords: ['gemelo', 'pantorrilla', 'elevacion de talon', 'elevacion de talones'], group: 'piernas', muscles: ['Gemelos'] },
  { keywords: ['abductor'], group: 'piernas', muscles: ['Abductores'] },
  { keywords: ['aductor'], group: 'piernas', muscles: ['Aductores'] },

  // ----- Espalda (jalon de triceps antes que jalon; peso muerto tras rumano)
  { keywords: ['jalon de triceps', 'jalon triceps'], group: 'brazos', muscles: ['Tríceps'] },
  { keywords: ['dominada', 'dominadas', 'pull up', 'pull-up', 'jalon', 'pulldown', 'pull down'], group: 'espalda', muscles: ['Dorsal', 'Bíceps'] },
  { keywords: ['remo', 'row'], group: 'espalda', muscles: ['Dorsal', 'Trapecio', 'Romboides'] },
  { keywords: ['pullover'], group: 'espalda', muscles: ['Dorsal', 'Pectoral'] },
  { keywords: ['encogimiento', 'shrug', 'trapecio'], group: 'espalda', muscles: ['Trapecio'] },
  { keywords: ['face pull'], group: 'espalda', muscles: ['Deltoides posterior', 'Trapecio'] },
  { keywords: ['hiperextension', 'lumbar', 'espalda baja'], group: 'espalda', muscles: ['Espalda baja'] },
  { keywords: ['peso muerto', 'deadlift'], group: 'espalda', muscles: ['Espalda baja', 'Glúteos', 'Isquios'] },

  // ----- Pecho
  { keywords: ['press inclinado', 'inclinado'], group: 'pecho', muscles: ['Pectoral superior', 'Tríceps'] },
  { keywords: ['press declinado', 'declinado'], group: 'pecho', muscles: ['Pectoral inferior', 'Tríceps'] },
  { keywords: ['press de banca', 'press banca', 'banca', 'bench'], group: 'pecho', muscles: ['Pectoral', 'Tríceps', 'Deltoides'] },
  { keywords: ['apertura', 'aperturas', 'fly', 'contractora', 'peck deck', 'cruce de poleas', 'cruce'], group: 'pecho', muscles: ['Pectoral'] },
  { keywords: ['fondos', 'dips'], group: 'pecho', muscles: ['Pectoral', 'Tríceps'] },

  // ----- Hombros
  { keywords: ['press militar', 'militar', 'press de hombro', 'press hombro', 'overhead press', 'arnold'], group: 'hombros', muscles: ['Deltoides', 'Tríceps'] },
  { keywords: ['elevaciones laterales', 'elevacion lateral', 'lateral'], group: 'hombros', muscles: ['Deltoides lateral'] },
  { keywords: ['elevaciones frontales', 'elevacion frontal', 'frontal'], group: 'hombros', muscles: ['Deltoides anterior'] },
  { keywords: ['pajaro', 'deltoide posterior', 'reverse fly'], group: 'hombros', muscles: ['Deltoides posterior'] },
  { keywords: ['hombro', 'deltoide'], group: 'hombros', muscles: ['Deltoides'] },

  // ----- Brazos
  { keywords: ['curl de biceps', 'curl biceps', 'curl martillo', 'martillo', 'predicador', 'curl'], group: 'brazos', muscles: ['Bíceps'] },
  { keywords: ['biceps'], group: 'brazos', muscles: ['Bíceps'] },
  { keywords: ['press frances', 'frances', 'extension de triceps', 'patada de triceps', 'copa', 'triceps'], group: 'brazos', muscles: ['Tríceps'] },
  { keywords: ['antebrazo'], group: 'brazos', muscles: ['Antebrazo'] },

  // ----- Core
  { keywords: ['plancha', 'plank'], group: 'core', muscles: ['Core', 'Abdomen'] },
  { keywords: ['abdominal', 'crunch', 'abdomen'], group: 'core', muscles: ['Abdomen'] },
  { keywords: ['elevacion de piernas', 'elevaciones de pierna'], group: 'core', muscles: ['Abdomen inferior'] },
  { keywords: ['russian twist', 'giro ruso', 'oblicuo'], group: 'core', muscles: ['Oblicuos'] },
  { keywords: ['rueda abdominal', 'ab wheel'], group: 'core', muscles: ['Core'] },
  { keywords: ['mountain climber'], group: 'core', muscles: ['Core'] },

  // ----- Cuerpo completo / olímpicos
  { keywords: ['arrancada', 'snatch'], group: 'olimpico', muscles: ['Cuerpo completo'] },
  { keywords: ['dos tiempos', 'clean and jerk', 'envion', 'cargada', 'clean'], group: 'olimpico', muscles: ['Cuerpo completo'] },
  { keywords: ['thruster'], group: 'olimpico', muscles: ['Piernas', 'Hombros'] },
  { keywords: ['burpee', 'wall ball', 'halterofilia', 'olimpico'], group: 'olimpico', muscles: ['Cuerpo completo'] },
  { keywords: ['kettlebell swing', 'swing'], group: 'olimpico', muscles: ['Glúteos', 'Espalda baja'] },
];

export function classifyExercise(name: string): { group: BodyGroupKey; muscles: string[] } {
  const n = normalize(name);
  for (const rule of RULES) {
    if (rule.keywords.some((k) => n.includes(k))) {
      return { group: rule.group, muscles: rule.muscles };
    }
  }
  return { group: 'otros', muscles: [] };
}
