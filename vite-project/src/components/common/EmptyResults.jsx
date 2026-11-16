import { Button, Stack, Text } from '@mantine/core';
import { IconFilterOff } from '@tabler/icons-react';

/**
 * Empty list after a search or filter: one plain line and a way out.
 *   search:  the typed text, shown in the line ("No customers match “abc”")
 *   noun:    "customers" / "invoices"
 *   onClear: clears the search and filters
 */
export default function EmptyResults({ search, noun, onClear }) {
  const text = search?.trim();
  return (
    <Stack align="center" gap="sm" py="xl">
      <Text c="dimmed" ta="center">{text ? `No ${noun} match “${text}”` : `No ${noun} match these filters`}</Text>
      {onClear && <Button variant="light" size="sm" leftSection={<IconFilterOff size={16} />} onClick={onClear}>{text ? 'Clear search' : 'Clear filters'}</Button>}
    </Stack>
  );
}
