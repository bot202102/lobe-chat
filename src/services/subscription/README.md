# SubscriptionService

Servicio para gestión completa de suscripciones en LobeChat.

## Responsabilidades

- **CRUD de Suscripciones**: Crear, obtener, cancelar y reactivar
- **Integración con Proveedor**: Sincronización con Mercado Pago/Stripe
- **Grant Automático de Créditos**: Al crear y renovar suscripciones
- **Gestión de Períodos**: Renovación automática de períodos

## Uso

```typescript
import { subscriptionService } from '@/services/subscription';

// Obtener suscripción actual
const subscription = await subscriptionService.getUserSubscription(userId);

// Crear suscripción
const newSub = await subscriptionService.createSubscription({
  userId,
  priceId: 'price_pro_monthly',
  trialDays: 7, // Opcional
});

// Cancelar suscripción
await subscriptionService.cancelSubscription(userId, true); // true = al final del período

// Reactivar suscripción cancelada
await subscriptionService.reactivateSubscription(userId);

// Cambiar de plan
await subscriptionService.changeSubscription({
  userId,
  newPriceId: 'price_enterprise_monthly',
  prorate: true,
});
```

## Flujo de Creación de Suscripción

1. **Validación**: Verificar que no tenga suscripción activa
2. **Obtener Price**: Consultar precio y créditos desde DB
3. **Crear en Proveedor**: Llamar a MP/Stripe para crear subscription
4. **Guardar en DB**: Persistir datos localmente
5. **Grant de Créditos**: Otorgar créditos del período inicial
6. **Notificación**: Enviar email de confirmación

## Renovación de Períodos

El método `renewSubscriptionPeriod()` es llamado por webhooks cuando se recibe un pago:

```typescript
// Llamado desde webhook handler
await subscriptionService.renewSubscriptionPeriod(
  providerSubscriptionId,
  paymentId
);
```

Esto:
- Actualiza `currentPeriodStart` y `currentPeriodEnd`
- Resetea `periodUsedCredits` a 0
- Otorga créditos del nuevo período

## Cancelación

### Cancelar al Final del Período

```typescript
await subscriptionService.cancelSubscription(userId, true);
```

- Usuario sigue teniendo acceso hasta fin del período
- No se cobra el próximo ciclo
- Estado: `ACTIVE` con `cancelAtPeriodEnd = true`

### Cancelar Inmediatamente

```typescript
await subscriptionService.cancelSubscription(userId, false);
```

- Usuario pierde acceso inmediatamente
- Créditos restantes no se reembolsan
- Estado: `CANCELLED`

## Integración con PaymentProvider

El servicio usa el factory para obtener el proveedor configurado:

```typescript
private paymentProvider = getPaymentProvider();

// Luego usa el adapter
await this.paymentProvider.createSubscription({...});
await this.paymentProvider.cancelSubscription(subscriptionId, cancelAtPeriodEnd);
```

Esto permite cambiar de MP a Stripe sin tocar el código del servicio.

## UserSubscription Type

El tipo `UserSubscription` incluye campos calculados:

```typescript
interface UserSubscription {
  // Datos de DB
  id: string;
  userId: string;
  plan: string;
  status: SubscriptionStatus;
  // ... más campos

  // Calculated fields
  isActive: boolean;           // status === ACTIVE && !isCancelled
  isPastDue: boolean;          // status === PAST_DUE
  isCancelled: boolean;        // cancelAt !== null
  daysUntilExpiry: number | null;    // Días hasta currentPeriodEnd
  creditsUsagePercent: number; // (used / granted) * 100
}
```

## Errores

- `SUBSCRIPTION_ALREADY_EXISTS` (409): Usuario ya tiene suscripción activa
- `SUBSCRIPTION_NOT_FOUND` (404): No se encontró suscripción
- `SUBSCRIPTION_EXPIRED` (400): Período ya expiró, no se puede reactivar
- `PRICE_NOT_FOUND` (404): Price ID inválido

## TODO

- [ ] Conectar con `SubscriptionModel` real
- [ ] Conectar con `ProductModel` para prices
- [ ] Implementar proration de créditos en cambio de plan
- [ ] Integrar con EmailService para notificaciones
- [ ] Manejar trials y descuentos
- [ ] Tests unitarios completos
