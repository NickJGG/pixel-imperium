ALTER TABLE "progress" ADD COLUMN "elapsed_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "progress" ADD COLUMN "attempt_hinted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "solve" ADD COLUMN "best_ms" integer;