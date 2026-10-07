/**
 * בדיקת ספרת ביקורת של מספר זהות, ח.פ. או מספר עוסק.
 * כולם משתמשים באותו אלגוריתם: 9 ספרות, משקלות 1,2 לסירוגין.
 */
export function isValidIsraeliId(input: string): boolean {
  const digits = input.trim();
  if (!/^\d{5,9}$/.test(digits)) return false;
  const padded = digits.padStart(9, "0");
  let total = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(padded[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    total += n;
  }
  return total % 10 === 0;
}
