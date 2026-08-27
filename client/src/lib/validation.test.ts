import { describe, expect, it } from 'vitest';
import { isValidSouthAfricanId, validateCustomer } from './validation';

describe('validateCustomer', () => {
  it('passes a complete, well-formed customer', () => {
    expect(
      validateCustomer({ name: 'Banele Ndlovu', email: 'b@example.com', phone: '082 555 0123', idNumber: '8001015009087' }),
    ).toEqual({});
  });

  it('reports each invalid field', () => {
    const errors = validateCustomer({ name: 'B', email: 'nope', phone: '123', idNumber: '1234567890123' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'idNumber', 'name', 'phone']);
  });

  it('treats the ID number as optional', () => {
    expect(validateCustomer({ name: 'Banele', email: 'b@example.com', phone: '0825550123' })).toEqual({});
    expect(isValidSouthAfricanId('8001015009088')).toBe(false);
  });
});
