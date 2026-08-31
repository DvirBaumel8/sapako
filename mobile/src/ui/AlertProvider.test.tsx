import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AlertProvider, useAlert } from './AlertProvider';

// AlertProvider replaced react-native's Alert because Alert's web
// implementation silently drops every button but the first — which would
// have made "Cancel" on a delete confirmation *perform the delete*. These
// tests prove tapping cancel, and dismissing via the backdrop, never call
// the destructive handler.
//
// @testing-library/react-native 14 renders and fires events asynchronously
// (render/fireEvent.press return promises), unlike the plan's worked
// example — every interaction below is awaited for that reason.

function Harness({ onDelete, onCancel }: { onDelete: () => void; onCancel: () => void }) {
  const showAlert = useAlert();
  return (
    <Pressable
      onPress={() =>
        showAlert({
          title: 'מחיקת מוצר',
          buttons: [
            { text: 'ביטול', style: 'cancel', onPress: onCancel },
            { text: 'מחיקה', style: 'destructive', onPress: onDelete },
          ],
        })
      }
    >
      <Text>open</Text>
    </Pressable>
  );
}

async function renderHarness() {
  const onDelete = jest.fn();
  const onCancel = jest.fn();
  await render(
    <AlertProvider>
      <Harness onDelete={onDelete} onCancel={onCancel} />
    </AlertProvider>,
  );
  await fireEvent.press(screen.getByText('open'));
  return { onDelete, onCancel };
}

it('renders both buttons of a two-button dialog', async () => {
  await renderHarness();

  expect(screen.getByText('ביטול')).toBeTruthy();
  expect(screen.getByText('מחיקה')).toBeTruthy();
});

it('runs the destructive handler exactly once when its button is tapped', async () => {
  const { onDelete, onCancel } = await renderHarness();

  await fireEvent.press(screen.getByText('מחיקה'));

  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

it('runs cancel and never the destructive handler', async () => {
  const { onDelete, onCancel } = await renderHarness();

  await fireEvent.press(screen.getByText('ביטול'));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDelete).not.toHaveBeenCalled();
});

it('dismissing via the backdrop runs cancel and never the destructive handler', async () => {
  const { onDelete, onCancel } = await renderHarness();

  // The backdrop is the Pressable behind the dialog card — it wraps the
  // dialog, so a press must be targeted at the backdrop itself rather than
  // any text within it. testID keeps the query independent of view nesting.
  await fireEvent.press(screen.getByTestId('alert-backdrop'));

  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDelete).not.toHaveBeenCalled();
});
