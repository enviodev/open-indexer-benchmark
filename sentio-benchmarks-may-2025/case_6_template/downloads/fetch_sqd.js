const { Client } = require('pg');
const parquet = require('parquetjs');
const fs = require('fs');
const path = require('path');

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const client = new Client({
  host: 'pg.squid.subsquid.io',
  port: 5432,
  database: '16378_q422vg',
  user: '16378_q422vg',
  password: 'C-0zyiKIZiyyydOooriNTTJm~xh_06yp',
});

async function writePairsToParquet(pairs) {
  const schema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    token0: { type: 'UTF8' },
    token1: { type: 'UTF8' },
    createdAt: { type: 'UTF8' }
  });

  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'sqd_pairs.parquet'));

  for (const pair of pairs) {
    await writer.appendRow({
      id: pair.id,
      token0: pair.token0,
      token1: pair.token1,
      createdAt: pair.created_at ? pair.created_at.toString() : '0'
    });
  }

  await writer.close();
}

async function writeSwapsToParquet(swaps) {
  const schema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    pair: { type: 'UTF8' },
    sender: { type: 'UTF8' },
    to: { type: 'UTF8' },
    amount0In: { type: 'UTF8' },
    amount1In: { type: 'UTF8' },
    amount0Out: { type: 'UTF8' },
    amount1Out: { type: 'UTF8' },
    blockNumber: { type: 'UTF8' },
    timestamp: { type: 'UTF8' }
  });

  const writer = await parquet.ParquetWriter.openFile(schema, path.join(dataDir, 'sqd_swaps.parquet'));

  for (const swap of swaps) {
    await writer.appendRow({
      id: swap.id,
      pair: swap.pair_id,
      sender: swap.sender,
      to: swap.to,
      amount0In: swap.amount0_in ? swap.amount0_in.toString() : '0',
      amount1In: swap.amount1_in ? swap.amount1_in.toString() : '0',
      amount0Out: swap.amount0_out ? swap.amount0_out.toString() : '0',
      amount1Out: swap.amount1_out ? swap.amount1_out.toString() : '0',
      blockNumber: swap.block_number ? swap.block_number.toString() : '0',
      timestamp: swap.timestamp ? swap.timestamp.toString() : '0'
    });
  }

  await writer.close();
}

async function fetchAndSaveData() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database');

    // Fetch pairs
    console.log('Fetching pairs...');
    const pairsResult = await client.query('SELECT * FROM pair');
    console.log(`Fetched ${pairsResult.rows.length} pairs`);
    await writePairsToParquet(pairsResult.rows);
    console.log('Pairs data written to sqd_pairs.parquet');

    // Fetch swaps
    console.log('\nFetching swaps...');
    const swapsResult = await client.query('SELECT * FROM uniswap_v2_event');
    console.log(`Fetched ${swapsResult.rows.length} swaps`);
    await writeSwapsToParquet(swapsResult.rows);
    console.log('Swaps data written to sqd_swaps.parquet');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL database');
  }
}

fetchAndSaveData(); 