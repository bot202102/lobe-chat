-- Extender user_subscriptions con campos específicos de Mercado Pago
ALTER TABLE "user_subscriptions" ADD COLUMN "mp_customer_id" text;
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "mp_subscription_id" text;
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "mp_preference_id" text;
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "current_period_start" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "current_period_end" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "period_granted_credits" integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD COLUMN "period_used_credits" integer DEFAULT 0;
--> statement-breakpoint

-- Actualizar campo stripe_id a mp_payment_id para mayor claridad
ALTER TABLE "user_subscriptions" RENAME COLUMN "stripe_id" TO "mp_payment_id";