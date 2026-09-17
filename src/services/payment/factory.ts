/**
 * Payment Provider Factory
 *
 * Crea instancias de proveedores de pago basados en configuración.
 * Permite cambiar de proveedor sin tocar lógica de negocio.
 */

import { BILLING_CONFIG } from '@/config/billing';

import type { PaymentProviderAdapter } from './providers/interface';
import { PaymentProviderError } from './providers/interface';
import { MercadoPagoAdapter } from './providers/mercadopago';

// Registro de proveedores disponibles
const PROVIDERS: Record<string, () => PaymentProviderAdapter> = {
  mercadopago: () => new MercadoPagoAdapter(),
  // Futuros proveedores:
  // stripe: () => new StripeAdapter(),
  // paypal: () => new PayPalAdapter(),
};

/**
 * Obtiene el proveedor de pago configurado
 * Lee la variable PAYMENT_PROVIDER del entorno
 */
export function getPaymentProvider(): PaymentProviderAdapter {
  const providerName = BILLING_CONFIG.PROVIDER;

  if (!providerName) {
    throw new PaymentProviderError(
      'PAYMENT_PROVIDER not configured',
      'factory',
      'PROVIDER_NOT_CONFIGURED',
    );
  }

  const providerFactory = PROVIDERS[providerName.toLowerCase()];

  if (!providerFactory) {
    throw new PaymentProviderError(
      `Unknown payment provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`,
      'factory',
      'UNKNOWN_PROVIDER',
    );
  }

  const provider = providerFactory();

  // Inicializar automáticamente
  provider.initialize().catch((error) => {
    console.error(`[PaymentProvider] Failed to initialize ${providerName}:`, error);
  });

  return provider;
}

/**
 * Obtiene un proveedor específico por nombre
 * Útil para webhooks que especifican el proveedor en la ruta
 */
export function getPaymentProviderByName(name: string): PaymentProviderAdapter {
  const providerFactory = PROVIDERS[name.toLowerCase()];

  if (!providerFactory) {
    throw new PaymentProviderError(
      `Unknown payment provider: ${name}. Available: ${Object.keys(PROVIDERS).join(', ')}`,
      'factory',
      'UNKNOWN_PROVIDER',
    );
  }

  const provider = providerFactory();

  // Inicializar automáticamente
  provider.initialize().catch((error) => {
    console.error(`[PaymentProvider] Failed to initialize ${name}:`, error);
  });

  return provider;
}

/**
 * Registra un nuevo proveedor de pago
 * Útil para plugins o extensiones
 */
export function registerPaymentProvider(
  name: string,
  factory: () => PaymentProviderAdapter,
): void {
  PROVIDERS[name.toLowerCase()] = factory;
}

/**
 * Lista los proveedores disponibles
 */
export function listAvailableProviders(): string[] {
  return Object.keys(PROVIDERS);
}
