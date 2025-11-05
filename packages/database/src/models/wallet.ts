import { TRPCError } from '@trpc/server';
import { eq, sql, sum } from 'drizzle-orm';
import { generateId } from '@lobehub/utils';

import { LobeChatDatabase } from '../type';
import { 
  creditGrants,
  NewCreditGrant,
  NewWalletBalance,
  usageLedger,
  walletBalances,
  WalletBalance,
} from '../schemas';

/**
 * Error cuando no hay suficientes créditos
 */
export class InsufficientCreditsError extends TRPCError {
  constructor(required: number, available: number) {
    super({ 
      code: 'PAYMENT_REQUIRED', 
      message: `Insufficient credits. Required: ${required}, Available: ${available}` 
    });
  }
}

/**
 * Fuente de créditos
 */
export type CreditSource = 'free' | 'subscription' | 'package' | 'promo';

/**
 * Razón del grant de créditos
 */
export type CreditReason = 'monthly_free' | 'subscription_renewal' | 'purchase' | 'refund' | 'promo' | 'manual_adjustment';

/**
 * Resumen de balance de wallet
 */
export interface WalletSummary {
  userId: string;
  freeCredits: number;
  subscriptionCredits: number;
  packageCredits: number;
  totalCredits: number;
  freeResetAt?: Date | null;
  subscriptionPeriodEnd?: Date | null;
  lastUpdated: Date;
}

/**
 * Modelo para manejar wallets y créditos de usuarios
 */
export class WalletModel {
  constructor(private db: LobeChatDatabase) {}

  /**
   * Obtiene o crea el wallet de un usuario
   * @param userId ID del usuario
   * @returns Wallet del usuario
   */
  async getOrCreateWallet(userId: string): Promise<WalletBalance> {
    // Intentar obtener wallet existente
    let wallet = await this.db.query.walletBalances.findFirst({
      where: eq(walletBalances.userId, userId),
    });

    // Si no existe, crear uno nuevo con créditos free iniciales
    if (!wallet) {
      const newWallet: NewWalletBalance = {
        userId,
        freeCredits: 100000, // 100k créditos gratis iniciales
        subscriptionCredits: 0,
        packageCredits: 0,
        totalCredits: 100000,
        freeResetAt: this.getNextMonthlyReset(),
      };

      [wallet] = await this.db.insert(walletBalances).values(newWallet).returning();

      // Crear grant inicial de créditos free
      await this.createCreditGrant({
        userId,
        source: 'free',
        credits: 100000,
        reason: 'monthly_free',
      });
    }

    return wallet;
  }

  /**
   * Obtiene el balance actual de un usuario
   * @param userId ID del usuario
   * @returns Resumen del balance
   */
  async getBalance(userId: string): Promise<WalletSummary> {
    const wallet = await this.getOrCreateWallet(userId);
    
    return {
      userId: wallet.userId,
      freeCredits: wallet.freeCredits,
      subscriptionCredits: wallet.subscriptionCredits,
      packageCredits: wallet.packageCredits,
      totalCredits: wallet.totalCredits,
      freeResetAt: wallet.freeResetAt,
      subscriptionPeriodEnd: wallet.subscriptionPeriodEnd,
      lastUpdated: wallet.updatedAt,
    };
  }

  /**
   * Deduce créditos del wallet del usuario siguiendo orden de prioridad
   * @param userId ID del usuario
   * @param credits Cantidad de créditos a deducir
   * @param source Fuente preferida de créditos (opcional)
   * @returns Fuente de la cual se dedujeron los créditos
   */
  async deductCredits(
    userId: string, 
    credits: number, 
    source?: CreditSource
  ): Promise<{ source: CreditSource; remainingCredits: number }> {
    return await this.db.transaction(async (tx) => {
      // Obtener wallet actual
      const wallet = await tx.query.walletBalances.findFirst({
        where: eq(walletBalances.userId, userId),
      });

      if (!wallet) {
        throw new InsufficientCreditsError(credits, 0);
      }

      if (wallet.totalCredits < credits) {
        throw new InsufficientCreditsError(credits, wallet.totalCredits);
      }

      let remainingToDeduct = credits;
      let deductedFrom: CreditSource;
      let newPackageCredits = wallet.packageCredits;
      let newSubscriptionCredits = wallet.subscriptionCredits;
      let newFreeCredits = wallet.freeCredits;

      // Orden de prioridad: package → subscription → free (a menos que se especifique source)
      if (source) {
        // Deducir de la fuente especificada
        switch (source) {
          case 'package':
            if (wallet.packageCredits >= remainingToDeduct) {
              newPackageCredits -= remainingToDeduct;
              remainingToDeduct = 0;
              deductedFrom = 'package';
            }
            break;
          case 'subscription':
            if (wallet.subscriptionCredits >= remainingToDeduct) {
              newSubscriptionCredits -= remainingToDeduct;
              remainingToDeduct = 0;
              deductedFrom = 'subscription';
            }
            break;
          case 'free':
            if (wallet.freeCredits >= remainingToDeduct) {
              newFreeCredits -= remainingToDeduct;
              remainingToDeduct = 0;
              deductedFrom = 'free';
            }
            break;
        }
      } else {
        // Orden automático: package → subscription → free
        if (wallet.packageCredits > 0 && remainingToDeduct > 0) {
          const deductAmount = Math.min(wallet.packageCredits, remainingToDeduct);
          newPackageCredits -= deductAmount;
          remainingToDeduct -= deductAmount;
          deductedFrom = 'package';
        }

        if (wallet.subscriptionCredits > 0 && remainingToDeduct > 0) {
          const deductAmount = Math.min(wallet.subscriptionCredits, remainingToDeduct);
          newSubscriptionCredits -= deductAmount;
          remainingToDeduct -= deductAmount;
          deductedFrom = 'subscription';
        }

        if (wallet.freeCredits > 0 && remainingToDeduct > 0) {
          const deductAmount = Math.min(wallet.freeCredits, remainingToDeduct);
          newFreeCredits -= deductAmount;
          remainingToDeduct -= deductAmount;
          deductedFrom = 'free';
        }
      }

      if (remainingToDeduct > 0) {
        throw new InsufficientCreditsError(credits, wallet.totalCredits);
      }

      // Actualizar wallet
      const newTotalCredits = newPackageCredits + newSubscriptionCredits + newFreeCredits;
      
      await tx
        .update(walletBalances)
        .set({
          packageCredits: newPackageCredits,
          subscriptionCredits: newSubscriptionCredits,
          freeCredits: newFreeCredits,
          totalCredits: newTotalCredits,
          updatedAt: new Date(),
        })
        .where(eq(walletBalances.userId, userId));

      return {
        source: deductedFrom!,
        remainingCredits: newTotalCredits,
      };
    });
  }

  /**
   * Otorga créditos a un usuario
   * @param userId ID del usuario
   * @param credits Cantidad de créditos a otorgar
   * @param source Fuente de los créditos
   * @param reason Razón del otorgamiento
   * @param metadata Metadata adicional (ej. payment IDs)
   */
  async grantCredits(
    userId: string,
    credits: number,
    source: CreditSource,
    reason: CreditReason,
    metadata: {
      expiresAt?: Date;
      mpPaymentId?: string;
      mpPreferenceId?: string;
    } = {}
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Crear grant record
      await this.createCreditGrant({
        userId,
        source,
        credits,
        reason,
        expiresAt: metadata.expiresAt,
        mpPaymentId: metadata.mpPaymentId,
        mpPreferenceId: metadata.mpPreferenceId,
      }, tx);

      // Actualizar wallet balance
      const wallet = await this.getOrCreateWallet(userId);
      
      let updates: Partial<WalletBalance> = {
        updatedAt: new Date(),
      };

      switch (source) {
        case 'free':
          updates.freeCredits = wallet.freeCredits + credits;
          break;
        case 'subscription':
          updates.subscriptionCredits = wallet.subscriptionCredits + credits;
          if (metadata.expiresAt) {
            updates.subscriptionPeriodEnd = metadata.expiresAt;
          }
          break;
        case 'package':
        case 'promo':
          updates.packageCredits = wallet.packageCredits + credits;
          break;
      }

      updates.totalCredits = 
        (updates.freeCredits ?? wallet.freeCredits) +
        (updates.subscriptionCredits ?? wallet.subscriptionCredits) +
        (updates.packageCredits ?? wallet.packageCredits);

      await tx
        .update(walletBalances)
        .set(updates)
        .where(eq(walletBalances.userId, userId));
    });
  }

  /**
   * Resetea los créditos gratuitos mensuales de un usuario
   * @param userId ID del usuario
   * @param amount Nueva cantidad de créditos gratuitos
   */
  async resetFreeCredits(userId: string, amount: number = 100000): Promise<void> {
    await this.db.transaction(async (tx) => {
      const wallet = await this.getOrCreateWallet(userId);
      
      const newTotalCredits = amount + wallet.subscriptionCredits + wallet.packageCredits;
      
      await tx
        .update(walletBalances)
        .set({
          freeCredits: amount,
          totalCredits: newTotalCredits,
          freeResetAt: this.getNextMonthlyReset(),
          updatedAt: new Date(),
        })
        .where(eq(walletBalances.userId, userId));

      // Crear grant record del reset
      await this.createCreditGrant({
        userId,
        source: 'free',
        credits: amount,
        reason: 'monthly_free',
      }, tx);
    });
  }

  /**
   * Verifica si un usuario puede pagar una cantidad de créditos
   * @param userId ID del usuario
   * @param estimatedCredits Créditos estimados necesarios
   * @returns true si puede pagar, false si no
   */
  async canAfford(userId: string, estimatedCredits: number): Promise<boolean> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.totalCredits >= estimatedCredits;
  }

  /**
   * Reconcilia el balance de wallet con los grants y usage del ledger
   * @param userId ID del usuario
   * @returns Reporte de reconciliación
   */
  async reconcileBalance(userId: string): Promise<{
    walletTotal: number;
    calculatedTotal: number;
    difference: number;
    needsAdjustment: boolean;
  }> {
    const wallet = await this.getOrCreateWallet(userId);
    
    // Calcular total desde grants
    const grantsResult = await this.db
      .select({ total: sum(creditGrants.credits) })
      .from(creditGrants)
      .where(eq(creditGrants.userId, userId));
    
    const totalGranted = grantsResult[0]?.total || 0;

    // Calcular total usado desde ledger
    const usageResult = await this.db
      .select({ total: sum(usageLedger.credits) })
      .from(usageLedger)
      .where(eq(usageLedger.userId, userId));
    
    const totalUsed = usageResult[0]?.total || 0;

    const calculatedTotal = totalGranted - totalUsed;
    const difference = Math.abs(wallet.totalCredits - calculatedTotal);
    const needsAdjustment = difference > wallet.totalCredits * 0.01; // 1% threshold

    return {
      walletTotal: wallet.totalCredits,
      calculatedTotal,
      difference,
      needsAdjustment,
    };
  }

  /**
   * Crea un grant de créditos
   * @param params Parámetros del grant
   * @param tx Transacción opcional
   */
  private async createCreditGrant(
    params: {
      userId: string;
      source: CreditSource;
      credits: number;
      reason: CreditReason;
      expiresAt?: Date;
      mpPaymentId?: string;
      mpPreferenceId?: string;
    },
    tx?: any
  ): Promise<void> {
    const grant: NewCreditGrant = {
      id: generateId(),
      userId: params.userId,
      source: params.source,
      credits: params.credits,
      reason: params.reason,
      expiresAt: params.expiresAt || null,
      mpPaymentId: params.mpPaymentId || null,
      mpPreferenceId: params.mpPreferenceId || null,
    };

    const db = tx || this.db;
    await db.insert(creditGrants).values(grant);
  }

  /**
   * Calcula la próxima fecha de reset mensual
   * @returns Fecha del próximo reset
   */
  private getNextMonthlyReset(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }
}