-- Projects can be filed into company folders of kind "project". Nullable:
-- existing projects stay unfiled and keep exactly the access they have.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "folder_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "pg_constraint" WHERE "conname" = 'projects_folder_id_folders_id_fk'
	) THEN
		ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_company_folder_idx" ON "projects" USING btree ("company_id","folder_id");
