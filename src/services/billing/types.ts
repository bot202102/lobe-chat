/**
 * Billing Service Types
 *
 * Tipos compartidos para el sistema de billing
 */

import type { CreditSource, UsageStatus } from '@/config/billing';

// ========================================
// WALLET TYPES
// ========================================

/**
 * Balance completo del wallet con desglose por fuente
 */
export interface WalletBalance {
  userId: string;
  freeCredits: number;
  subscriptionCredits: number;
  packageCredits: number;
  totalCredits: number;
  freeResetAt: Date | null;
  subscriptionPeriodEnd: Date | null;
  updatedAt: Date;
}

/**
 * Resumen enriquecido del wallet para UI
 */
export interface WalletSummary extends WalletBalance {
  // Información adicional calculada
  nextResetDate: Date | null;
  isLowBalance: boolean;
  lowBalanceWarning?: string;
  estimatedUSD: number;
  expirationWarnings: Array<{
    source: CreditSource;
    credits: number;
    expiresAt: Date;
    daysUntilExpiry: number;
  }>;
}

/**
 * Resultado de verificación de saldo
 */
export interface AffordabilityCheck {
  canAfford: boolean;
  available: number;
  required: number;
  message?: string;
  breakdown?: {
    free: number;
    subscription: number;
    package: number;
  };
}

// ========================================
// USAGE TYPES
// ========================================

/**
 * Parámetros para registrar uso
 */
export interface RecordUsageParams {
  userId: string;
  sessionId?: string;
  messageId?: string;
  provider: string;
  model: string;
  usage: ModelTokensUsage;
  idempotencyKey: string;
}

/**
 * Uso de tokens por modelo (viene del runtime)
 */
export interface ModelTokensUsage {
  // Input tokens
  totalInputTokens?: number;
  inputTextTokens?: number;
  inputImageTokens?: number;
  inputAudioTokens?: number;
  inputCachedTokens?: number;
  inputCacheMissTokens?: number;
  inputWriteCacheTokens?: number;
  inputCitationTokens?: number;

  // Output tokens
  totalOutputTokens?: number;
  outputTextTokens?: number;
  outputImageTokens?: number;
  outputAudioTokens?: number;
  outputReasoningTokens?: number;

  // Total
  totalTokens?: number;
}

/**
 * Entry del ledger de uso
 */
export interface UsageLedgerEntry {
  id: string;
  userId: string;
  sessionId?: string;
  messageId?: string;
  provider: string;
  model: string;
  usageJson: ModelTokensUsage;
  credits: number;
  costUsd: number;
  source: CreditSource;
  status: UsageStatus;
  idempotencyKey: string;
  createdAt: Date;
}

/**
 * Filtros para historial de uso
 */
export interface UsageFilters {
  startDate?: Date | string;
  endDate?: Date | string;
  provider?: string;
  model?: string;
  status?: UsageStatus;
  page?: number;
  pageSize?: number;
}

/**
 * Historial de uso paginado
 */
export interface PaginatedUsage {
  entries: UsageLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    totalCredits: number;
    totalUsd: number;
    totalTokens: number;
    byModel: Record<string, { credits: number; count: number }>;
    byProvider: Record<string, { credits: number; count: number }>;
  };
}

/**
 * Estadísticas de uso por período
 */
export interface UsageStats {
  period: {
    start: Date;
    end: Date;
  };
  totalCredits: number;
  totalUsd: number;
  totalRequests: number;
  byModel: Record<
    string,
    {
      credits: number;
      usd: number;
      requests: number;
      tokens: number;
    }
  >;
  byProvider: Record<
    string,
    {
      credits: number;
      usd: number;
      requests: number;
    }
  >;
  byDay: Array<{
    date: string;
    credits: number;
    usd: number;
    requests: number;
  }>;
}

// ========================================
// CREDIT GRANT TYPES
// ========================================

/**
 * Parámetros para otorgar créditos
 */
export interface GrantCreditsParams {
  userId: string;
  credits: number;
  source: CreditSource;
  reason: string;
  expiresAt?: Date;
  providerPaymentId?: string;
  providerPreferenceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Registro de créditos otorgados
 */
export interface CreditGrant {
  id: string;
  userId: string;
  source: CreditSource;
  credits: number;
  reason: string;
  expiresAt: Date | null;
  providerPaymentId: string | null;
  providerPreferenceId: string | null;
  providerName: string | null;
  createdAt: Date;
}

// ========================================
// RECONCILIATION TYPES
// ========================================

/**
 * Resultado de reconciliación de balance
 */
export interface ReconciliationResult {
  userId: string;
  walletBalance: number;
  calculatedBalance: number;
  difference: number;
  differencePercent: number;
  isConsistent: boolean;
  details: {
    totalGranted: number;
    totalUsed: number;
    walletFree: number;
    walletSubscription: number;
    walletPackage: number;
  };
  timestamp: Date;
}

// ========================================
// ERROR TYPES
// ========================================

export class BillingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export class InsufficientCreditsError extends BillingError {
  constructor(
    public readonly available: number,
    public readonly required: number,
  ) {
    super(
      `Insufficient credits: required ${required}, available ${available}`,
      'INSUFFICIENT_CREDITS',
      402,
    );
    this.name = 'InsufficientCreditsError';
  }
}

export class IdempotencyError extends BillingError {
  constructor(
    public readonly idempotencyKey: string,
    public readonly existingEntryId: string,
  ) {
    super(
      `Idempotency key already used: ${idempotencyKey}`,
      'IDEMPOTENCY_KEY_DUPLICATE',
      409,
    );
    this.name = 'IdempotencyError';
  }
}

export class WalletNotFoundError extends BillingError {
  constructor(public readonly userId: string) {
    super(`Wallet not found for user: ${userId}`, 'WALLET_NOT_FOUND', 404);
    this.name = 'WalletNotFoundError';
  }
}

export class InvalidUsageDataError extends BillingError {
  constructor(message: string) {
    super(message, 'INVALID_USAGE_DATA', 400);
    this.name = 'InvalidUsageDataError';
  }
}
