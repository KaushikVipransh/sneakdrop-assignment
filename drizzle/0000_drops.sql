CREATE TABLE "drops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"total_stock" integer NOT NULL,
	"hold_seconds" integer DEFAULT 300 NOT NULL,
	"max_per_user" integer DEFAULT 2 NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drops_total_stock_positive" CHECK ("drops"."total_stock" > 0),
	CONSTRAINT "drops_hold_seconds_positive" CHECK ("drops"."hold_seconds" > 0),
	CONSTRAINT "drops_max_per_user_positive" CHECK ("drops"."max_per_user" > 0)
);
