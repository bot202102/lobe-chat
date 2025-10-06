/**
 * BillingService
 *
 * Servicio orquestador del sistema de billing.
 * No duplica lógica de modelos, solo agrega lógica de negocio,
 * logs y auditoría.
 *
 * Responsabilidades:
 * - Enriquecer balances con información calculada
 * - Pre-checks de saldo con buffer de seguridad
 * - Registro de uso con cálculo de costos
 * - Coordinación de transacciones complejas
 */

import { computeChatCost } from '@lobehub/model-runtime/client';

import { BILLING_CONFIG, creditsToUSD, formatCredits } from '@/config/billing';
import { getPaymentProvider } from '@/services/payment/factory';

import type {
  AffordabilityCheck,
  CreditGrant,
  GrantCreditsParams,
  PaginatedUsage,
  ReconciliationResult,
  RecordUsageParams,
  UsageFilters,
  UsageLedgerEntry,
  WalletBalance,
  WalletSummary,
} from './types';
import {
  BillingError,
  IdempotencyError,
  InsufficientCreditsError,
  InvalidUsageDataError,
  WalletNotFoundError,
} from './types';

// TODO: Import de modelos cuando estén disponibles
// import { BillingModel } from '@lobehub/database/models/billing';
// import { WalletModel } from '@lobehub/database/models/wallet';
// import { ProductModel } from '@lobehub/database/models/product';

/**
 * BillingService - Orquestador del sistema de billing
 */
export class BillingService {
  // TODO: Inyectar modelos en constructor cuando estén disponibles
  // constructor(
  //   private billingModel: BillingModel,
  //   private walletModel: WalletModel,
  //   private productModel: ProductModel,
  // ) {}

  // ========================================
  // WALLET OPERATIONS
  // ========================================

  /**
   * Obtiene el balance del wallet con información enriquecida
   * @param userId - ID del usuario
   * @returns Balance enriquecido con warnings y próximo reset
   */
  async getWalletBalance(userId: string): Promise<WalletSummary> {
    try {
      // TODO: Usar WalletModel cuando esté disponible
      // const balance = await this.walletModel.getBalance(userId);
      
      // Por ahora, mock de balance
      const balance: WalletBalance = {
        userId,
        freeCredits: 100_000,
        subscriptionCredits: 0,
        packageCredits: 0,
        totalCredits: 100_000,
        freeResetAt: this.calculateNextResetDate(),
        subscriptionPeriodEnd: null,
        updatedAt: new Date(),
      };

      // Enriquecer con información calculada
      const summary: WalletSummary = {
        ...balance,
        nextResetDate: this.calculateNextResetDate(),
        isLowBalance: balance.totalCredits < BILLING_CONFIG.LOW_BALANCE_THRESHOLD,
        lowBalanceWarning: this.generateLowBalanceWarning(balance.totalCredits),
        estimatedUSD: creditsToUSD(balance.totalCredits),
        expirationWarnings: this.calculateExpirationWarnings(balance),
      };

      return summary;
    } catch (error) {
      if (error instanceof WalletNotFoundError) throw error;
      
      throw new BillingError(
        `Failed to get wallet balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WALLET_BALANCE_ERROR',
      );
    }
  }

  /**
   * Verifica si el usuario puede costear un gasto estimado
   * Aplica un buffer de seguridad para evitar quedarse sin saldo a mitad de request
   * 
   * @param userId - ID del usuario
   * @param estimatedCredits - Créditos estimados necesarios
   * @returns Resultado de verificación con detalles
   */
  async canUserAfford(userId: string, estimatedCredits: number): Promise<AffordabilityCheck> {
    try {
      // Aplicar buffer de seguridad (20% por defecto)
      const required = Math.ceil(
        estimatedCredits * BILLING_CONFIG.PRE_CHECK_BUFFER_MULTIPLIER,
      );

      // TODO: Usar WalletModel cuando esté disponible
      // const canAfford = await this.walletModel.canAfford(userId, required);
      // const balance = await this.walletModel.getBalance(userId);

      // Mock por ahora
      const balance = await this.getWalletBalance(userId);
      const canAfford = balance.totalCredits >= required;

      const result: AffordabilityCheck = {
        canAfford,
        available: balance.totalCredits,
        required,
        breakdown: {
          free: balance.freeCredits,
          subscription: balance.subscriptionCredits,
          package: balance.packageCredits,
        },
      };

      if (!canAfford) {
        result.message = `Insufficient credits. You have ${formatCredits(balance.totalCredits)} but need ${formatCredits(required)} (including safety buffer).`;
      }

      return result;
    } catch (error) {
      throw new BillingError(
        `Failed to check affordability: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AFFORDABILITY_CHECK_ERROR',
      );
    }
  }

  /**
   * Registra el uso de un modelo y deduce créditos
   * Incluye:
   * - Cálculo de costo basado en usage real
   * - Verificación de idempotencia
   * - Transacción atómica (ledger + wallet)
   * - Auditoría completa
   * 
   * @param params - Parámetros del uso
   * @returns Entry creada en el ledger
   */
  async recordUsage(params: RecordUsageParams): Promise<UsageLedgerEntry> {
    // Validar datos de entrada
    if (!params.usage || !params.usage.totalTokens) {
      throw new InvalidUsageDataError('Usage data is missing or invalid');
    }

    try {
      // 1. Verificar idempotencia
      // TODO: Usar BillingModel cuando esté disponible
      // const existing = await this.billingModel.findUsageByIdempotencyKey(params.idempotencyKey);
      // if (existing) {
      //   throw new IdempotencyError(params.idempotencyKey, existing.id);
      // }

      // 2. Calcular costo en créditos
      const { credits, costUsd } = await this.calculateCost(params.usage, params.model);

      // 3. Verificar saldo suficiente
      const affordCheck = await this.canUserAfford(params.userId, credits);
      if (!affordCheck.canAfford) {
        throw new InsufficientCreditsError(affordCheck.available, affordCheck.required);
      }

      // 4. Transacción: crear ledger + deducir wallet
      // TODO: Implementar con modelos cuando estén disponibles
      // return await this.db.transaction(async (tx) => {
      //   const ledgerEntry = await this.billingModel.createUsageLedgerEntry({
      //     ...params,
      //     credits,
      //     costUsd,
      //     source: 'free', // Se determinará en WalletModel
      //     status: 'pending',
      //   }, tx);
      //
      //   await this.walletModel.deductCredits(params.userId, credits, tx);
      //
      //   await this.billingModel.updateUsageStatus(ledgerEntry.id, 'completed', tx);
      //
      //   return ledgerEntry;
      // });

      // Mock por ahora
      const mockEntry: UsageLedgerEntry = {
        id: `usage_${Date.now()}`,
        userId: params.userId,
        sessionId: params.sessionId,
        messageId: params.messageId,
        provider: params.provider,
        model: params.model,
        usageJson: params.usage,
        credits,
        costUsd,
        source: 'free',
        status: 'completed',
        idempotencyKey: params.idempotencyKey,
        createdAt: new Date(),
      };

      console.log('[BillingService] Usage recorded:', {
        userId: params.userId,
        model: params.model,
        credits,
        costUsd,
        tokens: params.usage.totalTokens,
      });

      return mockEntry;
    } catch (error) {
      if (error instanceof InsufficientCreditsError) throw error;
      if (error instanceof IdempotencyError) throw error;
      if (error instanceof InvalidUsageDataError) throw error;

      throw new BillingError(
        `Failed to record usage: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RECORD_USAGE_ERROR',
      );
    }
  }

  /**
   * Obtiene el historial de uso con filtros y paginación
   * @param userId - ID del usuario
   * @param filters - Filtros de búsqueda
   * @returns Historial paginado con summary
   */
  async getUsageHistory(userId: string, filters: UsageFilters = {}): Promise<PaginatedUsage> {
    try {
      // TODO: Implementar con BillingModel cuando esté disponible
      // return await this.billingModel.getUserUsageHistory(userId, filters);

      // Mock por ahora
      return {
        entries: [],
        total: 0,
        page: filters.page || 1,
        pageSize: filters.pageSize || 20,
        totalPages: 0,
        summary: {
          totalCredits: 0,
          totalUsd: 0,
          totalTokens: 0,
          byModel: {},
          byProvider: {},
        },
      };
    } catch (error) {
      throw new BillingError(
        `Failed to get usage history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'USAGE_HISTORY_ERROR',
      );
    }
  }

  // ========================================
  // CREDIT GRANTS
  // ========================================

  /**
   * Otorga créditos a un usuario
   * @param params - Parámetros del grant
   * @returns Grant creado
   */
  async grantCredits(params: GrantCreditsParams): Promise<CreditGrant> {
    try {
      // TODO: Implementar con WalletModel cuando esté disponible
      // return await this.walletModel.grantCredits(
      //   params.userId,
      //   params.credits,
      //   params.source,
      //   params.reason,
      //   {
      //     expiresAt: params.expiresAt,
      //     providerPaymentId: params.providerPaymentId,
      //     providerPreferenceId: params.providerPreferenceId,
      //   }
      // );

      // Mock por ahora
      const mockGrant: CreditGrant = {
        id: `grant_${Date.now()}`,
        userId: params.userId,
        source: params.source,
        credits: params.credits,
        reason: params.reason,
        expiresAt: params.expiresAt || null,
        providerPaymentId: params.providerPaymentId || null,
        providerPreferenceId: params.providerPreferenceId || null,
        providerName: 'mercadopago',
        createdAt: new Date(),
      };

      console.log('[BillingService] Credits granted:', {
        userId: params.userId,
        credits: params.credits,
        source: params.source,
        reason: params.reason,
      });

      return mockGrant;
    } catch (error) {
      throw new BillingError(
        `Failed to grant credits: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GRANT_CREDITS_ERROR',
      );
    }
  }

  // ========================================
  // RECONCILIATION
  // ========================================

  /**
   * Reconcilia el balance del wallet con el ledger
   * Detecta descuadres y genera alertas si exceden el umbral
   * 
   * @param userId - ID del usuario
   * @returns Resultado de reconciliación
   */
  async reconcileWalletBalance(userId: string): Promise<ReconciliationResult> {
    try {
      // TODO: Implementar con WalletModel cuando esté disponible
      // return await this.walletModel.reconcileBalance(userId);

      // Mock por ahora
      const mockResult: ReconciliationResult = {
        userId,
        walletBalance: 100_000,
        calculatedBalance: 100_000,
        difference: 0,
        differencePercent: 0,
        isConsistent: true,
        details: {
          totalGranted: 100_000,
          totalUsed: 0,
          walletFree: 100_000,
          walletSubscription: 0,
          walletPackage: 0,
        },
        timestamp: new Date(),
      };

      if (!mockResult.isConsistent) {
        console.warn('[BillingService] Balance inconsistency detected:', mockResult);
      }

      return mockResult;
    } catch (error) {
      throw new BillingError(
        `Failed to reconcile wallet: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RECONCILE_WALLET_ERROR',
      );
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Calcula el costo en créditos basado en el uso de tokens
   * Usa computeChatCost del runtime para consistencia
   */
  private async calculateCost(
    usage: RecordUsageParams['usage'],
    model: string,
  ): Promise<{ credits: number; costUsd: number }> {
    try {
      // TODO: Obtener pricing del modelo desde model-bank o ProductModel
      // Por ahora usamos pricing mock
      const mockPricing = {
        units: [
          {
            name: 'textInput',
            strategy: 'fixed',
            rate: 2.5, // $2.50 per 1M tokens
            unit: 'millionTokens',
          },
          {
            name: 'textOutput',
            strategy: 'fixed',
            rate: 10.0, // $10 per 1M tokens
            unit: 'millionTokens',
          },
        ],
      };

      const cost = computeChatCost(usage, mockPricing as any);

      return {
        credits: cost.credits || 0,
        costUsd: cost.costInUSD || 0,
      };
    } catch (error) {
      console.error('[BillingService] Cost calculation error:', error);
      
      // Fallback a cálculo simple
      const totalTokens = usage.totalTokens || 0;
      const costUsd = (totalTokens / 1_000_000) * 5; // $5 per 1M tokens promedio
      const credits = Math.ceil(costUsd * BILLING_CONFIG.CREDITS_PER_DOLLAR);

      return { credits, costUsd };
    }
  }

  /**
   * Calcula la próxima fecha de reset de créditos free
   */
  private calculateNextResetDate(): Date {
    const now = new Date();
    const nextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      BILLING_CONFIG.DEFAULT_RESET_DAY,
    );
    return nextMonth;
  }

  /**
   * Genera mensaje de warning si el saldo es bajo
   */
  private generateLowBalanceWarning(totalCredits: number): string | undefined {
    if (totalCredits >= BILLING_CONFIG.LOW_BALANCE_THRESHOLD) {
      return undefined;
    }

    if (totalCredits === 0) {
      return 'Your balance is empty. Top up to continue using LobeChat.';
    }

    return `Your balance is low (${formatCredits(totalCredits)} remaining). Consider topping up to avoid interruptions.`;
  }

  /**
   * Calcula warnings de expiración de créditos
   */
  private calculateExpirationWarnings(
    balance: WalletBalance,
  ): WalletSummary['expirationWarnings'] {
    const warnings: WalletSummary['expirationWarnings'] = [];

    // Warning para free credits
    if (balance.freeCredits > 0 && balance.freeResetAt) {
      const daysUntilExpiry = Math.ceil(
        (balance.freeResetAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilExpiry <= BILLING_CONFIG.EXPIRATION_NOTIFICATION_DAYS) {
        warnings.push({
          source: 'free',
          credits: balance.freeCredits,
          expiresAt: balance.freeResetAt,
          daysUntilExpiry,
        });
      }
    }

    // Warning para subscription credits
    if (balance.subscriptionCredits > 0 && balance.subscriptionPeriodEnd) {
      const daysUntilExpiry = Math.ceil(
        (balance.subscriptionPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntilExpiry <= BILLING_CONFIG.EXPIRATION_NOTIFICATION_DAYS) {
        warnings.push({
          source: 'subscription',
          credits: balance.subscriptionCredits,
          expiresAt: balance.subscriptionPeriodEnd,
          daysUntilExpiry,
        });
      }
    }

    return warnings;
  }
}

// ========================================
// SINGLETON EXPORT
// ========================================

/**
 * Instancia singleton del BillingService
 * TODO: Inyectar modelos cuando estén disponibles
 */
export const billingService = new BillingService();
