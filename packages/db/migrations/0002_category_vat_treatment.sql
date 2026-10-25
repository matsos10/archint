ALTER TABLE "categories" ALTER COLUMN "vat_deductible_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "vat_deductible_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "vat_deduction_key" varchar(40) DEFAULT 'geral' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "vat_bucket" varchar(15) DEFAULT 'outros' NOT NULL;