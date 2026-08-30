export interface ProductDepartmentRow {
  'קוד ספק ראשי'?: string;
  'שם מחלקה'?: string;
}

export interface DepartmentLinks {
  /** Distinct department names, in first-seen order. */
  departmentNames: string[];
  /** Supplier code -> the departments that supplier's products appear in. */
  supplierCodeToDepartments: Map<string, Set<string>>;
}

/**
 * Derives departments, and each supplier's departments, from the products
 * export. The products CSV carries a department per product; the app models
 * departments per branch with providers linked to many of them, so the
 * mapping is by way of each supplier's products.
 *
 * Rows missing either column are skipped rather than throwing: real exports
 * carry blank trailing rows, and this script exists to rebuild a catalogue
 * from the only copy of the data that still exists.
 */
export function buildDepartmentLinks(
  rows: ProductDepartmentRow[],
): DepartmentLinks {
  const departmentNames: string[] = [];
  const seen = new Set<string>();
  const supplierCodeToDepartments = new Map<string, Set<string>>();

  for (const row of rows) {
    const supplierCode = row?.['קוד ספק ראשי']?.trim();
    const department = row?.['שם מחלקה']?.trim();
    if (!supplierCode || !department) {
      continue;
    }
    if (!seen.has(department)) {
      seen.add(department);
      departmentNames.push(department);
    }
    const existing = supplierCodeToDepartments.get(supplierCode);
    if (existing) {
      existing.add(department);
    } else {
      supplierCodeToDepartments.set(supplierCode, new Set([department]));
    }
  }

  return { departmentNames, supplierCodeToDepartments };
}
