# BillingService

Servicio orquestador del sistema de pagos de LobeChat.

## Responsabilidades

- **Gestión de Wallet**: Obtener balances con información enriquecida
- **Pre-checks de Saldo**: Verificar si un usuario puede costear un gasto con buffer de seguridad
- **Registro de Uso**: Registrar uso de modelos con cálculo de costos y deducción de créditos
- **Grants de Créditos**: Otorgar créditos con tracking completo
- **Reconciliación**: Detectar descuadres entre wallet y ledger

## Uso

```typescript
import { billingService } from '@/services/billing';

// Obtener balance del usuario
const summary = await billingService.getWalletBalance(userId);

// Verificar si puede pagar
const check = await billingService.canUserAfford(userId, estimatedCredits);
if (!check.canAfford) {
  throw new InsufficientCreditsError(check.available, check.required);
}

// Registrar uso después de llamada al modelo
const entry = await billingService.recordUsage({
  userId,
  sessionId,
  messageId,
  provider: 'openai',
  model: 'gpt-4',
  usage: result.usage, // Del runtime
  idempotencyKey: generateIdempotencyKey(messageId, userId),
});

// Otorgar créditos
await billingService.grantCredits({
  userId,
  credits: 100_000,
  source: 'promo',
  reason: 'new_user_bonus',
});
```

## Features

### 1. Balance Enriquecido

El método `getWalletBalance()` no solo retorna el balance raw, sino que agrega:

- Próxima fecha de reset de créditos free
- Warning de saldo bajo
- Estimación en USD
- Warnings de expiración por fuente de créditos

### 2. Pre-check con Buffer

`canUserAfford()` aplica un buffer de seguridad (20% por defecto) para evitar quedarse sin saldo a mitad de request.

### 3. Idempotencia

`recordUsage()` previene doble-cobro usando idempotency keys basadas en `messageId`.

### 4. Cálculo Automático de Costos

Usa `computeChatCost` del runtime para calcular créditos basados en tokens reales consumidos.

## Integración con Modelos

Actualmente los modelos están mockeados. Una vez implementados en `packages/database/src/models/`, el servicio los usará automáticamente.

## Configuración

Toda la configuración se maneja en `src/config/billing.ts`:

- `FREE_TIER_CREDITS`: Créditos free mensuales
- `PRE_CHECK_BUFFER_MULTIPLIER`: Buffer de seguridad
- `LOW_BALANCE_THRESHOLD`: Umbral de saldo bajo
- `RECONCILIATION_THRESHOLD_PERCENT`: Umbral de descuadre

## Errores

El servicio lanza errores específicos:

- `InsufficientCreditsError`: Saldo insuficiente (402)
- `IdempotencyError`: Key duplicada (409)
- `WalletNotFoundError`: Wallet no existe (404)
- `InvalidUsageDataError`: Datos de uso inválidos (400)
- `BillingError`: Error genérico del sistema

## Logs

El servicio loggea operaciones importantes:

```typescript
console.log('[BillingService] Usage recorded:', { userId, model, credits, tokens });
console.log('[BillingService] Credits granted:', { userId, credits, source });
console.warn('[BillingService] Balance inconsistency detected:', result);
```

## TODO

- [ ] Conectar con `BillingModel` real
- [ ] Conectar con `WalletModel` real
- [ ] Conectar con `ProductModel` para pricing
- [ ] Implementar cache de balances con Redis
- [ ] Agregar métricas con Prometheus
- [ ] Tests unitarios completos
