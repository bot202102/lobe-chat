/**
 * PaymentProviderAdapter Interface
 *
 * Define el contrato que todos los proveedores de pago deben implementar.
 * Esto permite cambiar de Mercado Pago a Stripe o cualquier otro proveedor
 * sin modificar la lógica de negocio.
 */

// ========================================
// TYPES
// ========================================

/**
 * Parámetros para crear un checkout
 */
export interface CheckoutParams {
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

/**
 * Sesión de checkout creada
 */
export interface CheckoutSession {
  id: string;
  url: string;
  customerId?: string;
  expiresAt?: Date;
}

/**
 * Parámetros para crear una suscripción
 */
export interface SubscriptionParams {
  userId: string;
  priceId: string;
  customerId?: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

/**
 * Suscripción creada
 */
export interface Subscription {
  id: string;
  customerId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Evento de webhook procesado
 */
export interface WebhookEvent {
  type: string;
  data: unknown;
  id: string;
  createdAt: Date;
}

/**
 * Parámetros para crear un portal de gestión
 */
export interface PortalParams {
  customerId: string;
  returnUrl: string;
}

/**
 * Sesión del portal de gestión
 */
export interface PortalSession {
  url: string;
}

// ========================================
// PAYMENT PROVIDER ADAPTER INTERFACE
// ========================================

/**
 * Interfaz que deben implementar todos los proveedores de pago
 */
export interface PaymentProviderAdapter {
  /**
   * Nombre del proveedor ('mercadopago', 'stripe', 'paypal', etc.)
   */
  readonly name: string;

  /**
   * Inicializa el proveedor con las credenciales necesarias
   */
  initialize(): Promise<void>;

  // ========================================
  // CUSTOMER MANAGEMENT
  // ========================================

  /**
   * Crea o recupera un customer para el usuario
   * @param userId - ID del usuario en la DB
   * @param email - Email del usuario
   * @returns ID del customer en el proveedor
   */
  createCustomer(userId: string, email: string, metadata?: Record<string, string>): Promise<string>;

  /**
   * Obtiene el customer ID de un usuario si existe
   * @param userId - ID del usuario
   * @returns ID del customer o null si no existe
   */
  getCustomerId(userId: string): Promise<string | null>;

  // ========================================
  // CHECKOUT & PAYMENTS
  // ========================================

  /**
   * Crea una sesión de checkout para compra única o suscripción
   * @param params - Parámetros del checkout
   * @returns Sesión de checkout con URL
   */
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutSession>;

  /**
   * Crea un portal de gestión para que el usuario gestione su suscripción
   * @param params - Parámetros del portal
   * @returns Sesión del portal con URL
   */
  createPortalSession(params: PortalParams): Promise<PortalSession>;

  // ========================================
  // SUBSCRIPTIONS
  // ========================================

  /**
   * Crea una nueva suscripción
   * @param params - Parámetros de la suscripción
   * @returns Suscripción creada
   */
  createSubscription(params: SubscriptionParams): Promise<Subscription>;

  /**
   * Cancela una suscripción
   * @param subscriptionId - ID de la suscripción
   * @param cancelAtPeriodEnd - Si true, cancela al final del período
   * @returns Suscripción actualizada
   */
  cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean): Promise<Subscription>;

  /**
   * Reactiva una suscripción cancelada
   * @param subscriptionId - ID de la suscripción
   * @returns Suscripción actualizada
   */
  reactivateSubscription(subscriptionId: string): Promise<Subscription>;

  /**
   * Obtiene los detalles de una suscripción
   * @param subscriptionId - ID de la suscripción
   * @returns Suscripción o null si no existe
   */
  getSubscription(subscriptionId: string): Promise<Subscription | null>;

  // ========================================
  // WEBHOOKS
  // ========================================

  /**
   * Valida y procesa un webhook del proveedor
   * @param signature - Firma del webhook
   * @param rawBody - Cuerpo raw del request
   * @returns Evento procesado
   */
  handleWebhook(signature: string, rawBody: Buffer): Promise<WebhookEvent>;

  /**
   * Verifica la firma de un webhook
   * @param signature - Firma del webhook
   * @param rawBody - Cuerpo raw del request
   * @returns true si la firma es válida
   */
  verifyWebhookSignature(signature: string, rawBody: Buffer): boolean;
}

// ========================================
// ERROR TYPES
// ========================================

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class WebhookVerificationError extends PaymentProviderError {
  constructor(provider: string, message: string = 'Webhook signature verification failed') {
    super(message, provider, 'WEBHOOK_VERIFICATION_FAILED', 400);
    this.name = 'WebhookVerificationError';
  }
}

export class CustomerNotFoundError extends PaymentProviderError {
  constructor(provider: string, customerId: string) {
    super(`Customer ${customerId} not found`, provider, 'CUSTOMER_NOT_FOUND', 404);
    this.name = 'CustomerNotFoundError';
  }
}

export class SubscriptionNotFoundError extends PaymentProviderError {
  constructor(provider: string, subscriptionId: string) {
    super(`Subscription ${subscriptionId} not found`, provider, 'SUBSCRIPTION_NOT_FOUND', 404);
    this.name = 'SubscriptionNotFoundError';
  }
}
