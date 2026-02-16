"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoolOpenreaderContext = void 0;
const util_internal_1 = require("@subsquid/util-internal");
const subscription_1 = require("./subscription");
const lazy_transaction_1 = require("./util/lazy-transaction");
let CTX_COUNTER = 0;
class PoolOpenreaderContext {
    constructor(dbType, pool, subscriptionPool, subscriptionPollInterval = 1000, log) {
        this.dbType = dbType;
        this.subscriptionPollInterval = subscriptionPollInterval;
        this.id = (CTX_COUNTER = (CTX_COUNTER + 1) % Number.MAX_SAFE_INTEGER);
        this.queryCounter = 0;
        this.log = log?.child({ graphqlCtx: this.id });
        this.tx = new lazy_transaction_1.LazyTransaction(cb => this.transact(pool, cb));
        this.subscriptionPool = subscriptionPool || pool;
    }
    close() {
        return this.tx.close();
    }
    async executeQuery(query) {
        let db = await this.tx.get();
        let result = await db(query.sql, query.params);
        return query.map(result);
    }
    subscription(query) {
        return new subscription_1.Subscription(this.subscriptionPollInterval, () => this.transact(this.subscriptionPool, async (db) => {
            let result = await db(query.sql, query.params);
            return query.map(result);
        }));
    }
    async transact(pool, cb) {
        let client = await pool.connect();
        try {
            await this.query(client, 'START TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY');
            try {
                return await cb(async (sql, parameters) => {
                    let result = await this.query(client, sql, parameters);
                    return result.rows;
                });
            }
            finally {
                await this.query(client, 'COMMIT').catch(() => { });
            }
        }
        finally {
            client.release();
        }
    }
    async query(client, sql, parameters) {
        let queryId = this.queryCounter = (this.queryCounter + 1) % Number.MAX_SAFE_INTEGER;
        let ctx = {
            graphqlCtx: this.id,
            graphqlSqlQuery: queryId,
        };
        let log = this.log?.child('sql', ctx);
        log?.debug({
            sql,
            parameters
        }, 'sql query');
        try {
            let result = await client.query({ text: sql, rowMode: 'array' }, parameters);
            log?.debug({
                rowCount: result.rowCount || 0,
                rows: log.isTrace() ? result.rows : undefined
            }, 'sql result');
            return result;
        }
        catch (err) {
            throw (0, util_internal_1.addErrorContext)(err, {
                ...ctx,
                sql,
                parameters
            });
        }
    }
}
exports.PoolOpenreaderContext = PoolOpenreaderContext;
//# sourceMappingURL=db.js.map