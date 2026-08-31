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

/**
 * Grants or revokes every department in the branch in one call.
 *
 * Not the same as setBranchAccess: that writes a direct grant per provider,
 * while this writes the department rules, so a provider added to one of them
 * later is picked up without anyone returning to this screen.
 */
export async function setAllDepartmentsAccess(
  userId: string,
  branchId: string,
  granted: boolean,
) {
  await apiClient.put(`/users/${userId}/branches/${branchId}/departments/access`, { granted });
}

export async function setBranchAccess(userId: string, branchId: string, granted: boolean) {
  await apiClient.put(`/users/${userId}/branches/${branchId}/access`, { granted });
}
