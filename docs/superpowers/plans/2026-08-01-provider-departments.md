# Provider Departments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-branch departments (מחלקות), a many-to-many relation from providers to departments (required, at least one), department CRUD (admin-only, with optional multi-branch creation), a departments browsing tab in the main app nav, and provider editing (which doesn't exist in the app yet).

**Architecture:** Backend: new `DepartmentsModule` mirroring the existing `ProvidersModule` shape (entity/service/controller/spec), plus a `provider_departments` join table and `ManyToMany` relation on `Provider`. Mobile: new API client functions and six new/modified Expo Router screens under `app/(app)/`, reusing existing UI patterns (branch chips, admin list-with-edit-icon, `Stack.Screen` header customization).

**Tech Stack:** NestJS + TypeORM + PostgreSQL (raw-SQL migrations, no `synchronize`), Expo Router + React Query + Axios, Jest for backend unit tests.

**Design doc:** `docs/superpowers/specs/2026-08-01-provider-departments-design.md`

---

## Backend

### Task 1: `Department` entity + `departments` table migration

**Files:**
- Create: `backend/src/departments/department.entity.ts`
- Create: `backend/src/database/migrations/1700000000007-CreateDepartments.ts`
- Modify: `backend/src/database/data-source.ts`

- [ ] **Step 1: Create the entity**

```typescript
// backend/src/departments/department.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Branch } from '../branches/branch.entity';

@Entity('departments')
@Unique(['branchId', 'name'])
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column()
  name: string;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Write the migration**

```typescript
// backend/src/database/migrations/1700000000007-CreateDepartments.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDepartments1700000000007 implements MigrationInterface {
  name = 'CreateDepartments1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name VARCHAR NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("branchId", name)
      );
      CREATE INDEX idx_departments_branch_id ON departments("branchId");

      INSERT INTO departments ("branchId", name)
      SELECT b.id, d.name
      FROM branches b
      CROSS JOIN (VALUES
        ('יין/אלכוהול'),
        ('חומרי ניקוי'),
        ('פיצוחים'),
        ('מוצרי חלב'),
        ('קפואים'),
        ('כללי')
      ) AS d(name);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE departments;
    `);
  }
}
```

- [ ] **Step 3: Register the migration in the data source**

Modify `backend/src/database/data-source.ts` — add the import and append to the
`migrations` array (after `CreateOrders1700000000006`):

```typescript
import { CreateDepartments1700000000007 } from './migrations/1700000000007-CreateDepartments';
```

```typescript
  migrations: [
    EnableUuidExtension1700000000000,
    CreateUsers1700000000001,
    CreateBranches1700000000002,
    CreateProviders1700000000003,
    CreateUserProviderAccess1700000000004,
    CreateProducts1700000000005,
    CreateOrders1700000000006,
    CreateDepartments1700000000007,
  ],
```

- [ ] **Step 4: Run the migration against the local backend DB**

Run: `cd backend && npm run migration:run`
Expected: output ends with the process exiting 0 (no error). Verify with:
`psql -d sapako -c "SELECT name FROM departments ORDER BY name;"` — expect 6
rows per existing branch (יין/אלכוהול, חומרי ניקוי, כללי, מוצרי חלב, פיצוחים, קפואים).

- [ ] **Step 5: Commit**

```bash
git add backend/src/departments/department.entity.ts backend/src/database/migrations/1700000000007-CreateDepartments.ts backend/src/database/data-source.ts
git commit -m "feat(backend): add departments table with per-branch seed data"
```

---

### Task 2: `provider_departments` join table migration

**Files:**
- Create: `backend/src/database/migrations/1700000000008-CreateProviderDepartments.ts`
- Modify: `backend/src/database/data-source.ts`

- [ ] **Step 1: Write the migration**

```typescript
// backend/src/database/migrations/1700000000008-CreateProviderDepartments.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProviderDepartments1700000000008
  implements MigrationInterface
{
  name = 'CreateProviderDepartments1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE provider_departments (
        "providerId" UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        "departmentId" UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY ("providerId", "departmentId")
      );
      CREATE INDEX idx_provider_departments_department_id ON provider_departments("departmentId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE provider_departments;
    `);
  }
}
```

- [ ] **Step 2: Register the migration in the data source**

Modify `backend/src/database/data-source.ts` — add the import and append to
the `migrations` array (after `CreateDepartments1700000000007`):

```typescript
import { CreateProviderDepartments1700000000008 } from './migrations/1700000000008-CreateProviderDepartments';
```

```typescript
  migrations: [
    EnableUuidExtension1700000000000,
    CreateUsers1700000000001,
    CreateBranches1700000000002,
    CreateProviders1700000000003,
    CreateUserProviderAccess1700000000004,
    CreateProducts1700000000005,
    CreateOrders1700000000006,
    CreateDepartments1700000000007,
    CreateProviderDepartments1700000000008,
  ],
```

- [ ] **Step 3: Run the migration**

Run: `cd backend && npm run migration:run`
Expected: exits 0. Verify: `psql -d sapako -c "\d provider_departments"` shows
the two-column composite-PK table.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/1700000000008-CreateProviderDepartments.ts backend/src/database/data-source.ts
git commit -m "feat(backend): add provider_departments join table"
```

---

### Task 3: `DepartmentsService` (TDD)

**Files:**
- Create: `backend/src/departments/departments.service.spec.ts`
- Create: `backend/src/departments/departments.service.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
// backend/src/departments/departments.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { DepartmentsService } from './departments.service';
import { Department } from './department.entity';
import { BranchesService } from '../branches/branches.service';

describe('DepartmentsService', () => {
  let service: DepartmentsService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOneBy: jest.fn(),
  };
  const mockBranchesService = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: getRepositoryToken(Department), useValue: mockRepo },
        { provide: BranchesService, useValue: mockBranchesService },
      ],
    }).compile();
    service = module.get(DepartmentsService);
  });

  it('creates a department under a branch that exists', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'd1', ...data }),
    );

    const department = await service.create('b1', { name: 'מוצרי חלב' });

    expect(mockBranchesService.findById).toHaveBeenCalledWith('b1');
    expect(department).toMatchObject({
      id: 'd1',
      branchId: 'b1',
      name: 'מוצרי חלב',
    });
  });

  it('rejects with NotFoundException when the branch does not exist, without saving', async () => {
    mockBranchesService.findById.mockRejectedValue(
      new NotFoundException('Branch not found'),
    );

    await expect(
      service.create('missing', { name: 'מוצרי חלב' }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('lists all departments (active and inactive) for a branch', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'd1', name: 'מוצרי חלב', isActive: true },
      { id: 'd2', name: 'ישן', isActive: false },
    ]);

    const departments = await service.findAllForBranch('b1');

    expect(mockRepo.find).toHaveBeenCalledWith({ where: { branchId: 'b1' } });
    expect(departments).toHaveLength(2);
  });

  it('finds departments by a list of ids', async () => {
    mockRepo.find.mockResolvedValue([{ id: 'd1' }, { id: 'd2' }]);

    const departments = await service.findByIds(['d1', 'd2']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { id: In(['d1', 'd2']) },
    });
    expect(departments).toHaveLength(2);
  });

  it('returns an empty array from findByIds without querying when given no ids', async () => {
    const departments = await service.findByIds([]);

    expect(mockRepo.find).not.toHaveBeenCalled();
    expect(departments).toEqual([]);
  });

  it('throws NotFoundException when finding a department by an unknown id', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      'Department not found',
    );
  });

  it('updates a department and persists the merged fields', async () => {
    mockRepo.findOneBy.mockResolvedValue({
      id: 'd1',
      branchId: 'b1',
      name: 'מוצרי חלב',
      isActive: true,
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('d1', {
      name: 'מוצרי חלב ומעדנים',
      isActive: false,
    });

    expect(updated).toMatchObject({
      id: 'd1',
      name: 'מוצרי חלב ומעדנים',
      isActive: false,
    });
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'מוצרי חלב ומעדנים', isActive: false }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/departments/departments.service.spec.ts`
Expected: FAIL — `Cannot find module './departments.service'`

- [ ] **Step 3: Write the implementation**

```typescript
// backend/src/departments/departments.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Department } from './department.entity';
import { BranchesService } from '../branches/branches.service';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentsRepo: Repository<Department>,
    private readonly branchesService: BranchesService,
  ) {}

  async create(
    branchId: string,
    input: { name: string },
  ): Promise<Department> {
    await this.branchesService.findById(branchId);
    const entity = this.departmentsRepo.create({ branchId, ...input });
    return this.departmentsRepo.save(entity);
  }

  findAllForBranch(branchId: string): Promise<Department[]> {
    return this.departmentsRepo.find({ where: { branchId } });
  }

  findByIds(ids: string[]): Promise<Department[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.departmentsRepo.find({ where: { id: In(ids) } });
  }

  async findById(id: string): Promise<Department> {
    const department = await this.departmentsRepo.findOneBy({ id });
    if (!department) {
      throw new NotFoundException('Department not found');
    }
    return department;
  }

  async update(
    id: string,
    input: { name?: string; isActive?: boolean },
  ): Promise<Department> {
    const department = await this.findById(id);
    Object.assign(department, input);
    return this.departmentsRepo.save(department);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/departments/departments.service.spec.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/departments/departments.service.ts backend/src/departments/departments.service.spec.ts
git commit -m "feat(backend): add DepartmentsService with unit tests"
```

---

### Task 4: `DepartmentsModule`, controllers, and DTOs

**Files:**
- Create: `backend/src/departments/dto/create-department.dto.ts`
- Create: `backend/src/departments/dto/update-department.dto.ts`
- Create: `backend/src/departments/departments.controller.ts`
- Create: `backend/src/departments/departments.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the DTOs**

```typescript
// backend/src/departments/dto/create-department.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
```

```typescript
// backend/src/departments/dto/update-department.dto.ts
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateDepartmentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

- [ ] **Step 2: Create the controllers**

```typescript
// backend/src/departments/departments.controller.ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../users/role.enum';
import { BranchAccessGuard } from '../permissions/branch-access.guard';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Department } from './department.entity';

@Controller('branches/:branchId/departments')
@UseGuards(JwtAuthGuard, BranchAccessGuard, RolesGuard)
export class BranchDepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  findForBranch(@Param('branchId') branchId: string): Promise<Department[]> {
    return this.departmentsService.findAllForBranch(branchId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(
    @Param('branchId') branchId: string,
    @Body() dto: CreateDepartmentDto,
  ): Promise<Department> {
    return this.departmentsService.create(branchId, dto);
  }
}

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentAdminController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ): Promise<Department> {
    return this.departmentsService.update(id, dto);
  }
}
```

- [ ] **Step 3: Create the module**

```typescript
// backend/src/departments/departments.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity';
import { DepartmentsService } from './departments.service';
import {
  BranchDepartmentsController,
  DepartmentAdminController,
} from './departments.controller';
import { PermissionsModule } from '../permissions/permissions.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Department]),
    PermissionsModule,
    BranchesModule,
  ],
  providers: [DepartmentsService],
  controllers: [BranchDepartmentsController, DepartmentAdminController],
  exports: [DepartmentsService, TypeOrmModule],
})
export class DepartmentsModule {}
```

- [ ] **Step 4: Register the module in `AppModule`**

Modify `backend/src/app.module.ts`:

```typescript
import { DepartmentsModule } from './departments/departments.module';
```

```typescript
    UsersModule,
    AuthModule,
    BranchesModule,
    ProvidersModule,
    PermissionsModule,
    ProductsModule,
    OrdersModule,
    DepartmentsModule,
```

- [ ] **Step 5: Verify the app boots**

Run: `cd backend && npm run start:dev` (stop any already-running instance
first), watch for `Nest application successfully started` and a mapped
`{/branches/:branchId/departments, GET}` route in the log, then stop it
(Ctrl+C or kill the process).

- [ ] **Step 6: Commit**

```bash
git add backend/src/departments/dto backend/src/departments/departments.controller.ts backend/src/departments/departments.module.ts backend/src/app.module.ts
git commit -m "feat(backend): wire up DepartmentsModule and /departments endpoints"
```

---

### Task 5: `Provider` many-to-many relation + DTOs

**Files:**
- Modify: `backend/src/providers/provider.entity.ts`
- Modify: `backend/src/providers/dto/create-provider.dto.ts`
- Modify: `backend/src/providers/dto/update-provider.dto.ts`

- [ ] **Step 1: Add the relation to the entity**

Replace the full contents of `backend/src/providers/provider.entity.ts`:

```typescript
// backend/src/providers/provider.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { Branch } from '../branches/branch.entity';
import { Department } from '../departments/department.entity';

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column()
  name: string;

  @Column()
  phone: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => Department)
  @JoinTable({
    name: 'provider_departments',
    joinColumn: { name: 'providerId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'departmentId', referencedColumnName: 'id' },
  })
  departments: Department[];

  @CreateDateColumn()
  createdAt: Date;
}
```

- [ ] **Step 2: Update `CreateProviderDto`**

```typescript
// backend/src/providers/dto/create-provider.dto.ts
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateProviderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  departmentIds: string[];
}
```

- [ ] **Step 3: Update `UpdateProviderDto`**

```typescript
// backend/src/providers/dto/update-provider.dto.ts
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateProviderDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsOptional()
  departmentIds?: string[];
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/providers/provider.entity.ts backend/src/providers/dto/create-provider.dto.ts backend/src/providers/dto/update-provider.dto.ts
git commit -m "feat(backend): add departments many-to-many relation to Provider"
```

---

### Task 6: `ProvidersService` department validation + eager loading (TDD)

**Files:**
- Modify: `backend/src/providers/providers.service.ts`
- Modify: `backend/src/providers/providers.service.spec.ts`

This task both extends `ProvidersService` with department handling and
switches its lookup from `findOneBy` to `findOne({ relations: [...] })` so
`departments` is loaded before any save — required for TypeORM to correctly
diff and replace many-to-many rows on update, and for API responses to
include the provider's department names.

- [ ] **Step 1: Update the spec file first (failing)**

Replace the full contents of `backend/src/providers/providers.service.spec.ts`:

```typescript
// backend/src/providers/providers.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { ProvidersService } from './providers.service';
import { Provider } from './provider.entity';
import { BranchesService } from '../branches/branches.service';
import { DepartmentsService } from '../departments/departments.service';

describe('ProvidersService', () => {
  let service: ProvidersService;
  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const mockBranchesService = {
    findById: jest.fn(),
  };
  const mockDepartmentsService = {
    findByIds: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: getRepositoryToken(Provider), useValue: mockRepo },
        { provide: BranchesService, useValue: mockBranchesService },
        { provide: DepartmentsService, useValue: mockDepartmentsService },
      ],
    }).compile();
    service = module.get(ProvidersService);
  });

  it('creates a provider under a branch that exists, attached to its departments', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd1', branchId: 'b1', name: 'מוצרי חלב' },
      { id: 'd2', branchId: 'b1', name: 'קפואים' },
    ]);
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'p1', ...data }),
    );

    const provider = await service.create('b1', {
      name: 'Meat Co',
      phone: '+972501234567',
      departmentIds: ['d1', 'd2'],
    });

    expect(mockBranchesService.findById).toHaveBeenCalledWith('b1');
    expect(mockDepartmentsService.findByIds).toHaveBeenCalledWith([
      'd1',
      'd2',
    ]);
    expect(provider).toMatchObject({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [
        { id: 'd1', branchId: 'b1', name: 'מוצרי חלב' },
        { id: 'd2', branchId: 'b1', name: 'קפואים' },
      ],
    });
  });

  it('rejects with NotFoundException when the branch does not exist, without saving', async () => {
    mockBranchesService.findById.mockRejectedValue(
      new NotFoundException('Branch not found'),
    );

    await expect(
      service.create('missing', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: ['d1'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException when a departmentId does not exist, without saving', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd1', branchId: 'b1', name: 'מוצרי חלב' },
    ]);

    await expect(
      service.create('b1', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: ['d1', 'missing'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('rejects with NotFoundException when a departmentId belongs to a different branch, without saving', async () => {
    mockBranchesService.findById.mockResolvedValue({ id: 'b1' });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd1', branchId: 'OTHER_BRANCH', name: 'מוצרי חלב' },
    ]);

    await expect(
      service.create('b1', {
        name: 'Meat Co',
        phone: '+972501234567',
        departmentIds: ['d1'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('lists all active providers for a branch when the caller has ALL access', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'p1', name: 'Meat Co', isActive: true },
    ]);

    const providers = await service.findActiveByBranch('b1', 'ALL');

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { branchId: 'b1', isActive: true },
      relations: ['departments'],
    });
    expect(providers).toHaveLength(1);
  });

  it('filters providers by the accessible-ids list when not ALL', async () => {
    mockRepo.find.mockResolvedValue([
      { id: 'p1', name: 'Meat Co', isActive: true },
    ]);

    const providers = await service.findActiveByBranch('b1', ['p1']);

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { branchId: 'b1', isActive: true, id: In(['p1']) },
      relations: ['departments'],
    });
    expect(providers).toHaveLength(1);
  });

  it('throws NotFoundException when finding a provider by an unknown id', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(
      'Provider not found',
    );
  });

  it('updates a provider and persists the merged fields, without touching departments when omitted', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      phone: '+972501234567',
      isActive: true,
      departments: [{ id: 'd1', branchId: 'b1', name: 'מוצרי חלב' }],
    });
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('p1', {
      name: 'Meat Co Ltd',
      isActive: false,
    });

    expect(mockDepartmentsService.findByIds).not.toHaveBeenCalled();
    expect(updated).toMatchObject({
      id: 'p1',
      name: 'Meat Co Ltd',
      isActive: false,
      departments: [{ id: 'd1', branchId: 'b1', name: 'מוצרי חלב' }],
    });
  });

  it('replaces the department set on update when departmentIds is provided', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [{ id: 'd1', branchId: 'b1', name: 'מוצרי חלב' }],
    });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd2', branchId: 'b1', name: 'קפואים' },
    ]);
    mockRepo.save.mockImplementation((data) => Promise.resolve(data));

    const updated = await service.update('p1', { departmentIds: ['d2'] });

    expect(updated.departments).toEqual([
      { id: 'd2', branchId: 'b1', name: 'קפואים' },
    ]);
  });

  it('rejects update with NotFoundException when a departmentId belongs to a different branch, without saving', async () => {
    mockRepo.findOne.mockResolvedValue({
      id: 'p1',
      branchId: 'b1',
      name: 'Meat Co',
      departments: [],
    });
    mockDepartmentsService.findByIds.mockResolvedValue([
      { id: 'd2', branchId: 'OTHER_BRANCH', name: 'קפואים' },
    ]);

    await expect(
      service.update('p1', { departmentIds: ['d2'] }),
    ).rejects.toThrow(NotFoundException);

    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/providers/providers.service.spec.ts`
Expected: FAIL — multiple failures (`DepartmentsService` not injectable yet,
`findOne` not called, `departmentIds` not handled).

- [ ] **Step 3: Update the service implementation**

Replace the full contents of `backend/src/providers/providers.service.ts`:

```typescript
// backend/src/providers/providers.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { Provider } from './provider.entity';
import { Department } from '../departments/department.entity';
import { BranchesService } from '../branches/branches.service';
import { DepartmentsService } from '../departments/departments.service';

@Injectable()
export class ProvidersService {
  constructor(
    @InjectRepository(Provider)
    private readonly providersRepo: Repository<Provider>,
    private readonly branchesService: BranchesService,
    private readonly departmentsService: DepartmentsService,
  ) {}

  async create(
    branchId: string,
    input: { name: string; phone: string; departmentIds: string[] },
  ): Promise<Provider> {
    // Confirm the branch exists before inserting — otherwise an invalid
    // branchId escapes as an unhandled FK-violation 500 instead of a clean
    // 404 (same failure mode already fixed for grantAccess).
    await this.branchesService.findById(branchId);
    const { departmentIds, ...rest } = input;
    const departments = await this.resolveDepartments(branchId, departmentIds);
    const entity = this.providersRepo.create({
      branchId,
      ...rest,
      departments,
    });
    return this.providersRepo.save(entity);
  }

  findActiveByBranch(
    branchId: string,
    accessibleProviderIds: string[] | 'ALL',
  ): Promise<Provider[]> {
    const where: FindOptionsWhere<Provider> = { branchId, isActive: true };
    if (accessibleProviderIds !== 'ALL') {
      where.id = In(accessibleProviderIds);
    }
    return this.providersRepo.find({ where, relations: ['departments'] });
  }

  async findById(id: string): Promise<Provider> {
    const provider = await this.providersRepo.findOne({
      where: { id },
      relations: ['departments'],
    });
    if (!provider) {
      throw new NotFoundException('Provider not found');
    }
    return provider;
  }

  async update(
    id: string,
    input: {
      name?: string;
      phone?: string;
      isActive?: boolean;
      departmentIds?: string[];
    },
  ): Promise<Provider> {
    const provider = await this.findById(id);
    const { departmentIds, ...rest } = input;
    Object.assign(provider, rest);
    if (departmentIds) {
      provider.departments = await this.resolveDepartments(
        provider.branchId,
        departmentIds,
      );
    }
    return this.providersRepo.save(provider);
  }

  // Loads the requested departments and verifies every one exists and
  // belongs to this provider's branch — a provider can only be tagged with
  // departments from its own branch's list.
  private async resolveDepartments(
    branchId: string,
    departmentIds: string[],
  ): Promise<Department[]> {
    const departments = await this.departmentsService.findByIds(
      departmentIds,
    );
    if (departments.length !== departmentIds.length) {
      throw new NotFoundException('One or more departments not found');
    }
    const mismatched = departments.find(
      (department) => department.branchId !== branchId,
    );
    if (mismatched) {
      throw new NotFoundException(
        'Department does not belong to this branch',
      );
    }
    return departments;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/providers/providers.service.spec.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/providers.service.ts backend/src/providers/providers.service.spec.ts
git commit -m "feat(backend): validate and attach departments in ProvidersService"
```

---

### Task 7: Wire `DepartmentsModule` into `ProvidersModule`

**Files:**
- Modify: `backend/src/providers/providers.module.ts`

- [ ] **Step 1: Import `DepartmentsModule`**

Replace the full contents of `backend/src/providers/providers.module.ts`:

```typescript
// backend/src/providers/providers.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from './provider.entity';
import { ProvidersService } from './providers.service';
import {
  BranchProvidersController,
  ProviderAdminController,
} from './providers.controller';
import { PermissionsModule } from '../permissions/permissions.module';
import { BranchesModule } from '../branches/branches.module';
import { DepartmentsModule } from '../departments/departments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Provider]),
    PermissionsModule,
    BranchesModule,
    DepartmentsModule,
  ],
  providers: [ProvidersService],
  controllers: [BranchProvidersController, ProviderAdminController],
  exports: [ProvidersService, TypeOrmModule],
})
export class ProvidersModule {}
```

- [ ] **Step 2: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS — every suite green, no regressions in other modules.

- [ ] **Step 3: Boot the app and smoke-test the new fields**

Run: `cd backend && npm run start:dev`, wait for `Nest application
successfully started`, then in another terminal:

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"dviro","password":"<your BOOTSTRAP_ADMIN_PASSWORD>"}'
```

Copy the `accessToken`, then:

```bash
curl -s http://localhost:3000/branches/<a real branchId>/departments \
  -H "Authorization: Bearer <accessToken>"
```

Expected: a JSON array of 6 department objects (the seeded names).

Stop the server (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add backend/src/providers/providers.module.ts
git commit -m "feat(backend): wire DepartmentsModule into ProvidersModule"
```

---

## Mobile

### Task 8: API client and types

**Files:**
- Modify: `mobile/src/api/types.ts`
- Create: `mobile/src/api/departments.ts`
- Modify: `mobile/src/api/providers.ts`

- [ ] **Step 1: Add the `Department` type and extend `Provider`**

Modify `mobile/src/api/types.ts` — add this interface near the top (before
`Provider`, since `Provider` will reference it):

```typescript
export interface Department {
  id: string;
  branchId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}
```

Then change the existing `Provider` interface from:

```typescript
export interface Provider {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
}
```

to:

```typescript
export interface Provider {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  isActive: boolean;
  departments: Pick<Department, 'id' | 'name'>[];
  createdAt: string;
}
```

- [ ] **Step 2: Create the departments API client**

```typescript
// mobile/src/api/departments.ts
import { apiClient } from './client';
import type { Department } from './types';

export async function fetchDepartments(branchId: string): Promise<Department[]> {
  const response = await apiClient.get<Department[]>(`/branches/${branchId}/departments`);
  return response.data;
}

export async function createDepartment(
  branchId: string,
  input: { name: string },
): Promise<Department> {
  const response = await apiClient.post<Department>(`/branches/${branchId}/departments`, input);
  return response.data;
}

export async function updateDepartment(
  id: string,
  input: { name?: string; isActive?: boolean },
): Promise<Department> {
  const response = await apiClient.patch<Department>(`/departments/${id}`, input);
  return response.data;
}
```

- [ ] **Step 3: Extend the providers API client**

Replace the full contents of `mobile/src/api/providers.ts`:

```typescript
// mobile/src/api/providers.ts
import { apiClient } from './client';
import type { Provider } from './types';

export async function fetchProvidersForBranch(branchId: string): Promise<Provider[]> {
  const response = await apiClient.get<Provider[]>(`/branches/${branchId}/providers`);
  return response.data;
}

export async function createProvider(
  branchId: string,
  input: { name: string; phone: string; departmentIds: string[] },
): Promise<Provider> {
  const response = await apiClient.post<Provider>(`/branches/${branchId}/providers`, input);
  return response.data;
}

export async function updateProvider(
  id: string,
  input: {
    name?: string;
    phone?: string;
    isActive?: boolean;
    departmentIds?: string[];
  },
): Promise<Provider> {
  const response = await apiClient.patch<Provider>(`/providers/${id}`, input);
  return response.data;
}
```

- [ ] **Step 4: Commit**

```bash
cd mobile
git add src/api/types.ts src/api/departments.ts src/api/providers.ts
git commit -m "feat(mobile): add departments API client and Provider.departments field"
```

---

### Task 9: Department-name intersection helper (TDD)

This is the one piece of new mobile logic worth unit-testing in isolation —
it decides which department names are valid to pick when creating a provider
under multiple branches at once.

**Files:**
- Create: `mobile/src/utils/departmentIntersection.test.ts`
- Create: `mobile/src/utils/departmentIntersection.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// mobile/src/utils/departmentIntersection.test.ts
import { intersectDepartmentNames } from './departmentIntersection';

describe('intersectDepartmentNames', () => {
  it('returns all active names when given a single branch', () => {
    const result = intersectDepartmentNames([
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'קפואים', isActive: true },
      ],
    ]);
    expect(result).toEqual(['מוצרי חלב', 'קפואים']);
  });

  it('returns only names common to every branch', () => {
    const result = intersectDepartmentNames([
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'קפואים', isActive: true },
      ],
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'פיצוחים', isActive: true },
      ],
    ]);
    expect(result).toEqual(['מוצרי חלב']);
  });

  it('excludes inactive departments from either side', () => {
    const result = intersectDepartmentNames([
      [
        { name: 'מוצרי חלב', isActive: false },
        { name: 'קפואים', isActive: true },
      ],
      [
        { name: 'מוצרי חלב', isActive: true },
        { name: 'קפואים', isActive: true },
      ],
    ]);
    expect(result).toEqual(['קפואים']);
  });

  it('returns an empty array when given no branches', () => {
    expect(intersectDepartmentNames([])).toEqual([]);
  });

  it('returns an empty array when branches share no active department', () => {
    const result = intersectDepartmentNames([
      [{ name: 'מוצרי חלב', isActive: true }],
      [{ name: 'קפואים', isActive: true }],
    ]);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd mobile && npx jest src/utils/departmentIntersection.test.ts`
Expected: FAIL — `Cannot find module './departmentIntersection'`

- [ ] **Step 3: Write the implementation**

```typescript
// mobile/src/utils/departmentIntersection.ts
interface NamedActiveDepartment {
  name: string;
  isActive: boolean;
}

export function intersectDepartmentNames(
  departmentsByBranch: NamedActiveDepartment[][],
): string[] {
  if (departmentsByBranch.length === 0) {
    return [];
  }
  const activeNamesByBranch = departmentsByBranch.map((departments) =>
    departments.filter((department) => department.isActive).map((department) => department.name),
  );
  const [first, ...rest] = activeNamesByBranch;
  return first.filter((name) => rest.every((names) => names.includes(name)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd mobile && npx jest src/utils/departmentIntersection.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/utils/departmentIntersection.ts src/utils/departmentIntersection.test.ts
git commit -m "feat(mobile): add department-name intersection helper with tests"
```

---

### Task 10: Register new routes in the app layout

**Files:**
- Modify: `mobile/app/(app)/_layout.tsx`

- [ ] **Step 1: Add the new `Stack.Screen` entries**

Modify `mobile/app/(app)/_layout.tsx` — insert these lines into the `<Stack>`
in the `Gate` component, after the existing
`<Stack.Screen name="providers/[providerId]/order" ... />` line and before
`<Stack.Screen name="admin/index" ... />`:

```tsx
      <Stack.Screen name="providers/[providerId]/edit" options={{ title: 'עריכת ספק' }} />
      <Stack.Screen name="departments/index" options={{ title: 'מחלקות' }} />
      <Stack.Screen name="departments/new" options={{ title: 'הוספת מחלקה' }} />
      <Stack.Screen name="departments/[departmentId]/edit" options={{ title: 'עריכת מחלקה' }} />
      <Stack.Screen name="departments/[departmentId]/providers" options={{ title: '' }} />
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/_layout.tsx"
git commit -m "feat(mobile): register departments and provider-edit routes"
```

(This commit will be effectively a no-op build-wise until the screen files
in the following tasks exist — that's fine, `expo-router` only needs the
file at runtime, and registering the route ahead of the file doesn't error.)

---

### Task 11: "מחלקות" button on the home screen

**Files:**
- Modify: `mobile/app/(app)/index.tsx`

- [ ] **Step 1: Add the button next to "פעילות אחרונה"**

In `mobile/app/(app)/index.tsx`, change:

```tsx
      <Pressable onPress={() => router.push('/activity')} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>פעילות אחרונה</Text>
      </Pressable>
```

to:

```tsx
      <View style={styles.secondaryButtonRow}>
        <Pressable onPress={() => router.push('/activity')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>פעילות אחרונה</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/departments')} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>מחלקות</Text>
        </Pressable>
      </View>
```

And add a `secondaryButtonRow` style, replacing the standalone-margin styling
on `secondaryButton`. Change:

```typescript
  secondaryButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
```

to:

```typescript
  secondaryButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/index.tsx"
git commit -m "feat(mobile): add departments button to home screen"
```

---

### Task 12: Departments list screen

**Files:**
- Create: `mobile/app/(app)/departments/index.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// mobile/app/(app)/departments/index.tsx
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchDepartments } from '../../../src/api/departments';
import { useBranch } from '../../../src/branch/BranchContext';
import { useAuth } from '../../../src/auth/AuthContext';

export default function DepartmentsScreen() {
  const { selectedBranch } = useBranch();
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const { data: departments, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['departments', selectedBranch!.id],
    queryFn: () => fetchDepartments(selectedBranch!.id),
  });

  const visibleDepartments = isAdmin
    ? departments
    : departments?.filter((department) => department.isActive);

  return (
    <View style={styles.container}>
      {isAdmin && (
        <Pressable onPress={() => router.push('/departments/new')} style={styles.addButton}>
          <Text style={styles.addButtonText}>+ הוספת מחלקה</Text>
        </Pressable>
      )}
      {isLoading && <Text style={styles.statusText}>טוען מחלקות…</Text>}
      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={visibleDepartments}
        keyExtractor={(department) => department.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.row, !item.isActive && styles.rowInactive]}>
            <Pressable
              style={styles.rowMain}
              onPress={() =>
                router.push({
                  pathname: '/departments/[departmentId]/providers',
                  params: { departmentId: item.id, departmentName: item.name },
                })
              }
            >
              <Text style={styles.departmentName}>{item.name}</Text>
              {!item.isActive && <Text style={styles.inactiveLabel}>לא פעיל</Text>}
            </Pressable>
            {isAdmin && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/departments/[departmentId]/edit',
                    params: {
                      departmentId: item.id,
                      departmentName: item.name,
                      departmentIsActive: String(item.isActive),
                    },
                  })
                }
              >
                <Text style={styles.editIcon}>✎</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.statusText}>אין עדיין מחלקות לסניף זה.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  addButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#eef2ff',
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  addButtonText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { gap: 8, paddingBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowInactive: { opacity: 0.5 },
  rowMain: { flex: 1 },
  departmentName: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
  inactiveLabel: { fontSize: 12, color: '#c0392b', textAlign: 'right', marginTop: 2 },
  editIcon: { fontSize: 20, color: '#2563eb', paddingHorizontal: 8 },
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/departments/index.tsx"
git commit -m "feat(mobile): add departments list screen"
```

---

### Task 13: Department create screen

**Files:**
- Create: `mobile/app/(app)/departments/new.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// mobile/app/(app)/departments/new.tsx
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../src/api/branches';
import { createDepartment } from '../../../src/api/departments';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../src/auth/useRequireAdmin';
import { useBranch } from '../../../src/branch/BranchContext';
import { sanitizeHebrewInput } from '../../../src/utils/hebrewInput';

export default function NewDepartmentScreen() {
  useRequireAdmin();
  const { selectedBranch } = useBranch();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(
    new Set(selectedBranch ? [selectedBranch.id] : []),
  );
  const [name, setName] = useState('');

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) {
        next.delete(branchId);
      } else {
        next.add(branchId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    await Promise.all(
      Array.from(selectedBranchIds).map((branchId) => createDepartment(branchId, { name })),
    );
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניפים</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleBranch(item.id)}
            style={[styles.branchChip, selectedBranchIds.has(item.id) && styles.branchChipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <TextInput
        style={styles.input}
        placeholder="שם המחלקה"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <PrimaryButton
        title="יצירת מחלקה"
        onPress={handleSubmit}
        disabled={selectedBranchIds.size === 0 || !name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  branchList: { flexGrow: 0 },
  branchChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginRight: 8,
  },
  branchChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/departments/new.tsx"
git commit -m "feat(mobile): add department create screen with optional multi-branch selection"
```

---

### Task 14: Department edit screen

**Files:**
- Create: `mobile/app/(app)/departments/[departmentId]/edit.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// mobile/app/(app)/departments/[departmentId]/edit.tsx
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { updateDepartment } from '../../../../src/api/departments';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';

export default function EditDepartmentScreen() {
  useRequireAdmin();
  const { departmentId, departmentName, departmentIsActive } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
    departmentIsActive?: string;
  }>();
  const [name, setName] = useState(departmentName ?? '');
  const [isActive, setIsActive] = useState(departmentIsActive !== 'false');

  const handleSubmit = async () => {
    await updateDepartment(departmentId, { name, isActive });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם המחלקה"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>פעיל</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <PrimaryButton title="שמירה" onPress={handleSubmit} disabled={!name} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/departments/[departmentId]/edit.tsx"
git commit -m "feat(mobile): add department edit screen"
```

---

### Task 15: Providers-in-department browsing screen

**Files:**
- Create: `mobile/app/(app)/departments/[departmentId]/providers.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// mobile/app/(app)/departments/[departmentId]/providers.tsx
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch } from '../../../../src/api/providers';
import { useBranch } from '../../../../src/branch/BranchContext';

export default function DepartmentProvidersScreen() {
  const { departmentId, departmentName } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
  }>();
  const { selectedBranch } = useBranch();
  const { data: providers, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });

  const departmentProviders = providers?.filter((provider) =>
    provider.departments.some((department) => department.id === departmentId),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: departmentName ?? '' }} />
      {isLoading && <Text style={styles.statusText}>טוען ספקים…</Text>}
      <FlatList
        refreshing={isRefetching}
        onRefresh={refetch}
        data={departmentProviders}
        keyExtractor={(provider) => provider.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/providers/[providerId]/order',
                params: { providerId: item.id, providerName: item.name },
              })
            }
          >
            <Text style={styles.cardText}>{item.name}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.statusText}>אין ספקים במחלקה זו.</Text> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 16 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  cardText: { fontSize: 16, fontWeight: '600', textAlign: 'right', color: '#1a1a1a' },
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/departments/[departmentId]/providers.tsx"
git commit -m "feat(mobile): add department-filtered provider list screen"
```

---

### Task 16: Edit button on the order screen

**Files:**
- Modify: `mobile/app/(app)/providers/[providerId]/order.tsx`

- [ ] **Step 1: Import `useAuth`**

Add to the import block near the top of the file (after the existing
`BarcodeScannerModal` import):

```tsx
import { useAuth } from '../../../../src/auth/AuthContext';
```

- [ ] **Step 2: Read the role and render the edit button conditionally**

Change:

```tsx
  const { selectedBranch } = useBranch();
```

to:

```tsx
  const { selectedBranch } = useBranch();
  const { role } = useAuth();
```

Then change:

```tsx
      <Stack.Screen options={{ title: providerName ?? '' }} />
```

to:

```tsx
      <Stack.Screen
        options={{
          title: providerName ?? '',
          headerRight:
            role === 'ADMIN'
              ? () => (
                  <Pressable
                    onPress={() => router.push(`/providers/${providerId}/edit`)}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>✎</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
```

This requires `router` to be imported — add it to the existing
`expo-router` import line. Change:

```tsx
import { Stack, useLocalSearchParams } from 'expo-router';
```

to:

```tsx
import { router, Stack, useLocalSearchParams } from 'expo-router';
```

- [ ] **Step 3: Add the button styles**

Add to the `StyleSheet.create` block at the bottom of the file:

```typescript
  editButton: { paddingHorizontal: 12 },
  editButtonText: { fontSize: 20, color: '#2563eb' },
```

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/providers/[providerId]/order.tsx"
git commit -m "feat(mobile): add admin-only edit button to the order screen header"
```

---

### Task 17: Provider edit screen

**Files:**
- Create: `mobile/app/(app)/providers/[providerId]/edit.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// mobile/app/(app)/providers/[providerId]/edit.tsx
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchProvidersForBranch, updateProvider } from '../../../../src/api/providers';
import { fetchDepartments } from '../../../../src/api/departments';
import { useBranch } from '../../../../src/branch/BranchContext';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';

const ISRAELI_MOBILE_PATTERN = /^05\d{8}$/;

export default function EditProviderScreen() {
  useRequireAdmin();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { selectedBranch } = useBranch();
  const { data: providers } = useQuery({
    queryKey: ['providers', selectedBranch!.id],
    queryFn: () => fetchProvidersForBranch(selectedBranch!.id),
  });
  const { data: departments } = useQuery({
    queryKey: ['departments', selectedBranch!.id],
    queryFn: () => fetchDepartments(selectedBranch!.id),
  });
  const provider = providers?.find((item) => item.id === providerId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (provider && !isInitialized) {
      setName(provider.name);
      setPhone(provider.phone);
      setIsActive(provider.isActive);
      setSelectedDepartmentIds(new Set(provider.departments.map((department) => department.id)));
      setIsInitialized(true);
    }
  }, [provider, isInitialized]);

  const isPhoneValid = ISRAELI_MOBILE_PATTERN.test(phone);
  const activeDepartments = departments?.filter((department) => department.isActive);

  const toggleDepartment = (departmentId: string) => {
    setSelectedDepartmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(departmentId)) {
        next.delete(departmentId);
      } else {
        next.add(departmentId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    await updateProvider(providerId, {
      name,
      phone,
      isActive,
      departmentIds: Array.from(selectedDepartmentIds),
    });
    router.back();
  };

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>טוען…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם הספק"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <TextInput
        style={styles.input}
        placeholder="טלפון וואטסאפ (לדוגמה: 0501234567)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {phone.length > 0 && !isPhoneValid && (
        <Text style={styles.errorText}>מספר טלפון לא תקין. הפורמט הנדרש: 05XXXXXXXX</Text>
      )}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>פעיל</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <Text style={styles.label}>מחלקות</Text>
      <FlatList
        horizontal
        style={styles.departmentList}
        data={activeDepartments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleDepartment(item.id)}
            style={[
              styles.departmentChip,
              selectedDepartmentIds.has(item.id) && styles.departmentChipSelected,
            ]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <PrimaryButton
        title="שמירה"
        onPress={handleSubmit}
        disabled={!name || !isPhoneValid || selectedDepartmentIds.size === 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  statusText: { textAlign: 'center', marginTop: 12, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 16, fontWeight: '600' },
  label: { fontWeight: '600' },
  departmentList: { flexGrow: 0 },
  departmentChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginRight: 8,
  },
  departmentChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/providers/[providerId]/edit.tsx"
git commit -m "feat(mobile): add provider edit screen"
```

---

### Task 18: Department picker on the provider create screen

**Files:**
- Modify: `mobile/app/(app)/admin/providers/new.tsx`

- [ ] **Step 1: Replace the full file**

```tsx
// mobile/app/(app)/admin/providers/new.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { fetchDepartments } from '../../../../src/api/departments';
import { createProvider } from '../../../../src/api/providers';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { intersectDepartmentNames } from '../../../../src/utils/departmentIntersection';

const ISRAELI_MOBILE_PATTERN = /^05\d{8}$/;

export default function NewProviderScreen() {
  useRequireAdmin();
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [selectedBranchIds, setSelectedBranchIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedDepartmentNames, setSelectedDepartmentNames] = useState<Set<string>>(new Set());

  const branchIdsList = Array.from(selectedBranchIds);
  const { data: departmentsByBranch } = useQuery({
    queryKey: ['departments-for-branches', branchIdsList.slice().sort().join(',')],
    queryFn: () => Promise.all(branchIdsList.map((branchId) => fetchDepartments(branchId))),
    enabled: branchIdsList.length > 0,
  });

  const departmentNameOptions = useMemo(
    () => intersectDepartmentNames(departmentsByBranch ?? []),
    [departmentsByBranch],
  );

  const isPhoneValid = ISRAELI_MOBILE_PATTERN.test(phone);

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((prev) => {
      const next = new Set(prev);
      if (next.has(branchId)) {
        next.delete(branchId);
      } else {
        next.add(branchId);
      }
      return next;
    });
    setSelectedDepartmentNames(new Set());
  };

  const toggleDepartmentName = (name: string) => {
    setSelectedDepartmentNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!departmentsByBranch) return;
    await Promise.all(
      branchIdsList.map((branchId, index) => {
        const branchDepartments = departmentsByBranch[index];
        const departmentIds = branchDepartments
          .filter((department) => selectedDepartmentNames.has(department.name))
          .map((department) => department.id);
        return createProvider(branchId, { name, phone, departmentIds });
      }),
    );
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניפים</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => toggleBranch(item.id)}
            style={[styles.branchChip, selectedBranchIds.has(item.id) && styles.branchChipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <TextInput
        style={styles.input}
        placeholder="שם הספק"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <TextInput
        style={styles.input}
        placeholder="טלפון וואטסאפ (לדוגמה: 0501234567)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      {phone.length > 0 && !isPhoneValid && (
        <Text style={styles.errorText}>מספר טלפון לא תקין. הפורמט הנדרש: 05XXXXXXXX</Text>
      )}
      {selectedBranchIds.size > 0 && (
        <>
          <Text style={styles.label}>מחלקות</Text>
          {departmentsByBranch && departmentNameOptions.length === 0 && (
            <Text style={styles.errorText}>
              אין מחלקה משותפת לכל הסניפים שנבחרו. יש להוסיף מחלקה תואמת לפני יצירת הספק.
            </Text>
          )}
          <FlatList
            horizontal
            style={styles.branchList}
            data={departmentNameOptions}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => toggleDepartmentName(item)}
                style={[
                  styles.branchChip,
                  selectedDepartmentNames.has(item) && styles.branchChipSelected,
                ]}
              >
                <Text>{item}</Text>
              </Pressable>
            )}
          />
        </>
      )}
      <PrimaryButton
        title="יצירת ספק"
        onPress={handleSubmit}
        disabled={
          selectedBranchIds.size === 0 ||
          !name ||
          !isPhoneValid ||
          !departmentsByBranch ||
          selectedDepartmentNames.size === 0
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  branchList: { flexGrow: 0 },
  branchChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    marginRight: 8,
  },
  branchChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
```

- [ ] **Step 2: Commit**

```bash
git add "app/(app)/admin/providers/new.tsx"
git commit -m "feat(mobile): add department picker to provider create screen"
```

---

### Task 19: End-to-end verification on the emulator

**Files:** none (manual verification only)

- [ ] **Step 1: Run the backend migrations and start it**

```bash
cd backend
npm run migration:run
npm run start:dev
```

Expected: exits migration step with code 0, then server logs `Nest
application successfully started`.

- [ ] **Step 2: Rebuild and launch the mobile app**

```bash
cd mobile
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
npm run android
```

Expected: Gradle build succeeds, app installs and launches on the
`Pixel_8_API_35` emulator, Metro bundles without errors.

- [ ] **Step 3: Walk through the full flow as `dviro` (ADMIN)**

1. Log in, select a branch.
2. Tap "מחלקות" on the home screen — verify the 6 seeded departments appear.
3. Tap "+ הוספת מחלקה", create a new department checking only the current
   branch, verify it appears in the list on return.
4. Tap the ✎ icon on a department, toggle it inactive, save — verify it now
   shows greyed out with "לא פעיל" in the list.
5. Tap an active department — verify it shows only providers tagged with
   that department (empty state if none yet).
6. Go to "ניהול" → "הוספת ספק", select the branch, verify the department
   chips render (intersection = all departments in this single-branch case),
   pick one, create the provider — verify "יצירת ספק" was disabled until a
   department was selected.
7. From the home screen, tap that new provider — verify a ✎ icon appears in
   the header (admin only).
8. Tap the ✎ icon — verify the edit screen pre-fills name/phone/active/
   departments correctly from what was just created.
9. Change the department selection and save — verify `PrimaryButton` is
   disabled if you try to uncheck every department.
10. Re-open the department's provider list from step 5 — verify the edited
    provider now shows under its new department instead of the old one.

- [ ] **Step 4: Confirm no regression in ordering**

Tap a provider from the plain "ספקים" home list (not via departments),
verify the order screen still opens and product quantities can still be
adjusted — the department feature must not have broken the existing
ordering flow.

- [ ] **Step 5: Log in as a non-admin (`STAFF`) account, if one exists locally**

Verify: "מחלקות" tab is visible and browsable, but no "+ הוספת מחלקה"
button, no ✎ icons on department rows, and no ✎ icon in the provider order
screen header.

---

## Plan self-review notes

- **Spec coverage:** every §2–§4 item in the design doc maps to a task above
  (data model → Tasks 1–2, backend service/validation → Tasks 3–7, mobile API
  → Task 8, navigation → Tasks 10–18, testing → Tasks 3, 6, 9).
- **Type consistency:** `departmentIds` (create: required; update: optional)
  is spelled identically in the DTOs (Task 5), `ProvidersService` (Task 6),
  and every mobile call site (Tasks 17–18). `Provider.departments` is
  `Pick<Department, 'id' | 'name'>[]` everywhere it's read on the mobile side.
- **No DB-level "at least one department" constraint** — enforced only via
  DTO validation (`@ArrayNotEmpty()`) and the mobile submit-button `disabled`
  checks, per the design doc's explicit call-out.
