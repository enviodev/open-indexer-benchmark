# USDC Transfer Events

This case is a benchmark for the historical backfill performance of USDC transfer events on Ethereum Mainnet. We will index the USDC transfer events for the last 100_000 blocks on Ethereum Mainnet. Write decoded logs + aggregate account balances in a database.

## Benchmark Specification

- **Target Contract**: USDC Token (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)
- **Events Indexed**: Transfer and Approval events
- **Block Range**: 100_000 blocks (approximately 2 weeks)
- **Features**: Storage read and write operations
