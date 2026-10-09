CREATE TABLE "lesson_done" (
	"user_id" text NOT NULL,
	"lesson" text NOT NULL,
	"done_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_done_user_id_lesson_pk" PRIMARY KEY("user_id","lesson")
);
--> statement-breakpoint
ALTER TABLE "lesson_done" ADD CONSTRAINT "lesson_done_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;