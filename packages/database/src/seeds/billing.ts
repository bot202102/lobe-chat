import { generateId } from '@lobehub/utils';
import { LobeChatDatabase } from '../type';
import { NewProduct, NewPrice, products, prices } from '../schemas';

/**
 * Datos de productos iniciales para el sistema de billing
 */
const INITIAL_PRODUCTS: Array<NewProduct & { prices: Omit<NewPrice, 'id' | 'productId'>[] }> = [
  {
    id: generateId(),
    name: 'Plan Gratuito',
    description: 'Acceso básico a LobeChat con límites generosos',
    type: 'free',
    active: true,
    metadata: {
      features: [
        '100,000 créditos mensuales',
        'Acceso a modelos básicos',
        'Historial limitado',
        'Soporte por comunidad'
      ],
      popular: false,
    },
    prices: [
      {
        amount: 0, // Gratis
        currency: 'ARS',
        interval: 'month',
        intervalCount: 1,
        credits: 100000,
        active: true,
        metadata: {
          description: 'Renovación automática mensual'
        }
      }
    ]
  },
  {
    id: generateId(),
    name: 'Plan Pro',
    description: 'Para usuarios profesionales que necesitan más potencia',
    type: 'subscription',
    active: true,
    metadata: {
      features: [
        '1,000,000 créditos mensuales',
        'Acceso a todos los modelos',
        'Historial completo',
        'Soporte prioritario',
        'API access'
      ],
      popular: true,
    },
    prices: [
      {
        amount: 2000000, // $20,000 ARS (aprox $20 USD)
        currency: 'ARS',
        interval: 'month',
        intervalCount: 1,
        credits: 1000000,
        active: true,
        metadata: {
          description: 'Facturación mensual'
        }
      },
      {
        amount: 20000000, // $200,000 ARS (aprox $200 USD) - descuento anual
        currency: 'ARS',
        interval: 'year',
        intervalCount: 1,
        credits: 12000000, // 12M créditos (bonus de 2M)
        active: true,
        metadata: {
          description: 'Facturación anual - 2 meses gratis'
        }
      }
    ]
  },
  {
    id: generateId(),
    name: 'Plan Enterprise',
    description: 'Para equipos y organizaciones grandes',
    type: 'subscription',
    active: true,
    metadata: {
      features: [
        '5,000,000 créditos mensuales',
        'Todos los modelos premium',
        'Gestión de equipos',
        'SSO y seguridad avanzada',
        'Soporte 24/7',
        'SLA garantizado'
      ],
      popular: false,
    },
    prices: [
      {
        amount: 5000000, // $50,000 ARS (aprox $50 USD)
        currency: 'ARS',
        interval: 'month',
        intervalCount: 1,
        credits: 5000000,
        active: true,
        metadata: {
          description: 'Facturación mensual'
        }
      }
    ]
  },
  {
    id: generateId(),
    name: 'Paquete Starter',
    description: 'Recarga rápida para usuarios ocasionales',
    type: 'package',
    active: true,
    metadata: {
      features: [
        '500,000 créditos adicionales',
        'No expiran',
        'Compatible con cualquier plan',
        'Activación inmediata'
      ],
      popular: false,
    },
    prices: [
      {
        amount: 1000000, // $10,000 ARS (aprox $10 USD)
        currency: 'ARS',
        interval: null, // One-time purchase
        intervalCount: 1,
        credits: 500000,
        active: true,
        metadata: {
          description: 'Compra única'
        }
      }
    ]
  },
  {
    id: generateId(),
    name: 'Paquete Power',
    description: 'Gran recarga para usuarios intensivos',
    type: 'package',
    active: true,
    metadata: {
      features: [
        '3,000,000 créditos adicionales',
        'No expiran',
        'Mejor valor por crédito',
        'Activación inmediata'
      ],
      popular: true,
    },
    prices: [
      {
        amount: 4500000, // $45,000 ARS (aprox $45 USD) - mejor precio por crédito
        currency: 'ARS',
        interval: null, // One-time purchase
        intervalCount: 1,
        credits: 3000000,
        active: true,
        metadata: {
          description: 'Compra única - Mejor valor'
        }
      }
    ]
  }
];

/**
 * Ejecuta el seed de productos y precios de billing
 * @param db Instancia de la base de datos
 */
export async function seedBilling(db: LobeChatDatabase): Promise<void> {
  console.log('🌱 Seeding billing products and prices...');

  try {
    for (const productData of INITIAL_PRODUCTS) {
      const { prices: priceData, ...productInfo } = productData;

      // Insertar producto (si no existe)
      const existingProduct = await db.query.products.findFirst({
        where: (products, { eq }) => eq(products.name, productInfo.name),
      });

      let productId: string;

      if (existingProduct) {
        console.log(`  ↳ Product "${productInfo.name}" already exists, skipping...`);
        productId = existingProduct.id;
      } else {
        const [insertedProduct] = await db
          .insert(products)
          .values(productInfo)
          .returning();
        
        console.log(`  ✓ Created product: ${productInfo.name}`);
        productId = insertedProduct.id;
      }

      // Insertar precios
      for (const priceInfo of priceData) {
        const priceToInsert: NewPrice = {
          id: generateId(),
          productId,
          ...priceInfo,
        };

        // Verificar si el precio ya existe
        const existingPrice = await db.query.prices.findFirst({
          where: (prices, { and, eq }) => and(
            eq(prices.productId, productId),
            eq(prices.amount, priceInfo.amount),
            eq(prices.interval, priceInfo.interval || null)
          ),
        });

        if (existingPrice) {
          console.log(`    ↳ Price for ${productInfo.name} (${priceInfo.amount} ${priceInfo.currency}) already exists, skipping...`);
        } else {
          await db.insert(prices).values(priceToInsert);
          const priceDescription = priceInfo.interval 
            ? `${priceInfo.amount} ${priceInfo.currency}/${priceInfo.interval}`
            : `${priceInfo.amount} ${priceInfo.currency} (one-time)`;
          console.log(`    ✓ Created price: ${priceDescription} - ${priceInfo.credits} credits`);
        }
      }
    }

    console.log('✅ Billing seed completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding billing data:', error);
    throw error;
  }
}

/**
 * Script para ejecutar el seed manualmente
 * Uso: bun run seed:billing
 */
export async function runBillingSeed(): Promise<void> {
  // Esta función será llamada desde un script externo
  // que configure la conexión a la base de datos
  console.log('🚀 Starting billing seed process...');
  
  // La implementación de conexión a DB será agregada cuando
  // se integre con el sistema de scripts del proyecto
}

// Si este archivo se ejecuta directamente
if (require.main === module) {
  runBillingSeed().catch((error) => {
    console.error('Failed to run billing seed:', error);
    process.exit(1);
  });
}