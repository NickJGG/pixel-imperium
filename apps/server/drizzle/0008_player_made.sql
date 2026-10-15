CREATE TABLE "draft_campaign" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "draft_campaign_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "draft_puzzle" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"cells" jsonb NOT NULL,
	"colors" jsonb NOT NULL,
	"paper" text,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "draft_puzzle_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "made_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"paper" text NOT NULL,
	"provinces" jsonb NOT NULL,
	"crest" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"retired_at" timestamp,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "made_puzzle" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"seed" jsonb NOT NULL,
	"paper" text,
	"passes" integer NOT NULL,
	"campaign_id" text,
	"draft_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"retired_at" timestamp,
	"removed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "report" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"reporter_id" text,
	"reporter_ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "publish_banned_at" timestamp;--> statement-breakpoint
ALTER TABLE "draft_campaign" ADD CONSTRAINT "draft_campaign_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_puzzle" ADD CONSTRAINT "draft_puzzle_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "made_campaign" ADD CONSTRAINT "made_campaign_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "made_puzzle" ADD CONSTRAINT "made_puzzle_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "made_campaign_author_idx" ON "made_campaign" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "made_puzzle_author_idx" ON "made_puzzle" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "made_puzzle_campaign_idx" ON "made_puzzle" USING btree ("campaign_id");