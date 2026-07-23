import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { Role } from '../users/role.enum';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(private readonly usersService: UsersService) {}

  async onModuleInit(): Promise<void> {
    const existingUserCount = await this.usersService.countAll();
    if (existingUserCount > 0) {
      return;
    }
    const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!username || !password) {
      this.logger.warn(
        'No users exist and BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD are not set — skipping admin bootstrap.',
      );
      return;
    }
    await this.usersService.create({ username, password, role: Role.ADMIN });
    this.logger.log(`Bootstrapped initial admin user "${username}"`);
  }
}
