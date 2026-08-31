import { AxiosError, AxiosHeaders } from 'axios';
import { isConflictError, isUnauthorizedError, isUnreachableError } from './errors';

const withStatus = (status: number) =>
  new AxiosError('failed', 'ERR', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  });

// No `response` at all is what axios gives for a request that never got an
// answer: the server is down, DNS failed, or the browser blocked it (a CORS
// preflight failure looks exactly like this from JS).
const withoutResponse = () => new AxiosError('Network Error', 'ERR_NETWORK');

describe('isUnauthorizedError', () => {
  it('is true for 401', () => {
    expect(isUnauthorizedError(withStatus(401))).toBe(true);
  });

  it('is false for other statuses', () => {
    expect(isUnauthorizedError(withStatus(500))).toBe(false);
    expect(isUnauthorizedError(withStatus(409))).toBe(false);
  });

  it('is false when the request never reached the server', () => {
    // The distinction that matters: an unreachable server must not be
    // reported to the user as a wrong password.
    expect(isUnauthorizedError(withoutResponse())).toBe(false);
  });

  it('is false for a non-axios error', () => {
    expect(isUnauthorizedError(new Error('boom'))).toBe(false);
  });
});

describe('isUnreachableError', () => {
  it('is true when there is no response', () => {
    expect(isUnreachableError(withoutResponse())).toBe(true);
  });

  it('is false when the server answered, whatever it said', () => {
    expect(isUnreachableError(withStatus(401))).toBe(false);
    expect(isUnreachableError(withStatus(500))).toBe(false);
  });

  it('is false for a non-axios error', () => {
    expect(isUnreachableError(new Error('boom'))).toBe(false);
  });
});

describe('isConflictError', () => {
  it('still reports 409 as a conflict', () => {
    expect(isConflictError(withStatus(409))).toBe(true);
    expect(isConflictError(withStatus(401))).toBe(false);
  });
});
