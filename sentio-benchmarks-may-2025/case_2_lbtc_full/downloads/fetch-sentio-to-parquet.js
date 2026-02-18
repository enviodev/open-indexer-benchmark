const fs = require('fs');
const path = require('path');
const axios = require('axios');
const parquet = require('parquetjs');

// Output directory setup
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Sentio API details
const API_KEY = 'hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl';
const BASE_URL = 'https://app.sentio.xyz/api/v1/analytics/yufei/case_2_lbtc_full/sql/execute';
const MAX_RETRIES = 3;
const TIMEOUT = 30000; // 30 seconds

// Schema definitions
const transferSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  transactionHash: { type: 'UTF8' },
  from: { type: 'UTF8' },
  to: { type: 'UTF8' },
  value: { type: 'UTF8' } // Using UTF8 for large numbers
});

// Updated schema for AccountSnapshot
const accountSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  balance: { type: 'UTF8' }, // Using UTF8 for large numbers
  timestamp: { type: 'INT64' },
  point: { type: 'UTF8' } // Added point field
});

// Add new schema for point updates
const pointUpdateSchema = new parquet.ParquetSchema({
  account: { type: 'UTF8' },
  blockNumber: { type: 'INT64' },
  points: { type: 'UTF8' }, // Using UTF8 for large numbers
  newTimestamp: { type: 'INT64' },
  newLbtcBalance: { type: 'UTF8' } // Using UTF8 for large numbers
});

// Test connection before starting
async function testConnection() {
  console.log(`Testing connection to Sentio API: ${BASE_URL}`);
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
  try {
    const response = await axios.post(
      BASE_URL,
      {
        sqlQuery: {
          sql: `select 1 as test limit 1`
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'api-key': API_KEY
        },
          timeout: TIMEOUT
      }
    );
    
    if (response.data && response.data.result && response.data.result.rows) {
      console.log('Connection test successful!');
      return true;
    } else {
      console.error('Connection test response format unexpected:', JSON.stringify(response.data, null, 2));
    }
  } catch (error) {
      console.error(`Connection test attempt ${retries + 1} failed:`, error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    }
    retries++;
    if (retries < MAX_RETRIES) {
      console.log(`Retrying in 5 seconds... (attempt ${retries + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
    return false;
}

// Fetch and save transfer data
async function fetchSentioTransfers() {
  const outputPath = path.join(dataDir, 'sentio-case2-transfers.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  try {
    const writer = await parquet.ParquetWriter.openFile(transferSchema, outputPath);
    let offset = 0;
    const pageSize = 5000;
    let totalRows = 0;
    
    console.log('Fetching transfer data from Sentio...');
    
    while (true) {
      console.log(`Fetching transfers with offset ${offset}...`);
      
      try {
        const response = await axios.post(
          BASE_URL,
          {
            sqlQuery: {
              sql: `select * from Transfer order by id limit ${pageSize} offset ${offset}`
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'api-key': API_KEY
            },
            timeout: TIMEOUT
          }
        );
        
        // Ensure we handle the response structure correctly
        const rows = response.data.result && response.data.result.rows ? response.data.result.rows : [];
        console.log(`Received ${rows.length} rows`);
        
        if (rows.length === 0) {
          break;
        }
        
        for (const row of rows) {
          try {
            // First, verify all required fields exist
            if (!row.id || !row.__genBlockChain__ || !row.from__ || !row.to__) {
              console.log(`Skipping row with missing required fields:`, row);
              continue;
            }
            
            // Extract the block number as a string from __genBlockChain__
            let blockNumberStr = '0';
            if (typeof row.__genBlockChain__ === 'string') {
              const parts = row.__genBlockChain__.split(':');
              blockNumberStr = parts.length > 1 ? parts[1] : '0';
            } else if (row.__genBlockChain__ && row.__genBlockChain__.toString) {
              blockNumberStr = row.__genBlockChain__.toString();
            }
            
            // Create a safe transaction hash
            let txHash = '';
            if (typeof row.id === 'string') {
              const parts = row.id.split('-');
              txHash = parts[0] || '';
            } else if (row.id && row.id.toString) {
              txHash = row.id.toString();
            }
            
            // Ensure all values are properly converted to strings
            const record = {
              id: typeof row.id === 'string' ? row.id : String(row.id || ''),
              blockNumber: BigInt(blockNumberStr),
              transactionHash: txHash,
              from: typeof row.from__ === 'string' ? row.from__ : String(row.from__ || ''),
              to: typeof row.to__ === 'string' ? row.to__ : String(row.to__ || ''),
              value: typeof row.value === 'string' ? row.value : String(row.value || '0')
            };
            
            await writer.appendRow(record);
            totalRows++;
          } catch (rowError) {
            console.error(`Error processing row: ${rowError.message}`, row);
          }
        }
        
        offset += pageSize;
        
        if (rows.length < pageSize) {
          break;
        }
      } catch (error) {
        console.error('Error fetching transfers:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        // Continue to try the next batch even if this one failed
        offset += pageSize;
      }
    }
    
    // If we didn't process any rows, write a dummy row to avoid Parquet errors
    if (totalRows === 0) {
      console.log('No transfers were processed. Writing a dummy record to avoid Parquet error.');
      await writer.appendRow({
        id: 'dummy',
        blockNumber: BigInt(0),
        transactionHash: '',
        from: '',
        to: '',
        value: '0'
      });
      totalRows = 1;
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} transfer records to ${outputPath}`);
    return totalRows;
  } catch (error) {
    console.error('Error in fetchSentioTransfers:', error);
    return 0;
  }
}

// Fetch and save AccountSnapshot data with proper balance
async function fetchSentioAccounts() {
  const outputPath = path.join(dataDir, 'sentio-case2-accounts.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  try {
    const writer = await parquet.ParquetWriter.openFile(accountSchema, outputPath);
    let offset = 0;
    const pageSize = 5000;
    let totalRows = 0;
    
    console.log('Fetching account data from Sentio...');
    
    // Get the latest snapshot per account with its corresponding points
    // The point_update table contains points calculation for each account
    const sql = `
      WITH LatestSnapshots AS (
        SELECT 
          id as account_id,
          MAX(timestamp) as latest_timestamp
        FROM 
          AccountSnapshot
        GROUP BY 
          id
      ),
      -- Get the latest point update for each account
      LatestPointUpdates AS (
        SELECT
          account,
          points,
          newTimestamp,
          ROW_NUMBER() OVER (PARTITION BY account ORDER BY newTimestamp DESC) as rn
        FROM
          point_update
      )
      SELECT 
        a.id,
        a.lbtcBalance * 100000000 as balance, -- Convert to integer representation
        a.timestamp as timestamp,
        COALESCE(p.points * 100000000, 0) as point -- Convert to integer representation
      FROM 
        AccountSnapshot a
      INNER JOIN 
        LatestSnapshots l ON a.id = l.account_id AND a.timestamp = l.latest_timestamp
      LEFT JOIN
        LatestPointUpdates p ON a.id = p.account AND p.rn = 1
      ORDER BY 
        a.id
    `;
    
    while (true) {
      console.log(`Fetching accounts with offset ${offset}...`);
      
      try {
        const response = await axios.post(
          BASE_URL,
          {
            sqlQuery: {
              sql: `${sql} LIMIT ${pageSize} OFFSET ${offset}`
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'api-key': API_KEY
            },
            timeout: TIMEOUT
          }
        );
        
        // Ensure we handle the response structure correctly
        const rows = response.data.result && response.data.result.rows ? response.data.result.rows : [];
        console.log(`Received ${rows.length} rows`);
        
        if (rows.length === 0) {
          break;
        }
        
        for (const row of rows) {
          try {
            if (!row.id) {
              console.log(`Skipping account with no ID:`, row);
              continue;
            }
            
            // Handle case where point might be null or undefined
            const point = row.point != null ? row.point : '0';
            
            const record = {
              id: typeof row.id === 'string' ? row.id : String(row.id || ''),
              balance: typeof row.balance === 'string' ? row.balance : String(row.balance || '0'),
              timestamp: BigInt(row.timestamp || 0),
              point: typeof point === 'string' ? point : String(point || '0')
            };
            
            await writer.appendRow(record);
            totalRows++;
          } catch (rowError) {
            console.error(`Error processing account row: ${rowError.message}`, row);
          }
        }
        
        offset += pageSize;
        
        if (rows.length < pageSize) {
          break;
        }
      } catch (error) {
        console.error('Error fetching accounts:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        // Continue to try the next batch even if this one failed
        offset += pageSize;
      }
    }
    
    // If no accounts were found or processed, write a dummy record to avoid Parquet errors
    if (totalRows === 0) {
      console.log('No accounts were processed. Writing a dummy record to avoid Parquet error.');
      await writer.appendRow({
        id: 'dummy',
        balance: '0',
        timestamp: BigInt(0),
        point: '0'
      });
      totalRows = 1;
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} account records to ${outputPath}`);
    return totalRows;
  } catch (error) {
    console.error('Error in fetchSentioAccounts:', error);
    return 0;
  }
}

// Add new function to fetch point updates
async function fetchSentioPointUpdates() {
  const outputPath = path.join(dataDir, 'sentio-case2-point-updates.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  try {
    const writer = await parquet.ParquetWriter.openFile(pointUpdateSchema, outputPath);
    let offset = 0;
    const pageSize = 5000;
    let totalRows = 0;
    
    console.log('Fetching point update data from Sentio...');
    
    while (true) {
      console.log(`Fetching point updates with offset ${offset}...`);
      
      try {
        const response = await axios.post(
          BASE_URL,
          {
            sqlQuery: {
              sql: `
                WITH LatestUpdates AS (
                  SELECT 
                    account,
                    block_number,
                    points,
                    newTimestamp,
                    newLbtcBalance,
                    ROW_NUMBER() OVER (PARTITION BY account ORDER BY block_number DESC) as rn
                  FROM point_update
                )
                SELECT 
                  account,
                  block_number,
                  points,
                  newTimestamp,
                  newLbtcBalance
                FROM LatestUpdates
                WHERE rn = 1
                ORDER BY account
                LIMIT ${pageSize} OFFSET ${offset}
              `
            }
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'api-key': API_KEY
            },
            timeout: TIMEOUT
          }
        );
        
        const rows = response.data.result && response.data.result.rows ? response.data.result.rows : [];
        console.log(`Received ${rows.length} rows`);
        
        if (rows.length === 0) {
          break;
        }
        
        for (const row of rows) {
          try {
            const record = {
              account: String(row.account || ''),
              blockNumber: BigInt(row.block_number || 0),
              points: String(row.points || '0'),
              newTimestamp: BigInt(row.newTimestamp || 0),
              newLbtcBalance: String(row.newLbtcBalance || '0')
            };
            
            await writer.appendRow(record);
            totalRows++;
          } catch (rowError) {
            console.error(`Error processing row: ${rowError.message}`, row);
          }
        }
        
        offset += pageSize;
        
        if (rows.length < pageSize) {
          break;
        }
      } catch (error) {
        console.error('Error fetching point updates:', error.message);
        if (error.response) {
          console.error('Response status:', error.response.status);
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
        offset += pageSize;
      }
    }
    
    // If we didn't process any rows, write a dummy row to avoid Parquet errors
    if (totalRows === 0) {
      console.log('No point updates were processed. Writing a dummy record to avoid Parquet error.');
      await writer.appendRow({
        account: 'dummy',
        blockNumber: BigInt(0),
        points: '0',
        newTimestamp: BigInt(0),
        newLbtcBalance: '0'
      });
      totalRows = 1;
    }
    
    await writer.close();
    console.log(`Successfully wrote ${totalRows} point update records to ${outputPath}`);
  } catch (error) {
    console.error('Error in fetchSentioPointUpdates:', error);
  }
}

// Modify main function to include point updates
async function main() {
  if (!await testConnection()) {
    console.error('Failed to connect to Sentio API. Exiting...');
    return;
  }

  try {
    await fetchSentioTransfers();
    await fetchSentioAccounts();
    await fetchSentioPointUpdates();
    console.log('All data fetched and saved successfully!');
  } catch (error) {
    console.error('Error in main:', error);
  }
}

// Run the script
main(); 