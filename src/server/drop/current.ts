import { desc } from "drizzle-orm";
import { db } from "../db/client";
import { drops, type Drop } from "../db/schema";

/** The drop the site is selling: the most recently created one. */
export async function getCurrentDrop(): Promise<Drop | null> {
  const [drop] = await db.select().from(drops).orderBy(desc(drops.createdAt)).limit(1);
  return drop ?? null;
}
