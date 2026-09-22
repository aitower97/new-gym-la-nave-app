import { getBonoWindow } from '../utils/bonoWindow';

// Regresión: getBonoWindow calculaba el inicio del bono con la fecha LOCAL
// del dispositivo en vez de la fecha UTC de plan_assigned_at. Postgres corre
// en sesión UTC, así que quota_period_start() (usada al guardar
// plan_adjustments) siempre da la fecha UTC. Con una asignación tarde en el
// día (p. ej. 22:00 UTC = ya día siguiente en Europa/Madrid en verano), las
// dos fechas divergían: el ajuste se guardaba bajo un día y el cupo lo
// buscaba bajo otro, así que "restar clases" no se reflejaba nunca.
describe('getBonoWindow', () => {
  it('usa la fecha UTC de plan_assigned_at, no la fecha local del dispositivo', () => {
    const { start } = getBonoWindow('2026-09-20T22:00:00Z', 90);
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(8); // septiembre, 0-indexed
    expect(start.getUTCDate()).toBe(20);
  });

  it('suma validityDays en días de calendario UTC', () => {
    const { end } = getBonoWindow('2026-09-20T22:00:00Z', 90);
    expect(end.getUTCFullYear()).toBe(2026);
    expect(end.getUTCMonth()).toBe(11); // diciembre
    expect(end.getUTCDate()).toBe(19);
  });

  it('trata un Date de entrada igual que un string ISO', () => {
    const { start } = getBonoWindow(new Date('2026-09-20T22:00:00Z'), 90);
    expect(start.getUTCDate()).toBe(20);
  });

  it('no cambia de día cuando la hora UTC ya está a primera hora', () => {
    const { start } = getBonoWindow('2026-09-20T05:00:00Z', 90);
    expect(start.getUTCDate()).toBe(20);
  });
});
