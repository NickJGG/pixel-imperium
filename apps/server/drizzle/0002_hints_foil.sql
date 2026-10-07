CREATE TABLE "hint" (
	"user_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	CONSTRAINT "hint_user_id_puzzle_id_pk" PRIMARY KEY("user_id","puzzle_id")
);
--> statement-breakpoint
ALTER TABLE "solve" ADD COLUMN "foil" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hint" ADD CONSTRAINT "hint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;