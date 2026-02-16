export type ConnectionOptions = UrlConnection | ParamConnection;
interface UrlConnection {
    url: string;
    ssl?: SslOptions | false;
}
interface ParamConnection {
    url?: undefined;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: SslOptions | false;
}
export interface SslOptions {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
}
export declare function createConnectionOptions(): ConnectionOptions;
export {};
//# sourceMappingURL=connectionOptions.d.ts.map