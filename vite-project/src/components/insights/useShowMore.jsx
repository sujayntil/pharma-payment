import { useRef, useState } from 'react';
import { UnstyledButton } from '@mantine/core';
import css from './ShowMore.module.css';

/**
 * The same "Show N more · M left" / "Show less" as a hook, for tables and
 * grouped lists: returns the rows to show and the footer to put under them.
 * after: extra footer content (e.g. a "See all" link) shown next to it.
 */
export function useShowMore(items, initial = 5, step = 5, after = null) {
  const [count, setCount] = useState(initial);
  const top = useRef(null);
  const left = items.length - count;
  const showLess = () => {
    setCount(initial);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const toggle = left > 0
    ? <UnstyledButton className={css.more} onClick={() => setCount(count + step)}>Show {Math.min(step, left)} more <span>· {left} left</span></UnstyledButton>
    : count > initial ? <UnstyledButton className={css.more} onClick={showLess}>Show less</UnstyledButton> : null;
  const footer = (toggle || after) ? (
    <div className={css.foot} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span>{toggle}</span>{after}
    </div>
  ) : null;
  return { visible: items.slice(0, count), footer, anchor: <span ref={top} /> };
}
