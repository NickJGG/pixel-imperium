ALTER TABLE "draft_campaign" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "draft_campaign" SET "created_at" = "updated_at";
