CREATE TYPE "public"."fakepay_delivery_status" AS ENUM('PENDING', 'DELIVERED', 'DEAD');--> statement-breakpoint
CREATE TABLE "fakepay_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"intent_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" "fakepay_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fakepay_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"min_delay_ms" integer DEFAULT 0 NOT NULL,
	"max_delay_ms" integer DEFAULT 0 NOT NULL,
	"duplicate_rate" real DEFAULT 0 NOT NULL,
	"reorder_rate" real DEFAULT 0 NOT NULL,
	"fail_rate" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fakepay_settings_singleton" CHECK ("fakepay_settings"."id" = 1),
	CONSTRAINT "fakepay_settings_delay_range" CHECK (0 <= "fakepay_settings"."min_delay_ms" and "fakepay_settings"."min_delay_ms" <= "fakepay_settings"."max_delay_ms"),
	CONSTRAINT "fakepay_settings_rates" CHECK ("fakepay_settings"."duplicate_rate" between 0 and 1 and "fakepay_settings"."reorder_rate" between 0 and 1 and "fakepay_settings"."fail_rate" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"intent_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fakepay_deliveries_due" ON "fakepay_deliveries" USING btree ("status","deliver_at");--> statement-breakpoint
CREATE INDEX "fakepay_deliveries_intent" ON "fakepay_deliveries" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "webhook_events_received" ON "webhook_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_intent" ON "webhook_events" USING btree ("intent_id");