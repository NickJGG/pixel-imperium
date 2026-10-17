CREATE TABLE "coop_room" (
	"code" text PRIMARY KEY NOT NULL,
	"previous_codes" text[] NOT NULL,
	"host_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	"cells" text NOT NULL,
	"seats" jsonb NOT NULL,
	"removed" jsonb NOT NULL,
	"solved" boolean NOT NULL,
	"replaying" boolean NOT NULL,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coop_room" ADD CONSTRAINT "coop_room_host_id_user_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;