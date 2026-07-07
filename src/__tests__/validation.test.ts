import {
  loginSchema,
  signUpSchema,
  registerSchema,
  profileUpdateSchema,
  classCapacitySchema,
  validateData,
} from '../utils/validation';

// ─── Login Schema ─────────────────────────────────────────────────

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = validateData(loginSchema, {
      email: 'user@example.com',
      password: 'abc123',
    });
    expect(result.success).toBe(true);
  });

  it('normalizes email to lowercase', () => {
    const result = validateData(loginSchema, {
      email: 'User@Example.COM',
      password: 'abc123',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
    }
  });

  it('rejects empty email', () => {
    const result = validateData(loginSchema, { email: '', password: 'abc123' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = validateData(loginSchema, { email: 'not-an-email', password: 'abc123' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = validateData(loginSchema, { email: 'a@b.com', password: '12345' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('6 caracteres');
    }
  });
});

// ─── SignUp Schema ────────────────────────────────────────────────

describe('signUpSchema', () => {
  const validSignUp = { email: 'test@test.com', password: 'Abcdef1!' };

  it('accepts strong password', () => {
    const result = validateData(signUpSchema, validSignUp);
    expect(result.success).toBe(true);
  });

  it('rejects password without uppercase', () => {
    const result = validateData(signUpSchema, { ...validSignUp, password: 'abcdef1!' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('mayúscula');
  });

  it('rejects password without lowercase', () => {
    const result = validateData(signUpSchema, { ...validSignUp, password: 'ABCDEF1!' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('minúscula');
  });

  it('rejects password without number', () => {
    const result = validateData(signUpSchema, { ...validSignUp, password: 'Abcdefg!' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('número');
  });

  it('rejects password without special char', () => {
    const result = validateData(signUpSchema, { ...validSignUp, password: 'Abcdefg1' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('especial');
  });

  it('rejects password shorter than 8 chars', () => {
    const result = validateData(signUpSchema, { ...validSignUp, password: 'Ab1!' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('8 caracteres');
  });
});

// ─── Register Schema ──────────────────────────────────────────────

describe('registerSchema', () => {
  const validRegister = {
    full_name: 'Juan García',
    email: 'juan@example.com',
    phone: '612345678',
    birth_date: '15/03/1990',
    password: 'Secure1!pass',
    confirm_password: 'Secure1!pass',
    accept_terms: true,
  };

  it('accepts valid registration', () => {
    const result = validateData(registerSchema, validRegister);
    expect(result.success).toBe(true);
  });

  it('rejects mismatched passwords', () => {
    const result = validateData(registerSchema, {
      ...validRegister,
      confirm_password: 'DifferentPass1!',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('coinciden');
  });

  it('rejects short name', () => {
    const result = validateData(registerSchema, { ...validRegister, full_name: 'A' });
    expect(result.success).toBe(false);
  });

  it('accepts valid Spanish phone', () => {
    const result = validateData(registerSchema, { ...validRegister, phone: '612345678' });
    expect(result.success).toBe(true);
  });

  it('accepts Spanish phone with prefix', () => {
    const result = validateData(registerSchema, { ...validRegister, phone: '+34612345678' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid phone', () => {
    const result = validateData(registerSchema, { ...validRegister, phone: '123' });
    expect(result.success).toBe(false);
  });

  it('rejects missing phone', () => {
    const result = validateData(registerSchema, { ...validRegister, phone: '' });
    expect(result.success).toBe(false);
  });

  it('accepts valid birth date', () => {
    const result = validateData(registerSchema, { ...validRegister, birth_date: '15/03/1990' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid birth date format', () => {
    const result = validateData(registerSchema, { ...validRegister, birth_date: '1990-03-15' });
    expect(result.success).toBe(false);
  });

  it('rejects registration under the minimum age', () => {
    const underage = new Date();
    underage.setFullYear(underage.getFullYear() - 10);
    const dateStr = `${underage.getDate().toString().padStart(2, '0')}/${(underage.getMonth() + 1).toString().padStart(2, '0')}/${underage.getFullYear()}`;
    const result = validateData(registerSchema, { ...validRegister, birth_date: dateStr });
    expect(result.success).toBe(false);
  });

  it('rejects registration without accepting terms', () => {
    const result = validateData(registerSchema, { ...validRegister, accept_terms: false });
    expect(result.success).toBe(false);
  });
});

// ─── Profile Update Schema ────────────────────────────────────────

describe('profileUpdateSchema', () => {
  it('accepts valid update', () => {
    const result = validateData(profileUpdateSchema, { full_name: 'María López' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = validateData(profileUpdateSchema, { full_name: '' });
    expect(result.success).toBe(false);
  });

  it('trims whitespace from name', () => {
    const result = validateData(profileUpdateSchema, { full_name: '  Ana  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.full_name).toBe('Ana');
  });
});

// ─── Class Capacity Schema ────────────────────────────────────────

describe('classCapacitySchema', () => {
  it('accepts valid capacity', () => {
    expect(validateData(classCapacitySchema, { max_spots: 5 }).success).toBe(true);
    expect(validateData(classCapacitySchema, { max_spots: 1 }).success).toBe(true);
    expect(validateData(classCapacitySchema, { max_spots: 10 }).success).toBe(true);
  });

  it('rejects zero', () => {
    expect(validateData(classCapacitySchema, { max_spots: 0 }).success).toBe(false);
  });

  it('rejects over 10', () => {
    expect(validateData(classCapacitySchema, { max_spots: 11 }).success).toBe(false);
  });

  it('rejects decimals', () => {
    expect(validateData(classCapacitySchema, { max_spots: 5.5 }).success).toBe(false);
  });
});

// ─── validateData helper ──────────────────────────────────────────

describe('validateData', () => {
  it('returns first error message on failure', () => {
    const result = validateData(loginSchema, { email: '', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('returns parsed data on success', () => {
    const result = validateData(loginSchema, { email: 'A@B.COM', password: 'password' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('a@b.com');
    }
  });
});
