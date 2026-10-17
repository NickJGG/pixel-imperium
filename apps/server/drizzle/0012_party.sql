DROP TABLE "coop_room" CASCADE;
--> statement-breakpoint
CREATE TABLE "party" (
	"code" text PRIMARY KEY NOT NULL,
	"previous_codes" text[] NOT NULL,
	"host_id" text NOT NULL,
	"host_seat" integer NOT NULL,
	"seats" jsonb NOT NULL,
	"removed" jsonb NOT NULL,
	"grid" jsonb,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "party" ADD CONSTRAINT "party_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;