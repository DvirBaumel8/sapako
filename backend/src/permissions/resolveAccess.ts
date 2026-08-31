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
