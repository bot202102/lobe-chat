/* eslint-disable sort-keys-fix/sort-keys-fix  */
import { boolean, index, integer, jsonb, numeric, pgTable, text, unique } from 'drizzle-orm/pg-core';

import { timestamps, timestamptz } from './_helpers';
import { users } from './user';

// Tabla de ledger (registro detallado de transacciones de uso)
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: text('id').primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: text('session_id'),
    messageId: text('message_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    usageJson: jsonb('usage_json').notNull(), // ModelTokensUsage object
    credits: integer('credits').notNull(),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
    source: text('source', { enum: ['free', 'subscription', 'package'] }).notNull(),
    status: text('status', { enum: ['pending', 'completed', 'refunded'] }).notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamptz('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('usage_ledger_user_id_idx').on(table.userId),
    createdAtIdx: index('usage_ledger_created_at_idx').on(table.createdAt),
    idempotencyKeyIdx: index('usage_ledger_idempotency_key_idx').on(table.idempotencyKey),
    idempotencyKeyUnique: unique('usage_ledger_idempotency_key_unique').on(table.idempotencyKey),
  }),
);

export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
export type NewUsageLedgerEntry = typeof usageLedger.$inferInsert;

// Tabla de balances actuales (denormalizada para performance)
export const walletBalances = pgTable('wallet_balances', {
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey()
    .notNull(),
  freeCredits: integer('free_credits').default(0).notNull(),
  subscriptionCredits: integer('subscription_credits').default(0).notNull(),
  packageCredits: integer('package_credits').default(0).notNull(),
  totalCredits: integer('total_credits').default(0).notNull(),
  freeResetAt: timestamptz('free_reset_at'),
  subscriptionPeriodEnd: timestamptz('subscription_period_end'),
  updatedAt: timestamptz('updated_at').defaultNow().notNull(),
});

export type WalletBalance = typeof walletBalances.$inferSelect;
export type NewWalletBalance = typeof walletBalances.$inferInsert;

// Tabla de grants (asignaciones de créditos)
export const creditGrants = pgTable(
  'credit_grants',
  {
    id: text('id').primaryKey().notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    source: text('source', { enum: ['free', 'subscription', 'package', 'promo'] }).notNull(),
    credits: integer('credits').notNull(),
    reason: text('reason'), // 'monthly_free', 'subscription_renewal', 'purchase', 'refund'
    expiresAt: timestamptz('expires_at'),
    mpPaymentId: text('mp_payment_id'), // Mercado Pago payment ID
    mpPreferenceId: text('mp_preference_id'), // Mercado Pago preference ID
    createdAt: timestamptz('created_at').defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index('credit_grants_user_id_idx').on(table.userId),
  }),
);

export type CreditGrant = typeof creditGrants.$inferSelect;
export type NewCreditGrant = typeof creditGrants.$inferInsert;

// Tabla de productos (catálogo)
export const products = pgTable('products', {
  id: text('id').primaryKey().notNull(),
  mpProductId: text('mp_product_id').unique(), // Mercado Pago product ID (si aplica)
  name: text('name').notNull(),
  description: text('description'),
  type: text('type', { enum: ['subscription', 'package', 'free'] }).notNull(),
  active: boolean('active').default(true).notNull(),
  metadata: jsonb('metadata'),
  ...timestamps,
});

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

// Tabla de precios
export const prices = pgTable(
  'prices',
  {
    id: text('id').primaryKey().notNull(),
    productId: text('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    mpPriceId: text('mp_price_id').unique(), // Mercado Pago price ID (si aplica)
    amount: integer('amount').notNull(), // En centavos (pesos argentinos)
    currency: text('currency').default('ARS').notNull(),
    interval: text('interval', { enum: ['month', 'year'] }), // null para one-time
    intervalCount: integer('interval_count').default(1),
    credits: integer('credits').notNull(), // Créditos otorgados
    active: boolean('active').default(true).notNull(),
    metadata: jsonb('metadata'),
    ...timestamps,
  },
  (table) => ({
    productIdIdx: index('prices_product_id_idx').on(table.productId),
  }),
);

export type Price = typeof prices.$inferSelect;
export type NewPrice = typeof prices.$inferInsert;

// Tabla de suscripciones extendida (esquema para las tablas existentes)
export const userBudgets = pgTable('user_budgets', {
  id: text('id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey()
    .notNull(),
  freeBudgetId: text('free_budget_id'),
  freeBudgetKey: text('free_budget_key'),
  subscriptionBudgetId: text('subscription_budget_id'),
  subscriptionBudgetKey: text('subscription_budget_key'),
  packageBudgetId: text('package_budget_id'),
  packageBudgetKey: text('package_budget_key'),
  ...timestamps,
});

export type UserBudget = typeof userBudgets.$inferSelect;
export type NewUserBudget = typeof userBudgets.$inferInsert;

export const userSubscriptions = pgTable('user_subscriptions', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  mpPaymentId: text('mp_payment_id'), // Renombrado de stripe_id
  mpCustomerId: text('mp_customer_id'),
  mpSubscriptionId: text('mp_subscription_id'),
  mpPreferenceId: text('mp_preference_id'),
  currency: text('currency'),
  pricing: integer('pricing'),
  billingPaidAt: integer('billing_paid_at'),
  billingCycleStart: integer('billing_cycle_start'),
  billingCycleEnd: integer('billing_cycle_end'),
  currentPeriodStart: timestamptz('current_period_start'),
  currentPeriodEnd: timestamptz('current_period_end'),
  periodGrantedCredits: integer('period_granted_credits').default(0),
  periodUsedCredits: integer('period_used_credits').default(0),
  cancelAtPeriodEnd: boolean('cancel_at_period_end'),
  cancelAt: integer('cancel_at'),
  nextBilling: jsonb('next_billing'),
  plan: text('plan'),
  recurring: text('recurring'),
  storageLimit: integer('storage_limit'),
  status: integer('status'),
  ...timestamps,
});

export type UserSubscription = typeof userSubscriptions.$inferSelect;
export type NewUserSubscription = typeof userSubscriptions.$inferInsert;