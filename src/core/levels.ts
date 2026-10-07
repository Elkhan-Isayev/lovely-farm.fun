// invented: the original XP curve did not survive; tuned so the first levels take a couple of days
// and the 30s take months, as players remember.
export const MAX_LEVEL = 60;

export function expToNext(level: number) {
  return Math.round(20 * level ** 1.75 + 10);
}

const TABLE: number[] = [0, 0];
for (let l = 1; l <= MAX_LEVEL; l++) TABLE[l + 1] = TABLE[l] + expToNext(l);

/** Total XP needed to reach a level. */
export const expForLevel = (level: number) => TABLE[Math.min(level, MAX_LEVEL)];

export function levelFromExp(exp: number) {
  let l = 1;
  while (l < MAX_LEVEL && exp >= TABLE[l + 1]) l++;
  return l;
}

export function levelProgress(exp: number) {
  const l = levelFromExp(exp);
  if (l >= MAX_LEVEL) return { level: l, cur: 1, need: 1 };
  return { level: l, cur: exp - TABLE[l], need: TABLE[l + 1] - TABLE[l] };
}
