import type { Tx } from "../db/client";
import { auditLog } from "../db/schema";

export type AuditInput = {
  entity: "hold" | "order" | "waitlist" | "payment";
  entityId: string;
  dropId?: string | null;
  userId?: string | null;
  from?: string | null;
  to: string;
  meta?: Record<string, unknown>;
  at?: Date;
};

/** Appends transitions to the audit log inside the caller's transaction. */
export async function audit(tx: Tx, entries: AuditInput | AuditInput[]): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  await tx.insert(auditLog).values(
    list.map((e) => ({
      entity: e.entity,
      entityId: e.entityId,
      dropId: e.dropId ?? null,
      userId: e.userId ?? null,
      fromStatus: e.from ?? null,
      toStatus: e.to,
      meta: e.meta ?? null,
      ...(e.at ? { at: e.at } : {}),
    })),
  );
}
