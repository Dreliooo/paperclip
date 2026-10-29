CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"locale" text,
	"usage_display" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_usage_display_check" CHECK ("user_preferences"."usage_display" is null or "user_preferences"."usage_display" in ('tokens', 'costs', 'both'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_user_uq" ON "user_preferences" USING btree ("user_id");
