-- Tabla de ledger (registro detallado de transacciones de uso)
CREATE TABLE IF NOT EXISTS "usage_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"message_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"usage_json" jsonb NOT NULL,        -- Copia de ModelTokensUsage
	"credits" integer NOT NULL,         -- Créditos deducidos
	"cost_usd" numeric(10, 6) NOT NULL, -- Costo en USD
	"source" text NOT NULL,             -- 'free' | 'subscription' | 'package'
	"status" text NOT NULL,             -- 'pending' | 'completed' | 'refunded'
	"idempotency_key" text UNIQUE,      -- Para evitar duplicados
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Tabla de balances actuales (denormalizada para performance)
CREATE TABLE IF NOT EXISTS "wallet_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"free_credits" integer DEFAULT 0 NOT NULL,
	"subscription_credits" integer DEFAULT 0 NOT NULL,
	"package_credits" integer DEFAULT 0 NOT NULL,
	"total_credits" integer DEFAULT 0 NOT NULL,
	"free_reset_at" timestamp with time zone,
	"subscription_period_end" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Tabla de grants (asignaciones de créditos)
CREATE TABLE IF NOT EXISTS "credit_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,              -- 'free' | 'subscription' | 'package' | 'promo'
	"credits" integer NOT NULL,
	"reason" text,                       -- 'monthly_free' | 'subscription_renewal' | 'purchase' | 'refund'
	"expires_at" timestamp with time zone,
	"mp_payment_id" text,                -- Mercado Pago payment ID
	"mp_preference_id" text,             -- Mercado Pago preference ID
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Tabla de productos y precios (catálogo)
CREATE TABLE IF NOT EXISTS "products" (
	"id" text PRIMARY KEY NOT NULL,
	"mp_product_id" text UNIQUE,         -- Mercado Pago product ID (si aplica)
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,               -- 'subscription' | 'package' | 'free'
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "prices" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"mp_price_id" text UNIQUE,           -- Mercado Pago price ID (si aplica)
	"amount" integer NOT NULL,          -- En centavos (pesos argentinos)
	"currency" text DEFAULT 'ARS' NOT NULL,
	"interval" text,                    -- 'month' | 'year' | null (para one-time)
	"interval_count" integer DEFAULT 1,
	"credits" integer NOT NULL,         -- Créditos otorgados
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Índices para usage_ledger
CREATE INDEX "usage_ledger_user_id_idx" ON "usage_ledger"("user_id");
--> statement-breakpoint
CREATE INDEX "usage_ledger_created_at_idx" ON "usage_ledger"("created_at");
--> statement-breakpoint
CREATE INDEX "usage_ledger_idempotency_key_idx" ON "usage_ledger"("idempotency_key");
--> statement-breakpoint

-- Índices para credit_grants
CREATE INDEX "credit_grants_user_id_idx" ON "credit_grants"("user_id");
--> statement-breakpoint

-- Índices para prices
CREATE INDEX "prices_product_id_idx" ON "prices"("product_id");
--> statement-breakpoint

-- Foreign keys
DO $$ BEGIN
 ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;