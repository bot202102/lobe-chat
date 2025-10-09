/**
 * SubscriptionService
 *
 * Servicio para gestión de suscripciones con lógica de negocio completa.
 * Coordina entre el proveedor de pago (Mercado Pago, Stripe, etc.) y la base de datos.
 *
 * Responsabilidades:
 * - Crear y gestionar suscripciones
 * - Sincronizar con proveedor de pago
 * - Grant automático de créditos
 * - Renovación y cancelación de períodos
 */

import { SubscriptionStatus } from '@/config/billing';
import { getPaymentProvider } from '@/services/payment/factory';

import { billingService } from '../billing';
import type { GrantCreditsParams } from '../billing/types';
import { BillingError } from '../billing/types';

// TODO: Import de modelos cuando estén disponibles
// import { SubscriptionModel } from '@lobehub/database/models/subscription';
// import { ProductModel } from '@lobehub/database/models/product';
// import { WalletModel } from '@lobehub/database/models/wallet';

// ========================================
// TYPES
// ========================================

/**
 * Suscripción del usuario con datos calculados
 */
export interface UserSubscription {
  id: string;
  userId: string;
  plan: string;
  status: SubscriptionStatus;
  providerName: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  pricing: number;
  currency: string;
  recurring: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  periodGrantedCredits: number;
  periodUsedCredits: number;
  cancelAtPeriodEnd: boolean;
  cancelAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Calculated fields
  isActive: boolean;
  isPastDue: boolean;
  isCancelled: boolean;
  daysUntilExpiry: number | null;
  creditsUsagePercent: number;
}

/**
 * Parámetros para crear suscripción
 */
export interface CreateSubscriptionParams {
  userId: string;
  priceId: string;
  paymentMethodId?: string;
  trialDays?: number;
}

/**
 * Parámetros para cambiar plan
 */
export interface ChangePlanParams {
  userId: string;
  newPriceId: string;
  prorate?: boolean;
}

// ========================================
// SUBSCRIPTION SERVICE
// ========================================

export class SubscriptionService {
  private paymentProvider = getPaymentProvider();

  // TODO: Inyectar modelos en constructor cuando estén disponibles
  // constructor(
  //   private subscriptionModel: SubscriptionModel,
  //   private productModel: ProductModel,
  //   private walletModel: WalletModel,
  // ) {}

  // ========================================
  // SUBSCRIPTION MANAGEMENT
  // ========================================

  /**
   * Obtiene la suscripción actual del usuario con datos calculados
   * @param userId - ID del usuario
   * @returns Suscripción o null si no tiene
   */
  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    try {
      // TODO: Implementar con SubscriptionModel cuando esté disponible
      // const subscription = await this.subscriptionModel.getUserSubscription(userId);
      // return subscription;

      // Mock por ahora
      return null;
    } catch (error) {
      throw new BillingError(
        `Failed to get subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_SUBSCRIPTION_ERROR',
      );
    }
  }

  /**
   * Crea una nueva suscripción
   * 
   * Flujo:
   * 1. Validar que no tenga suscripción activa
   * 2. Obtener datos del price desde DB
   * 3. Crear en proveedor de pago
   * 4. Guardar en DB local
   * 5. Grant inicial de créditos del período
   * 6. Enviar email de bienvenida
   * 
   * @param params - Parámetros de la suscripción
   * @returns Suscripción creada
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<UserSubscription> {
    try {
      // 1. Validar que no tenga suscripción activa
      const existingSubscription = await this.getUserSubscription(params.userId);
      if (existingSubscription?.isActive) {
        throw new BillingError(
          'User already has an active subscription',
          'SUBSCRIPTION_ALREADY_EXISTS',
          409,
        );
      }

      // 2. Obtener price y calcular créditos
      // TODO: Implementar con ProductModel cuando esté disponible
      // const price = await this.productModel.getPriceById(params.priceId);
      // if (!price || !price.active) {
      //   throw new BillingError('Price not found or inactive', 'PRICE_NOT_FOUND', 404);
      // }

      // Mock por ahora
      const mockPrice = {
        id: params.priceId,
        productId: 'prod_pro',
        providerPriceId: 'mp_price_pro_monthly',
        amount: 20000, // $20,000 ARS
        currency: 'ARS',
        interval: 'month',
        intervalCount: 1,
        credits: 1_000_000,
        active: true,
        metadata: {},
      };

      // 3. Crear en proveedor de pago
      const providerSubscription = await this.paymentProvider.createSubscription({
        userId: params.userId,
        priceId: params.priceId,
        trialDays: params.trialDays,
        metadata: {
          priceId: params.priceId,
          credits: mockPrice.credits.toString(),
        },
      });

      // 4. Guardar en DB
      // TODO: Implementar con SubscriptionModel cuando esté disponible
      // const subscription = await this.subscriptionModel.createSubscription({
      //   userId: params.userId,
      //   plan: price.productName,
      //   providerName: this.paymentProvider.name,
      //   providerCustomerId: providerSubscription.customerId,
      //   providerSubscriptionId: providerSubscription.id,
      //   pricing: price.amount,
      //   currency: price.currency,
      //   recurring: price.interval,
      //   currentPeriodStart: providerSubscription.currentPeriodStart,
      //   currentPeriodEnd: providerSubscription.currentPeriodEnd,
      //   periodGrantedCredits: price.credits,
      //   periodUsedCredits: 0,
      //   status: SubscriptionStatus.ACTIVE,
      // });

      // Mock de subscription
      const mockSubscription: UserSubscription = {
        id: `sub_${Date.now()}`,
        userId: params.userId,
        plan: 'Pro',
        status: SubscriptionStatus.ACTIVE,
        providerName: this.paymentProvider.name,
        providerCustomerId: providerSubscription.customerId,
        providerSubscriptionId: providerSubscription.id,
        pricing: mockPrice.amount,
        currency: mockPrice.currency,
        recurring: mockPrice.interval,
        currentPeriodStart: providerSubscription.currentPeriodStart,
        currentPeriodEnd: providerSubscription.currentPeriodEnd,
        periodGrantedCredits: mockPrice.credits,
        periodUsedCredits: 0,
        cancelAtPeriodEnd: false,
        cancelAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
        isPastDue: false,
        isCancelled: false,
        daysUntilExpiry: this.calculateDaysUntilExpiry(providerSubscription.currentPeriodEnd),
        creditsUsagePercent: 0,
      };

      // 5. Grant inicial de créditos
      await billingService.grantCredits({
        userId: params.userId,
        credits: mockPrice.credits,
        source: 'subscription',
        reason: 'subscription_created',
        expiresAt: providerSubscription.currentPeriodEnd,
        providerPaymentId: providerSubscription.id,
      });

      // 6. TODO: Enviar email de bienvenida
      // await emailService.sendSubscriptionConfirmation(params.userId, subscription);

      console.log('[SubscriptionService] Subscription created:', {
        userId: params.userId,
        subscriptionId: mockSubscription.id,
        plan: mockSubscription.plan,
        credits: mockPrice.credits,
      });

      return mockSubscription;
    } catch (error) {
      if (error instanceof BillingError) throw error;

      throw new BillingError(
        `Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_SUBSCRIPTION_ERROR',
      );
    }
  }

  /**
   * Cancela una suscripción
   * @param userId - ID del usuario
   * @param cancelAtPeriodEnd - Si true, cancela al final del período
   * @returns Suscripción actualizada
   */
  async cancelSubscription(
    userId: string,
    cancelAtPeriodEnd: boolean = true,
  ): Promise<UserSubscription> {
    try {
      // 1. Buscar suscripción activa
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        throw new BillingError('No active subscription found', 'SUBSCRIPTION_NOT_FOUND', 404);
      }

      if (!subscription.providerSubscriptionId) {
        throw new BillingError(
          'Subscription has no provider ID',
          'INVALID_SUBSCRIPTION_STATE',
          400,
        );
      }

      // 2. Cancelar en proveedor
      const updatedProviderSub = await this.paymentProvider.cancelSubscription(
        subscription.providerSubscriptionId,
        cancelAtPeriodEnd,
      );

      // 3. Actualizar DB
      // TODO: Implementar con SubscriptionModel cuando esté disponible
      // await this.subscriptionModel.updateSubscription(userId, {
      //   status: cancelAtPeriodEnd ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELLED,
      //   cancelAtPeriodEnd,
      //   cancelAt: cancelAtPeriodEnd ? subscription.currentPeriodEnd : new Date(),
      // });

      // 4. TODO: Enviar email de confirmación
      // await emailService.sendSubscriptionCancelled(userId, cancelAtPeriodEnd);

      console.log('[SubscriptionService] Subscription cancelled:', {
        userId,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd,
      });

      // Mock updated subscription
      return {
        ...subscription,
        cancelAtPeriodEnd,
        cancelAt: cancelAtPeriodEnd ? subscription.currentPeriodEnd : new Date(),
        status: cancelAtPeriodEnd ? SubscriptionStatus.ACTIVE : SubscriptionStatus.CANCELLED,
        updatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof BillingError) throw error;

      throw new BillingError(
        `Failed to cancel subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CANCEL_SUBSCRIPTION_ERROR',
      );
    }
  }

  /**
   * Reactiva una suscripción cancelada
   * Solo funciona si aún está dentro del período activo
   * 
   * @param userId - ID del usuario
   * @returns Suscripción actualizada
   */
  async reactivateSubscription(userId: string): Promise<UserSubscription> {
    try {
      // 1. Buscar suscripción
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        throw new BillingError('No subscription found', 'SUBSCRIPTION_NOT_FOUND', 404);
      }

      if (!subscription.cancelAtPeriodEnd) {
        throw new BillingError(
          'Subscription is not set to cancel',
          'SUBSCRIPTION_NOT_CANCELLED',
          400,
        );
      }

      if (!subscription.providerSubscriptionId) {
        throw new BillingError(
          'Subscription has no provider ID',
          'INVALID_SUBSCRIPTION_STATE',
          400,
        );
      }

      // 2. Verificar que aún esté en período válido
      if (subscription.currentPeriodEnd && new Date() > subscription.currentPeriodEnd) {
        throw new BillingError('Subscription period has ended', 'SUBSCRIPTION_EXPIRED', 400);
      }

      // 3. Reactivar en proveedor
      await this.paymentProvider.reactivateSubscription(subscription.providerSubscriptionId);

      // 4. Actualizar DB
      // TODO: Implementar con SubscriptionModel cuando esté disponible
      // await this.subscriptionModel.updateSubscription(userId, {
      //   cancelAtPeriodEnd: false,
      //   cancelAt: null,
      //   status: SubscriptionStatus.ACTIVE,
      // });

      console.log('[SubscriptionService] Subscription reactivated:', {
        userId,
        subscriptionId: subscription.id,
      });

      // Mock updated subscription
      return {
        ...subscription,
        cancelAtPeriodEnd: false,
        cancelAt: null,
        updatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof BillingError) throw error;

      throw new BillingError(
        `Failed to reactivate subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REACTIVATE_SUBSCRIPTION_ERROR',
      );
    }
  }

  /**
   * Cambia el plan de una suscripción existente
   * @param params - Parámetros del cambio
   * @returns Suscripción actualizada
   */
  async changeSubscription(params: ChangePlanParams): Promise<UserSubscription> {
    try {
      // 1. Validar que tenga suscripción activa
      const subscription = await this.getUserSubscription(params.userId);
      if (!subscription?.isActive) {
        throw new BillingError('No active subscription found', 'SUBSCRIPTION_NOT_FOUND', 404);
      }

      // 2. Obtener nuevo price
      // TODO: Implementar con ProductModel cuando esté disponible
      // const newPrice = await this.productModel.getPriceById(params.newPriceId);

      // 3. Modificar en proveedor (con o sin prorate)
      // Nota: Esto depende del proveedor - MP no tiene prorate automático como Stripe

      // 4. Actualizar DB y ajustar créditos
      // TODO: Implementar lógica de proration de créditos

      console.log('[SubscriptionService] Subscription changed:', {
        userId: params.userId,
        newPriceId: params.newPriceId,
        prorate: params.prorate,
      });

      return subscription;
    } catch (error) {
      if (error instanceof BillingError) throw error;

      throw new BillingError(
        `Failed to change subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CHANGE_SUBSCRIPTION_ERROR',
      );
    }
  }

  // ========================================
  // SUBSCRIPTION RENEWAL
  // ========================================

  /**
   * Renueva una suscripción al inicio del nuevo período
   * Llamado por webhook cuando se recibe payment.succeeded
   * 
   * @param subscriptionId - ID de la suscripción
   * @param paymentId - ID del pago del proveedor
   * @returns Suscripción actualizada
   */
  async renewSubscriptionPeriod(subscriptionId: string, paymentId: string): Promise<void> {
    try {
      // TODO: Implementar con SubscriptionModel cuando esté disponible
      // const subscription = await this.subscriptionModel.findByProviderSubscriptionId(subscriptionId);
      // if (!subscription) {
      //   throw new BillingError('Subscription not found', 'SUBSCRIPTION_NOT_FOUND', 404);
      // }

      // const price = await this.productModel.getPriceById(subscription.priceId);

      // 1. Actualizar período
      const newPeriodStart = new Date();
      const newPeriodEnd = this.calculatePeriodEnd('month', 1);

      // await this.subscriptionModel.updateSubscription(subscription.userId, {
      //   currentPeriodStart: newPeriodStart,
      //   currentPeriodEnd: newPeriodEnd,
      //   periodUsedCredits: 0, // Reset uso del período
      // });

      // 2. Grant de créditos del nuevo período
      await billingService.grantCredits({
        userId: 'user_mock', // TODO: Obtener del subscription
        credits: 1_000_000, // TODO: Obtener del price
        source: 'subscription',
        reason: 'subscription_renewal',
        expiresAt: newPeriodEnd,
        providerPaymentId: paymentId,
      });

      console.log('[SubscriptionService] Subscription renewed:', {
        subscriptionId,
        paymentId,
        newPeriodEnd,
      });
    } catch (error) {
      if (error instanceof BillingError) throw error;

      throw new BillingError(
        `Failed to renew subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RENEW_SUBSCRIPTION_ERROR',
      );
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Calcula el fin del período según el intervalo
   */
  private calculatePeriodEnd(interval: string | null, intervalCount: number = 1): Date {
    const now = new Date();
    
    if (!interval) return now; // One-time purchase

    switch (interval) {
      case 'month':
        return new Date(now.getFullYear(), now.getMonth() + intervalCount, now.getDate());
      case 'year':
        return new Date(now.getFullYear() + intervalCount, now.getMonth(), now.getDate());
      case 'day':
        return new Date(now.getTime() + intervalCount * 24 * 60 * 60 * 1000);
      default:
        return now;
    }
  }

  /**
   * Calcula días hasta expiración
   */
  private calculateDaysUntilExpiry(periodEnd: Date | null): number | null {
    if (!periodEnd) return null;
    
    const now = new Date();
    const diff = periodEnd.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}

// ========================================
// SINGLETON EXPORT
// ========================================

/**
 * Instancia singleton del SubscriptionService
 * TODO: Inyectar modelos cuando estén disponibles
 */
export const subscriptionService = new SubscriptionService();
