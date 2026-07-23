import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Role } from '../users/role.enum';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  const usersService = { findByUsername: jest.fn() };
  const jwtService = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtService.sign.mockReturnValue('signed.jwt.token');
    service = new AuthService(usersService as any, jwtService as any);
  });

  it('returns an access token for valid credentials', async () => {
    const passwordHash = await bcrypt.hash('secret123', 12);
    usersService.findByUsername.mockResolvedValue({
      id: 'u1',
      username: 'danny',
      passwordHash,
      role: Role.STAFF,
    });

    const result = await service.login('danny', 'secret123');

    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'u1',
      role: Role.STAFF,
    });
  });

  it('rejects an unknown username', async () => {
    usersService.findByUsername.mockResolvedValue(null);

    await expect(service.login('ghost', 'whatever')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    const passwordHash = await bcrypt.hash('secret123', 12);
    usersService.findByUsername.mockResolvedValue({
      id: 'u1',
      username: 'danny',
      passwordHash,
      role: Role.STAFF,
    });

    await expect(service.login('danny', 'wrong-password')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.sign).not.toHaveBeenCalled();
  });
});
