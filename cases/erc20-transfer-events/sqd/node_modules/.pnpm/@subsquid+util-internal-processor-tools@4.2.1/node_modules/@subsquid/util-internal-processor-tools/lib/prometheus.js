"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrometheusServer = void 0;
const util_internal_prometheus_server_1 = require("@subsquid/util-internal-prometheus-server");
const prom_client_1 = require("prom-client");
class PrometheusServer {
    constructor() {
        this.registry = new prom_client_1.Registry();
        (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
    }
    setPort(port) {
        this.port = port;
    }
    addRunnerMetrics(metrics) {
        new prom_client_1.Gauge({
            name: 'sqd_processor_chain_height',
            help: 'Chain height of the data source',
            registers: [this.registry],
            collect: collect(() => metrics.getChainHeight())
        });
        new prom_client_1.Gauge({
            name: 'sqd_processor_last_block',
            help: 'Last processed block',
            registers: [this.registry],
            collect: collect(() => metrics.getLastProcessedBlock())
        });
        new prom_client_1.Gauge({
            name: 'sqd_processor_mapping_blocks_per_second',
            help: 'Mapping performance',
            registers: [this.registry],
            collect: collect(() => metrics.getMappingSpeed())
        });
        new prom_client_1.Gauge({
            name: 'sqd_processor_sync_eta_seconds',
            help: 'Estimated time until all required blocks will be processed or until the chain height will be reached',
            registers: [this.registry],
            collect: collect(() => metrics.getSyncEtaSeconds())
        });
        new prom_client_1.Gauge({
            name: 'sqd_processor_sync_ratio',
            help: 'Percentage of processed blocks',
            registers: [this.registry],
            collect: collect(() => metrics.getSyncRatio())
        });
    }
    addChainRpcMetrics(collect) {
        new prom_client_1.Gauge({
            name: 'sqd_rpc_request_count',
            help: 'Number of rpc requests made',
            labelNames: ['url', 'kind'],
            registers: [this.registry],
            collect() {
                let m = collect();
                this.set({ url: m.url, kind: 'success' }, m.requestsServed);
                this.set({ url: m.url, kind: 'failure' }, m.connectionErrors);
            }
        });
    }
    serve() {
        return (0, util_internal_prometheus_server_1.createPrometheusServer)(this.registry, this.getPort());
    }
    getPort() {
        return this.port == null
            ? process.env.PROCESSOR_PROMETHEUS_PORT || process.env.PROMETHEUS_PORT || 0
            : this.port;
    }
}
exports.PrometheusServer = PrometheusServer;
function collect(fn) {
    return function () {
        this.set(fn());
    };
}
//# sourceMappingURL=prometheus.js.map