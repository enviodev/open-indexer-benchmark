"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _Transaction_block, _Transaction_logs, _Transaction_traces, _Transaction_stateDiffs, _Log_block, _Log_transaction, _TraceBase_block, _TraceBase_transaction, _TraceBase_parent, _TraceBase_children, _StateDiffBase_block, _StateDiffBase_transaction;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateDiffDelete = exports.StateDiffChange = exports.StateDiffAdd = exports.StateDiffNoChange = exports.TraceReward = exports.TraceSuicide = exports.TraceCall = exports.TraceCreate = exports.Log = exports.Transaction = exports.BlockHeader = exports.Block = void 0;
const util_internal_processor_tools_1 = require("@subsquid/util-internal-processor-tools");
const assert_1 = __importDefault(require("assert"));
class Block {
    constructor(header) {
        this.transactions = [];
        this.logs = [];
        this.traces = [];
        this.stateDiffs = [];
        this.header = header;
    }
}
exports.Block = Block;
class BlockHeader {
    constructor(height, hash, parentHash) {
        this.id = (0, util_internal_processor_tools_1.formatId)({ height, hash });
        this.height = height;
        this.hash = hash;
        this.parentHash = parentHash;
    }
}
exports.BlockHeader = BlockHeader;
class Transaction {
    constructor(block, transactionIndex) {
        _Transaction_block.set(this, void 0);
        _Transaction_logs.set(this, void 0);
        _Transaction_traces.set(this, void 0);
        _Transaction_stateDiffs.set(this, void 0);
        this.id = (0, util_internal_processor_tools_1.formatId)(block, transactionIndex);
        this.transactionIndex = transactionIndex;
        __classPrivateFieldSet(this, _Transaction_block, block, "f");
    }
    get block() {
        return __classPrivateFieldGet(this, _Transaction_block, "f");
    }
    get logs() {
        return __classPrivateFieldGet(this, _Transaction_logs, "f") || (__classPrivateFieldSet(this, _Transaction_logs, [], "f"));
    }
    set logs(value) {
        __classPrivateFieldSet(this, _Transaction_logs, value, "f");
    }
    get traces() {
        return __classPrivateFieldGet(this, _Transaction_traces, "f") || (__classPrivateFieldSet(this, _Transaction_traces, [], "f"));
    }
    set traces(value) {
        __classPrivateFieldSet(this, _Transaction_traces, value, "f");
    }
    get stateDiffs() {
        return __classPrivateFieldGet(this, _Transaction_stateDiffs, "f") || (__classPrivateFieldSet(this, _Transaction_stateDiffs, [], "f"));
    }
    set stateDiffs(value) {
        __classPrivateFieldSet(this, _Transaction_stateDiffs, value, "f");
    }
}
exports.Transaction = Transaction;
_Transaction_block = new WeakMap(), _Transaction_logs = new WeakMap(), _Transaction_traces = new WeakMap(), _Transaction_stateDiffs = new WeakMap();
class Log {
    constructor(block, logIndex, transactionIndex) {
        _Log_block.set(this, void 0);
        _Log_transaction.set(this, void 0);
        this.id = (0, util_internal_processor_tools_1.formatId)(block, logIndex);
        this.logIndex = logIndex;
        this.transactionIndex = transactionIndex;
        __classPrivateFieldSet(this, _Log_block, block, "f");
    }
    get block() {
        return __classPrivateFieldGet(this, _Log_block, "f");
    }
    get transaction() {
        return __classPrivateFieldGet(this, _Log_transaction, "f");
    }
    set transaction(value) {
        __classPrivateFieldSet(this, _Log_transaction, value, "f");
    }
    getTransaction() {
        (0, assert_1.default)(this.transaction != null);
        return this.transaction;
    }
}
exports.Log = Log;
_Log_block = new WeakMap(), _Log_transaction = new WeakMap();
class TraceBase {
    constructor(block, transactionIndex, traceAddress) {
        _TraceBase_block.set(this, void 0);
        _TraceBase_transaction.set(this, void 0);
        _TraceBase_parent.set(this, void 0);
        _TraceBase_children.set(this, void 0);
        this.id = (0, util_internal_processor_tools_1.formatId)(block, transactionIndex, ...traceAddress);
        this.transactionIndex = transactionIndex;
        this.traceAddress = traceAddress;
        __classPrivateFieldSet(this, _TraceBase_block, block, "f");
    }
    get block() {
        return __classPrivateFieldGet(this, _TraceBase_block, "f");
    }
    get transaction() {
        return __classPrivateFieldGet(this, _TraceBase_transaction, "f");
    }
    set transaction(value) {
        __classPrivateFieldSet(this, _TraceBase_transaction, value, "f");
    }
    getTransaction() {
        (0, assert_1.default)(this.transaction != null);
        return this.transaction;
    }
    get parent() {
        return __classPrivateFieldGet(this, _TraceBase_parent, "f");
    }
    set parent(value) {
        __classPrivateFieldSet(this, _TraceBase_parent, value, "f");
    }
    getParent() {
        (0, assert_1.default)(this.parent != null);
        return this.parent;
    }
    get children() {
        return __classPrivateFieldGet(this, _TraceBase_children, "f") || (__classPrivateFieldSet(this, _TraceBase_children, [], "f"));
    }
    set children(value) {
        __classPrivateFieldSet(this, _TraceBase_children, value, "f");
    }
}
_TraceBase_block = new WeakMap(), _TraceBase_transaction = new WeakMap(), _TraceBase_parent = new WeakMap(), _TraceBase_children = new WeakMap();
class TraceCreate extends TraceBase {
    constructor() {
        super(...arguments);
        this.type = 'create';
    }
}
exports.TraceCreate = TraceCreate;
class TraceCall extends TraceBase {
    constructor() {
        super(...arguments);
        this.type = 'call';
    }
}
exports.TraceCall = TraceCall;
class TraceSuicide extends TraceBase {
    constructor() {
        super(...arguments);
        this.type = 'suicide';
    }
}
exports.TraceSuicide = TraceSuicide;
class TraceReward extends TraceBase {
    constructor() {
        super(...arguments);
        this.type = 'reward';
    }
}
exports.TraceReward = TraceReward;
class StateDiffBase {
    constructor(block, transactionIndex, address, key) {
        _StateDiffBase_block.set(this, void 0);
        _StateDiffBase_transaction.set(this, void 0);
        this.transactionIndex = transactionIndex;
        this.address = address;
        this.key = key;
        __classPrivateFieldSet(this, _StateDiffBase_block, block, "f");
    }
    get block() {
        return __classPrivateFieldGet(this, _StateDiffBase_block, "f");
    }
    get transaction() {
        return __classPrivateFieldGet(this, _StateDiffBase_transaction, "f");
    }
    set transaction(value) {
        __classPrivateFieldSet(this, _StateDiffBase_transaction, value, "f");
    }
    getTransaction() {
        (0, assert_1.default)(this.transaction != null);
        return this.transaction;
    }
}
_StateDiffBase_block = new WeakMap(), _StateDiffBase_transaction = new WeakMap();
class StateDiffNoChange extends StateDiffBase {
    constructor() {
        super(...arguments);
        this.kind = '=';
    }
}
exports.StateDiffNoChange = StateDiffNoChange;
class StateDiffAdd extends StateDiffBase {
    constructor() {
        super(...arguments);
        this.kind = '+';
    }
}
exports.StateDiffAdd = StateDiffAdd;
class StateDiffChange extends StateDiffBase {
    constructor() {
        super(...arguments);
        this.kind = '*';
    }
}
exports.StateDiffChange = StateDiffChange;
class StateDiffDelete extends StateDiffBase {
    constructor() {
        super(...arguments);
        this.kind = '-';
    }
}
exports.StateDiffDelete = StateDiffDelete;
//# sourceMappingURL=entities.js.map