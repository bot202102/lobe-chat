/**
 * MercadoPagoAdapter
 *
 * Implementación del PaymentProviderAdapter para Mercado Pago.
 * Maneja checkouts, suscripciones y webhooks específicos de MP.
 */

import crypto from 'node:crypto';

import type {
  CheckoutParams,
  CheckoutSession,
  PaymentProviderAdapter,
  PortalParams,
  PortalSession,
  Subscription,
  SubscriptionParams,
  WebhookEvent,
} from './interface';
import {
  CustomerNotFoundError,
  PaymentProviderError,
  SubscriptionNotFoundError,
  WebhookVerificationError,
} from './interface';

// ========================================
// MERCADO PAGO SDK TYPES
// ========================================

interface MercadoPagoConfig {
  accessToken: string;
  publicKey?: string;
}

interface MPCustomer {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  metadata?: Record<string, string>;
}

interface MPPreference {
  id: string;
  init_point: string; // URL del checkout
  sandbox_init_point?: string;
  auto_return?: 'approved' | 'all';
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  items: Array<{
    id?: string;
    title: string;
    quantity: number;
    unit_price: number;
    currency_id?: string;
  }>;
  payer?: {
    email?: string;
  };
  metadata?: Record<string, string>;
  external_reference?: string;
}

interface MPSubscription {
  id: string;
  preapproval_plan_id: string;
  payer_id: string;
  status: 'authorized' | 'paused' | 'cancelled' | 'pending';
  reason?: string;
  auto_recurring: {
    frequency: number;
    frequency_type: 'months' | 'days' | 'years';
    transaction_amount: number;
    currency_id: string;
    start_date?: string;
    end_date?: string;
  };
  back_url?: string;
  external_reference?: string;
}

// ========================================
// MERCADO PAGO ADAPTER
// ========================================

export class MercadoPagoAdapter implements PaymentProviderAdapter {
  public readonly name = 'mercadopago';
  private config: MercadoPagoConfig | null = null;
  private baseUrl = 'https://api.mercadopago.com';

  constructor(config?: MercadoPagoConfig) {
    if (config) {
      this.config = config;
    }
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  async initialize(): Promise<void> {
    const accessToken = process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      throw new PaymentProviderError(
        'MP_ACCESS_TOKEN is not configured',
        this.name,
        'MISSING_CREDENTIALS',
      );
    }

    this.config = {
      accessToken,
      publicKey: process.env.MP_PUBLIC_KEY,
    };
  }

  private ensureInitialized(): void {
    if (!this.config?.accessToken) {
      throw new PaymentProviderError('MercadoPago not initialized', this.name, 'NOT_INITIALIZED');
    }
  }

  private getHeaders(): Record<string, string> {
    this.ensureInitialized();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config!.accessToken}`,
    };
  }

  // ========================================
  // CUSTOMER MANAGEMENT
  // ========================================

  async createCustomer(
    userId: string,
    email: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    this.ensureInitialized();

    try {
      // Verificar si ya existe un customer con este userId en metadata
      const existingCustomerId = await this.getCustomerId(userId);
      if (existingCustomerId) {
        return existingCustomerId;
      }

      // Crear nuevo customer
      const response = await fetch(`${this.baseUrl}/v1/customers`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          email,
          metadata: {
            ...metadata,
            userId,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new PaymentProviderError(
          `Failed to create customer: ${error.message || response.statusText}`,
          this.name,
          'CUSTOMER_CREATE_FAILED',
          response.status,
        );
      }

      const customer: MPCustomer = await response.json();
      return customer.id;
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;

      throw new PaymentProviderError(
        `Error creating customer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'CUSTOMER_CREATE_ERROR',
      );
    }
  }

  async getCustomerId(userId: string): Promise<string | null> {
    this.ensureInitialized();

    try {
      // Buscar customers por metadata
      // Nota: MP no tiene búsqueda directa por metadata, necesitamos una estrategia diferente
      // Por ahora retornamos null y creamos uno nuevo cada vez
      // En producción, deberías guardar el customer_id en tu DB
      return null;
    } catch (error) {
      // Si falla la búsqueda, retornar null
      return null;
    }
  }

  // ========================================
  // CHECKOUT & PAYMENTS
  // ========================================

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession> {
    this.ensureInitialized();

    try {
      // Necesitamos obtener el precio de la DB para saber el monto
      // Por ahora usamos un placeholder - esto se debe implementar con el ProductModel
      const preference: Partial<MPPreference> = {
        items: [
          {
            title: 'LobeChat Credits', // Esto debería venir del producto
            quantity: 1,
            unit_price: 20000, // Esto debería venir del precio en la DB
            currency_id: 'ARS',
          },
        ],
        back_urls: {
          success: params.successUrl,
          failure: params.cancelUrl,
          pending: params.cancelUrl,
        },
        auto_return: 'approved',
        external_reference: params.userId,
        metadata: {
          userId: params.userId,
          priceId: params.priceId,
          ...params.metadata,
        },
      };

      const response = await fetch(`${this.baseUrl}/checkout/preferences`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(preference),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new PaymentProviderError(
          `Failed to create checkout: ${error.message || response.statusText}`,
          this.name,
          'CHECKOUT_CREATE_FAILED',
          response.status,
        );
      }

      const mpPreference: MPPreference = await response.json();

      return {
        id: mpPreference.id,
        url: mpPreference.init_point,
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;

      throw new PaymentProviderError(
        `Error creating checkout: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'CHECKOUT_CREATE_ERROR',
      );
    }
  }

  async createPortalSession(params: PortalParams): Promise<PortalSession> {
    // Mercado Pago no tiene un portal de gestión como Stripe
    // Redirigimos a la página de cuenta de MP
    return {
      url: `https://www.mercadopago.com.ar/subscriptions?return_url=${encodeURIComponent(params.returnUrl)}`,
    };
  }

  // ========================================
  // SUBSCRIPTIONS
  // ========================================

  async createSubscription(params: SubscriptionParams): Promise<Subscription> {
    this.ensureInitialized();

    try {
      // Para suscripciones en MP necesitas crear un "preapproval plan" primero
      // Esto es más complejo que en Stripe y requiere pasos adicionales

      const response = await fetch(`${this.baseUrl}/preapproval`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          reason: 'LobeChat Subscription',
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: 20000, // Debería venir del precio
            currency_id: 'ARS',
          },
          back_url: 'https://yourdomain.com/billing',
          payer_email: params.metadata?.email,
          external_reference: params.userId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new PaymentProviderError(
          `Failed to create subscription: ${error.message || response.statusText}`,
          this.name,
          'SUBSCRIPTION_CREATE_FAILED',
          response.status,
        );
      }

      const mpSubscription: MPSubscription = await response.json();

      return {
        id: mpSubscription.id,
        customerId: mpSubscription.payer_id || params.customerId || '',
        status: this.mapMPStatus(mpSubscription.status),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 días después
        ),
        cancelAtPeriodEnd: false,
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;

      throw new PaymentProviderError(
        `Error creating subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'SUBSCRIPTION_CREATE_ERROR',
      );
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean,
  ): Promise<Subscription> {
    this.ensureInitialized();

    try {
      const response = await fetch(`${this.baseUrl}/preapproval/${subscriptionId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          status: cancelAtPeriodEnd ? 'paused' : 'cancelled',
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new SubscriptionNotFoundError(this.name, subscriptionId);
        }

        const error = await response.json();
        throw new PaymentProviderError(
          `Failed to cancel subscription: ${error.message || response.statusText}`,
          this.name,
          'SUBSCRIPTION_CANCEL_FAILED',
          response.status,
        );
      }

      const mpSubscription: MPSubscription = await response.json();

      return {
        id: mpSubscription.id,
        customerId: mpSubscription.payer_id,
        status: this.mapMPStatus(mpSubscription.status),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
        cancelAtPeriodEnd,
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;

      throw new PaymentProviderError(
        `Error cancelling subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'SUBSCRIPTION_CANCEL_ERROR',
      );
    }
  }

  async reactivateSubscription(subscriptionId: string): Promise<Subscription> {
    this.ensureInitialized();

    try {
      const response = await fetch(`${this.baseUrl}/preapproval/${subscriptionId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          status: 'authorized',
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new SubscriptionNotFoundError(this.name, subscriptionId);
        }

        const error = await response.json();
        throw new PaymentProviderError(
          `Failed to reactivate subscription: ${error.message || response.statusText}`,
          this.name,
          'SUBSCRIPTION_REACTIVATE_FAILED',
          response.status,
        );
      }

      const mpSubscription: MPSubscription = await response.json();

      return {
        id: mpSubscription.id,
        customerId: mpSubscription.payer_id,
        status: this.mapMPStatus(mpSubscription.status),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
        cancelAtPeriodEnd: false,
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;

      throw new PaymentProviderError(
        `Error reactivating subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'SUBSCRIPTION_REACTIVATE_ERROR',
      );
    }
  }

  async getSubscription(subscriptionId: string): Promise<Subscription | null> {
    this.ensureInitialized();

    try {
      const response = await fetch(`${this.baseUrl}/preapproval/${subscriptionId}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const error = await response.json();
        throw new PaymentProviderError(
          `Failed to get subscription: ${error.message || response.statusText}`,
          this.name,
          'SUBSCRIPTION_GET_FAILED',
          response.status,
        );
      }

      const mpSubscription: MPSubscription = await response.json();

      return {
        id: mpSubscription.id,
        customerId: mpSubscription.payer_id,
        status: this.mapMPStatus(mpSubscription.status),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
        cancelAtPeriodEnd: mpSubscription.status === 'paused',
      };
    } catch (error) {
      if (error instanceof PaymentProviderError) throw error;
      return null;
    }
  }

  // ========================================
  // WEBHOOKS
  // ========================================

  async handleWebhook(signature: string, rawBody: Buffer): Promise<WebhookEvent> {
    if (!this.verifyWebhookSignature(signature, rawBody)) {
      throw new WebhookVerificationError(this.name);
    }

    try {
      const payload = JSON.parse(rawBody.toString('utf8'));

      // Mercado Pago envía notificaciones en formato diferente a Stripe
      // Tipos: payment, merchant_order, subscription
      const eventType = payload.type || payload.action;
      const data = payload.data || payload;

      return {
        type: this.mapEventType(eventType),
        data,
        id: payload.id || data.id,
        createdAt: new Date(payload.date_created || Date.now()),
      };
    } catch (error) {
      throw new PaymentProviderError(
        `Error parsing webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.name,
        'WEBHOOK_PARSE_ERROR',
      );
    }
  }

  verifyWebhookSignature(signature: string, rawBody: Buffer): boolean {
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn('[MercadoPago] MP_WEBHOOK_SECRET not configured, skipping verification');
      return true; // En desarrollo, permitir sin verificación
    }

    try {
      // Mercado Pago usa HMAC SHA256
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    } catch (error) {
      console.error('[MercadoPago] Webhook signature verification error:', error);
      return false;
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  private mapMPStatus(mpStatus: MPSubscription['status']): string {
    const statusMap: Record<string, string> = {
      authorized: 'active',
      paused: 'paused',
      cancelled: 'cancelled',
      pending: 'pending',
    };

    return statusMap[mpStatus] || 'unknown';
  }

  private mapEventType(mpEventType: string): string {
    const typeMap: Record<string, string> = {
      'payment.created': 'payment.created',
      'payment.updated': 'payment.updated',
      payment: 'payment.approved',
      subscription: 'subscription.updated',
      'subscription.created': 'subscription.created',
      'subscription.updated': 'subscription.updated',
      'subscription.cancelled': 'subscription.cancelled',
    };

    return typeMap[mpEventType] || mpEventType;
  }
}
