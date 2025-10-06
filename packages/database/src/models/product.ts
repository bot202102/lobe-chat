import { TRPCError } from '@trpc/server';
import { and, eq, desc } from 'drizzle-orm';
import { generateId } from '@lobehub/utils';

import { LobeChatDatabase } from '../type';
import { 
  NewProduct,
  NewPrice,
  Price,
  Product,
  prices,
  products,
} from '../schemas';

/**
 * Error cuando no se encuentra un producto
 */
export class ProductNotFoundError extends TRPCError {
  constructor(productId: string) {
    super({ code: 'NOT_FOUND', message: `Product not found: ${productId}` });
  }
}

/**
 * Error cuando no se encuentra un precio
 */
export class PriceNotFoundError extends TRPCError {
  constructor(priceId: string) {
    super({ code: 'NOT_FOUND', message: `Price not found: ${priceId}` });
  }
}

/**
 * Producto con sus precios asociados
 */
export interface ProductWithPrices extends Product {
  prices: Price[];
}

/**
 * Modelo para manejar productos y precios del catálogo
 */
export class ProductModel {
  constructor(private db: LobeChatDatabase) {}

  /**
   * Obtiene todos los productos activos con sus precios
   * @returns Lista de productos activos
   */
  async getActiveProducts(): Promise<ProductWithPrices[]> {
    const productsData = await this.db.query.products.findMany({
      where: eq(products.active, true),
      with: {
        // No está definida la relación todavía, haremos la consulta manual
      },
      orderBy: [desc(products.createdAt)],
    });

    // Obtener precios para cada producto manualmente
    const productsWithPrices: ProductWithPrices[] = [];
    
    for (const product of productsData) {
      const productPrices = await this.db.query.prices.findMany({
        where: and(eq(prices.productId, product.id), eq(prices.active, true)),
        orderBy: [prices.amount],
      });

      productsWithPrices.push({
        ...product,
        prices: productPrices,
      });
    }

    return productsWithPrices;
  }

  /**
   * Obtiene un producto por su ID con precios asociados
   * @param productId ID del producto
   * @returns Producto con precios
   */
  async getProductById(productId: string): Promise<ProductWithPrices> {
    const product = await this.db.query.products.findFirst({
      where: eq(products.id, productId),
    });

    if (!product) {
      throw new ProductNotFoundError(productId);
    }

    const productPrices = await this.db.query.prices.findMany({
      where: and(eq(prices.productId, productId), eq(prices.active, true)),
      orderBy: [prices.amount],
    });

    return {
      ...product,
      prices: productPrices,
    };
  }

  /**
   * Obtiene un producto por su ID de Mercado Pago
   * @param mpProductId ID del producto en Mercado Pago
   * @returns Producto con precios
   */
  async getProductByMpId(mpProductId: string): Promise<ProductWithPrices> {
    const product = await this.db.query.products.findFirst({
      where: eq(products.mpProductId, mpProductId),
    });

    if (!product) {
      throw new ProductNotFoundError(`MP:${mpProductId}`);
    }

    const productPrices = await this.db.query.prices.findMany({
      where: and(eq(prices.productId, product.id), eq(prices.active, true)),
      orderBy: [prices.amount],
    });

    return {
      ...product,
      prices: productPrices,
    };
  }

  /**
   * Crea un nuevo producto (admin only)
   * @param data Datos del producto
   * @returns Producto creado
   */
  async createProduct(data: {
    name: string;
    description?: string;
    type: 'subscription' | 'package' | 'free';
    mpProductId?: string;
    metadata?: Record<string, any>;
  }): Promise<Product> {
    const newProduct: NewProduct = {
      id: generateId(),
      name: data.name,
      description: data.description || null,
      type: data.type,
      mpProductId: data.mpProductId || null,
      active: true,
      metadata: data.metadata || null,
    };

    const [created] = await this.db.insert(products).values(newProduct).returning();
    return created;
  }

  /**
   * Actualiza un producto (admin only)
   * @param productId ID del producto
   * @param data Datos a actualizar
   * @returns Producto actualizado
   */
  async updateProduct(
    productId: string, 
    data: Partial<Pick<Product, 'name' | 'description' | 'active' | 'metadata'>>
  ): Promise<Product> {
    const [updated] = await this.db
      .update(products)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(products.id, productId))
      .returning();

    if (!updated) {
      throw new ProductNotFoundError(productId);
    }

    return updated;
  }

  /**
   * Desactiva un producto (soft delete)
   * @param productId ID del producto
   */
  async deactivateProduct(productId: string): Promise<void> {
    const result = await this.db
      .update(products)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(products.id, productId));

    if (result.rowCount === 0) {
      throw new ProductNotFoundError(productId);
    }
  }

  /**
   * Obtiene un precio por su ID
   * @param priceId ID del precio
   * @returns Precio encontrado
   */
  async getPriceById(priceId: string): Promise<Price> {
    const price = await this.db.query.prices.findFirst({
      where: eq(prices.id, priceId),
    });

    if (!price) {
      throw new PriceNotFoundError(priceId);
    }

    return price;
  }

  /**
   * Obtiene un precio por su ID de Mercado Pago
   * @param mpPriceId ID del precio en Mercado Pago
   * @returns Precio encontrado
   */
  async getPriceByMpId(mpPriceId: string): Promise<Price> {
    const price = await this.db.query.prices.findFirst({
      where: eq(prices.mpPriceId, mpPriceId),
    });

    if (!price) {
      throw new PriceNotFoundError(`MP:${mpPriceId}`);
    }

    return price;
  }

  /**
   * Crea un nuevo precio para un producto
   * @param data Datos del precio
   * @returns Precio creado
   */
  async createPrice(data: {
    productId: string;
    amount: number;
    currency?: string;
    interval?: 'month' | 'year';
    intervalCount?: number;
    credits: number;
    mpPriceId?: string;
    metadata?: Record<string, any>;
  }): Promise<Price> {
    // Verificar que el producto existe
    await this.getProductById(data.productId);

    const newPrice: NewPrice = {
      id: generateId(),
      productId: data.productId,
      amount: data.amount,
      currency: data.currency || 'ARS',
      interval: data.interval || null,
      intervalCount: data.intervalCount || 1,
      credits: data.credits,
      mpPriceId: data.mpPriceId || null,
      active: true,
      metadata: data.metadata || null,
    };

    const [created] = await this.db.insert(prices).values(newPrice).returning();
    return created;
  }

  /**
   * Actualiza un precio
   * @param priceId ID del precio
   * @param data Datos a actualizar
   * @returns Precio actualizado
   */
  async updatePrice(
    priceId: string, 
    data: Partial<Pick<Price, 'amount' | 'credits' | 'active' | 'metadata'>>
  ): Promise<Price> {
    const [updated] = await this.db
      .update(prices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(prices.id, priceId))
      .returning();

    if (!updated) {
      throw new PriceNotFoundError(priceId);
    }

    return updated;
  }

  /**
   * Desactiva un precio
   * @param priceId ID del precio
   */
  async deactivatePrice(priceId: string): Promise<void> {
    const result = await this.db
      .update(prices)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(prices.id, priceId));

    if (result.rowCount === 0) {
      throw new PriceNotFoundError(priceId);
    }
  }

  /**
   * Obtiene precios por tipo de producto
   * @param type Tipo de producto
   * @returns Lista de precios
   */
  async getPricesByType(type: 'subscription' | 'package' | 'free'): Promise<Array<Price & { productName: string }>> {
    const result = await this.db
      .select({
        // Price fields
        id: prices.id,
        productId: prices.productId,
        mpPriceId: prices.mpPriceId,
        amount: prices.amount,
        currency: prices.currency,
        interval: prices.interval,
        intervalCount: prices.intervalCount,
        credits: prices.credits,
        active: prices.active,
        metadata: prices.metadata,
        createdAt: prices.createdAt,
        updatedAt: prices.updatedAt,
        // Product name
        productName: products.name,
      })
      .from(prices)
      .innerJoin(products, eq(prices.productId, products.id))
      .where(and(
        eq(products.type, type),
        eq(products.active, true),
        eq(prices.active, true)
      ))
      .orderBy(prices.amount);

    return result;
  }
}