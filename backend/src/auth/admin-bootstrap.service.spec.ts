import { Logger } from '@nestjs/common';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { Role } from '../users/role.enum';

describe('AdminBootstrapService', () => {
  const usersService = { countAll: jest.fn(), create: jest.fn() };
  let service: AdminBootstrapService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    service = new AdminBootstrapService(usersService as any);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('creates an ADMIN user from env vars when no users exist', async () => {
    usersService.countAll.mockResolvedValue(0);
    process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'strong-password';

    await service.onModuleInit();

    expect(usersService.create).toHaveBeenCalledWith({
      username: 'admin',
      password: 'strong-password',
      role: Role.ADMIN,
    });
  });

  it('does not create a user when no users exist but env vars are missing', async () => {
    usersService.countAll.mockResolvedValue(0);
    delete process.env.BOOTSTRAP_ADMIN_USERNAME;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    await service.onModuleInit();

    expect(usersService.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('does not create a user when only one of the two env vars is set', async () => {
    usersService.countAll.mockResolvedValue(0);
    process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

    await service.onModuleInit();

    expect(usersService.create).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('does not create a user when users already exist, even if env vars are set', async () => {
    usersService.countAll.mockResolvedValue(1);
    process.env.BOOTSTRAP_ADMIN_USERNAME = 'admin';
    process.env.BOOTSTRAP_ADMIN_PASSWORD = 'strong-password';

    await service.onModuleInit();

    expect(usersService.create).not.toHaveBeenCalled();
  });
});
