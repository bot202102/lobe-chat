import { TRPCError } from '@trpc/server';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { generateId } from '@lobehub/utils';

import { LobeChatDatabase } from '../type';
import { 
  NewUsageLedgerEntry,
  UsageLedgerEntry,
  usageLedger,
} from '../schemas';

/**
 * Error personalizado para operaciones de billing
 */
export class BillingError extends TRPCError {
  constructor(message: string, code: 'BAD_REQUEST' | 'INTERNAL_SERVER_ERROR' = 'INTERNAL_SERVER_ERROR') {
    super({ code, message });
  }
}

export class IdempotencyError extends TRPCError {
  constructor() {
    super({ code: 'CONFLICT', message: 'Operation already processed' });
  }
}

/**
 * Filtros para consulta de historial de uso
 */
export interface UsageFilters {
  startDate?: string;
  endDate?: string;
  provider?: string;
  model?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Respuesta paginada de historial de uso
 */
export interface PaginatedUsageHistory {
  entries: UsageLedgerEntry[];
  totalCount: number;
  totalCredits: number;
  totalCostUsd: number;
  page: number;
  pageSize: number;
}

/**
 * Parámetros para registrar uso
 */
export interface RecordUsageParams {
  userId: string;
  sessionId?: string;
  messageId?: string;
  provider: string;
  model: string;
  usage: Record<string, any>; // ModelTokensUsage object
  credits: number;
  costUsd: number;
  source: 'free' | 'subscription' | 'package';
  idempotencyKey: string;
}

/**
 * Modelo de datos para operaciones de billing y uso
 */
export class BillingModel {
  constructor(private db: LobeChatDatabase) {}

  /**
   * Crea una entrada en el ledger de uso
   * @param params Parámetros de la entrada de uso
   * @returns La entrada creada
   */
  async createUsageLedgerEntry(params: RecordUsageParams): Promise<UsageLedgerEntry> {
    // Verificar idempotencia
    const existing = await this.findUsageByIdempotencyKey(params.idempotencyKey);
    if (existing) {
      throw new IdempotencyError();
    }

    const entry: NewUsageLedgerEntry = {
      id: generateId(),
      userId: params.userId,
      sessionId: params.sessionId || null,
      messageId: params.messageId || null,
      provider: params.provider,
      model: params.model,
      usageJson: params.usage,
      credits: params.credits,
      costUsd: params.costUsd.toString(),
      source: params.source,
      status: 'pending',
      idempotencyKey: params.idempotencyKey,
    };

    const [created] = await this.db.insert(usageLedger).values(entry).returning();
    return created;
  }

  /**
   * Busca una entrada de uso por su clave de idempotencia
   * @param key Clave de idempotencia
   * @returns La entrada encontrada o null
   */
  async findUsageByIdempotencyKey(key: string): Promise<UsageLedgerEntry | null> {
    const result = await this.db.query.usageLedger.findFirst({
      where: eq(usageLedger.idempotencyKey, key),
    });
    return result || null;
  }

  /**
   * Actualiza el estado de una entrada de uso
   * @param id ID de la entrada
   * @param status Nuevo estado
   */
  async updateUsageStatus(id: string, status: 'completed' | 'refunded'): Promise<void> {
    await this.db
      .update(usageLedger)
      .set({ status })
      .where(eq(usageLedger.id, id));
  }

  /**
   * Obtiene el historial de uso de un usuario con filtros y paginación
   * @param userId ID del usuario
   * @param filters Filtros de consulta
   * @returns Historial paginado
   */
  async getUserUsageHistory(userId: string, filters: UsageFilters = {}): Promise<PaginatedUsageHistory> {
    const {
      startDate,
      endDate,
      provider,
      model,
      page = 1,
      pageSize = 20,
    } = filters;

    // Construir condiciones WHERE
    const conditions = [eq(usageLedger.userId, userId)];

    if (startDate) {
      conditions.push(gte(usageLedger.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(usageLedger.createdAt, new Date(endDate)));
    }
    if (provider) {
      conditions.push(eq(usageLedger.provider, provider));
    }
    if (model) {
      conditions.push(eq(usageLedger.model, model));
    }

    const whereClause = and(...conditions);

    // Consulta de entries con paginación
    const entries = await this.db.query.usageLedger.findMany({
      where: whereClause,
      orderBy: [desc(usageLedger.createdAt)],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    // Consulta de totales
    const totalsResult = await this.db
      .select({
        totalCount: sql<number>`COUNT(*)`,
        totalCredits: sql<number>`COALESCE(SUM(${usageLedger.credits}), 0)`,
        totalCostUsd: sql<number>`COALESCE(SUM(${usageLedger.costUsd}::numeric), 0)`,
      })
      .from(usageLedger)
      .where(whereClause);

    const totals = totalsResult[0] || {
      totalCount: 0,
      totalCredits: 0,
      totalCostUsd: 0,
    };

    return {
      entries,
      totalCount: totals.totalCount,
      totalCredits: totals.totalCredits,
      totalCostUsd: Number(totals.totalCostUsd),
      page,
      pageSize,
    };
  }

  /**
   * Obtiene el total gastado por un usuario en un período
   * @param userId ID del usuario
   * @param startDate Fecha de inicio
   * @param endDate Fecha de fin
   * @returns Total de créditos y USD gastados
   */
  async getUserTotalSpent(
    userId: string, 
    startDate?: Date, 
    endDate?: Date
  ): Promise<{ totalCredits: number; totalCostUsd: number }> {
    const conditions = [eq(usageLedger.userId, userId), eq(usageLedger.status, 'completed')];

    if (startDate) {
      conditions.push(gte(usageLedger.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(usageLedger.createdAt, endDate));
    }

    const result = await this.db
      .select({
        totalCredits: sql<number>`COALESCE(SUM(${usageLedger.credits}), 0)`,
        totalCostUsd: sql<number>`COALESCE(SUM(${usageLedger.costUsd}::numeric), 0)`,
      })
      .from(usageLedger)
      .where(and(...conditions));

    const totals = result[0] || { totalCredits: 0, totalCostUsd: 0 };
    
    return {
      totalCredits: totals.totalCredits,
      totalCostUsd: Number(totals.totalCostUsd),
    };
  }

  /**
   * Obtiene estadísticas de uso por modelo para un usuario
   * @param userId ID del usuario
   * @param startDate Fecha de inicio
   * @param endDate Fecha de fin
   * @returns Estadísticas agrupadas por modelo
   */
  async getUserUsageByModel(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<Array<{
    provider: string;
    model: string;
    totalCredits: number;
    totalCostUsd: number;
    totalCalls: number;
  }>> {
    const conditions = [eq(usageLedger.userId, userId), eq(usageLedger.status, 'completed')];

    if (startDate) {
      conditions.push(gte(usageLedger.createdAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(usageLedger.createdAt, endDate));
    }

    const result = await this.db
      .select({
        provider: usageLedger.provider,
        model: usageLedger.model,
        totalCredits: sql<number>`SUM(${usageLedger.credits})`,
        totalCostUsd: sql<number>`SUM(${usageLedger.costUsd}::numeric)`,
        totalCalls: sql<number>`COUNT(*)`,
      })
      .from(usageLedger)
      .where(and(...conditions))
      .groupBy(usageLedger.provider, usageLedger.model)
      .orderBy(desc(sql`SUM(${usageLedger.credits})`));

    return result.map((row) => ({
      provider: row.provider,
      model: row.model,
      totalCredits: row.totalCredits,
      totalCostUsd: Number(row.totalCostUsd),
      totalCalls: row.totalCalls,
    }));
  }

  /**
   * Genera una clave de idempotencia única basada en el mensaje y usuario
   * @param messageId ID del mensaje
   * @param userId ID del usuario
   * @returns Clave de idempotencia
   */
  static generateIdempotencyKey(messageId: string, userId: string): string {
    // Incluir timestamp para hacer la key más única
    const timestamp = Date.now();
    return `${userId}_${messageId}_${timestamp}`;
  }
}