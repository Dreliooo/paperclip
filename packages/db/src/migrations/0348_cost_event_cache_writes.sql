-- Nullable on purpose: existing rows did not record cache writes separately.
ALTER TABLE "cost_events" ADD COLUMN "cache_write_input_tokens" integer;
