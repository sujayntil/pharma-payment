import { useEffect, useRef, useState } from 'react';

/**
 * Replaces Table.ScrollContainer. Scrolls sideways only when the table really
 * doesn't fit (container narrower than minWidth); otherwise it adds no scroll
 * box, so the table's header can stay pinned while the page scrolls.
 */
export default function TableScroll({ minWidth = 0, children }) {
  const ref = useRef(null);
  const [tight, setTight] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setTight(el.clientWidth < minWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);
  return (
    <div ref={ref} className="table-scroll" style={{ overflowX: tight ? 'auto' : 'visible', maxWidth: '100%' }}>
      <div style={{ minWidth: tight ? minWidth : undefined }}>{children}</div>
    </div>
  );
}
