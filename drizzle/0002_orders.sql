CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"hold_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_hold_id_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."holds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_hold_unique" ON "orders" USING btree ("hold_id");--> statement-breakpoint
CREATE INDEX "orders_drop_user" ON "orders" USING btree ("drop_id","user_id");