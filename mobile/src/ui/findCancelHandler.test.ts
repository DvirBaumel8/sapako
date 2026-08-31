import { findCancelHandler } from './findCancelHandler';

describe('findCancelHandler', () => {
  it('returns the cancel button handler when one exists', () => {
    const onCancel = jest.fn();
    const handler = findCancelHandler([
      { text: 'ביטול', style: 'cancel', onPress: onCancel },
      { text: 'מחיקה', style: 'destructive', onPress: jest.fn() },
    ]);
    handler?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('returns undefined when the cancel button has no handler', () => {
    expect(
      findCancelHandler([
        { text: 'ביטול', style: 'cancel' },
        { text: 'מחיקה', style: 'destructive', onPress: jest.fn() },
      ]),
    ).toBeUndefined();
  });

  it('returns undefined when there is no cancel button', () => {
    expect(findCancelHandler([{ text: 'אישור', onPress: jest.fn() }])).toBeUndefined();
  });

  it('returns undefined for a single-button dialog with no buttons array', () => {
    expect(findCancelHandler(undefined)).toBeUndefined();
  });

  it('never returns a destructive handler', () => {
    // Backstop against the worst possible bug in this file: dismissing a
    // delete confirmation by tapping outside it must not perform the delete.
    const onDelete = jest.fn();
    const handler = findCancelHandler([
      { text: 'מחיקה', style: 'destructive', onPress: onDelete },
    ]);
    handler?.();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
