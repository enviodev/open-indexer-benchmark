// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

async function checkSyncSchema() {
  console.log('Checking ponder_sync schema tables...');
  
  // Connect to PostgreSQL
  const client = new Client({
    host: 'localhost',
    port: 5433,
    user: 'postgres',
    password: 'postgres_password',
    database: 'postgres'
  });
  
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');
    
    // Check if ponder_sync schema exists
    const schemaQuery = `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'ponder_sync';
    `;
    
    const schemaResult = await client.query(schemaQuery);
    if (schemaResult.rows.length === 0) {
      console.log('ponder_sync schema not found.');
      return;
    }
    
    // List all tables in ponder_sync schema
    const tablesQuery = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'ponder_sync'
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    
    if (tablesResult.rows.length === 0) {
      console.log('No tables found in ponder_sync schema.');
    } else {
      console.log(`Found ${tablesResult.rows.length} tables in ponder_sync schema:`);
      
      for (const table of tablesResult.rows) {
        console.log(`- ${table.table_name}`);
        
        // Get column info for the table
        const columnsQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'ponder_sync'
          AND table_name = $1
          ORDER BY ordinal_position;
        `;
        
        const columnsResult = await client.query(columnsQuery, [table.table_name]);
        
        if (columnsResult.rows.length > 0) {
          console.log(`  Columns:`);
          for (const column of columnsResult.rows) {
            console.log(`  - ${column.column_name} (${column.data_type})`);
          }
        }
        
        // Get row count for table
        const countQuery = `
          SELECT COUNT(*) as count
          FROM ponder_sync.${table.table_name};
        `;
        
        try {
          const countResult = await client.query(countQuery);
          console.log(`  Row count: ${countResult.rows[0].count}`);
          
          // If it's the blocks table, get the latest block
          if (table.table_name === 'blocks') {
            const latestBlockQuery = `
              SELECT * FROM ponder_sync.blocks 
              ORDER BY height DESC 
              LIMIT 1;
            `;
            
            const latestBlockResult = await client.query(latestBlockQuery);
            if (latestBlockResult.rows.length > 0) {
              const latestBlock = latestBlockResult.rows[0];
              console.log(`  Latest block synced: ${latestBlock.height}`);
              
              // Calculate progress
              const startBlock = 22200000;
              const endBlock = 22290000;
              const totalBlocks = endBlock - startBlock;
              const syncedBlocks = latestBlock.height - startBlock;
              const progress = (syncedBlocks / totalBlocks) * 100;
              
              console.log(`  Sync progress: ${progress.toFixed(2)}%`);
            }
          }
        } catch (error) {
          console.log(`  Error getting row count: ${error.message}`);
        }
        
        console.log('');
      }
    }
    
    // Check metadata table in _ponder_meta
    try {
      const metaQuery = `
        SELECT * FROM public._ponder_meta;
      `;
      
      const metaResult = await client.query(metaQuery);
      if (metaResult.rows.length > 0) {
        console.log('_ponder_meta data:');
        for (const row of metaResult.rows) {
          console.log(`  ${row.key}: ${JSON.stringify(row.value)}`);
        }
      }
    } catch (error) {
      console.error('Error querying _ponder_meta:', error.message);
    }
    
    // Check status table in _ponder_status
    try {
      const statusQuery = `
        SELECT * FROM public._ponder_status;
      `;
      
      const statusResult = await client.query(statusQuery);
      if (statusResult.rows.length > 0) {
        console.log('_ponder_status data:');
        for (const row of statusResult.rows) {
          console.log(`  Network: ${row.network_name}, Block: ${row.block_number}, Ready: ${row.ready}`);
        }
      }
    } catch (error) {
      console.error('Error querying _ponder_status:', error.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

checkSyncSchema().catch(console.error); 