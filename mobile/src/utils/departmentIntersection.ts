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
