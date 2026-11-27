import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';

export const UNDO_SECONDS = 6;

/**
 * "Done · Undo" for safe actions (clearing filters, deleting a scheme…):
 * the action happens at once; Undo puts it back. Serious actions (reversing
 * a payment, deleting an invoice or customer) keep their confirmation.
 * onExpire: runs if Undo was not pressed (e.g. send a delayed delete).
 */
export function offerUndo(message, onUndo, { onExpire } = {}) {
  const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let undone = false;
  notifications.show({
    id,
    autoClose: UNDO_SECONDS * 1000,
    withCloseButton: true,
    onClose: () => { if (!undone && onExpire) onExpire(); },
    message: (
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">{message}</Text>
        <Button size="compact-sm" variant="light" onClick={() => { undone = true; notifications.hide(id); onUndo(); }}>Undo</Button>
      </Group>
    ),
  });
  return id;
}
