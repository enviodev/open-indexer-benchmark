"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvmRpcDataSource = void 0;
const logger_1 = require("@subsquid/logger");
const util_internal_1 = require("@subsquid/util-internal");
const util_internal_ingest_tools_1 = require("@subsquid/util-internal-ingest-tools");
const util_internal_range_1 = require("@subsquid/util-internal-range");
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const util_timeout_1 = require("@subsquid/util-timeout");
const assert_1 = __importDefault(require("assert"));
const mapping_1 = require("./mapping");
const request_1 = require("./request");
const rpc_1 = require("./rpc");
const NO_REQUEST = (0, request_1.toMappingRequest)();
class EvmRpcDataSource {
    constructor(options) {
        this.log = options.log;
        this.rpc = new rpc_1.Rpc(options.rpc, this.log, options.validationFlags);
        this.finalityConfirmation = options.finalityConfirmation;
        this.headPollInterval = options.headPollInterval || 5000;
        this.newHeadTimeout = options.newHeadTimeout || 0;
        this.preferTraceApi = options.preferTraceApi;
        this.useDebugApiForStateDiffs = options.useDebugApiForStateDiffs;
        this.debugTraceTimeout = options.debugTraceTimeout;
    }
    async getFinalizedHeight() {
        let height = await this.rpc.getHeight();
        return Math.max(0, height - this.finalityConfirmation);
    }
    getBlockHash(height) {
        return this.rpc.getBlockHash(height);
    }
    getFinalizedBlocks(requests, stopOnHead) {
        return (0, util_internal_ingest_tools_1.coldIngest)({
            getFinalizedHeight: () => this.getFinalizedHeight(),
            getSplit: req => this._getColdSplit(req),
            requests: (0, util_internal_range_1.mapRangeRequestList)(requests, req => this.toMappingRequest(req)),
            splitSize: 10,
            concurrency: Math.min(5, this.rpc.client.getConcurrency()),
            stopOnHead,
            headPollInterval: this.headPollInterval
        });
    }
    async _getColdSplit(req) {
        let rpc = this.rpc.withPriority(req.range.from);
        let blocks = await rpc.getColdSplit(req).catch(err => {
            if ((0, util_internal_ingest_tools_1.isDataConsistencyError)(err)) {
                err.message += '. Perhaps finality confirmation was not large enough';
            }
            throw err;
        });
        return blocks.map(b => (0, mapping_1.mapBlock)(b, req.request));
    }
    toMappingRequest(req) {
        let r = (0, request_1.toMappingRequest)(req);
        r.preferTraceApi = this.preferTraceApi;
        r.useDebugApiForStateDiffs = this.useDebugApiForStateDiffs;
        r.debugTraceTimeout = this.debugTraceTimeout;
        return r;
    }
    async processHotBlocks(requests, state, cb) {
        if (requests.length == 0)
            return;
        let mappingRequests = (0, util_internal_range_1.mapRangeRequestList)(requests, req => this.toMappingRequest(req));
        let self = this;
        let proc = new util_internal_ingest_tools_1.HotProcessor(state, {
            process: cb,
            getBlock: async (ref) => {
                let req = (0, util_internal_range_1.getRequestAt)(mappingRequests, ref.height) || NO_REQUEST;
                let block = await this.rpc.getColdBlock(ref.hash, req, proc.getFinalizedHeight());
                return (0, mapping_1.mapBlock)(block, req);
            },
            async *getBlockRange(from, to) {
                (0, assert_1.default)(to.height != null);
                if (from > to.height) {
                    from = to.height;
                }
                for (let split of (0, util_internal_range_1.splitRangeByRequest)(mappingRequests, { from, to: to.height })) {
                    let request = split.request || NO_REQUEST;
                    for (let range of (0, util_internal_range_1.splitRange)(10, split.range)) {
                        let rpcBlocks = await self.rpc.getHotSplit({
                            range,
                            request,
                            finalizedHeight: proc.getFinalizedHeight()
                        });
                        let blocks = rpcBlocks.map(b => (0, mapping_1.mapBlock)(b, request));
                        let lastBlock = (0, util_internal_1.maybeLast)(blocks)?.header.height ?? range.from - 1;
                        yield blocks;
                        if (lastBlock < range.to) {
                            throw new util_internal_ingest_tools_1.BlockConsistencyError({ height: lastBlock + 1 });
                        }
                    }
                }
            },
            getHeader(block) {
                return block.header;
            }
        });
        let isEnd = () => proc.getFinalizedHeight() >= (0, util_internal_range_1.rangeEnd)((0, util_internal_1.last)(requests).range);
        let navigate = (head) => {
            return proc.goto({
                best: head,
                finalized: {
                    height: Math.max(head.height - this.finalityConfirmation, 0)
                }
            });
        };
        if (this.rpc.client.supportsNotifications()) {
            return this.subscription(navigate, isEnd);
        }
        else {
            return this.polling(navigate, isEnd);
        }
    }
    async polling(cb, isEnd) {
        let prev = -1;
        let height = new util_internal_1.Throttler(() => this.rpc.getHeight(), this.headPollInterval);
        while (!isEnd()) {
            let next = await height.call();
            if (next <= prev)
                continue;
            prev = next;
            for (let i = 0; i < 100; i++) {
                try {
                    await cb({ height: next });
                    break;
                }
                catch (err) {
                    if ((0, util_internal_ingest_tools_1.isDataConsistencyError)(err)) {
                        this.log?.write(i > 0 ? logger_1.LogLevel.WARN : logger_1.LogLevel.DEBUG, err.message);
                        await (0, util_internal_1.wait)(100);
                    }
                    else {
                        throw err;
                    }
                }
            }
        }
    }
    async subscription(cb, isEnd) {
        let lastHead = { height: -1, hash: '0x' };
        let heads = this.subscribeNewHeads();
        try {
            while (!isEnd()) {
                let next = await (0, util_timeout_1.addTimeout)(heads.take(), this.newHeadTimeout).catch(util_internal_1.ensureError);
                (0, assert_1.default)(next);
                if (next instanceof util_timeout_1.TimeoutError) {
                    this.log?.warn(`resetting RPC connection, because we haven't seen a new head for ${this.newHeadTimeout} ms`);
                    this.rpc.client.reset();
                }
                else if (next instanceof Error) {
                    throw next;
                }
                else if (next.height >= lastHead.height) {
                    lastHead = next;
                    for (let i = 0; i < 3; i++) {
                        try {
                            await cb(next);
                            break;
                        }
                        catch (err) {
                            if ((0, util_internal_ingest_tools_1.isDataConsistencyError)(err)) {
                                this.log?.write(i > 0 ? logger_1.LogLevel.WARN : logger_1.LogLevel.DEBUG, err.message);
                                await (0, util_internal_1.wait)(100);
                                if (heads.peek())
                                    break;
                            }
                            else {
                                throw err;
                            }
                        }
                    }
                }
            }
        }
        finally {
            heads.close();
        }
    }
    subscribeNewHeads() {
        let queue = new util_internal_1.AsyncQueue(1);
        let handle = this.rpc.client.subscribe({
            method: 'eth_subscribe',
            params: ['newHeads'],
            notification: 'eth_subscription',
            unsubscribe: 'eth_unsubscribe',
            onMessage: msg => {
                try {
                    let { number, hash, parentHash } = (0, util_internal_validation_1.cast)(NewHeadMessage, msg);
                    queue.forcePut({
                        height: number,
                        hash,
                        parentHash
                    });
                }
                catch (err) {
                    queue.forcePut((0, util_internal_1.ensureError)(err));
                    queue.close();
                }
            },
            onError: err => {
                queue.forcePut((0, util_internal_1.ensureError)(err));
                queue.close();
            },
            resubscribeOnConnectionLoss: true
        });
        queue.addCloseListener(() => handle.close());
        return queue;
    }
}
exports.EvmRpcDataSource = EvmRpcDataSource;
const NewHeadMessage = (0, util_internal_validation_1.object)({
    number: util_internal_validation_1.SMALL_QTY,
    hash: util_internal_validation_1.BYTES,
    parentHash: util_internal_validation_1.BYTES
});
//# sourceMappingURL=client.js.map