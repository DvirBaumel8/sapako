import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../users/role.enum';
import { buildCorsConfig, isAllowedOrigin } from '../cors';

const ADMINS_ROOM = 'admins';

// Built once at module load, mirroring main.ts's REST CORS setup — same
// allowlist and preview-branch pattern, so a Worker/Pages origin allowed to
// call the API is also allowed to open this socket.
const corsConfig = buildCorsConfig(process.env);

/**
 * Pushes a lightweight "something changed" signal to every connected admin
 * the moment an order is handed to WhatsApp. Deliberately carries no
 * notification id or read state — those differ per admin (each has their
 * own row), so the client treats this purely as a cue to refetch
 * /notifications and /notifications/unread-count, which stay the source of
 * truth. Live only while the app is open; there is no offline/closed-app
 * delivery here (that would need Web Push, a separate, larger piece of
 * infrastructure).
 */
@WebSocketGateway({
  namespace: '/admin-notifications',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, isAllowedOrigin(origin, corsConfig));
    },
  },
})
export class AdminNotificationsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Only an authenticated ADMIN may join the room this gateway broadcasts
   * to — staff never receive these events. The same JWT_SECRET-signed
   * token the REST API already trusts is passed via the socket.io
   * handshake's `auth` payload rather than a header, since browsers cannot
   * set arbitrary headers on the WebSocket upgrade request.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        role: Role;
      }>(token);
      if (payload.role !== Role.ADMIN) {
        client.disconnect(true);
        return;
      }
      await client.join(ADMINS_ROOM);
    } catch {
      client.disconnect(true);
    }
  }

  broadcastNew(providerName: string): void {
    this.server.to(ADMINS_ROOM).emit('notification:new', { providerName });
  }
}
