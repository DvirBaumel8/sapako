import * as SecureStore from 'expo-secure-store';
import { getToken, setToken, clearToken } from './tokenStorage';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('tokenStorage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves a token under a fixed key', async () => {
    await setToken('jwt-value');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('sapako.accessToken', 'jwt-value');
  });

  it('reads the stored token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('jwt-value');

    const token = await getToken();

    expect(token).toBe('jwt-value');
  });

  it('clears the stored token', async () => {
    await clearToken();

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('sapako.accessToken');
  });
});
