# Showcase squid 01: USDC transfers in real time

This squid captures all `Transfer(address,address,uint256)` events emitted by the [USDC token contract](https://etherscan.io/address/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48) and keeps up with network updates [in real time](https://docs.subsquid.io/basics/unfinalized-blocks/). See more examples of requesting data with squids on the [showcase page](https://docs.subsquid.io/evm-indexing/configuration/showcase) of Subsquid documentation.

Dependencies: Node.js, Docker.

## Quickstart

```bash
# 0. Install @subsquid/cli a.k.a. the sqd command globally
npm i -g @subsquid/cli

# 1. Retrieve the template
sqd init showcase01 -t https://github.com/subsquid-labs/showcase01-all-usdc-transfers
cd showcase01

# 2. Install dependencies
npm ci

# 3. Start a Postgres database container and detach
sqd up

# 4. Build and start the processor
sqd process

# 5. The command above will block the terminal
#    being busy with fetching the chain data, 
#    transforming and storing it in the target database.
#
#    To start the graphql server open the separate terminal
#    and run
sqd serve
```
A GraphiQL playground will be available at [localhost:4350/graphql](http://localhost:4350/graphql).
