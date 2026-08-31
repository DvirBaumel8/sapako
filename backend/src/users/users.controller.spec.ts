import { UsersController } from './users.controller';

describe('UsersController', () => {
  let controller: UsersController;
  const mockUsersService = {
    findAllWithAccess: jest.fn(),
    toSafeUser: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    remove: jest.fn(),
  };
  const mockPermissionsService = {
    getAccessForBranch: jest.fn(),
    setProviderAccess: jest.fn(),
    setDepartmentAccess: jest.fn(),
    setBranchAccess: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new UsersController(
      mockUsersService as any,
      mockPermissionsService as any,
    );
  });

  describe('getAccess', () => {
    it('delegates to the permissions service for the given branch', () => {
      mockPermissionsService.getAccessForBranch.mockResolvedValue({
        departments: [],
        providers: [],
      });

      controller.getAccess('u1', 'b1');

      expect(mockPermissionsService.getAccessForBranch).toHaveBeenCalledWith('u1', 'b1');
    });
  });

  describe('setProviderAccess', () => {
    it('delegates the intent to the permissions service', () => {
      controller.setProviderAccess('u1', 'p1', { granted: true });

      expect(mockPermissionsService.setProviderAccess).toHaveBeenCalledWith(
        'u1',
        'p1',
        true,
      );
    });
  });

  describe('setDepartmentAccess', () => {
    it('delegates the intent to the permissions service', () => {
      controller.setDepartmentAccess('u1', 'd1', { granted: false });

      expect(mockPermissionsService.setDepartmentAccess).toHaveBeenCalledWith(
        'u1',
        'd1',
        false,
      );
    });
  });

  describe('setBranchAccess', () => {
    it('delegates the intent to the permissions service', () => {
      controller.setBranchAccess('u1', 'b1', { granted: false });

      expect(mockPermissionsService.setBranchAccess).toHaveBeenCalledWith(
        'u1',
        'b1',
        false,
      );
    });
  });
});
