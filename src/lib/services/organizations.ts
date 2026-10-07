import "server-only";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isValidIsraeliId } from "@/lib/domain/israeli-id";

export interface NewOrganization {
  /** המשתמש שפותח את העסק — הופך לבעלים */
  ownerUserId: string;
  name: string;
  taxId: string;
  address?: string;
  phone?: string;
  email?: string;
}

export class ValidationError extends Error {}

export async function createOrganization({ ownerUserId, ...input }: NewOrganization) {
  if (!isValidIsraeliId(input.taxId)) throw new ValidationError("מספר ח.פ. / עוסק לא תקין");

  const db = await getDb();
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(schema.organizations)
      // המשרד נשמר כ"שותפות" עם דיווח מע"מ חודשי — שדות שהטבלה דורשת, ללא משמעות במערכת הביקורת
      .values({ ...input, businessType: "partnership", vatFrequency: "monthly" })
      .returning();
    await tx.insert(schema.memberships).values({ organizationId: org.id, userId: ownerUserId, role: "owner" });
    await tx.insert(schema.auditLog).values({
      organizationId: org.id,
      action: "create",
      entity: "organization",
      entityId: org.id,
      data: { ...input, by: ownerUserId },
    });
    return org;
  });
}

export async function getOrganization(id: string) {
  const db = await getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id));
  return org ?? null;
}

