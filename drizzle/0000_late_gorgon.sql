CREATE TYPE "public"."ai_call_purpose" AS ENUM('issue_analysis', 'issue_match', 'repair');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('minor', 'major', 'critical');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('investigating', 'identified', 'monitoring', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."issue_state" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."repo_computation_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."report_category" AS ENUM('bug', 'abuse', 'inaccuracy', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'triaged', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."skill_level" AS ENUM('beginner', 'intermediate', 'advanced', 'expert');--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"purpose" "ai_call_purpose" NOT NULL,
	"success" boolean NOT NULL,
	"json_valid" boolean,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"rating" smallint,
	"prompt_version" integer,
	"issue_analysis_id" uuid,
	"issue_match_id" uuid,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "github_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"github_id" bigint NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"target" text NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "incident_severity" DEFAULT 'minor' NOT NULL,
	"status" "incident_status" DEFAULT 'investigating' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"repo_computation_id" uuid,
	"level" smallint,
	"summary" text,
	"reasoning" text,
	"suggested_labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clarifying_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"input_hash" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"error" text,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_analyses_level_check" CHECK ("issue_analyses"."level" is null or "issue_analyses"."level" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "issue_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"issue_analysis_id" uuid NOT NULL,
	"fit_rating" smallint,
	"confidence" "confidence",
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_hours" real,
	"deterministic_score" real,
	"final_score" real,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"input_hash" text NOT NULL,
	"error" text,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_matches_fit_rating_check" CHECK ("issue_matches"."fit_rating" is null or "issue_matches"."fit_rating" between 0 and 10),
	CONSTRAINT "issue_matches_estimated_hours_check" CHECK ("issue_matches"."estimated_hours" is null or "issue_matches"."estimated_hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"github_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" "issue_state" DEFAULT 'open' NOT NULL,
	"author_login" text,
	"author_github_id" bigint,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"html_url" text NOT NULL,
	"github_created_at" timestamp with time zone,
	"github_updated_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_languages" (
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"level" "skill_level" NOT NULL,
	"years" real,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_languages_user_id_language_pk" PRIMARY KEY("user_id","language"),
	CONSTRAINT "profile_languages_years_check" CHECK ("profile_languages"."years" is null or "profile_languages"."years" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"headline" text,
	"hours_per_week" smallint,
	"timezone" text,
	"professional_years" real,
	"opensource_years" real,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_hours_per_week_check" CHECK ("profiles"."hours_per_week" is null or "profiles"."hours_per_week" between 0 and 168),
	CONSTRAINT "profiles_professional_years_check" CHECK ("profiles"."professional_years" is null or "profiles"."professional_years" >= 0),
	CONSTRAINT "profiles_opensource_years_check" CHECK ("profiles"."opensource_years" is null or "profiles"."opensource_years" >= 0)
);
--> statement-breakpoint
CREATE TABLE "repo_computations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"commit_sha" text NOT NULL,
	"branch" text,
	"status" "repo_computation_status" DEFAULT 'pending' NOT NULL,
	"hierarchy" jsonb,
	"file_count" integer,
	"algorithm_version" integer DEFAULT 1 NOT NULL,
	"error" text,
	"computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"category" "report_category" DEFAULT 'bug' NOT NULL,
	"message" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"issue_id" uuid,
	"repository_id" uuid,
	"issue_analysis_id" uuid,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text,
	"language" text,
	"stars" integer,
	"size_kb" integer,
	"is_private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"github_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"name" text,
	"email" text,
	"avatar_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_issue_analysis_id_issue_analyses_id_fk" FOREIGN KEY ("issue_analysis_id") REFERENCES "public"."issue_analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_calls" ADD CONSTRAINT "ai_calls_issue_match_id_issue_matches_id_fk" FOREIGN KEY ("issue_match_id") REFERENCES "public"."issue_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_accounts" ADD CONSTRAINT "github_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_analyses" ADD CONSTRAINT "issue_analyses_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_analyses" ADD CONSTRAINT "issue_analyses_repo_computation_id_repo_computations_id_fk" FOREIGN KEY ("repo_computation_id") REFERENCES "public"."repo_computations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_matches" ADD CONSTRAINT "issue_matches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_matches" ADD CONSTRAINT "issue_matches_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_matches" ADD CONSTRAINT "issue_matches_issue_analysis_id_issue_analyses_id_fk" FOREIGN KEY ("issue_analysis_id") REFERENCES "public"."issue_analyses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_languages" ADD CONSTRAINT "profile_languages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_computations" ADD CONSTRAINT "repo_computations_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_issue_analysis_id_issue_analyses_id_fk" FOREIGN KEY ("issue_analysis_id") REFERENCES "public"."issue_analyses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_provider_model_created_at_idx" ON "ai_calls" USING btree ("provider","model","created_at");--> statement-breakpoint
CREATE INDEX "ai_calls_purpose_created_at_idx" ON "ai_calls" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "github_accounts_github_id_idx" ON "github_accounts" USING btree ("github_id");--> statement-breakpoint
CREATE INDEX "health_checks_target_checked_at_idx" ON "health_checks" USING btree ("target","checked_at");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incidents_started_at_idx" ON "incidents" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_analyses_issue_id_idx" ON "issue_analyses" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "issue_analyses_status_idx" ON "issue_analyses" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_matches_user_issue_idx" ON "issue_matches" USING btree ("user_id","issue_id");--> statement-breakpoint
CREATE INDEX "issue_matches_user_id_idx" ON "issue_matches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issue_matches_user_score_idx" ON "issue_matches" USING btree ("user_id","final_score");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_github_id_idx" ON "issues" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_repository_number_idx" ON "issues" USING btree ("repository_id","number");--> statement-breakpoint
CREATE INDEX "issues_repository_state_idx" ON "issues" USING btree ("repository_id","state");--> statement-breakpoint
CREATE INDEX "issues_fetched_at_idx" ON "issues" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "profile_languages_user_id_idx" ON "profile_languages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_computations_repository_commit_idx" ON "repo_computations" USING btree ("repository_id","commit_sha");--> statement-breakpoint
CREATE INDEX "repo_computations_status_idx" ON "repo_computations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_github_id_idx" ON "repositories" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_owner_name_idx" ON "repositories" USING btree (lower("owner"),lower("name"));--> statement-breakpoint
CREATE INDEX "repositories_language_idx" ON "repositories" USING btree ("language");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_id_idx" ON "users" USING btree ("github_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_github_login_idx" ON "users" USING btree (lower("github_login"));