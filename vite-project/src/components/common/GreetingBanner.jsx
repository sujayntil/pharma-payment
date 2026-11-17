import { useAuth } from '../../hooks/useAppStore';
import { useGreeting } from '../../hooks/useGreeting';
import { crownFor } from '../../utils/crown';
import { dailyLine } from '../../utils/dailyLine';
import classes from './GreetingBanner.module.css';

const STARS = [[14, 38], [30, 62], [70, 30], [22, 48], [58, 74], [40, 86], [10, 70], [66, 56]];
const CLOUDS = [{ top: 16, width: 46, duration: 38, delay: -6 }, { top: 42, width: 32, duration: 52, delay: -30 }];

/**
 * Home greeting: "Good afternoon, Rahul 👑" and the day's line on a calm,
 * slowly moving sky that follows the time of day (sunrise, drifting clouds,
 * moon and stars), with the small pill mascot waving hi in the corner.
 * The crown sits on a small white badge so it never blends into the sky.
 */
export default function GreetingBanner({ name }) {
  const { user } = useAuth();
  const greeting = useGreeting();
  const scene = greeting === 'Good morning' ? 'morning' : greeting === 'Good afternoon' ? 'afternoon' : 'evening';
  const shownName = name || user?.name;
  return (
    <div className={`${classes.banner} ${classes[scene]}`}>
      <div className={classes.sky} aria-hidden>
        {scene === 'morning' && <><Rays color="#fff3bf" /><div className={classes.sun} /><Birds color="#7a3d00" /></>}
        {scene === 'afternoon' && <><Rays color="#fff9db" /><div className={classes.noonSun} /><Birds color="#1c3d6e" /></>}
        {scene === 'afternoon' && CLOUDS.map((cloud) => (
          <div key={cloud.top} className={classes.cloud}
            style={{ top: cloud.top, width: cloud.width, animationDuration: `${cloud.duration}s`, animationDelay: `${cloud.delay}s` }} />
        ))}
        {scene === 'evening' && <>
          <div className={classes.moon} />
          <div className={classes.shooting} />
          {STARS.map(([top, right], index) => (
            <div key={index} className={classes.star} style={{ top: `${top + (index % 3) * 6}%`, right: `${right}%`, animationDelay: `${(index * 0.7) % 3}s` }} />
          ))}
        </>}
      </div>

      <div className={classes.text}>
        <h1 className={classes.hello}>
          {greeting}{shownName ? ', ' : ''}
          {/* Name and crown stay together on one line. */}
          <span className={classes.name}>{shownName}<span className={classes.crown} aria-hidden>{crownFor(user)}</span></span>
        </h1>
        {user?.id && <p className={classes.line}>{dailyLine(user.id)}</p>}
      </div>

      <span className={classes.hi} aria-hidden>Hi!</span>
      <svg className={classes.mascot} viewBox="0 0 200 200" aria-hidden>
        <path d="M62 112 C46 120 40 134 38 146" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
        <g className={classes.arm}>
          <path d="M138 112 C156 100 162 84 164 66" stroke="#1f7a3a" strokeWidth="10" strokeLinecap="round" fill="none" />
          <circle cx="164" cy="60" r="10" fill="#fff" stroke="#1f7a3a" strokeWidth="5" />
        </g>
        <path d="M84 168 L80 186" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
        <path d="M116 168 L120 186" stroke="#1f7a3a" strokeWidth="9" strokeLinecap="round" />
        <rect x="58" y="62" width="84" height="112" rx="42" fill="#fff" stroke="#1f7a3a" strokeWidth="5" />
        <path d="M58 118 V104 A42 42 0 0 1 142 104 V118 Z" fill="#40c057" />
        <circle cx="86" cy="104" r="6" fill="#1b1b1b" />
        <circle cx="114" cy="104" r="6" fill="#1b1b1b" />
        <path d="M88 128 Q100 140 112 128" stroke="#1b1b1b" strokeWidth="5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Rays({ color }) {
  return (
    <svg className={classes.rays} viewBox="0 0 100 100">
      {Array.from({ length: 12 }, (_, index) => (
        <rect key={index} x="48.5" y="2" width="3" height="16" rx="1.5" fill={color} transform={`rotate(${index * 30} 50 50)`} />
      ))}
    </svg>
  );
}

function Birds({ color }) {
  return (
    <svg className={classes.birds} viewBox="0 0 40 20">
      <path d="M2 8 Q7 2 12 8 Q17 2 22 8" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M22 16 Q26 11 30 16 Q34 11 38 16" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
