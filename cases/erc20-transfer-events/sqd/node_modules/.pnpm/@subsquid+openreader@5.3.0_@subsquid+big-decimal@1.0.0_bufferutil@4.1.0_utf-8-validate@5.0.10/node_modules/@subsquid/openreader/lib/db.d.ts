import type { Logger } from '@subsquid/logger';
import type { Pool } from 'pg';
import { OpenreaderContext } from './context';
import { Query } from './sql/query';
export type DbType = 'postgres' | 'cockroach';
export declare class PoolOpenreaderContext implements OpenreaderContext {
    readonly dbType: DbType;
    private subscriptionPollInterval;
    id: number;
    log?: Logger;
    private tx;
    private subscriptionPool;
    private queryCounter;
    constructor(dbType: DbType, pool: Pool, subscriptionPool?: Pool, subscriptionPollInterval?: number, log?: Logger);
    close(): Promise<void>;
    executeQuery<T>(query: Query<T>): Promise<T>;
    subscription<T>(query: Query<T>): AsyncIterable<T>;
    private transact;
    private query;
}
//# sourceMappingURL=db.d.ts.map