import axios from 'axios';

export function isConflictError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 409;
}

export function isUnauthorizedError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

/**
 * True when the request never got an answer at all — the server is down or
 * asleep, DNS failed, or the browser blocked it (a failed CORS preflight
 * looks exactly like this from JavaScript).
 *
 * Worth distinguishing because the alternative is telling someone their
 * password is wrong when the server simply is not there, which sends them
 * looking in entirely the wrong place.
 */
export function isUnreachableError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response === undefined;
}
