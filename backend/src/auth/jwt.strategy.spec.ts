import { JwtStrategy } from './jwt.strategy';
import { Role } from '../users/role.enum';

/**
 * validate() is the seam between a verified token and every authorisation
 * decision the app makes: whatever it returns becomes request.user, which
 * RolesGuard, BranchAccessGuard, ProviderAccessGuard and OrderAccessGuard
 * all read. Rename a property here and those guards start reading undefined
 * — which, for a role check, is a silent denial, and for a user id is a
 * lookup against nobody. The guards' own specs construct request.user
 * themselves, so nothing else pins this shape to what they expect.
 */
describe('JwtStrategy', () => {
  // passport-jwt throws at construction when secretOrKey is undefined, and
  // the strategy reads it from the environment at that moment.
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-only-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  // Constructed per test rather than once: secretOrKey is read inside the
  // constructor, so the env var above must be in place before each call.
  const loadStrategy = () =>
    new JwtStrategy() as JwtStrategy & {
      _verifOpts?: { ignoreExpiration?: boolean };
    };

  it('maps the token subject to userId, which is what the guards read', () => {
    const user = loadStrategy().validate({ sub: 'user-1', role: Role.STAFF });

    expect(user).toEqual({ userId: 'user-1', role: Role.STAFF });
  });

  it.each([Role.ADMIN, Role.STAFF])(
    'carries the %s role through unchanged',
    (role) => {
      // RolesGuard compares this value against the route's required roles by
      // equality, so any transformation here would deny every request.
      const user = loadStrategy().validate({ sub: 'user-1', role });

      expect(user.role).toBe(role);
    },
  );

  it('exposes no other fields, keeping the token payload out of request.user', () => {
    const user = loadStrategy().validate({
      sub: 'user-1',
      role: Role.ADMIN,
      iat: 1700000000,
      exp: 1700003600,
    } as any);

    expect(Object.keys(user).sort()).toEqual(['role', 'userId']);
  });

  it('keeps expiry enforcement on, so an old token stops working', () => {
    // ignoreExpiration must stay false: with it true, a token issued to a
    // since-departed employee would keep working forever.
    //
    // This reads a passport-jwt internal, which is the only place the
    // resolved option is observable. Asserted in two steps on purpose — a
    // single optional-chained check would keep passing if passport renamed
    // the field, quietly verifying nothing. If the first expectation ever
    // fails, this test needs rewriting, not deleting.
    const strategy = loadStrategy();

    expect(strategy._verifOpts).toBeDefined();
    expect(strategy._verifOpts.ignoreExpiration).toBe(false);
  });
});
