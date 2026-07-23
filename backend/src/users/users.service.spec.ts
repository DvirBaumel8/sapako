import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from './role.enum';

describe('UsersService', () => {
  let service: UsersService;
  const mockRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('hashes the password before saving a new user', async () => {
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'u1', ...data }),
    );

    const user = await service.create({
      username: 'danny',
      password: 'secret123',
      role: Role.STAFF,
    });

    expect(user.passwordHash).not.toBe('secret123');
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('finds a user by username', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 'u1', username: 'danny' });

    const user = await service.findByUsername('danny');

    expect(mockRepo.findOne).toHaveBeenCalledWith({
      where: { username: 'danny' },
    });
    expect(user?.username).toBe('danny');
  });

  it('returns null when no user matches the username', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    const user = await service.findByUsername('ghost');

    expect(user).toBeNull();
  });

  it('returns all users', async () => {
    mockRepo.find.mockResolvedValue([{ id: 'u1', username: 'danny' }]);

    const users = await service.findAll();

    expect(mockRepo.find).toHaveBeenCalled();
    expect(users).toHaveLength(1);
  });

  it('counts all users', async () => {
    mockRepo.count.mockResolvedValue(3);

    const count = await service.countAll();

    expect(mockRepo.count).toHaveBeenCalled();
    expect(count).toBe(3);
  });
});
