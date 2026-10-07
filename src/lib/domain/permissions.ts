export type Role = "owner" | "accountant" | "viewer";

export const ROLES: Record<Role, { label: string; description: string }> = {
  owner: { label: "בעלים", description: "גישה מלאה, כולל ניהול משתמשים" },
  accountant: { label: "רואה חשבון / מנהל חשבונות", description: "הפקת מסמכים ורישום הוצאות" },
  viewer: { label: "צפייה בלבד", description: "צפייה בנתונים ובדוחות" },
};

export type Action = "read" | "write_books" | "manage_members";

const MATRIX: Record<Role, Action[]> = {
  owner: ["read", "write_books", "manage_members"],
  accountant: ["read", "write_books"],
  viewer: ["read"],
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.includes(action) ?? false;
}

export function isRole(value: string): value is Role {
  return value in ROLES;
}
