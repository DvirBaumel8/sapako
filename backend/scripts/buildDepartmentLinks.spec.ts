import { buildDepartmentLinks } from './buildDepartmentLinks';

describe('buildDepartmentLinks', () => {
  const row = (supplierCode: string, department: string) => ({
    'קוד ספק ראשי': supplierCode,
    'שם מחלקה': department,
  });

  it('collects each distinct department name once', () => {
    const { departmentNames } = buildDepartmentLinks([
      row('1', 'חלב'),
      row('2', 'ירקות'),
      row('3', 'חלב'),
    ]);
    expect(departmentNames).toEqual(['חלב', 'ירקות']);
  });

  it('trims surrounding whitespace and treats the trimmed values as equal', () => {
    const { departmentNames } = buildDepartmentLinks([row('1', ' חלב '), row('2', 'חלב')]);
    expect(departmentNames).toEqual(['חלב']);
  });

  it('ignores rows with a blank or whitespace-only department', () => {
    const { departmentNames } = buildDepartmentLinks([
      row('1', ''),
      row('2', '   '),
      row('3', 'חלב'),
    ]);
    expect(departmentNames).toEqual(['חלב']);
  });

  it('ignores rows with no supplier code, since nothing could be linked to them', () => {
    const { departmentNames, supplierCodeToDepartments } = buildDepartmentLinks([
      row('', 'חלב'),
      row('  ', 'ירקות'),
    ]);
    expect(departmentNames).toEqual([]);
    expect(supplierCodeToDepartments.size).toBe(0);
  });

  it('links a supplier to every department its products appear in', () => {
    const { supplierCodeToDepartments } = buildDepartmentLinks([
      row('7', 'חלב'),
      row('7', 'ירקות'),
      row('7', 'חלב'),
    ]);
    expect([...supplierCodeToDepartments.get('7')!].sort()).toEqual(['חלב', 'ירקות']);
  });

  it('keeps suppliers separate from one another', () => {
    const { supplierCodeToDepartments } = buildDepartmentLinks([
      row('7', 'חלב'),
      row('8', 'ירקות'),
    ]);
    expect([...supplierCodeToDepartments.get('7')!]).toEqual(['חלב']);
    expect([...supplierCodeToDepartments.get('8')!]).toEqual(['ירקות']);
  });

  it('tolerates rows missing the columns entirely', () => {
    // Real exports have blank trailing rows and inconsistent columns; a
    // recovery script that throws on one malformed row is useless.
    const { departmentNames, supplierCodeToDepartments } = buildDepartmentLinks([
      {} as never,
      row('7', 'חלב'),
    ]);
    expect(departmentNames).toEqual(['חלב']);
    expect(supplierCodeToDepartments.size).toBe(1);
  });
});
