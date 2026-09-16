import { AdminNotificationsGateway } from './admin-notifications.gateway';
import { Role } from '../users/role.enum';

describe('AdminNotificationsGateway', () => {
  let gateway: AdminNotificationsGateway;
  const jwtService = { verifyAsync: jest.fn() };

  const makeClient = (token?: string) => ({
    handshake: { auth: token === undefined ? {} : { token } },
    disconnect: jest.fn(),
    join: jest.fn(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new AdminNotificationsGateway(jwtService as any);
  });

  describe('handleConnection', () => {
    it('joins the admins room for a valid ADMIN token', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', role: Role.ADMIN });
      const client = makeClient('valid-token');

      await gateway.handleConnection(client as any);

      expect(client.join).toHaveBeenCalledWith('admins');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('disconnects a client with no token', async () => {
      const client = makeClient(undefined);

      await gateway.handleConnection(client as any);

      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects a client whose token fails verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));
      const client = makeClient('garbage');

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects a validly-signed token for a non-admin — staff must never join this room', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1', role: Role.STAFF });
      const client = makeClient('staff-token');

      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('broadcastNew', () => {
    it('emits notification:new to the admins room with the provider name', () => {
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      (gateway as any).server = { to };

      gateway.broadcastNew('תנובה');

      expect(to).toHaveBeenCalledWith('admins');
      expect(emit).toHaveBeenCalledWith('notification:new', { providerName: 'תנובה' });
    });
  });
});
