/**
 * Billing System Configuration
 *
 * Centraliza todas las constantes y configuraciones del sistema de pagos
 * para evitar magic numbers y facilitar ajustes.
 */

// ========================================
// BILLING CONFIGURATION
// ========================================

export const BILLING_CONFIG = {
  /**
   * Créditos gratuitos mensuales otorgados a usuarios free tier
   * 1,000,000 créditos = $1 USD aproximadamente
   */
  FREE_TIER_CREDITS: Number(process.env.FREE_TIER_MONTHLY_CREDITS || 100_000),

  /**
   * Día del mes en que se resetean los créditos gratuitos (1-31)
   */
  DEFAULT_RESET_DAY: 1,

  /**
   * Umbral de diferencia porcentual permitida en reconciliación
   * Si wallet difiere del ledger en más de este %, se genera alerta
   */
  RECONCILIATION_THRESHOLD_PERCENT: 1,

  /**
   * Proveedor de pagos configurado
   * Opciones: 'mercadopago' | 'stripe' | 'paypal'
   */
  PROVIDER: (process.env.PAYMENT_PROVIDER || 'mercadopago') as
    | 'mercadopago'
    | 'stripe'
    | 'paypal',

  /**
   * Multiplicador de buffer para pre-checks de saldo
   * 1.2 = 20% de margen de seguridad
   */
  PRE_CHECK_BUFFER_MULTIPLIER: 1.2,

  /**
   * Umbral de saldo bajo (muestra warning al usuario)
   */
  LOW_BALANCE_THRESHOLD: 1000,

  /**
   * Días antes de expiración para enviar notificación
   */
  EXPIRATION_NOTIFICATION_DAYS: 7,

  /**
   * TTL del cache de balance en segundos
   */
  BALANCE_CACHE_TTL_SECONDS: 30,

  /**
   * Número de reintentos para webhooks fallidos
   */
  WEBHOOK_RETRY_ATTEMPTS: 3,

  /**
   * Moneda por defecto del sistema
   */
  DEFAULT_CURRENCY: 'ARS' as const,

  /**
   * Conversión de créditos a dólares
   * 1,000,000 créditos = $1 USD
   */
  CREDITS_PER_DOLLAR: 1_000_000,
} as const;

// ========================================
// FEATURE FLAGS
// ========================================

export const FEATURE_FLAGS = {
  /**
   * Habilita el sistema de billing globalmente
   */
  ENABLE_BILLING: process.env.ENABLE_BILLING === 'true',

  /**
   * Porcentaje de usuarios con billing habilitado (0-100)
   * Útil para rollout gradual
   */
  ROLLOUT_PERCENTAGE: Number(process.env.BILLING_ROLLOUT_PERCENTAGE || 0),
} as const;

/**
 * Determina si el billing está habilitado para un usuario específico
 * Usa hash determinista del userId para rollout gradual consistente
 */
export function isBillingEnabledForUser(userId: string): boolean {
  // Si el billing está deshabilitado globalmente, retornar false
  if (!FEATURE_FLAGS.ENABLE_BILLING) return false;

  // Si está al 100%, retornar true
  if (FEATURE_FLAGS.ROLLOUT_PERCENTAGE >= 100) return true;

  // Si está al 0%, retornar false
  if (FEATURE_FLAGS.ROLLOUT_PERCENTAGE <= 0) return false;

  // Hash simple y determinista del userId
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convertir a porcentaje (0-100)
  const userPercentile = Math.abs(hash % 100);

  return userPercentile < FEATURE_FLAGS.ROLLOUT_PERCENTAGE;
}

// ========================================
// CREDIT SOURCES
// ========================================

/**
 * Tipos de fuentes de créditos
 */
export const CREDIT_SOURCES = {
  FREE: 'free',
  SUBSCRIPTION: 'subscription',
  PACKAGE: 'package',
  PROMO: 'promo',
  REFUND: 'refund',
} as const;

export type CreditSource = (typeof CREDIT_SOURCES)[keyof typeof CREDIT_SOURCES];

/**
 * Orden de prelación para deducir créditos
 * (de mayor a menor prioridad)
 */
export const CREDIT_DEDUCTION_ORDER: CreditSource[] = [
  CREDIT_SOURCES.PACKAGE, // Primero paquetes (no expiran)
  CREDIT_SOURCES.SUBSCRIPTION, // Luego suscripción (expiran al fin del período)
  CREDIT_SOURCES.FREE, // Finalmente free tier (reset mensual)
  CREDIT_SOURCES.PROMO, // Promocionales al final
];

// ========================================
// SUBSCRIPTION STATUS
// ========================================

/**
 * Estados de suscripción
 */
export enum SubscriptionStatus {
  ACTIVE = 0,
  CANCELLED = 1,
  PAST_DUE = 2,
  INCOMPLETE = 3,
  TRIALING = 4,
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  [SubscriptionStatus.ACTIVE]: 'Activa',
  [SubscriptionStatus.CANCELLED]: 'Cancelada',
  [SubscriptionStatus.PAST_DUE]: 'Pago Vencido',
  [SubscriptionStatus.INCOMPLETE]: 'Incompleta',
  [SubscriptionStatus.TRIALING]: 'Periodo de Prueba',
};

// ========================================
// USAGE LEDGER STATUS
// ========================================

/**
 * Estados de entries en usage_ledger
 */
export const USAGE_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  FAILED: 'failed',
} as const;

export type UsageStatus = (typeof USAGE_STATUS)[keyof typeof USAGE_STATUS];

// ========================================
// PRODUCT TYPES
// ========================================

/**
 * Tipos de productos
 */
export const PRODUCT_TYPES = {
  FREE: 'free',
  SUBSCRIPTION: 'subscription',
  PACKAGE: 'package',
} as const;

export type ProductType = (typeof PRODUCT_TYPES)[keyof typeof PRODUCT_TYPES];

// ========================================
// INTERVALS
// ========================================

/**
 * Intervalos de facturación
 */
export const BILLING_INTERVALS = {
  MONTH: 'month',
  YEAR: 'year',
  ONE_TIME: null,
} as const;

export type BillingInterval = 'month' | 'year' | null;

// ========================================
// HELPERS
// ========================================

/**
 * Convierte créditos a USD
 */
export function creditsToUSD(credits: number): number {
  return credits / BILLING_CONFIG.CREDITS_PER_DOLLAR;
}

/**
 * Convierte USD a créditos
 */
export function usdToCredits(usd: number): number {
  return Math.round(usd * BILLING_CONFIG.CREDITS_PER_DOLLAR);
}

/**
 * Formatea créditos para mostrar en UI
 */
export function formatCredits(credits: number): string {
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`;
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`;
  }
  return credits.toLocaleString('es-AR');
}

/**
 * Formatea moneda según locale
 */
export function formatCurrency(
  amount: number,
  currency: string = BILLING_CONFIG.DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
  }).format(amount);
}
