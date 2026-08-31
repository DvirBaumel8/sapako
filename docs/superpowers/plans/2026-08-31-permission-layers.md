# Permission Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin grant a user a whole department or a whole branch, and block individual providers as exceptions, without losing the per-branch precision the model already has.

**Architecture:** Two new tables alongside the existing `user_provider_access` — `user_department_access` and `user_provider_block`. Resolution (block, then direct grant, then department) lives in one pure function used by `PermissionsService`, exposed through one read endpoint and three intent-based write endpoints so the rule never exists in two codebases.

**Tech Stack:** NestJS, TypeORM, Postgres, Expo/React Native Web, Jest.

**Spec:** `docs/superpowers/specs/2026-08-31-permission-layers-design.md`

---

## File Structure

### Created

| File | Responsibility |
|---|---|
| `backend/src/permissions/user-department-access.entity.ts` | department grant row |
| `backend/src/permissions/user-provider-block.entity.ts` | exception row |
| `backend/src/permissions/resolveAccess.ts` | the resolution rule, pure |
| `backend/src/permissions/resolveAccess.spec.ts` | its tests |
| `backend/src/database/migrations/1700000000011-AddPermissionLayers.ts` | creates both tables |
| `backend/src/users/dto/set-access.dto.ts` | `{ granted: boolean }` |
| `mobile/src/api/access.ts` | client for the four endpoints |

### Modified

| File | Change |
|---|---|
| `backend/src/permissions/permissions.service.ts` | department/block repos, resolution, branch-wide writes |
| `backend/src/permissions/permissions.module.ts` | register the two entities |
| `backend/src/users/users.controller.ts` | replace grant/revoke with the read + three intent endpoints |
| `backend/src/database/data-source.ts` | register the migration |
| `mobile/app/(app)/admin/users/[userId]/access.tsx` | rebuilt around the new endpoints |
| `mobile/src/api/users.ts` | drop `grantProviderAccess` / `revokeProviderAccess`, whose endpoints no longer exist |

---

## Task 1: The resolution rule

Pure and standalone, because it is the one piece that must not be wrong and
the one piece the codebase convention says to test directly.

**Files:**
- Create: `backend/src/permissions/resolveAccess.ts`
- Create: `backend/src/permissions/resolveAccess.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { resolveAccess } from './resolveAccess';

const input = {
  directProviderIds: [] as string[],
  blockedProviderIds: [] as string[],
  grantedDepartmentIds: [] as string[],
  departmentsByProviderId: {} as Record<string, { id: string; name: string }[]>,
};

describe('resolveAccess', () => {
  it('denies a provider with no rule at all', () => {
    expect(resolveAccess('p1', input)).toEqual({ isGranted: false, reason: 'NONE' });
  });

  it('grants a directly granted provider', () => {
    expect(resolveAccess('p1', { ...input, directProviderIds: ['p1'] })).toEqual({
      isGranted: true,
      reason: 'DIRECT',
    });
  });

  it('grants a provider through a granted department', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        grantedDepartmentIds: ['d1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }),
    ).toEqual({ isGranted: true, reason: 'DEPARTMENT', viaDepartmentName: 'חלב' });
  });

  it('lets a block beat a direct grant', () => {
    // Block wins over everything: any weaker order makes an exception
    // unreliable, which is the only reason exceptions exist.
    expect(
      resolveAccess('p1', {
        ...input,
        directProviderIds: ['p1'],
        blockedProviderIds: ['p1'],
      }),
    ).toEqual({ isGranted: false, reason: 'BLOCKED' });
  });

  it('lets a block beat a department grant, and says which department', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        blockedProviderIds: ['p1'],
        grantedDepartmentIds: ['d1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }),
    ).toEqual({ isGranted: false, reason: 'BLOCKED', viaDepartmentName: 'חלב' });
  });

  it('reports a dormant block as a plain denial', () => {
    // Blocked, but no department currently grants it: there is nothing to
    // explain, so the screen shows an ordinary off switch.
    expect(
      resolveAccess('p1', {
        ...input,
        blockedProviderIds: ['p1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }),
    ).toEqual({ isGranted: false, reason: 'BLOCKED' });
  });

  it('grants when any one of several departments is granted', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        grantedDepartmentIds: ['d2'],
        departmentsByProviderId: {
          p1: [{ id: 'd1', name: 'חלב' }, { id: 'd2', name: 'ירקות' }],
        },
      }),
    ).toEqual({ isGranted: true, reason: 'DEPARTMENT', viaDepartmentName: 'ירקות' });
  });

  it('names the alphabetically first granted department when several apply', () => {
    // One of several true answers; chosen deterministically so the
    // explanatory line does not change between reads.
    expect(
      resolveAccess('p1', {
        ...input,
        grantedDepartmentIds: ['d1', 'd2'],
        departmentsByProviderId: {
          p1: [{ id: 'd2', name: 'ירקות' }, { id: 'd1', name: 'חלב' }],
        },
      }).viaDepartmentName,
    ).toBe('חלב');
  });

  it('prefers a direct grant over a department for the stated reason', () => {
    expect(
      resolveAccess('p1', {
        ...input,
        directProviderIds: ['p1'],
        grantedDepartmentIds: ['d1'],
        departmentsByProviderId: { p1: [{ id: 'd1', name: 'חלב' }] },
      }).reason,
    ).toBe('DIRECT');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx jest src/permissions/resolveAccess.spec.ts`
Expected: FAIL — `Cannot find module './resolveAccess'`.

- [ ] **Step 3: Implement**

```ts
export type AccessReason = 'DIRECT' | 'DEPARTMENT' | 'BLOCKED' | 'NONE';

export interface AccessResult {
  isGranted: boolean;
  reason: AccessReason;
  viaDepartmentName?: string;
}

export interface AccessInput {
  directProviderIds: string[];
  blockedProviderIds: string[];
  grantedDepartmentIds: string[];
  departmentsByProviderId: Record<string, { id: string; name: string }[]>;
}

/**
 * Whether a user reaches one provider, and why.
 *
 * The "why" is not decoration: with blocks in the model an off switch has two
 * indistinguishable causes, and the admin screen has to be able to say which.
 */
export function resolveAccess(
  providerId: string,
  input: AccessInput,
): AccessResult {
  const granting = (input.departmentsByProviderId[providerId] ?? [])
    .filter((department) => input.grantedDepartmentIds.includes(department.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const viaDepartmentName = granting[0]?.name;

  if (input.blockedProviderIds.includes(providerId)) {
    // A block with no department granting the provider has nothing to
    // explain, so it is reported as an ordinary denial.
    return viaDepartmentName
      ? { isGranted: false, reason: 'BLOCKED', viaDepartmentName }
      : { isGranted: false, reason: 'BLOCKED' };
  }
  if (input.directProviderIds.includes(providerId)) {
    return { isGranted: true, reason: 'DIRECT' };
  }
  if (viaDepartmentName) {
    return { isGranted: true, reason: 'DEPARTMENT', viaDepartmentName };
  }
  return { isGranted: false, reason: 'NONE' };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && npx jest src/permissions/resolveAccess.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/permissions/resolveAccess.ts backend/src/permissions/resolveAccess.spec.ts
git commit -m "feat(backend): add the permission resolution rule"
```

---

## Task 2: Entities and migration

**Files:**
- Create: `backend/src/permissions/user-department-access.entity.ts`
- Create: `backend/src/permissions/user-provider-block.entity.ts`
- Create: `backend/src/database/migrations/1700000000011-AddPermissionLayers.ts`
- Modify: `backend/src/database/data-source.ts`, `backend/src/permissions/permissions.module.ts`

- [ ] **Step 1: Write both entities**

Mirroring `user-provider-access.entity.ts`, including its cascade behaviour.

`user-department-access.entity.ts`:

```ts
import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Department } from '../departments/department.entity';

/** Grants every provider in the department, including ones added later. */
@Entity('user_department_access')
export class UserDepartmentAccess {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  departmentId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Department, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'departmentId' })
  department: Department;
}
```

`user-provider-block.entity.ts`:

```ts
import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { Provider } from '../providers/provider.entity';

/** An exception: denies a provider the user would otherwise reach. */
@Entity('user_provider_block')
export class UserProviderBlock {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  providerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Provider, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'providerId' })
  provider: Provider;
}
```

- [ ] **Step 2: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPermissionLayers1700000000011 implements MigrationInterface {
  name = 'AddPermissionLayers1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // No existing data is rewritten: rows in user_provider_access are direct
    // grants and keep exactly the meaning they already had, so every user's
    // access is unchanged the moment this ships.
    await queryRunner.query(`
      CREATE TABLE user_department_access (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "departmentId" UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY ("userId", "departmentId")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE user_provider_block (
        "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        PRIMARY KEY ("userId", "providerId")
      )
    `);
    // Resolution reads every rule for one user on each request.
    await queryRunner.query(
      `CREATE INDEX idx_user_department_access_user ON user_department_access("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_user_provider_block_user ON user_provider_block("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE user_provider_block`);
    await queryRunner.query(`DROP TABLE user_department_access`);
  }
}
```

- [ ] **Step 3: Register the migration and the entities**

In `data-source.ts`, import `AddPermissionLayers1700000000011` and append it to
the `migrations` array. In `permissions.module.ts`, add both entities to
`TypeOrmModule.forFeature([...])`.

- [ ] **Step 4: Run it against local Postgres**

```bash
cd backend && DATABASE_URL="postgresql://$(whoami)@localhost:5432/sapako" npx ts-node src/database/migrate.ts
psql -d sapako -tAc "\d user_department_access"
psql -d sapako -tAc "\d user_provider_block"
```

Expected: both tables exist with a composite primary key and the two indexes.

- [ ] **Step 5: Confirm existing access is unchanged**

```bash
psql -d sapako -tAc "select count(*) from user_provider_access"
```

Expected: the same count as before the migration.

- [ ] **Step 6: Commit**

```bash
git add backend/src/permissions backend/src/database
git commit -m "feat(backend): add department-grant and provider-block tables"
```

---

## Task 3: Service — reading resolved access

**Files:**
- Modify: `backend/src/permissions/permissions.service.ts`
- Modify: `backend/src/permissions/permissions.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to the existing spec, following its repository-mock style:

```ts
describe('getAccessForBranch', () => {
  it('reports each provider with its reason', async () => {
    directRepo.find.mockResolvedValue([{ providerId: 'p1' }]);
    departmentRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
    blockRepo.find.mockResolvedValue([{ providerId: 'p3' }]);
    providersService.findAllForBranch.mockResolvedValue([
      { id: 'p1', name: 'אוסם', departments: [] },
      { id: 'p2', name: 'תנובה', departments: [{ id: 'd1', name: 'חלב' }] },
      { id: 'p3', name: 'שטראוס', departments: [{ id: 'd1', name: 'חלב' }] },
    ]);
    departmentsService.findByBranch.mockResolvedValue([{ id: 'd1', name: 'חלב' }]);

    const result = await service.getAccessForBranch('u1', 'b1');

    expect(result.departments).toEqual([{ id: 'd1', name: 'חלב', isGranted: true }]);
    expect(result.providers).toEqual([
      { id: 'p1', name: 'אוסם', isGranted: true, reason: 'DIRECT' },
      { id: 'p2', name: 'תנובה', isGranted: true, reason: 'DEPARTMENT', viaDepartmentName: 'חלב' },
      { id: 'p3', name: 'שטראוס', isGranted: false, reason: 'BLOCKED', viaDepartmentName: 'חלב' },
    ]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && npx jest src/permissions/permissions.service.spec.ts`
Expected: FAIL — `service.getAccessForBranch is not a function`.

- [ ] **Step 3: Implement**

Inject `UserDepartmentAccess` and `UserProviderBlock` repositories plus
`ProvidersService` and `DepartmentsService`, then:

```ts
async getAccessForBranch(userId: string, branchId: string) {
  const [direct, departmentGrants, blocks, providers, departments] =
    await Promise.all([
      this.accessRepo.find({ where: { userId } }),
      this.departmentAccessRepo.find({ where: { userId } }),
      this.blockRepo.find({ where: { userId } }),
      this.providersService.findAllForBranch(branchId),
      this.departmentsService.findByBranch(branchId),
    ]);

  const input = {
    directProviderIds: direct.map((row) => row.providerId),
    blockedProviderIds: blocks.map((row) => row.providerId),
    grantedDepartmentIds: departmentGrants.map((row) => row.departmentId),
    departmentsByProviderId: Object.fromEntries(
      providers.map((provider) => [
        provider.id,
        (provider.departments ?? []).map((d) => ({ id: d.id, name: d.name })),
      ]),
    ),
  };

  return {
    departments: departments.map((department) => ({
      id: department.id,
      name: department.name,
      isGranted: input.grantedDepartmentIds.includes(department.id),
    })),
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      ...resolveAccess(provider.id, input),
    })),
  };
}
```

- [ ] **Step 4: Update the existing access checks to use the same rule**

`hasProviderAccess` and `getAccessibleProviderIds` currently read only
`user_provider_access`, so a department grant would let a user see a provider
on the permissions screen while the API still refused their order. Both must
resolve through `resolveAccess` over the same three inputs.

Add a test that a department-granted provider passes `hasProviderAccess`, and
one that a blocked provider fails it even when directly granted.

- [ ] **Step 5: Run the tests**

Run: `cd backend && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/permissions
git commit -m "feat(backend): resolve access through departments and blocks"
```

---

## Task 4: Controller — the four endpoints

**Files:**
- Create: `backend/src/users/dto/set-access.dto.ts`
- Modify: `backend/src/users/users.controller.ts`

- [ ] **Step 1: Write the DTO**

```ts
import { IsBoolean } from 'class-validator';

export class SetAccessDto {
  @IsBoolean()
  granted: boolean;
}
```

- [ ] **Step 2: Replace the endpoints**

Remove `POST :id/provider-access` and `DELETE :id/provider-access/:providerId`.
Add, all guarded by `JwtAuthGuard` + `RolesGuard(ADMIN)` as the removed ones
were:

```ts
@Get(':id/access')
getAccess(@Param('id') userId: string, @Query('branchId') branchId: string) {
  return this.permissionsService.getAccessForBranch(userId, branchId);
}

@Put(':id/providers/:providerId/access')
setProviderAccess(
  @Param('id') userId: string,
  @Param('providerId') providerId: string,
  @Body() dto: SetAccessDto,
) {
  return this.permissionsService.setProviderAccess(userId, providerId, dto.granted);
}

@Put(':id/departments/:departmentId/access')
setDepartmentAccess(
  @Param('id') userId: string,
  @Param('departmentId') departmentId: string,
  @Body() dto: SetAccessDto,
) {
  return this.permissionsService.setDepartmentAccess(userId, departmentId, dto.granted);
}

@Put(':id/branches/:branchId/access')
setBranchAccess(
  @Param('id') userId: string,
  @Param('branchId') branchId: string,
  @Body() dto: SetAccessDto,
) {
  return this.permissionsService.setBranchAccess(userId, branchId, dto.granted);
}
```

- [ ] **Step 3: Write the failing tests for the three writes**

```ts
describe('setProviderAccess', () => {
  it('removes the block rather than adding a grant when a department already grants it', async () => {
    departmentRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
    providersService.findById.mockResolvedValue({
      id: 'p1',
      departments: [{ id: 'd1', name: 'חלב' }],
    });

    await service.setProviderAccess('u1', 'p1', true);

    expect(blockRepo.delete).toHaveBeenCalledWith({ userId: 'u1', providerId: 'p1' });
    expect(directRepo.save).not.toHaveBeenCalled();
  });

  it('adds a direct grant when nothing else would reach the provider', async () => {
    departmentRepo.find.mockResolvedValue([]);
    providersService.findById.mockResolvedValue({ id: 'p1', departments: [] });

    await service.setProviderAccess('u1', 'p1', true);

    expect(directRepo.save).toHaveBeenCalledWith({ userId: 'u1', providerId: 'p1' });
  });

  it('blocks a department-granted provider when switched off', async () => {
    departmentRepo.find.mockResolvedValue([{ departmentId: 'd1' }]);
    providersService.findById.mockResolvedValue({
      id: 'p1',
      departments: [{ id: 'd1', name: 'חלב' }],
    });

    await service.setProviderAccess('u1', 'p1', false);

    expect(blockRepo.save).toHaveBeenCalledWith({ userId: 'u1', providerId: 'p1' });
  });

  it('only removes the grant when switching off a directly granted provider', async () => {
    // Adding a block here too would be redundant, and would outlive the grant
    // as a dormant rule nobody asked for.
    departmentRepo.find.mockResolvedValue([]);
    providersService.findById.mockResolvedValue({ id: 'p1', departments: [] });

    await service.setProviderAccess('u1', 'p1', false);

    expect(directRepo.delete).toHaveBeenCalledWith({ userId: 'u1', providerId: 'p1' });
    expect(blockRepo.save).not.toHaveBeenCalled();
  });

  it('never leaves a direct grant and a block in place together', async () => {
    departmentRepo.find.mockResolvedValue([]);
    providersService.findById.mockResolvedValue({ id: 'p1', departments: [] });

    await service.setProviderAccess('u1', 'p1', true);

    expect(blockRepo.delete).toHaveBeenCalledWith({ userId: 'u1', providerId: 'p1' });
  });
});

describe('setDepartmentAccess', () => {
  it('leaves a direct grant inside the department intact when revoked', async () => {
    // Spec section 3.3: the two rules are independent, and dropping one
    // because an unrelated one was withdrawn would be surprising.
    await service.setDepartmentAccess('u1', 'd1', false);

    expect(departmentAccessRepo.delete).toHaveBeenCalledWith({
      userId: 'u1',
      departmentId: 'd1',
    });
    expect(directRepo.delete).not.toHaveBeenCalled();
  });
});

describe('setBranchAccess', () => {
  it('leaves the other branch untouched when clearing one', async () => {
    providersService.findAllForBranch.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    departmentsService.findByBranch.mockResolvedValue([{ id: 'd1' }]);

    await service.setBranchAccess('u1', 'b1', false);

    expect(directRepo.delete).toHaveBeenCalledWith({
      userId: 'u1',
      providerId: In(['p1', 'p2']),
    });
    expect(departmentAccessRepo.delete).toHaveBeenCalledWith({
      userId: 'u1',
      departmentId: In(['d1']),
    });
  });
});
```

- [ ] **Step 3b: Run them and watch them fail**

Run: `cd backend && npx jest src/permissions/permissions.service.spec.ts`
Expected: FAIL — the three methods do not exist.

- [ ] **Step 3c: Implement the three writes**

```ts
/** Grants or revokes one provider, choosing the mechanism the rule requires. */
async setProviderAccess(userId: string, providerId: string, granted: boolean) {
  const provider = await this.providersService.findById(providerId);
  const departmentGrants = await this.departmentAccessRepo.find({ where: { userId } });
  const grantedDepartmentIds = departmentGrants.map((row) => row.departmentId);
  const reachedByDepartment = (provider.departments ?? []).some((department) =>
    grantedDepartmentIds.includes(department.id),
  );

  if (granted) {
    // Clearing the block is always right; a direct grant is only needed when
    // no department would reach it anyway.
    await this.blockRepo.delete({ userId, providerId });
    if (!reachedByDepartment) {
      await this.accessRepo.save({ userId, providerId });
    }
    return;
  }

  await this.accessRepo.delete({ userId, providerId });
  if (reachedByDepartment) {
    // Only a department keeps it reachable, so an exception is required.
    await this.blockRepo.save({ userId, providerId });
  }
}

async setDepartmentAccess(userId: string, departmentId: string, granted: boolean) {
  if (granted) {
    await this.departmentAccessRepo.save({ userId, departmentId });
    return;
  }
  // Direct grants inside the department are left alone — see spec 3.3.
  await this.departmentAccessRepo.delete({ userId, departmentId });
}

async setBranchAccess(userId: string, branchId: string, granted: boolean) {
  const [providers, departments] = await Promise.all([
    this.providersService.findAllForBranch(branchId),
    this.departmentsService.findByBranch(branchId),
  ]);
  const providerIds = providers.map((provider) => provider.id);
  const departmentIds = departments.map((department) => department.id);
  if (providerIds.length === 0) return;

  if (granted) {
    await this.blockRepo.delete({ userId, providerId: In(providerIds) });
    await this.accessRepo.save(providerIds.map((providerId) => ({ userId, providerId })));
    return;
  }

  await this.accessRepo.delete({ userId, providerId: In(providerIds) });
  await this.blockRepo.delete({ userId, providerId: In(providerIds) });
  if (departmentIds.length > 0) {
    await this.departmentAccessRepo.delete({ userId, departmentId: In(departmentIds) });
  }
}
```

Scoping every delete by this branch's ids is what keeps the other branch
untouched.

- [ ] **Step 3d: Run the tests**

Run: `cd backend && npm test`
Expected: all pass.

- [ ] **Step 4: Verify against a running server**

```bash
cd backend && npm run start:dev
# then, with an admin token and a STAFF user id:
curl -s "$API/users/$UID/access?branchId=$BID" -H "Authorization: Bearer $TOKEN" | head -c 400
curl -s -X PUT "$API/users/$UID/departments/$DID/access" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"granted":true}'
curl -s "$API/users/$UID/access?branchId=$BID" -H "Authorization: Bearer $TOKEN" | head -c 400
```

Expected: providers in that department flip to `"reason":"DEPARTMENT"`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users backend/src/permissions
git commit -m "feat(backend): intent-based permission endpoints"
```

---

## Task 5: The screen

**Files:**
- Create: `mobile/src/api/access.ts`
- Modify: `mobile/app/(app)/admin/users/[userId]/access.tsx`

- [ ] **Step 1: Write the API client**

```ts
import { apiClient } from './client';

export type AccessReason = 'DIRECT' | 'DEPARTMENT' | 'BLOCKED' | 'NONE';

export interface AccessView {
  departments: { id: string; name: string; isGranted: boolean }[];
  providers: {
    id: string;
    name: string;
    isGranted: boolean;
    reason: AccessReason;
    viaDepartmentName?: string;
  }[];
}

export async function fetchAccess(userId: string, branchId: string): Promise<AccessView> {
  const { data } = await apiClient.get(`/users/${userId}/access`, { params: { branchId } });
  return data;
}

export async function setProviderAccess(userId: string, providerId: string, granted: boolean) {
  await apiClient.put(`/users/${userId}/providers/${providerId}/access`, { granted });
}

export async function setDepartmentAccess(userId: string, departmentId: string, granted: boolean) {
  await apiClient.put(`/users/${userId}/departments/${departmentId}/access`, { granted });
}

export async function setBranchAccess(userId: string, branchId: string, granted: boolean) {
  await apiClient.put(`/users/${userId}/branches/${branchId}/access`, { granted });
}
```

- [ ] **Step 2: Rebuild the screen**

Replace the two queries (all users + branch providers) with one
`['access', userId, branchId]` query calling `fetchAccess`. Sections, in order:

1. Branch chips — restyle to `common.chip` so they read as a control rather
   than a heading. This is the whole of the "branches are missing" complaint.
2. `הרשאה לכל הספקים בסניף` — one control calling `setBranchAccess`.
3. `מחלקות` — a switch per department calling `setDepartmentAccess`.
4. `ספקים` — a switch per provider calling `setProviderAccess`, each row
   showing its reason underneath when it has one:
   - `DIRECT` or `NONE` → nothing
   - `DEPARTMENT` → `דרך מחלקה: {viaDepartmentName}`
   - `BLOCKED` with a name → `חסום למרות מחלקה: {viaDepartmentName}`
   - `BLOCKED` without → nothing (a dormant block, spec §3.3)

Keep the existing optimistic pattern for a single provider switch. A
department or branch write changes many rows at once, so those instead await
the call and refetch the query rather than predicting the result locally.

- [ ] **Step 3: Verify in a browser at iPhone size**

```bash
cd mobile && API_BASE_URL=http://localhost:3000 npm run build:web && npx serve dist -s -l 8080
```

Check, as an admin, on a STAFF user:
1. Granting a department turns its providers on, each reading `דרך מחלקה`.
2. Turning one of those off leaves it off reading `חסום למרות מחלקה`, with the
   rest of the department still on.
3. Turning it back on clears the block and it reads `דרך מחלקה` again.
4. Select-all turns every provider in the visible branch on; switching to the
   other branch shows it unaffected.
5. `npx tsc --noEmit && npm test` pass.

- [ ] **Step 4: Commit**

```bash
git add mobile
git commit -m "feat(mobile): grant permissions by department, branch, and exception"
```

---

## Task 6: End-to-end check as the affected user

The point of the feature is what a STAFF user can reach, and every test above
verifies it from the admin's side only.

- [ ] **Step 1: Create a STAFF user and grant one department**

- [ ] **Step 2: Log in as that user and confirm**

- Only the providers in that department appear on the providers list.
- A provider blocked as an exception does not appear, even though its
  department is granted.
- Opening that provider's order screen directly by URL is refused by the API,
  not merely hidden in the UI.

Step 2's last point is the one that matters: if `hasProviderAccess` were not
updated in Task 3 Step 4, the list would hide the provider while the API still
served it.

- [ ] **Step 3: Commit any fixes, then deploy**

Render runs the migration on deploy. Confirm afterwards:

```bash
psql "$NEON" -tAc "\d user_department_access"
```
