const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');
const hypersyncClient = require('hypersync-client');

// Output directory setup
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// HyperSync configuration
const HYPERSYNC_URL = 'https://fuel.hypersync.xyz'; // Use the Fuel HyperSync endpoint

// Initialize HyperSync client
const client = hypersyncClient.HypersyncClient.new({
  url: HYPERSYNC_URL,
  httpReqTimeoutMillis: 180000 // 3 minute timeout
});

// Schema definitions - same as the current implementation
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
  timestamp: { type: 'INT64' },
  point: { type: 'UTF8' } // Add point field
});

const snapshotSchema = new parquet.ParquetSchema({
  id: { type: 'UTF8' },
  accountId: { type: 'UTF8' },
  balance: { type: 'UTF8' }, // Using UTF8 for large numbers
  timestampMilli: { type: 'INT64' },
  point: { type: 'UTF8' } // Add point field
});

// Define HyperSync queries
// Transfer query - filters for the Transfer event
const transferQuery = {
  fromBlock: 0, // Start from the beginning of the chain
  logs: [
    {
      address: [], // Empty to match all addresses
      topics: [
        ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'] // Transfer event signature (keccak256("Transfer(address,address,uint256)"))
      ]
    }
  ],
  field_selection: {
    block: ['number', 'hash', 'timestamp'],
    transaction: ['hash'],
    log: ['address', 'data', 'topic0', 'topic1', 'topic2', 'topic3', 'log_index', 'transaction_index']
  }
};

// Function to fetch and save transfer data using HyperSync
async function fetchHypersyncTransfers() {
  const outputPath = path.join(dataDir, 'hypersync-case2-transfers.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  try {
    const writer = await parquet.ParquetWriter.openFile(transferSchema, outputPath);
    let totalRows = 0;
    
    console.log('Fetching transfer data from HyperSync...');
    
    // Use sendReq to get transfer data
    const transfersResponse = await client.sendReq(transferQuery);
    
    console.log(`Received ${transfersResponse.data.logs.length} transfer logs`);
    
    // Process transfer logs
    for (let i = 0; i < transfersResponse.data.logs.length; i++) {
      const log = transfersResponse.data.logs[i];
      const transaction = transfersResponse.data.transactions.find(tx => 
        tx.hash === log.transaction_hash
      );
      const block = transfersResponse.data.blocks.find(b => 
        b.hash === (transaction?.block_hash || log.block_hash)
      );
      
      if (!block) {
        console.warn(`Skipping transfer log with missing block: ${log.transaction_hash}`);
        continue;
      }
      
      // Extract transfer details from the log
      const from = '0x' + log.topic1.slice(26); // Remove padding and add 0x prefix
      const to = '0x' + log.topic2.slice(26); // Remove padding and add 0x prefix
      const value = BigInt('0x' + log.data.slice(2)).toString(); // Convert hex to decimal string
      
      const id = `${log.transaction_hash}-${log.log_index}`;
      
      const record = {
        id,
        blockNumber: BigInt(block.number),
        transactionHash: log.transaction_hash,
        from,
        to,
        value
      };
      
      await writer.appendRow(record);
      totalRows++;
      
      // Log progress
      if (totalRows % 1000 === 0) {
        console.log(`Processed ${totalRows} transfers...`);
      }
    }
    
    // Write a dummy record if no transfers were processed to avoid Parquet errors
    if (totalRows === 0) {
      console.log('No transfers were processed. Writing a dummy record to avoid Parquet error.');
      await writer.appendRow({
        id: 'dummy',
        blockNumber: BigInt(0),
        transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        from: '0x0000000000000000000000000000000000000000',
        to: '0x0000000000000000000000000000000000000000',
        value: '0'
      });
      totalRows = 1;
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} transfer records to ${outputPath}`);
    return totalRows;
  } catch (error) {
    console.error('Error in fetchHypersyncTransfers:', error);
    return 0;
  }
}

// Function to get all accounts by analyzing transfers
async function fetchHypersyncAccounts() {
  const outputPath = path.join(dataDir, 'hypersync-case2-accounts.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }

  try {
    // First, fetch all snapshots
    await fetchHypersyncSnapshots();
    
    // Use the AccountDB from the snapshot data
    const accountBalanceMap = new Map();
    
    // Read the snapshots file we just created
    const snapshotReader = await parquet.ParquetReader.openFile(path.join(dataDir, 'hypersync-case2-snapshots.parquet'));
    const snapshotCursor = snapshotReader.getCursor();
    
    let snapshot;
    while ((snapshot = await snapshotCursor.next())) {
      const accountId = snapshot.accountId;
      
      if (!accountBalanceMap.has(accountId) || 
          BigInt(snapshot.timestampMilli) > BigInt(accountBalanceMap.get(accountId).timestamp)) {
        accountBalanceMap.set(accountId, {
          balance: snapshot.balance,
          timestamp: snapshot.timestampMilli,
          point: snapshot.point
        });
      }
    }
    
    snapshotReader.close();
    
    console.log(`Built balance map for ${accountBalanceMap.size} accounts`);
    
    // Create the accounts parquet file from the account balance map
    const writer = await parquet.ParquetWriter.openFile(accountSchema, outputPath);
    let totalRows = 0;
    
    for (const [accountId, data] of accountBalanceMap.entries()) {
      const record = {
        id: accountId,
        balance: data.balance,
        timestamp: BigInt(data.timestamp),
        point: data.point
      };
      
      await writer.appendRow(record);
      totalRows++;
    }
    
    // Write a dummy record if no accounts were processed to avoid Parquet errors
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
    console.error('Error in fetchHypersyncAccounts:', error);
    return 0;
  }
}

// Function to generate snapshots from transfer data
async function fetchHypersyncSnapshots() {
  const outputPath = path.join(dataDir, 'hypersync-case2-snapshots.parquet');
  
  // Remove existing file if it exists
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath);
    console.log(`Removed existing file: ${outputPath}`);
  }
  
  try {
    const writer = await parquet.ParquetWriter.openFile(snapshotSchema, outputPath);
    let totalRows = 0;
    
    console.log('Generating snapshots from HyperSync transfer data...');
    
    // Use sendReq to get transfer data for building snapshots
    const transfersResponse = await client.sendReq(transferQuery);
    
    // Build a map of account balances and their changes over time
    const accountBalances = new Map();
    
    // Process transfer logs to build account balances
    for (let i = 0; i < transfersResponse.data.logs.length; i++) {
      const log = transfersResponse.data.logs[i];
      const from = '0x' + log.topic1.slice(26);
      const to = '0x' + log.topic2.slice(26);
      const value = BigInt('0x' + log.data.slice(2)).toString();
      
      const block = transfersResponse.data.blocks.find(b => 
        b.hash === log.block_hash || b.hash === transfersResponse.data.transactions.find(tx => 
          tx.hash === log.transaction_hash
        )?.block_hash
      );
      
      if (!block) continue;
      
      const timestamp = BigInt(block.timestamp || 0);
      
      // Update sender balance
      if (!accountBalances.has(from)) {
        accountBalances.set(from, []);
      }
      accountBalances.get(from).push({
        timestamp,
        change: '-' + value,
        blockNumber: block.number
      });
      
      // Update receiver balance
      if (!accountBalances.has(to)) {
        accountBalances.set(to, []);
      }
      accountBalances.get(to).push({
        timestamp,
        change: value,
        blockNumber: block.number
      });
    }
    
    // Process the account balance changes to create snapshots
    for (const [accountId, balanceChanges] of accountBalances.entries()) {
      // Sort balance changes by timestamp
      balanceChanges.sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return Number(a.timestamp - b.timestamp);
        }
        return Number(a.blockNumber - b.blockNumber);
      });
      
      let balance = BigInt(0);
      
      for (const change of balanceChanges) {
        if (change.change.startsWith('-')) {
          balance -= BigInt(change.change.substring(1));
        } else {
          balance += BigInt(change.change);
        }
        
        const snapshotId = `${accountId}-${change.timestamp}`;
        const record = {
          id: snapshotId,
          accountId: accountId,
          balance: balance.toString(),
          timestampMilli: BigInt(change.timestamp),
          point: calculatePoint(balance.toString()) // Calculate point based on balance
        };
        
        await writer.appendRow(record);
        totalRows++;
      }
    }
    
    // Write a dummy record if no snapshots were processed to avoid Parquet errors
    if (totalRows === 0) {
      console.log('No snapshots were processed. Writing a dummy record to avoid Parquet error.');
      await writer.appendRow({
        id: 'dummy',
        accountId: 'dummy',
        balance: '0',
        timestampMilli: BigInt(0),
        point: '0'
      });
      totalRows = 1;
    }
    
    await writer.close();
    console.log(`Saved ${totalRows} snapshot records to ${outputPath}`);
    return totalRows;
  } catch (error) {
    console.error('Error in fetchHypersyncSnapshots:', error);
    return 0;
  }
}

// Helper function to calculate points based on balance
function calculatePoint(balance) {
  // Simple formula for demonstration: point = sqrt(balance / 10^8)
  try {
    const balanceNum = Number(balance) / 100000000;
    if (balanceNum <= 0) return '0';
    
    const pointValue = Math.sqrt(balanceNum).toString();
    return pointValue;
  } catch (error) {
    console.warn(`Warning: Could not calculate point value for balance: ${balance}`);
    return '0';
  }
}

// Test connection before starting
async function testConnection() {
  console.log(`Testing connection to HyperSync endpoint: ${HYPERSYNC_URL}`);
  try {
    // Get the archive height to test connection
    const height = await client.getHeight();
    console.log('Connection test successful!');
    console.log(`Archive height: ${height}`);
    return true;
  } catch (error) {
    console.error('Connection test failed:', error.message);
    return false;
  }
}

// Main function
async function main() {
  try {
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      console.error('Could not connect to HyperSync API. Exiting.');
      return;
    }
    
    console.log('Starting HyperSync data fetch...');
    
    // Fetch transfers first
    const transfersCount = await fetchHypersyncTransfers();
    console.log(`Completed fetching ${transfersCount} transfers.`);
    
    // Fetch accounts (which depends on snapshots)
    const accountsCount = await fetchHypersyncAccounts();
    console.log(`Completed fetching ${accountsCount} accounts.`);
    
    console.log('HyperSync data fetching complete!');
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

// Run the script
main(); 