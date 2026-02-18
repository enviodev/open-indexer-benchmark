const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const parquet = require('parquetjs');

// Define the data directory relative to the script location
const dataDir = path.join(__dirname, '..', 'data');

// Create data directory if it doesn't exist
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Define schemas
const pairSchema = new parquet.ParquetSchema({
    createdAt: { type: 'INT64' },
    id: { type: 'UTF8' },
    token0: { type: 'UTF8' },
    token1: { type: 'UTF8' }
});

const swapSchema = new parquet.ParquetSchema({
    amount0In: { type: 'DOUBLE' },
    amount0Out: { type: 'DOUBLE' },
    amount1In: { type: 'DOUBLE' },
    amount1Out: { type: 'DOUBLE' },
    blockNumber: { type: 'INT64' },
    id: { type: 'UTF8' },
    pair: { type: 'UTF8' },
    sender: { type: 'UTF8' },
    timestamp: { type: 'INT64' },
    to__: { type: 'UTF8' }
});

async function fetchWithPagination(baseUrl, apiKey, query, outputFile, pageSize = 1000) {
    let offset = 0;
    let totalRows = 0;
    let page = 1;
    let hasMoreData = true;
    let allRows = [];

    while (hasMoreData) {
        console.log(`Fetching page ${page} (offset: ${offset})...`);
        const paginatedQuery = `${query} LIMIT ${pageSize} OFFSET ${offset}`;
        
        const response = await fetch(baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                sqlQuery: {
                    sql: paginatedQuery
                }
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API Response:', JSON.stringify(data, null, 2));
        
        if (!data.result || !data.result.rows) {
            console.error('Unexpected response structure:', data);
            throw new Error('Unexpected API response structure');
        }

        const rows = data.result.rows;
        if (rows.length === 0) {
            console.log('No more data to fetch');
            hasMoreData = false;
            break;
        }

        totalRows += rows.length;
        allRows = allRows.concat(rows);
        console.log(`Fetched page ${page}, got ${rows.length} rows. Total rows so far: ${totalRows}`);

        // Update offset for next page
        offset += pageSize;
        page++;
    }

    // Write all data at once
    await writeToParquet(allRows, outputFile);
    console.log(`Finished fetching all data. Total rows: ${totalRows}`);
    return totalRows;
}

async function writeToParquet(data, filename) {
    try {
        // Create full output path
        const outputPath = path.join(dataDir, filename);
        console.log(`Writing ${data.length} rows to ${outputPath}`);

        const schema = filename.includes('pairs') ? pairSchema : swapSchema;
        const writer = await parquet.ParquetWriter.openFile(schema, outputPath);

        for (const row of data) {
            await writer.appendRow(row);
        }

        await writer.close();
        console.log(`Successfully wrote ${data.length} rows to ${outputPath}`);
    } catch (error) {
        console.error('Error in writeToParquet:', error);
        throw error;
    }
}

async function fetchSentioData() {
    const baseUrl = "https://app.sentio.xyz/api/v1/analytics/yufei/case_6_template/sql/execute";
    const apiKey = "hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl";
    
    try {
        // Fetch all pairs
        console.log('Fetching pairs...');
        const pairRows = await fetchWithPagination(
            baseUrl, 
            apiKey,
            "SELECT id, token0, token1, createdAt FROM `Pair`",
            'sentio_pairs.parquet'
        );
        console.log(`Total pairs fetched: ${pairRows}`);

        // Fetch all swaps
        console.log('Fetching swaps...');
        const swapsQuery = `SELECT amount0In, amount0Out, amount1In, amount1Out, blockNumber, id, pair, sender, timestamp, to__ FROM UniswapV2Event WHERE blockNumber >= 19000000 AND blockNumber <= 19010000`;
        const swapRows = await fetchWithPagination(
            baseUrl,
            apiKey,
            swapsQuery,
            'sentio_swaps.parquet'
        );
        console.log(`Total swaps fetched: ${swapRows}`);

    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

fetchSentioData(); 