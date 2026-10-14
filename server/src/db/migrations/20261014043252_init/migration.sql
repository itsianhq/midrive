CREATE TYPE "node_status" AS ENUM('pending', 'ready');--> statement-breakpoint
CREATE TYPE "node_type" AS ENUM('file', 'folder');--> statement-breakpoint
CREATE TYPE "share_role" AS ENUM('viewer', 'editor');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"parent_id" text,
	"type" "node_type" NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"size" bigint DEFAULT 0 NOT NULL,
	"storage_key" text,
	"thumbnail_key" text,
	"status" "node_status" DEFAULT 'ready'::"node_status" NOT NULL,
	"upload_id" text,
	"created_by_id" text,
	"trashed_at" timestamp with time zone,
	"trashed_root" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_not_own_parent" CHECK ("parent_id" <> "id")
);
--> statement-breakpoint
CREATE TABLE "public_link" (
	"id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"node_id" text NOT NULL,
	"created_by_id" text,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL UNIQUE,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1,
	"signup_enabled" boolean DEFAULT true NOT NULL,
	"default_quota" bigint,
	"trash_retention_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "share" (
	"id" text PRIMARY KEY,
	"node_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "share_role" NOT NULL,
	"shared_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star" (
	"user_id" text NOT NULL,
	"node_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"storage_quota" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "node_owner_parent_idx" ON "node" ("owner_id","parent_id");--> statement-breakpoint
CREATE INDEX "node_parent_idx" ON "node" ("parent_id");--> statement-breakpoint
CREATE INDEX "node_owner_updated_idx" ON "node" ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "public_link_node_idx" ON "public_link" ("node_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_node_user_idx" ON "share" ("node_id","user_id");--> statement-breakpoint
CREATE INDEX "share_user_idx" ON "share" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "star_user_node_idx" ON "star" ("user_id","node_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_parent_id_node_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "node"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "node" ADD CONSTRAINT "node_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "public_link" ADD CONSTRAINT "public_link_node_id_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "node"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "public_link" ADD CONSTRAINT "public_link_created_by_id_user_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_node_id_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "node"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "share" ADD CONSTRAINT "share_shared_by_id_user_id_fkey" FOREIGN KEY ("shared_by_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "star" ADD CONSTRAINT "star_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "star" ADD CONSTRAINT "star_node_id_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "node"("id") ON DELETE CASCADE;