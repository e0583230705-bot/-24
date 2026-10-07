export const PASSWORD_MIN_LENGTH = 10;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`;
  if (password.length > 200) return "הסיסמה ארוכה מדי";
  return null;
}
