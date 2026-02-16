"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rpc = void 0;
const rpc_client_1 = require("@subsquid/rpc-client");
const util_internal_1 = require("@subsquid/util-internal");
const util_internal_ingest_tools_1 = require("@subsquid/util-internal-ingest-tools");
const util_internal_range_1 = require("@subsquid/util-internal-range");
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const assert_1 = __importDefault(require("assert"));
const schema_1 = require("../mapping/schema");
const rpc_data_1 = require("./rpc-data");
const util_1 = require("./util");
const NO_LOGS_BLOOM = '0x' + Buffer.alloc(256).toString('hex');
function getResultValidator(validator) {
    return function (result) {
        let err = validator.validate(result);
        if (err) {
            throw new util_internal_validation_1.DataValidationError(`server returned unexpected result: ${err.toString()}`);
        }
        else {
            return result;
        }
    };
}
class Rpc {
    constructor(client, log, validation = {}, genesisHeight = 0, priority = 0, props) {
        this.client = client;
        this.log = log;
        this.validation = validation;
        this.genesisHeight = genesisHeight;
        this.priority = priority;
        this.props = props || new RpcProps(this.client, this.genesisHeight);
        if (this.validation.disableLogsBloomCheck) {
            log?.warn(`Log bloom check is disabled`);
        }
        if (this.validation.disableMissingTracesCheck) {
            log?.warn(`Missing traces check is disabled`);
        }
        if (this.validation.disableTxReceiptsNumberCheck) {
            log?.warn(`Tx receipt number check is disabled`);
        }
    }
    withPriority(priority) {
        return new Rpc(this.client, this.log, this.validation, this.genesisHeight, priority, this.props);
    }
    call(method, params, options) {
        return this.client.call(method, params, { priority: this.priority, ...options });
    }
    batchCall(batch, options) {
        return this.client.batchCall(batch, { priority: this.priority, ...options });
    }
    getBlockByNumber(height, withTransactions) {
        return this.call('eth_getBlockByNumber', [
            (0, util_1.toQty)(height),
            withTransactions
        ], {
            validateResult: getResultValidator(withTransactions ? (0, util_internal_validation_1.nullable)(rpc_data_1.GetBlockWithTransactions) : (0, util_internal_validation_1.nullable)(rpc_data_1.GetBlockNoTransactions))
        });
    }
    getBlockByHash(hash, withTransactions) {
        return this.call('eth_getBlockByHash', [hash, withTransactions], {
            validateResult: getResultValidator(withTransactions ? (0, util_internal_validation_1.nullable)(rpc_data_1.GetBlockWithTransactions) : (0, util_internal_validation_1.nullable)(rpc_data_1.GetBlockNoTransactions))
        });
    }
    async getBlockHash(height) {
        let block = await this.getBlockByNumber(height, false);
        return block?.hash;
    }
    async getHeight() {
        let height = await this.call('eth_blockNumber');
        return (0, util_1.qty2Int)(height);
    }
    async getColdBlock(blockHash, req, finalizedHeight) {
        let block = await this.getBlockByHash(blockHash, req?.transactions || false).then(toBlock);
        if (block == null)
            throw new util_internal_ingest_tools_1.BlockConsistencyError({ hash: blockHash });
        if (req) {
            await this.addRequestedData([block], req, finalizedHeight);
        }
        if (block._isInvalid)
            throw new util_internal_ingest_tools_1.BlockConsistencyError(block, block._errorMessage);
        return block;
    }
    async getColdSplit(req) {
        let blocks = await this.getColdBlockBatch((0, util_internal_range_1.rangeToArray)(req.range), req.request.transactions ?? false, 1);
        return this.addColdRequestedData(blocks, req.request, 1);
    }
    async addColdRequestedData(blocks, req, depth) {
        let result = blocks.map(b => ({ ...b }));
        await this.addRequestedData(result, req);
        if (depth > 9) {
            (0, util_internal_ingest_tools_1.assertIsValid)(result);
            return result;
        }
        let missing = [];
        for (let i = 0; i < result.length; i++) {
            if (result[i]._isInvalid) {
                missing.push(i);
            }
        }
        if (missing.length == 0)
            return result;
        let missed = await this.addColdRequestedData(missing.map(i => blocks[i]), req, depth + 1);
        for (let i = 0; i < missing.length; i++) {
            result[missing[i]] = missed[i];
        }
        return result;
    }
    async getColdBlockBatch(numbers, withTransactions, depth) {
        let result = await this.getBlockBatch(numbers, withTransactions);
        let missing = [];
        for (let i = 0; i < result.length; i++) {
            if (result[i] == null) {
                missing.push(i);
            }
        }
        if (missing.length == 0)
            return result;
        if (depth > 9)
            throw new util_internal_ingest_tools_1.BlockConsistencyError({
                height: numbers[missing[0]]
            }, `failed to get finalized block after ${depth} attempts`);
        let missed = await this.getColdBlockBatch(missing.map(i => numbers[i]), withTransactions, depth + 1);
        for (let i = 0; i < missing.length; i++) {
            result[missing[i]] = missed[i];
        }
        return result;
    }
    async getHotSplit(req) {
        let blocks = await this.getBlockBatch((0, util_internal_range_1.rangeToArray)(req.range), req.request.transactions ?? false);
        let chain = [];
        for (let i = 0; i < blocks.length; i++) {
            let block = blocks[i];
            if (block == null)
                break;
            if (i > 0 && chain[i - 1].hash !== block.block.parentHash)
                break;
            chain.push(block);
        }
        await this.addRequestedData(chain, req.request, req.finalizedHeight);
        return (0, util_internal_ingest_tools_1.trimInvalid)(chain);
    }
    async getBlockBatch(numbers, withTransactions) {
        let call = numbers.map(height => {
            return {
                method: 'eth_getBlockByNumber',
                params: [(0, util_1.toQty)(height), withTransactions]
            };
        });
        let blocks = await this.batchCall(call, {
            validateResult: getResultValidator(withTransactions ? (0, util_internal_validation_1.nullable)(rpc_data_1.GetBlockWithTransactions) : (0, util_internal_validation_1.nullable)(rpc_data_1.GetBlockNoTransactions)),
            validateError: info => {
                // Avalanche
                if (/cannot query unfinalized data/i.test(info.message))
                    return null;
                throw new rpc_client_1.RpcError(info);
            }
        });
        return blocks.map(toBlock);
    }
    async addRequestedData(blocks, req, finalizedHeight) {
        if (blocks.length == 0)
            return;
        let subtasks = [];
        if (req.logs) {
            subtasks.push(this.addLogs(blocks));
        }
        if (req.receipts) {
            subtasks.push(this.addReceipts(blocks));
        }
        if (req.traces || req.stateDiffs) {
            subtasks.push(this.addTraces(blocks, req, finalizedHeight));
        }
        await Promise.all(subtasks);
    }
    async addLogs(blocks) {
        if (blocks.length == 0)
            return;
        let logs = await this.getLogs(blocks[0].height, (0, util_internal_1.last)(blocks).height);
        let logsByBlock = (0, util_internal_1.groupBy)(logs, log => log.blockHash);
        for (let block of blocks) {
            let logs = logsByBlock.get(block.hash) || [];
            block.logs = logs;
            if (!this.validation.disableLogsBloomCheck && (logs.length === 0 && block.block.logsBloom !== NO_LOGS_BLOOM)) {
                block._isInvalid = true;
                block._errorMessage = 'got 0 log records from eth_getLogs, but logs bloom is not empty';
            }
        }
    }
    getLogs(from, to) {
        return this.call('eth_getLogs', [{
                fromBlock: (0, util_1.toQty)(from),
                toBlock: (0, util_1.toQty)(to)
            }], {
            validateResult: getResultValidator((0, util_internal_validation_1.array)(rpc_data_1.Log)),
            validateError: info => {
                if (info.message.includes('after last accepted block')) {
                    // Regular RVM networks simply return an empty array in case
                    // of out of range request, but Avalanche returns an error.
                    return [];
                }
                throw new rpc_client_1.RpcError(info);
            }
        }).catch(async (err) => {
            if (isLogsResponseTooBigError(err)) {
                let range = asTryAnotherRangeError(err);
                if (range == null) {
                    range = { from, to: Math.floor(from + (to - from) / 2) };
                }
                if (range.from == from && from <= range.to && to > range.to) {
                    let result = await Promise.all([this.getLogs(range.from, range.to), this.getLogs(range.to + 1, to)]);
                    return result[0].concat(result[1]);
                }
                else {
                    this.log?.warn({ range: [from, to] }, `unable to fetch logs with eth_getLogs, fallback to eth_getTransactionReceipt`);
                    let result = await Promise.all((0, util_internal_range_1.rangeToArray)({ from, to }).map(n => this.getLogsByReceipts(n)));
                    return result.flat();
                }
            }
            throw err;
        });
    }
    async getLogsByReceipts(blockHeight) {
        let header = await this.getBlockByNumber(blockHeight, false);
        if (header == null)
            return [];
        let validateResult = getResultValidator((0, util_internal_validation_1.nullable)(rpc_data_1.TransactionReceipt));
        let receipts = await Promise.all(header.transactions.map((tx) => this.call('eth_getTransactionReceipt', [(0, util_1.getTxHash)(tx)], { validateResult })));
        let logs = [];
        for (let receipt of receipts) {
            if (receipt == null || receipt.blockHash !== header.hash)
                return [];
            logs.push(...receipt.logs);
        }
        return logs;
    }
    async addReceipts(blocks) {
        let method = await this.props.getReceiptsMethod();
        switch (method) {
            case 'alchemy_getTransactionReceipts':
            case 'eth_getBlockReceipts':
                return this.addReceiptsByBlock(blocks, method);
            default:
                return this.addReceiptsByTx(blocks);
        }
    }
    async addReceiptsByBlock(blocks, method) {
        let call = blocks.map(block => {
            if (method == 'eth_getBlockReceipts') {
                return {
                    method,
                    params: [block.block.number]
                };
            }
            else {
                return {
                    method,
                    params: [{ blockHash: block.hash }]
                };
            }
        });
        let results = await this.batchCall(call, {
            validateResult: getResultValidator((0, util_internal_validation_1.nullable)((0, util_internal_validation_1.array)(rpc_data_1.TransactionReceipt)))
        });
        for (let i = 0; i < blocks.length; i++) {
            let block = blocks[i];
            let receipts = results[i];
            if (receipts == null) {
                block._isInvalid = true;
                block._errorMessage = `${method} returned null`;
                continue;
            }
            block.receipts = receipts;
            // block hash check
            if (!this.validation.disableTxReceiptBlockHashCheck) {
                for (let receipt of receipts) {
                    if (receipt.blockHash !== block.hash) {
                        // for the hash mismatch, fail anyway
                        block._isInvalid = true;
                        block._errorMessage = `${method} returned receipts for a different block`;
                    }
                }
            }
            // count match check
            if (!this.validation.disableTxReceiptsNumberCheck && (block.block.transactions.length !== receipts.length)) {
                block._isInvalid = true;
                block._errorMessage = `got invalid number of receipts from ${method}`;
            }
        }
    }
    async addReceiptsByTx(blocks) {
        let call = [];
        for (let block of blocks) {
            for (let tx of block.block.transactions) {
                call.push({
                    method: 'eth_getTransactionReceipt',
                    params: [(0, util_1.getTxHash)(tx)]
                });
            }
        }
        let receipts = await this.batchCall(call, {
            validateResult: getResultValidator((0, util_internal_validation_1.nullable)(rpc_data_1.TransactionReceipt))
        });
        let receiptsByBlock = (0, util_internal_1.groupBy)(receipts.filter(r => r != null), r => r.blockHash);
        for (let block of blocks) {
            let rs = receiptsByBlock.get(block.hash) || [];
            block.receipts = rs;
            if (!this.validation.disableTxReceiptsNumberCheck && (rs.length !== block.block.transactions.length)) {
                block._isInvalid = true;
                block._errorMessage = 'failed to get receipts for all transactions';
            }
        }
    }
    async addTraceTxReplays(blocks, traces, method = 'trace_replayBlockTransactions') {
        let tracers = [];
        if (traces.trace) {
            tracers.push('trace');
        }
        if (traces.stateDiff) {
            tracers.push('stateDiff');
        }
        if (tracers.length == 0)
            return;
        let call = blocks.map(block => ({
            method,
            params: [block.block.number, tracers]
        }));
        let replaysByBlock = await this.batchCall(call, {
            validateResult: getResultValidator((0, util_internal_validation_1.array)((0, rpc_data_1.getTraceTransactionReplayValidator)(traces)))
        });
        for (let i = 0; i < blocks.length; i++) {
            let block = blocks[i];
            let replays = replaysByBlock[i];
            let txs = new Set(block.block.transactions.map(util_1.getTxHash));
            for (let rep of replays) {
                if (!rep.transactionHash) { // FIXME: Who behaves like that? Arbitrum?
                    let txHash = undefined;
                    for (let frame of rep.trace || []) {
                        (0, assert_1.default)(txHash == null || txHash === frame.transactionHash);
                        txHash = txHash || frame.transactionHash;
                    }
                    (0, assert_1.default)(txHash, "Can't match transaction replay with its transaction");
                    rep.transactionHash = txHash;
                }
                // Sometimes replays might be missing. FIXME: when?
                if (!txs.has(rep.transactionHash)) {
                    block._isInvalid = true;
                    block._errorMessage = `${method} returned a trace of a different block`;
                }
            }
            block.traceReplays = replays;
        }
    }
    async addTraceBlockTraces(blocks) {
        let call = blocks.map(block => ({
            method: 'trace_block',
            params: [block.block.number]
        }));
        let results = await this.batchCall(call, {
            validateResult: getResultValidator((0, util_internal_validation_1.array)(rpc_data_1.TraceFrame))
        });
        for (let i = 0; i < blocks.length; i++) {
            let block = blocks[i];
            let frames = results[i];
            if (frames.length == 0) {
                if (!this.validation.disableMissingTracesCheck && (block.block.transactions.length > 0)) {
                    block._isInvalid = true;
                    block._errorMessage = 'missing traces for some transactions';
                }
                continue;
            }
            for (let frame of frames) {
                if (!this.validation.disableTraceBlockHashCheck && frame.blockHash !== block.hash) {
                    block._isInvalid = true;
                    block._errorMessage = 'trace_block returned a trace of a different block';
                    break;
                }
                if (!block._isInvalid) {
                    block.traceReplays = [];
                    let byTx = (0, util_internal_1.groupBy)(frames, f => f.transactionHash);
                    for (let [transactionHash, txFrames] of byTx.entries()) {
                        if (transactionHash) {
                            block.traceReplays.push({
                                transactionHash,
                                trace: txFrames
                            });
                        }
                    }
                }
            }
        }
    }
    async addDebugFrames(blocks, req) {
        let traceConfig = {
            tracer: 'callTracer',
            tracerConfig: {
                onlyTopCall: false,
                withLog: false, // will study log <-> frame matching problem later
            },
            timeout: req.debugTraceTimeout,
        };
        let call = blocks.map(block => ({
            method: 'debug_traceBlockByHash',
            params: [block.hash, traceConfig]
        }));
        let validateFrameResult = getResultValidator((0, util_internal_validation_1.array)(rpc_data_1.DebugFrameResult));
        let results = await this.batchCall(call, {
            validateResult: result => {
                if (Array.isArray(result)) {
                    // Moonbeam quirk
                    for (let i = 0; i < result.length; i++) {
                        if (!('result' in result[i])) {
                            result[i] = { result: result[i] };
                        }
                    }
                }
                return validateFrameResult(result);
            },
            validateError: captureNotFound
        });
        for (let i = 0; i < blocks.length; i++) {
            let block = blocks[i];
            let frames = results[i];
            if (frames == null) {
                block._isInvalid = true;
                block._errorMessage = 'got "block not found" from debug_traceBlockByHash';
            }
            else if (block.block.transactions.length === frames.length) {
                block.debugFrames = frames;
            }
            else {
                block.debugFrames = this.matchDebugTrace('debug call frame', block, frames);
            }
        }
    }
    async addDebugStateDiffs(blocks, req) {
        let traceConfig = {
            tracer: 'prestateTracer',
            tracerConfig: {
                onlyTopCall: false, // passing this option is incorrect, but required by Alchemy endpoints
                diffMode: true,
            },
            timeout: req.debugTraceTimeout
        };
        let call = blocks.map(block => ({
            method: 'debug_traceBlockByHash',
            params: [block.hash, traceConfig]
        }));
        let results = await this.batchCall(call, {
            validateResult: getResultValidator((0, util_internal_validation_1.array)(rpc_data_1.DebugStateDiffResult)),
            validateError: captureNotFound
        });
        for (let i = 0; i < blocks.length; i++) {
            let block = blocks[i];
            let diffs = results[i];
            if (diffs == null) {
                block._isInvalid = true;
                block._errorMessage = 'got "block not found" from debug_traceBlockByHash';
            }
            else if (block.block.transactions.length === diffs.length) {
                block.debugStateDiffs = diffs;
            }
            else {
                block.debugStateDiffs = this.matchDebugTrace('debug state diff', block, diffs);
            }
        }
    }
    matchDebugTrace(type, block, trace) {
        let mapping = new Map(trace.map(t => [t.txHash, t]));
        let out = new Array(block.block.transactions.length);
        for (let i = 0; i < block.block.transactions.length; i++) {
            let txHash = (0, util_1.getTxHash)(block.block.transactions[i]);
            let rec = mapping.get(txHash);
            if (rec) {
                out[i] = rec;
            }
            else {
                this.log?.warn({
                    blockHeight: block.height,
                    blockHash: block.hash,
                    transactionIndex: i,
                    transactionHash: txHash
                }, `no ${type} for transaction`);
            }
        }
        return out;
    }
    async addArbitrumOneTraces(blocks, req) {
        if (req.stateDiffs) {
            throw new Error('State diffs are not supported on Arbitrum One');
        }
        if (!req.traces)
            return;
        let arbBlocks = blocks.filter(b => b.height <= 22207815);
        let debugBlocks = blocks.filter(b => b.height >= 22207818);
        if (arbBlocks.length) {
            await this.addTraceTxReplays(arbBlocks, { trace: true }, 'arbtrace_replayBlockTransactions');
        }
        if (debugBlocks.length) {
            await this.addDebugFrames(debugBlocks, req);
        }
    }
    async addTraces(blocks, req, finalizedHeight = Number.MAX_SAFE_INTEGER) {
        let isArbitrumOne = await this.props.getGenesisHash() === '0x7ee576b35482195fc49205cec9af72ce14f003b9ae69f6ba0faef4514be8b442';
        if (isArbitrumOne)
            return this.addArbitrumOneTraces(blocks, req);
        let tasks = [];
        let replayTraces = {};
        if (req.stateDiffs) {
            if (finalizedHeight < (0, util_internal_1.last)(blocks).height || req.useDebugApiForStateDiffs) {
                tasks.push(this.addDebugStateDiffs(blocks, req));
            }
            else {
                replayTraces.stateDiff = true;
            }
        }
        if (req.traces) {
            if (req.preferTraceApi) {
                if (finalizedHeight < (0, util_internal_1.last)(blocks).height || (0, schema_1.isEmpty)(replayTraces)) {
                    tasks.push(this.addTraceBlockTraces(blocks));
                }
                else {
                    replayTraces.trace = true;
                }
            }
            else {
                tasks.push(this.addDebugFrames(blocks, req));
            }
        }
        if (!(0, schema_1.isEmpty)(replayTraces)) {
            tasks.push(this.addTraceTxReplays(blocks, replayTraces));
        }
        await Promise.all(tasks);
    }
}
exports.Rpc = Rpc;
class RpcProps {
    constructor(client, genesisHeight = 0) {
        this.client = client;
        this.genesisHeight = genesisHeight;
    }
    async getGenesisHash() {
        if (this.genesisHash)
            return this.genesisHash;
        let rpc = new Rpc(this.client);
        let hash = await rpc.getBlockHash(this.genesisHeight);
        if (hash == null)
            throw new Error(`block ${this.genesisHeight} is not known to ${this.client.url}`);
        return this.genesisHash = hash;
    }
    async getReceiptsMethod() {
        if (this.receiptsMethod)
            return this.receiptsMethod;
        let alchemy = await this.client.call('alchemy_getTransactionReceipts', [{ blockNumber: '0x1' }]).then(res => Array.isArray(res), () => false);
        if (alchemy)
            return this.receiptsMethod = 'alchemy_getTransactionReceipts';
        let eth = await this.client.call('eth_getBlockReceipts', ['latest']).then(res => Array.isArray(res), () => false);
        if (eth)
            return this.receiptsMethod = 'eth_getBlockReceipts';
        return this.receiptsMethod = 'eth_getTransactionReceipt';
    }
}
function isLogsResponseTooBigError(err) {
    if (!(err instanceof rpc_client_1.RpcError))
        return false;
    if (/query returned more than/i.test(err.message))
        return true;
    if (/response is too big/i.test(err.message))
        return true;
    if (/query exceeds max results/i.test(err.message))
        return true;
    return false;
}
function asTryAnotherRangeError(err) {
    if (!(err instanceof rpc_client_1.RpcError))
        return;
    let m = /try with this block range \[(0x[0-9a-f]+), (0x[0-9a-f]+)]/i.exec(err.message);
    if (m != null) {
        let from = (0, util_1.qty2Int)(m[1]);
        let to = (0, util_1.qty2Int)(m[2]);
        if (from <= to)
            return { from, to };
    }
    m = /retry with the range (\d+)-(\d+)/i.exec(err.message);
    if (m != null) {
        let from = parseInt(m[1], 10);
        let to = parseInt(m[2], 10);
        if (from <= to)
            return { from, to };
    }
    return undefined;
}
function toBlock(getBlock) {
    if (getBlock == null)
        return;
    return {
        height: (0, util_1.qty2Int)(getBlock.number),
        hash: getBlock.hash,
        block: getBlock
    };
}
function captureNotFound(info) {
    if (info.message.includes('not found'))
        return null;
    throw new rpc_client_1.RpcError(info);
}
//# sourceMappingURL=rpc.js.map