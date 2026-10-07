import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { can, isRole, type Role } from "@/lib/domain/permissions";
import { normalizeEmail } from "./auth";
import { ValidationError } from "./organizations";

export class ForbiddenError extends Error {
  constructor() {
    super("אין לך הרשאה לפעולה הזו");
  }
}

export async function listOrganizationsForUser(userId: string) {
  const db = await getDb();
  const rows = await db
    .select({ org: schema.organizations, role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.organizationId, schema.organizations.id))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(asc(schema.organizations.createdAt));
  return rows.map((r) => ({ org: r.org, role: r.role as Role }));
}

export async function getRole(userId: string, organizationId: string): Promise<Role | null> {
  const db = await getDb();
  const [m] = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.organizationId, organizationId)));
  return m && isRole(m.role) ? m.role : null;
}

async function requireOwner(actorUserId: string, organizationId: string) {
  const role = await getRole(actorUserId, organizationId);
  if (!role || !can(role, "manage_members")) throw new ForbiddenError();
}

export async function listMembers(organizationId: string) {
  const db = await getDb();
  return db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.organizationId, organizationId))
    .orderBy(asc(schema.memberships.createdAt));
}

/** הוספת משתמש קיים לעסק. (הזמנה במייל למשתמש שעדיין לא רשום — בשלב הבא.) */
export async function addMember(actorUserId: string, organizationId: string, email: string, role: Role) {
  await requireOwner(actorUserId, organizationId);
  if (!isRole(role)) throw new ValidationError("תפקיד לא תקין");
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, normalizeEmail(email)));
  if (!user) throw new ValidationError("לא נמצא משתמש עם האימייל הזה. בקשו ממנו להירשם קודם.");
  if (await getRole(user.id, organizationId)) throw new ValidationError("המשתמש כבר חבר בעסק");

  await db.transaction(async (tx) => {
    await tx.insert(schema.memberships).values({ organizationId, userId: user.id, role });
    await tx.insert(schema.auditLog).values({
      organizationId,
      action: "add_member",
      entity: "membership",
      entityId: user.id,
      data: { role, by: actorUserId },
    });
  });
}

export async function removeMember(actorUserId: string, organizationId: string, userId: string) {
  await requireOwner(actorUserId, organizationId);
  const members = await listMembers(organizationId);
  const target = members.find((m) => m.userId === userId);
  if (!target) throw new ValidationError("המשתמש אינו חבר בעסק");
  if (target.role === "owner" && members.filter((m) => m.role === "owner").length === 1) {
    throw new ValidationError("לא ניתן להסיר את הבעלים האחרון של העסק");
  }
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.memberships)
      .where(and(eq(schema.memberships.organizationId, organizationId), eq(schema.memberships.userId, userId)));
    await tx.insert(schema.auditLog).values({
      organizationId,
      action: "remove_member",
      entity: "membership",
      entityId: userId,
      data: { by: actorUserId },
    });
  });
}
