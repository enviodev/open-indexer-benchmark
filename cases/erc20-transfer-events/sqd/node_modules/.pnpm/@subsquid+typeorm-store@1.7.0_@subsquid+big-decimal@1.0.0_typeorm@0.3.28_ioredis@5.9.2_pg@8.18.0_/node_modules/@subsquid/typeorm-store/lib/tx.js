"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransaction = createTransaction;
function createTransaction(con, isolationLevel) {
    return new Promise((resolve, reject) => {
        let done = con.transaction(isolationLevel, em => {
            return new Promise((commit, rollback) => {
                resolve({
                    em,
                    commit() {
                        commit();
                        return done;
                    },
                    rollback() {
                        rollback(ROLLBACK_ERROR);
                        return done.catch(err => {
                            if (err !== ROLLBACK_ERROR) {
                                throw err;
                            }
                        });
                    }
                });
            });
        });
        done.catch(err => {
            if (err !== ROLLBACK_ERROR) {
                reject(err);
            }
        });
    });
}
const ROLLBACK_ERROR = new Error('rollback');
//# sourceMappingURL=tx.js.map