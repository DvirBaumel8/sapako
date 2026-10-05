import { renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useAuth } from './AuthContext';
import { useRequireProductEditor } from './useRequireProductEditor';

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('./AuthContext', () => ({ useAuth: jest.fn() }));

const setAuth = (canEditProducts: boolean, isCapabilityLoading: boolean) =>
  (useAuth as jest.Mock).mockReturnValue({ canEditProducts, isCapabilityLoading });

beforeEach(() => jest.clearAllMocks());

describe('useRequireProductEditor', () => {
  it('redirects staff without the flag once loaded', async () => {
    setAuth(false, false);
    await renderHook(() => useRequireProductEditor());
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('does not redirect while the capability is loading', async () => {
    setAuth(false, true);
    await renderHook(() => useRequireProductEditor());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not redirect an editor or admin', async () => {
    setAuth(true, false);
    await renderHook(() => useRequireProductEditor());
    expect(router.replace).not.toHaveBeenCalled();
  });
});
