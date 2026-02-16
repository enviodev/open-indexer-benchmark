"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvmArchive = void 0;
const util_internal_1 = require("@subsquid/util-internal");
const util_internal_ingest_tools_1 = require("@subsquid/util-internal-ingest-tools");
const util_internal_range_1 = require("@subsquid/util-internal-range");
const util_internal_validation_1 = require("@subsquid/util-internal-validation");
const assert_1 = __importDefault(require("assert"));
const entities_1 = require("../mapping/entities");
const relations_1 = require("../mapping/relations");
const schema_1 = require("./schema");
const NO_FIELDS = {};
class EvmArchive {
    constructor(client) {
        this.client = client;
    }
    getFinalizedHeight() {
        return this.client.getHeight();
    }
    async getBlockHash(height) {
        let blocks = await this.client.query({
            fromBlock: height,
            toBlock: height,
            includeAllBlocks: true
        });
        (0, assert_1.default)(blocks.length == 1);
        return blocks[0].header.hash;
    }
    async *getFinalizedBlocks(requests, stopOnHead) {
        for await (let batch of (0, util_internal_ingest_tools_1.archiveIngest)({
            requests,
            client: this.client,
            stopOnHead
        })) {
            let fields = (0, util_internal_range_1.getRequestAt)(requests, batch.blocks[0].header.number)?.fields || NO_FIELDS;
            let blocks = batch.blocks.map(b => {
                try {
                    return this.mapBlock(b, fields);
                }
                catch (err) {
                    throw (0, util_internal_1.addErrorContext)(err, {
                        blockHeight: b.header.number,
                        blockHash: b.header.hash
                    });
                }
            });
            yield { blocks, isHead: batch.isHead };
        }
    }
    mapBlock(rawBlock, fields) {
        let validator = (0, schema_1.getBlockValidator)(fields);
        let src = (0, util_internal_validation_1.cast)(validator, rawBlock);
        let { number, hash, parentHash, ...hdr } = src.header;
        if (hdr.timestamp) {
            hdr.timestamp = hdr.timestamp * 1000; // convert to ms
        }
        let header = new entities_1.BlockHeader(number, hash, parentHash);
        Object.assign(header, hdr);
        let block = new entities_1.Block(header);
        if (src.transactions) {
            for (let { transactionIndex, ...props } of src.transactions) {
                let tx = new entities_1.Transaction(header, transactionIndex);
                Object.assign(tx, props);
                block.transactions.push(tx);
            }
        }
        if (src.logs) {
            for (let { logIndex, transactionIndex, ...props } of src.logs) {
                let log = new entities_1.Log(header, logIndex, transactionIndex);
                Object.assign(log, props);
                block.logs.push(log);
            }
        }
        if (src.traces) {
            for (let { transactionIndex, traceAddress, type, ...props } of src.traces) {
                transactionIndex = (0, util_internal_1.assertNotNull)(transactionIndex);
                let trace;
                switch (type) {
                    case 'create':
                        trace = new entities_1.TraceCreate(header, transactionIndex, traceAddress);
                        break;
                    case 'call':
                        trace = new entities_1.TraceCall(header, transactionIndex, traceAddress);
                        break;
                    case 'suicide':
                        trace = new entities_1.TraceSuicide(header, transactionIndex, traceAddress);
                        break;
                    case 'reward':
                        trace = new entities_1.TraceReward(header, transactionIndex, traceAddress);
                        break;
                    default:
                        throw (0, util_internal_1.unexpectedCase)();
                }
                Object.assign(trace, props);
                block.traces.push(trace);
            }
        }
        if (src.stateDiffs) {
            for (let { transactionIndex, address, key, kind, ...props } of src.stateDiffs) {
                let diff;
                switch (kind) {
                    case '=':
                        diff = new entities_1.StateDiffNoChange(header, transactionIndex, address, key);
                        break;
                    case '+':
                        diff = new entities_1.StateDiffAdd(header, transactionIndex, address, key);
                        break;
                    case '*':
                        diff = new entities_1.StateDiffChange(header, transactionIndex, address, key);
                        break;
                    case '-':
                        diff = new entities_1.StateDiffDelete(header, transactionIndex, address, key);
                        break;
                    default:
                        throw (0, util_internal_1.unexpectedCase)();
                }
                Object.assign(diff, props);
                block.stateDiffs.push(diff);
            }
        }
        (0, relations_1.setUpRelations)(block);
        return block;
    }
}
exports.EvmArchive = EvmArchive;
//# sourceMappingURL=client.js.map