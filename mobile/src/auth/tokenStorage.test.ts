import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
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

  describe('on web', () => {
    const originalOS = Platform.OS;
    const localStorageMock = {
      setItem: jest.fn(),
      getItem: jest.fn(),
      removeItem: jest.fn(),
    };

    beforeAll(() => {
      Platform.OS = 'web';
      (globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;
    });

    afterAll(() => {
      Platform.OS = originalOS;
    });

    beforeEach(() => {
      localStorageMock.setItem.mockClear();
      localStorageMock.getItem.mockClear();
      localStorageMock.removeItem.mockClear();
    });

    it('saves a token via localStorage instead of SecureStore', async () => {
      await setToken('jwt-value');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('sapako.accessToken', 'jwt-value');
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it('reads a token via localStorage instead of SecureStore', async () => {
      localStorageMock.getItem.mockReturnValue('jwt-value');

      const token = await getToken();

      expect(token).toBe('jwt-value');
      expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    });

    it('clears a token via localStorage instead of SecureStore', async () => {
      await clearToken();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('sapako.accessToken');
      expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
    });
  });
});
