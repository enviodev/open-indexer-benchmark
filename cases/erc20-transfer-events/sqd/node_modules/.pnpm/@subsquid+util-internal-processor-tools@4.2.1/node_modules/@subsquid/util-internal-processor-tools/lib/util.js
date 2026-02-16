"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrGenerateSquidId = getOrGenerateSquidId;
exports.timeInterval = timeInterval;
exports.getItemsCount = getItemsCount;
exports.formatHead = formatHead;
exports.shortHash = shortHash;
exports.formatId = formatId;
function getOrGenerateSquidId() {
    return process.env.SQUID_ID || `gen-${randomString(10)}`;
}
function randomString(len) {
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}
function timeInterval(seconds) {
    if (seconds < 60) {
        return Math.round(seconds) + 's';
    }
    let minutes = Math.ceil(seconds / 60);
    if (minutes < 60) {
        return minutes + 'm';
    }
    let hours = Math.floor(minutes / 60);
    minutes = minutes - hours * 60;
    return hours + 'h ' + minutes + 'm';
}
function getItemsCount(blocks) {
    let count = 0;
    for (let block of blocks) {
        for (let key in block) {
            let val = block[key];
            if (Array.isArray(val)) {
                count += val.length;
            }
        }
    }
    return count;
}
function formatHead(head) {
    return `${head.height}#${shortHash(head.hash)}`;
}
function shortHash(hash) {
    if (hash.startsWith('0x')) {
        return hash.slice(2, 7);
    }
    else {
        return hash.slice(0, 5);
    }
}
function formatId(block, ...address) {
    let no = block.height.toString().padStart(10, '0');
    let hash = shortHash(block.hash);
    let id = `${no}-${hash}`;
    for (let index of address) {
        id += '-' + index.toString().padStart(6, '0');
    }
    return id;
}
//# sourceMappingURL=util.js.map