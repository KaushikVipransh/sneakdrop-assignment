CREATE TYPE "public"."hold_source" AS ENUM('buy', 'waitlist');--> statement-breakpoint
CREATE TYPE "public"."hold_status" AS ENUM('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');--> statement-breakpoint
CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"status" "hold_status" DEFAULT 'ACTIVE' NOT NULL,
	"source" "hold_source" DEFAULT 'buy' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holds_one_active_per_user" ON "holds" USING btree ("drop_id","user_id") WHERE "holds"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "holds_drop_status_expires" ON "holds" USING btree ("drop_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "holds_drop_user" ON "holds" USING btree ("drop_id","user_id");