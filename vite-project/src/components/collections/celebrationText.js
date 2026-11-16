/**
 * The cheer shown on top, picked when the collection is saved so it varies a
 * little from one collection to the next. Last two words go on the big line.
 */
export const HEADLINES = {
  cleared: ['Well done, Sales King!', 'Boom! Sales King!', 'Cleared it, Sales King!'],
  part: ['Nice one, Sales King!', 'Keep rolling, Sales King!'],
};

/** One cheer at random for this collection. */
export function pickHeadline(cleared) {
  const list = cleared ? HEADLINES.cleared : HEADLINES.part;
  return list[Math.floor(Math.random() * list.length)];
}
