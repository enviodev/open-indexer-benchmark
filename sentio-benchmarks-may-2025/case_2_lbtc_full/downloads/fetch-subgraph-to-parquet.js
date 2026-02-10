const fs = require('fs');
const path = require('path');
const axios = require('axios');
const parquet = require('parquetjs');

// Output directory setup
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Subgraph GraphQL details
const SUBGRAPH_ENDPOINT = 'https://api.studio.thegraph.com/query/108520/case_2_lbtc_full/version/latest';

// Schema definitions
const transferSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  transactionHash: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  value: { type: 'UTF8' } // Using UTF8 for large numbers
});

const accountSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  balance: { type: 'UTF8' }, // Using UTF8 for large numbers
  point: { type: 'UTF8' },   // Add point field for accounts
  timestamp: { type: 'INT64' } // Add timestamp field
});

// Fetch and save transfer data
async function fetchSubgraphTransfers() {
  const outputPath = path.join(dataDir, 'subgraph-case2-transfers.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  const writer = await parquet.ParquetWriter.openFile(transferSchema, outputPath);
  let lastId = '';
  const pageSize = 1000;
  let totalRows = 0;
  
  console.log('Fetching transfer data from Subgraph GraphQL...');
  
  while (true) {
    console.log(`Fetching transfers after ID: ${lastId || 'start'}...`);
    
    const whereCondition = lastId ? `where: {id_gt: "${lastId}"}` : '';
    const query = `
      query {
        transfers(${whereCondition}, first: ${pageSize}, orderBy: id, orderDirection: asc) {
          id
          blockNumber
          transactionHash
          from
          to
          value
        }
      }
    `;
    
    const response = await axios.post(
      SUBGRAPH_ENDPOINT,
      { query },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000 // 3 minute timeout
      }
    );
    
    const transfers = response.data.data.transfers;
    console.log(`Received ${transfers.length} transfers`);
    
    if (transfers.length === 0) {
      // If we haven't fetched any transfers yet, create a dummy record
      if (totalRows === 0) {
        await writer.appendRow({
          id: 'dummy',
          blockNumber: 0,
          transactionHash: '',
          from: '',
          to: '',
          value: '0'
        });
        totalRows = 1;
        console.log("Added a dummy record since no transfers were found.");
      }
      break;
    }
    
    for (const transfer of transfers) {
      const record = {
        id: transfer.id || '',
        blockNumber: Number(transfer.blockNumber || 0),
        transactionHash: transfer.transactionHash || '',
        from: transfer.from || '',
        to: transfer.to || '',
        value: transfer.value || '0'
      };
      
      await writer.appendRow(record);
      lastId = transfer.id;
    }
    
    totalRows += transfers.length;
    
    if (transfers.length < pageSize) {
      break;
    }
  }
  
  await writer.close();
  console.log(`Saved ${totalRows} transfer records to ${outputPath}`);
  return totalRows;
}

// Fetch and save account data
async function fetchSubgraphAccounts() {
  const outputPath = path.join(dataDir, 'subgraph-case2-accounts.parquet');
  
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  try {
    const writer = await parquet.ParquetWriter.openFile(accountSchema, outputPath);
    let lastId = '';
    const pageSize = 1000;
    let totalRows = 0;
    
    console.log('Fetching account data from Subgraph GraphQL...');
    
    while (true) {
      console.log(`Fetching accounts after ID: ${lastId || 'start'}...`);
      
      try {
        const whereCondition = lastId ? `where: {id_gt: "${lastId}"}` : '';
        const response = await axios.post(
          SUBGRAPH_ENDPOINT,
          {
            query: `
              query {
                accounts_collection(
                  ${whereCondition}
                  first: ${pageSize}
                  orderBy: id
                  orderDirection: asc
                ) {
                  id
                  lastSnapshotTimestamp
                  snapshots(
                    first: 1
                    orderBy: timestamp
                    orderDirection: desc
                  ) {
                    id
                    timestamp
                    balance
                    point
                    mintAmount
                  }
                }
              }
            `
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000
          }
        );
        
        if (!response.data?.data?.accounts_collection) {
          console.log('Invalid response structure:', JSON.stringify(response.data, null, 2));
          break;
        }
        
        const accounts = response.data.data.accounts_collection;
        console.log(`Received ${accounts.length} accounts`);
        
        if (accounts.length === 0) {
          break;
        }
        
        for (const account of accounts) {
          // Skip zero address
          if (account.id.toLowerCase() === "0x0000000000000000000000000000000000000000") {
            continue;
          }
          
          if (!account.snapshots || account.snapshots.length === 0) {
            console.log(`No snapshots found for account ${account.id}`);
            continue;
          }
          
          const latestSnapshot = account.snapshots[0];
          const record = {
            id: account.id,
            balance: latestSnapshot.balance || '0',
            point: latestSnapshot.point || '0',
            timestamp: parseInt(latestSnapshot.timestamp, 10) || 0
          };
          
          await writer.appendRow(record);
          lastId = account.id;
          totalRows++;
        }
        
        if (accounts.length < pageSize) {
          break;
        }
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('Error fetching accounts:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        break;
      }
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} account records to ${outputPath}`);
    return totalRows;
  } catch (error) {
    console.error('Error in fetchSubgraphAccounts:', error);
    throw error;
  }
}

// Main function
async function main() {
  // Check subgraph indexing status
  console.log("Checking subgraph indexing status...");
  
  const metaQuery = `
    query {
      _meta {
        block {
          number
        }
        hasIndexingErrors
        deployment
      }
    }
  `;
  
  const metaResponse = await axios.post(
    SUBGRAPH_ENDPOINT,
    { query: metaQuery },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }
  );
  
  console.log("Subgraph _meta data:", JSON.stringify(metaResponse.data, null, 2));
  
  // Check schema to verify Transfer entity exists
  const schemaQuery = `
    query {
      __schema {
        types {
          name
          kind
          fields {
            name
            type {
              name
              kind
            }
          }
        }
      }
    }
  `;
  
  const schemaResponse = await axios.post(
    SUBGRAPH_ENDPOINT,
    { query: schemaQuery },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }
  );
  
  // Filter for Transfer type info
  if (schemaResponse.data && schemaResponse.data.data && schemaResponse.data.data.__schema) {
    const transferType = schemaResponse.data.data.__schema.types.find(
      type => type.name === 'Transfer' && type.kind === 'OBJECT'
    );
    
    if (transferType) {
      console.log("Transfer entity fields:", 
        transferType.fields.map(f => `${f.name}: ${f.type.name || f.type.kind}`));
    } else {
      console.log("Transfer entity not found in schema as expected, although it's defined in schema.graphql");
    }
  }
  
  console.log("Fetching transfers from Subgraph...");
  const transferCount = await fetchSubgraphTransfers();
  console.log(`Fetching transfers completed. Retrieved ${transferCount} records.`);
  
  console.log("Fetching accounts from Subgraph...");
  const accountCount = await fetchSubgraphAccounts();
  console.log(`Fetching accounts completed. Retrieved ${accountCount} records.`);
  
  console.log('Subgraph data fetching complete!');
}

// Run the script
main().catch(error => {
  console.error('Error occurred during data fetching:');
  console.error(error);
  process.exit(1);
});