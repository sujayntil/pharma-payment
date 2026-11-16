import { useEffect, useState } from 'react';

/** "Good morning" 5am–12, "Good afternoon" 12–5pm, "Good evening" 5pm–5am, on the phone's own clock. */
function greetingFor(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The greeting for now; re-checked every minute so it changes if the app stays open. */
export function useGreeting() {
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setGreeting(greetingFor(new Date())), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return greeting;
}
