import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './uniqueViolation';

describe('isUniqueViolation', () => {
  it('recognises Postgres error code 23505', () => {
    const error = new QueryFailedError('INSERT ...', [], {
      code: '23505',
    } as any);

    expect(isUniqueViolation(error)).toBe(true);
  });

  it('rejects a QueryFailedError with a different code', () => {
    const error = new QueryFailedError('INSERT ...', [], {
      code: '23503', // foreign-key violation
    } as any);

    expect(isUniqueViolation(error)).toBe(false);
  });

  it('rejects an error that is not a QueryFailedError at all', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation('not an error')).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
