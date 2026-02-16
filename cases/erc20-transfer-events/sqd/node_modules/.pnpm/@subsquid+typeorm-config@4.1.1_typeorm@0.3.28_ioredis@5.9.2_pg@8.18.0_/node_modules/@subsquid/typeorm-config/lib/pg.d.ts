import type { ConnectionOptions, SslOptions } from './connectionOptions';
export declare function isPostgres(url: URL): boolean;
export declare function extractAndClearSSLParams(url: URL): SslOptions | undefined | false;
export interface PgClientConfig {
    connectionString?: string;
    user?: string;
    database?: string;
    password?: string;
    port?: number;
    host?: string;
    ssl?: SslOptions | boolean;
}
export declare function toPgClientConfig(con: ConnectionOptions): PgClientConfig;
//# sourceMappingURL=pg.d.ts.map