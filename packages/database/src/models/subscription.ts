import { TRPCError } from '@trpc/server';
import { and, eq, gte, lte } from 'drizzle-orm';
import { generateId } from '@lobehub/utils';

import { LobeChatDatabase } from '../type';
import { 
  NewUserSubscription,
  UserSubscription,
  userSubscriptions,
} from '../schemas';

/**
 * Error cuando no se encuentra una suscripción
 */
export class SubscriptionNotFoundError extends TRPCError {
  constructor(userId?: string) {
    super({ 
      code: 'NOT_FOUND', 
      message: userId ? `Subscription not found for user: ${userId}` : 'Subscription not found'
    });
  }
}

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

/**
 * Datos extendidos de suscripción con información del producto
 */
export interface SubscriptionWithDetails extends UserSubscription {
  isActive: boolean;
  isPastDue: boolean;
  isCancelled: boolean;
  daysUntilExpiry?: number;
  creditsUsagePercent: number;
}

/**
 * Modelo para manejar suscripciones de usuarios
 */
export class SubscriptionModel {
  constructor(private db: LobeChatDatabase) {}

  /**
   * Obtiene la suscripción actual de un usuario
   * @param userId ID del usuario
   * @returns Suscripción con detalles o null si no tiene
   */
  async getUserSubscription(userId: string): Promise<SubscriptionWithDetails | null> {
    const subscription = await this.db.query.userSubscriptions.findFirst({
      where: eq(userSubscriptions.userId, userId),
      orderBy: [userSubscriptions.createdAt], // La más reciente
    });

    if (!subscription) {
      return null;
    }

    return this.enrichSubscriptionWithDetails(subscription);
  }

  /**
   * Crea una nueva suscripción
   * @param data Datos de la suscripción
   * @returns Suscripción creada
   */
  async createSubscription(data: {
    userId: string;
    plan: string;
    mpCustomerId?: string;
    mpSubscriptionId?: string;
    mpPreferenceId?: string;
    pricing?: number;
    currency?: string;
    recurring?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    periodGrantedCredits?: number;
    storageLimit?: number;
  }): Promise<UserSubscription> {
    // Verificar que el usuario no tenga una suscripción activa
    const existingSubscription = await this.getUserSubscription(data.userId);
    if (existingSubscription?.isActive) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'User already has an active subscription',
      });
    }

    const newSubscription: NewUserSubscription = {
      id: generateId(),
      userId: data.userId,
      plan: data.plan,
      mpCustomerId: data.mpCustomerId || null,
      mpSubscriptionId: data.mpSubscriptionId || null,
      mpPreferenceId: data.mpPreferenceId || null,
      pricing: data.pricing || null,
      currency: data.currency || 'ARS',
      recurring: data.recurring || 'monthly',
      currentPeriodStart: data.currentPeriodStart || null,
      currentPeriodEnd: data.currentPeriodEnd || null,
      periodGrantedCredits: data.periodGrantedCredits || 0,
      periodUsedCredits: 0,
      status: SubscriptionStatus.ACTIVE,
      storageLimit: data.storageLimit || null,
      cancelAtPeriodEnd: false,
    };

    const [created] = await this.db.insert(userSubscriptions).values(newSubscription).returning();
    return created;
  }

  /**
   * Actualiza una suscripción
   * @param userId ID del usuario
   * @param data Datos a actualizar
   * @returns Suscripción actualizada
   */
  async updateSubscription(
    userId: string, 
    data: Partial<UserSubscription>
  ): Promise<UserSubscription> {
    const [updated] = await this.db
      .update(userSubscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userSubscriptions.userId, userId))
      .returning();

    if (!updated) {
      throw new SubscriptionNotFoundError(userId);
    }

    return updated;
  }

  /**
   * Cancela una suscripción
   * @param userId ID del usuario
   * @param cancelAtPeriodEnd Si debe cancelar al final del período actual
   */
  async cancelSubscription(userId: string, cancelAtPeriodEnd: boolean = true): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new SubscriptionNotFoundError(userId);
    }

    const updates: Partial<UserSubscription> = {
      cancelAtPeriodEnd,
      updatedAt: new Date(),
    };

    if (!cancelAtPeriodEnd) {
      // Cancelar inmediatamente
      updates.status = SubscriptionStatus.CANCELLED;
      updates.cancelAt = Math.floor(Date.now() / 1000);
    }

    await this.db
      .update(userSubscriptions)
      .set(updates)
      .where(eq(userSubscriptions.userId, userId));
  }

  /**
   * Reactiva una suscripción cancelada (si aún está en período válido)
   * @param userId ID del usuario
   */
  async reactivateSubscription(userId: string): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      throw new SubscriptionNotFoundError(userId);
    }

    if (!subscription.cancelAtPeriodEnd && !subscription.isCancelled) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Subscription is not cancelled or not eligible for reactivation',
      });
    }

    // Solo se puede reactivar si aún está en período válido
    const now = new Date();
    if (subscription.currentPeriodEnd && subscription.currentPeriodEnd < now) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot reactivate expired subscription',
      });
    }

    await this.db
      .update(userSubscriptions)
      .set({
        cancelAtPeriodEnd: false,
        cancelAt: null,
        status: SubscriptionStatus.ACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, userId));
  }

  /**
   * Busca una suscripción por su ID de Mercado Pago
   * @param mpSubscriptionId ID de suscripción en Mercado Pago
   * @returns Suscripción encontrada o null
   */
  async findByMpSubscriptionId(mpSubscriptionId: string): Promise<UserSubscription | null> {
    const subscription = await this.db.query.userSubscriptions.findFirst({
      where: eq(userSubscriptions.mpSubscriptionId, mpSubscriptionId),
    });

    return subscription || null;
  }

  /**
   * Obtiene todas las suscripciones activas (para jobs de procesamiento)
   * @returns Lista de suscripciones activas
   */
  async getActiveSubscriptions(): Promise<UserSubscription[]> {
    const activeSubscriptions = await this.db.query.userSubscriptions.findMany({
      where: and(
        eq(userSubscriptions.status, SubscriptionStatus.ACTIVE),
        eq(userSubscriptions.cancelAtPeriodEnd, false)
      ),
    });

    return activeSubscriptions;
  }

  /**
   * Obtiene suscripciones que expiran próximamente
   * @param daysAhead Días hacia adelante para buscar expiraciones
   * @returns Suscripciones que expiran pronto
   */
  async getExpiringSubscriptions(daysAhead: number = 7): Promise<UserSubscription[]> {
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + daysAhead);

    return await this.db.query.userSubscriptions.findMany({
      where: and(
        eq(userSubscriptions.status, SubscriptionStatus.ACTIVE),
        gte(userSubscriptions.currentPeriodEnd, now),
        lte(userSubscriptions.currentPeriodEnd, futureDate)
      ),
    });
  }

  /**
   * Actualiza el uso de créditos del período actual
   * @param userId ID del usuario
   * @param creditsUsed Créditos adicionales usados
   */
  async updatePeriodUsage(userId: string, creditsUsed: number): Promise<void> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      return; // No hacer nada si no tiene suscripción
    }

    await this.db
      .update(userSubscriptions)
      .set({
        periodUsedCredits: subscription.periodUsedCredits + creditsUsed,
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, userId));
  }

  /**
   * Renueva el período de una suscripción
   * @param userId ID del usuario
   * @param newPeriodStart Nueva fecha de inicio
   * @param newPeriodEnd Nueva fecha de fin
   * @param grantedCredits Créditos otorgados para el nuevo período
   */
  async renewSubscriptionPeriod(
    userId: string,
    newPeriodStart: Date,
    newPeriodEnd: Date,
    grantedCredits: number
  ): Promise<void> {
    await this.db
      .update(userSubscriptions)
      .set({
        currentPeriodStart: newPeriodStart,
        currentPeriodEnd: newPeriodEnd,
        periodGrantedCredits: grantedCredits,
        periodUsedCredits: 0, // Reset usage for new period
        updatedAt: new Date(),
      })
      .where(eq(userSubscriptions.userId, userId));
  }

  /**
   * Enriquece una suscripción con detalles calculados
   * @param subscription Suscripción base
   * @returns Suscripción con detalles
   */
  private enrichSubscriptionWithDetails(subscription: UserSubscription): SubscriptionWithDetails {
    const now = new Date();
    
    const isActive = subscription.status === SubscriptionStatus.ACTIVE && 
                    (!subscription.currentPeriodEnd || subscription.currentPeriodEnd > now);
    
    const isPastDue = subscription.status === SubscriptionStatus.PAST_DUE;
    const isCancelled = subscription.status === SubscriptionStatus.CANCELLED || 
                       Boolean(subscription.cancelAtPeriodEnd);

    let daysUntilExpiry: number | undefined;
    if (subscription.currentPeriodEnd) {
      const diffMs = subscription.currentPeriodEnd.getTime() - now.getTime();
      daysUntilExpiry = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const creditsUsagePercent = subscription.periodGrantedCredits > 0 
      ? (subscription.periodUsedCredits / subscription.periodGrantedCredits) * 100
      : 0;

    return {
      ...subscription,
      isActive,
      isPastDue,
      isCancelled,
      daysUntilExpiry,
      creditsUsagePercent,
    };
  }
}