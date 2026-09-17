# Payment Provider System

Sistema de abstracción de proveedores de pago para LobeChat.

## Arquitectura

El sistema usa el patrón **Adapter** para desacoplar la lógica de negocio de los proveedores de pago específicos.

```
┌──────────────────────────────────────────┐
│   SubscriptionService / BillingService   │
│   (No conocen al proveedor específico)   │
└──────────────────────────────────────────┘
                    ↓
        ┌───────────────────────┐
        │  PaymentProvider      │ 
        │    (Interface)        │
        └───────────────────────┘
                    ↓
        ┌───────────┴───────────┐
        ↓                       ↓
┌──────────────┐      ┌──────────────┐
│ MercadoPago  │      │   Stripe     │
│   Adapter    │      │   Adapter    │
└──────────────┘      └──────────────┘
```

## Componentes

### 1. Interface (`providers/interface.ts`)

Define el contrato que todos los proveedores deben cumplir:

```typescript
interface PaymentProviderAdapter {
  name: string;
  initialize(): Promise<void>;
  
  // Customer Management
  createCustomer(userId, email): Promise<string>;
  getCustomerId(userId): Promise<string | null>;
  
  // Checkout & Payments
  createCheckoutSession(params): Promise<CheckoutSession>;
  createPortalSession(params): Promise<PortalSession>;
  
  // Subscriptions
  createSubscription(params): Promise<Subscription>;
  cancelSubscription(id, cancelAtPeriodEnd): Promise<Subscription>;
  reactivateSubscription(id): Promise<Subscription>;
  getSubscription(id): Promise<Subscription | null>;
  
  // Webhooks
  handleWebhook(signature, rawBody): Promise<WebhookEvent>;
  verifyWebhookSignature(signature, rawBody): boolean;
}
```

### 2. Adapters (`providers/*.ts`)

Implementaciones concretas para cada proveedor.

#### MercadoPagoAdapter

**Características**:
- ✅ Customer management con `/v1/customers`
- ✅ Checkout con Preferences API
- ✅ Suscripciones con Preapproval API
- ✅ Webhooks con verificación HMAC SHA256
- ✅ Mapeo de estados y eventos MP → genéricos

**APIs Utilizadas**:
- `POST /v1/customers` - Crear customer
- `POST /checkout/preferences` - Crear checkout
- `POST /preapproval` - Crear suscripción
- `PUT /preapproval/{id}` - Cancelar/reactivar
- `GET /preapproval/{id}` - Obtener suscripción

**Eventos de Webhook**:
- `payment.created` → `payment.created`
- `payment.updated` → `payment.updated`
- `payment` → `payment.approved`
- `subscription.updated` → `subscription.updated`

**Particularidades**:
- Portal de gestión no existe (redirige a MP)
- Suscripciones usan "preapproval" en lugar de "subscription"
- Webhooks usan `x-signature` en lugar de firma en header

#### StripeAdapter (TODO)

Implementación futura para Stripe.

### 3. Factory (`factory.ts`)

Gestiona la creación y selección de proveedores:

```typescript
// Obtener proveedor configurado
const provider = getPaymentProvider();

// Obtener proveedor específico (útil para webhooks)
const mpProvider = getPaymentProviderByName('mercadopago');

// Registrar nuevo proveedor
registerPaymentProvider('paypal', () => new PayPalAdapter());

// Listar disponibles
const available = listAvailableProviders(); // ['mercadopago', 'stripe']
```

## Configuración

### Variables de Entorno

```bash
# Selección de proveedor
PAYMENT_PROVIDER=mercadopago

# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-xxxxxxxxxx
MP_PUBLIC_KEY=APP_USR-xxxxxxxxxx  # Opcional
MP_WEBHOOK_SECRET=xxxxxxxxxx      # Para verificar webhooks

# Stripe (futuro)
# STRIPE_SECRET_KEY=sk_live_xxxxx
# STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
# STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

### Configuración en Código

En `src/config/billing.ts`:

```typescript
export const BILLING_CONFIG = {
  PROVIDER: process.env.PAYMENT_PROVIDER || 'mercadopago',
  // ...más config
};
```

## Uso

### En Servicios

```typescript
import { getPaymentProvider } from '@/services/payment/factory';

class SubscriptionService {
  private paymentProvider = getPaymentProvider();
  
  async createSubscription(params) {
    // Crear en proveedor de pago (abstracción automática)
    const subscription = await this.paymentProvider.createSubscription({
      userId: params.userId,
      priceId: params.priceId,
    });
    
    // Guardar en DB...
  }
}
```

### En Webhooks

```typescript
// src/app/api/webhooks/[provider]/route.ts
export async function POST(req, { params }) {
  const providerName = params.provider; // 'mercadopago' or 'stripe'
  const provider = getPaymentProviderByName(providerName);
  
  const signature = req.headers.get('x-signature');
  const rawBody = await req.arrayBuffer();
  
  const event = await provider.handleWebhook(signature, Buffer.from(rawBody));
  
  // Procesar evento...
}
```

## Agregar Nuevo Proveedor

1. **Crear Adapter**:

```typescript
// src/services/payment/providers/stripe.ts
import type { PaymentProviderAdapter } from './interface';

export class StripeAdapter implements PaymentProviderAdapter {
  name = 'stripe';
  
  async initialize() {
    // Setup Stripe SDK
  }
  
  // Implementar todos los métodos...
}
```

2. **Registrar en Factory**:

```typescript
// src/services/payment/factory.ts
import { StripeAdapter } from './providers/stripe';

const PROVIDERS = {
  mercadopago: () => new MercadoPagoAdapter(),
  stripe: () => new StripeAdapter(), // ← Agregar aquí
};
```

3. **Configurar Variables**:

```bash
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

4. **Listo!** Todo el sistema automáticamente usa el nuevo proveedor.

## Tipos de Datos Normalizados

### CheckoutSession

```typescript
interface CheckoutSession {
  id: string;
  url: string;              // URL para redirigir al usuario
  customerId?: string;
  expiresAt?: Date;
}
```

### Subscription

```typescript
interface Subscription {
  id: string;
  customerId: string;
  status: string;           // 'active', 'cancelled', 'paused', etc.
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, unknown>;
}
```

### WebhookEvent

```typescript
interface WebhookEvent {
  type: string;             // 'payment.approved', 'subscription.updated', etc.
  data: unknown;            // Datos del evento (varía según tipo)
  id: string;
  createdAt: Date;
}
```

## Manejo de Errores

Todos los adapters deben lanzar errores estandarizados:

```typescript
// Error genérico
throw new PaymentProviderError(
  'Failed to create checkout',
  'mercadopago',
  'CHECKOUT_CREATE_FAILED',
  500
);

// Error de verificación de webhook
throw new WebhookVerificationError('mercadopago');

// Customer no encontrado
throw new CustomerNotFoundError('mercadopago', customerId);

// Subscription no encontrada
throw new SubscriptionNotFoundError('mercadopago', subscriptionId);
```

## Testing

### Mock de Proveedor

```typescript
import { registerPaymentProvider } from '@/services/payment/factory';

class MockPaymentProvider implements PaymentProviderAdapter {
  name = 'mock';
  
  async initialize() {}
  
  async createCheckoutSession() {
    return {
      id: 'mock_checkout',
      url: 'https://mock.com/checkout',
    };
  }
  
  // ...más métodos mockeados
}

// En tests
beforeAll(() => {
  registerPaymentProvider('mock', () => new MockPaymentProvider());
  process.env.PAYMENT_PROVIDER = 'mock';
});
```

## Webhooks

### Verificación de Firma

Cada proveedor tiene su método de verificación:

**Mercado Pago**: HMAC SHA256
```typescript
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(rawBody)
  .digest('hex');
```

**Stripe**: Stripe SDK con timestamp
```typescript
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  webhookSecret
);
```

### Procesamiento de Eventos

```typescript
async handlePaymentEvent(event: WebhookEvent) {
  switch(event.type) {
    case 'payment.approved':
      await handlePaymentApproved(event.data);
      break;
    case 'subscription.updated':
      await handleSubscriptionUpdated(event.data);
      break;
    // ...más eventos
  }
}
```

## Limitaciones Conocidas

### Mercado Pago

1. **No tiene Billing Portal**: Redirigimos a la página de MP
2. **Suscripciones limitadas**: API de Preapproval no tan flexible como Stripe
3. **Sin proration automática**: Hay que implementar manualmente
4. **Webhooks lentos**: Pueden tardar minutos en llegar

### Estrategias de Mitigación

1. **Polling de estado**: Verificar estado cada X minutos
2. **Reintento de webhooks**: Sistema de retry si falla
3. **Logs exhaustivos**: Para debugging de issues

## Roadmap

- [ ] Implementar StripeAdapter completo
- [ ] Implementar PayPalAdapter
- [ ] Sistema de retry de webhooks
- [ ] Polling de sincronización
- [ ] Dashboard de monitoring
- [ ] Tests E2E con cada proveedor
- [ ] Documentación de cada API

## Referencias

- [Mercado Pago API Docs](https://www.mercadopago.com.ar/developers/es/reference)
- [Stripe API Docs](https://stripe.com/docs/api)
- [PayPal API Docs](https://developer.paypal.com/api/rest/)
