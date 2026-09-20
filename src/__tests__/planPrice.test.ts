import { formatPlanPrice } from '../utils/planPrice';

describe('formatPlanPrice', () => {
  it('muestra "Gratis" en un plan a 0, que es la clase de prueba', () => {
    expect(formatPlanPrice(0, 'EUR')).toBe('Gratis');
    expect(formatPlanPrice('0.00', '€', 0)).toBe('Gratis');
  });

  it('pega el símbolo a la cifra y separa el código de divisa', () => {
    expect(formatPlanPrice(60, '€', 0)).toBe('60€');
    expect(formatPlanPrice(60, 'EUR')).toBe('60.00 EUR');
  });

  it('acepta el precio como texto, que es como llega de Supabase', () => {
    expect(formatPlanPrice('50.00', 'EUR')).toBe('50.00 EUR');
  });

  // Un precio ilegible no debe acabar pintado como "Gratis": regalaría el
  // plan por un fallo de datos.
  it('distingue un precio ausente o inválido de uno gratuito', () => {
    expect(formatPlanPrice(null)).toBe('—');
    expect(formatPlanPrice(undefined)).toBe('—');
    expect(formatPlanPrice('vacio')).toBe('—');
  });

  it('trata un precio negativo como gratuito en vez de mostrarlo', () => {
    expect(formatPlanPrice(-5, 'EUR')).toBe('Gratis');
  });
});
