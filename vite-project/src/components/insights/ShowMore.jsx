import { useRef, useState } from 'react';
import { UnstyledButton } from '@mantine/core';
import css from './ShowMore.module.css';

const STEP = 10;

/** First few rows of a list, with "Show 10 more" / "Show less" underneath. */
export default function ShowMore({ items, initial = 5, render }) {
  const [count, setCount] = useState(initial);
  const top = useRef(null);
  // Folding a long list would leave you far below it; bring its start back into view.
  const showLess = () => {
    setCount(initial);
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const left = items.length - count;
  return (
    <>
      <span ref={top} />
      {items.slice(0, count).map(render)}
      {(left > 0 || count > initial) && (
        <div className={css.foot}>
          {left > 0
            ? <UnstyledButton className={css.more} onClick={() => setCount(count + STEP)}>Show {Math.min(STEP, left)} more <span>· {left} left</span></UnstyledButton>
            : <UnstyledButton className={css.more} onClick={showLess}>Show less</UnstyledButton>}
        </div>
      )}
    </>
  );
}
