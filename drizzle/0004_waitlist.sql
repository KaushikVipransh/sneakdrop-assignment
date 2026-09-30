CREATE TYPE "public"."waitlist_status" AS ENUM('WAITING', 'PROMOTED', 'LEFT', 'SKIPPED');--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"drop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "waitlist_status" DEFAULT 'WAITING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"hold_id" uuid
);
--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_one_waiting_per_user" ON "waitlist_entries" USING btree ("drop_id","user_id") WHERE "waitlist_entries"."status" = 'WAITING';--> statement-breakpoint
CREATE INDEX "waitlist_drop_status_created" ON "waitlist_entries" USING btree ("drop_id","status","created_at","id");