# Case 3 Ethereum Block Data Download Scripts

This directory contains scripts to download block data from various indexers used in Case 3 of the indexer benchmark.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Make sure the data directory exists:
```bash
mkdir -p ../data
```

## Running the Scripts

Each script can be run individually to download data from a specific indexer, or you can run all scripts sequentially.

### Download from all indexers
```bash
npm run all
```

### Download from individual indexers

#### Sentio
```bash
npm run sentio
```

#### Ponder
```bash
npm run ponder
```

#### Subsquid
```bash
npm run subsquid
```

#### Subgraph
```bash
npm run subgraph
```

## Output

All downloaded data will be saved as Parquet files in the `../data` directory:

- `sentio-case3-blocks.parquet`: Block data from Sentio
- `ponder-case3-blocks.parquet`: Block data from Ponder
- `subsquid-case3-blocks.parquet`: Block data from Subsquid
- `subgraph-case3-blocks.parquet`: Block data from The Graph subgraph

## Schema

All Parquet files follow this schema:

```javascript
{
  id: { type: 'UTF8' },
  number: { type: 'INT64' },
  hash: { type: 'UTF8' },
  parentHash: { type: 'UTF8' },
  timestamp: { type: 'INT64' }
}
``` 