import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useAppRefreshControl } from '../../hooks/useAppRefresh';

function ago(time) {
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
}

/** Round ⟳ in the top bar: reloads the current page in place. */
export default function RefreshButton({ size = 38 }) {
  const { refresh, refreshing, lastUpdated } = useAppRefreshControl();
  // Re-read the time each time the tooltip opens so "x min ago" stays current.
  const [, setTick] = useState(0);
  return (
    <Tooltip label={refreshing ? 'Refreshing…' : `Refresh · updated ${ago(lastUpdated)}`} withArrow openDelay={250} onMouseEnter={() => setTick((t) => t + 1)}>
      <ActionIcon
        variant="default"
        radius="xl"
        size={size}
        onClick={refresh}
        aria-label="Refresh"
        aria-busy={refreshing}
        onMouseEnter={() => setTick((t) => t + 1)}
      >
        <IconRefresh size={size > 34 ? 18 : 16} className={refreshing ? 'app-spin' : undefined} />
      </ActionIcon>
    </Tooltip>
  );
}
