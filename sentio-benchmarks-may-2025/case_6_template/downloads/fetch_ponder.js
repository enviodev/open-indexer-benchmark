const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const parquet = require('parquetjs');

// Configuration
const PONDER_GRAPHQL_ENDPOINT = 'http://localhost:42070';
const DATA_DIR = path.join(__dirname, '..', 'data');

// Define schemas
const swapSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    pairId: { type: 'UTF8' },
    sender: { type: 'UTF8' },
    to: { type: 'UTF8' },
    amount0In: { type: 'DOUBLE' },
    amount0Out: { type: 'DOUBLE' },
    amount1In: { type: 'DOUBLE' },
    amount1Out: { type: 'DOUBLE' },
    timestamp: { type: 'INT64' },
    blockNumber: { type: 'INT64' }
});

const pairSchema = new parquet.ParquetSchema({
    id: { type: 'UTF8' },
    token0: { type: 'UTF8' },
    token1: { type: 'UTF8' },
    factory: { type: 'UTF8' },
    createdAt: { type: 'INT64' }
});

// GraphQL queries
const queries = {
    pairs: `
        query($after: String) {
            pairs(limit: 1000, after: $after) {
                items {
                    id
                    token0
                    token1
                    factory
                    createdAt
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `,
    swaps: `
        query($after: String) {
            swaps(limit: 1000, after: $after) {
                items {
                    id
                    pairId
                    sender
                    to
                    amount0In
                    amount0Out
                    amount1In
                    amount1Out
                    timestamp
                    blockNumber
                }
                pageInfo {
                    hasNextPage
                    endCursor
                }
            }
        }
    `
};

async function fetchAndSaveData(queryName, query) {
    let allItems = [];
    let hasMore = true;
    let after = null;
    let pageCount = 0;

    console.log(`\n=== Starting to fetch ${queryName} data from Ponder ===`);
    console.log(`GraphQL endpoint: ${PONDER_GRAPHQL_ENDPOINT}`);

    while (hasMore) {
        try {
            pageCount++;
            console.log(`\nFetching page ${pageCount}...`);
            if (after) {
                console.log(`Using cursor: ${after}`);
            }

            const response = await fetch(PONDER_GRAPHQL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    variables: { after }
                }),
            });

            const result = await response.json();
            console.log('Response status:', response.status);
            
            if (result.errors) {
                console.error('GraphQL errors:', JSON.stringify(result.errors, null, 2));
                break;
            }

            const items = result.data[queryName]?.items || [];
            console.log(`Fetched ${items.length} ${queryName} in this page`);
            
            if (items.length === 0) {
                console.log('No more items found, ending fetch');
                hasMore = false;
                break;
            }

            allItems = allItems.concat(items);
            after = result.data[queryName]?.pageInfo?.endCursor;
            hasMore = result.data[queryName]?.pageInfo?.hasNextPage || false;

            console.log(`Total ${queryName} fetched so far: ${allItems.length}`);
            console.log(`Has next page: ${hasMore}`);
            if (hasMore) {
                console.log(`Next cursor: ${after}`);
            }
        } catch (error) {
            console.error(`Error fetching ${queryName}:`, error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                code: error.code
            });
            break;
        }
    }

    console.log(`\n=== Completed fetching ${queryName} ===`);
    console.log(`Total pages fetched: ${pageCount}`);
    console.log(`Total ${queryName} fetched: ${allItems.length}`);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(DATA_DIR)) {
        console.log(`Creating data directory: ${DATA_DIR}`);
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Remove existing file if it exists
    const outputPath = path.join(DATA_DIR, `ponder_${queryName}.parquet`);
    if (fs.existsSync(outputPath)) {
        console.log(`Removing existing file: ${outputPath}`);
        fs.unlinkSync(outputPath);
    }

    console.log(`Writing to parquet file: ${outputPath}`);
    // Write to parquet using parquetjs
    const writer = await parquet.ParquetWriter.openFile(
        queryName === 'pairs' ? pairSchema : swapSchema,
        outputPath
    );

    for (const item of allItems) {
        const record = {};
        if (queryName === 'pairs') {
            record.id = item.id || '';
            record.token0 = item.token0 || '';
            record.token1 = item.token1 || '';
            record.factory = item.factory || '';
            record.createdAt = Number(item.createdAt || 0);
        } else {
            record.id = item.id || '';
            record.pairId = item.pairId || '';
            record.sender = item.sender || '';
            record.to = item.to || '';
            record.amount0In = Number(item.amount0In || 0);
            record.amount0Out = Number(item.amount0Out || 0);
            record.amount1In = Number(item.amount1In || 0);
            record.amount1Out = Number(item.amount1Out || 0);
            record.timestamp = Number(item.timestamp || 0);
            record.blockNumber = Number(item.blockNumber || 0);
        }
        await writer.appendRow(record);
    }

    await writer.close();
    console.log(`Successfully saved ${allItems.length} ${queryName} to ${outputPath}`);
}

// Main function to run all exports
async function exportAllData() {
    console.log('Starting data export...');
    
    await fetchAndSaveData('pairs', queries.pairs);
    await fetchAndSaveData('swaps', queries.swaps);
    
    console.log('Data export completed!');
}

// Run the export
exportAllData(); 