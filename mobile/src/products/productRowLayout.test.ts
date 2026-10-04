import {
  ROW_HEIGHT,
  NOTE_LINE_HEIGHT,
  SECTION_HEADER_HEIGHT,
  SECTION_FOOTER_HEIGHT,
  hasNote,
  rowHeightFor,
  buildFlatLayout,
  buildSectionLayout,
  layoutAt,
} from './productRowLayout';

const plain = { note: null };
const noted = { note: 'לבקש תאריך ארוך' };

describe('hasNote', () => {
  it('is false for null, undefined, empty and whitespace-only notes', () => {
    expect(hasNote({ note: null })).toBe(false);
    expect(hasNote({})).toBe(false);
    expect(hasNote({ note: '' })).toBe(false);
    expect(hasNote({ note: '   ' })).toBe(false);
  });

  it('is true for a real note', () => {
    expect(hasNote(noted)).toBe(true);
  });
});

describe('rowHeightFor', () => {
  it('adds the note line only for products with a note', () => {
    expect(rowHeightFor(plain)).toBe(ROW_HEIGHT);
    expect(rowHeightFor(noted)).toBe(ROW_HEIGHT + NOTE_LINE_HEIGHT);
  });
});

describe('buildFlatLayout', () => {
  it('matches the old fixed-height formula when no product has a note', () => {
    const table = buildFlatLayout([plain, plain, plain]);
    expect(layoutAt(table, 2)).toEqual({ length: ROW_HEIGHT, offset: ROW_HEIGHT * 2, index: 2 });
  });

  it('pushes later rows down by the note line of every noted row above them', () => {
    const table = buildFlatLayout([noted, plain, noted, plain]);
    expect(layoutAt(table, 3)).toEqual({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * 3 + NOTE_LINE_HEIGHT * 2,
      index: 3,
    });
    expect(layoutAt(table, 2).length).toBe(ROW_HEIGHT + NOTE_LINE_HEIGHT);
  });
});

describe('buildSectionLayout', () => {
  it('matches the old formula (header then rows, per section) with no notes', () => {
    const table = buildSectionLayout([{ data: [plain, plain] }, { data: [plain] }]);
    // Flattened: [h0, r, r, f0, h1, r, f1]
    expect(layoutAt(table, 0)).toEqual({ length: SECTION_HEADER_HEIGHT, offset: 0, index: 0 });
    expect(layoutAt(table, 2)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT + ROW_HEIGHT,
      index: 2,
    });
    expect(layoutAt(table, 4)).toEqual({
      length: SECTION_HEADER_HEIGHT,
      offset: SECTION_HEADER_HEIGHT + ROW_HEIGHT * 2 + SECTION_FOOTER_HEIGHT,
      index: 4,
    });
    expect(layoutAt(table, 5)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT * 2 + ROW_HEIGHT * 2 + SECTION_FOOTER_HEIGHT,
      index: 5,
    });
  });

  it('includes note lines from earlier sections in later offsets', () => {
    const table = buildSectionLayout([{ data: [noted] }, { data: [plain] }]);
    // Flattened: [h0, noted, f0, h1, plain, f1]
    expect(layoutAt(table, 4).offset).toBe(
      SECTION_HEADER_HEIGHT * 2 + ROW_HEIGHT + NOTE_LINE_HEIGHT + SECTION_FOOTER_HEIGHT,
    );
  });

  it('treats a collapsed (empty) section as just its header and footer', () => {
    const table = buildSectionLayout([{ data: [] }, { data: [plain] }]);
    // Flattened: [h0, f0, h1, plain, f1]
    expect(layoutAt(table, 3)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT * 2 + SECTION_FOOTER_HEIGHT,
      index: 3,
    });
  });

  it('gives each section a footer slot of the list gap, which the list counts even unrendered', () => {
    const table = buildSectionLayout([{ data: [plain] }, { data: [plain] }]);
    // Flattened: [h0, r, f0, h1, r, f1]
    expect(layoutAt(table, 2).length).toBe(SECTION_FOOTER_HEIGHT);
    expect(layoutAt(table, 5).length).toBe(SECTION_FOOTER_HEIGHT);
  });
});

describe('measured web layout', () => {
  it('reproduces the offsets measured in the running app', () => {
    const table = buildSectionLayout([{ data: [noted, plain] }, { data: [plain] }]);
    // Flattened: [h0, noted, plain, f0, h1, plain, f1]
    expect(table.offsets.slice(0, 6)).toEqual([0, 43, 173, 277, 285, 328]);
  });
});

describe('layoutAt', () => {
  it('returns a row-height slot at the end for an index past the table, like the old fallback', () => {
    const table = buildSectionLayout([{ data: [plain] }]);
    expect(layoutAt(table, 5)).toEqual({
      length: ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT + ROW_HEIGHT + SECTION_FOOTER_HEIGHT,
      index: 5,
    });
  });
});
