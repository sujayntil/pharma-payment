import { Group, Pagination, Text } from '@mantine/core';

export const PAGE_SIZE = 50;

export default function ListPagination({ total, page, onChange, searchActive = false, label = 'records' }) {
  const summary = searchActive
    ? `${total} matching ${label}`
    : total
      ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} ${label}`
      : `0 ${label}`;

  return (
    <Group justify="space-between" mt="md">
      <Text size="sm" c="dimmed">{summary}</Text>
      {!searchActive && total > PAGE_SIZE && (
        <Pagination size="sm" total={Math.ceil(total / PAGE_SIZE)} value={page} onChange={onChange} />
      )}
    </Group>
  );
}
