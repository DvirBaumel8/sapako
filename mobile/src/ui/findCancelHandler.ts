import type { AlertButton } from './alertTypes';

// What runs when the dialog is dismissed without an explicit choice (tapping
// the backdrop, or Android's back gesture). Matches native Alert behaviour:
// only an explicit `cancel` button is treated as the dismissal action, so
// dismissing a delete confirmation can never perform the delete.
export function findCancelHandler(
  buttons: AlertButton[] | undefined,
): (() => void) | undefined {
  return buttons?.find((button) => button.style === 'cancel')?.onPress;
}
