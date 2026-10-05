import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthenticatedUser } from './jwt.strategy';
import { UsersService } from '../users/users.service';
import { Role } from '../users/role.enum';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  // Tighter than the app-wide default: this is the one route a
  // credential-stuffing script would hit repeatedly.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: { user: AuthenticatedUser }) {
    const user = await this.usersService.findById(req.user.userId);
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      // One flag for the client to check: admins can always edit products.
      canEditProducts: user.role === Role.ADMIN || user.canEditProducts,
    };
  }
}
