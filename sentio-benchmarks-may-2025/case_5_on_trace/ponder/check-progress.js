// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

async function checkSyncProgress() {
  console.log('Checking Ponder sync progress...');
  
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
    
    // Check if ponder_sync tables exist
    const tableQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename LIKE 'ponder_sync%';
    `;
    
    const tableResult = await client.query(tableQuery);
    if (tableResult.rows.length === 0) {
      console.log('No ponder_sync tables found. Sync may not have started yet.');
      return;
    }
    
    console.log('Found ponder_sync tables:');
    for (const row of tableResult.rows) {
      console.log(`- ${row.tablename}`);
    }
    
    // Try to find the blocks table which contains sync progress
    const blocksQuery = `
      SELECT * 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'ponder_sync_blocks';
    `;
    
    const blocksResult = await client.query(blocksQuery);
    if (blocksResult.rows.length > 0) {
      // Query the latest blocks
      const latestBlocksQuery = `
        SELECT * 
        FROM ponder_sync_blocks 
        ORDER BY "height" DESC 
        LIMIT 1;
      `;
      
      try {
        const latestBlocksResult = await client.query(latestBlocksQuery);
        if (latestBlocksResult.rows.length > 0) {
          const latestBlock = latestBlocksResult.rows[0];
          console.log(`Latest synced block: ${latestBlock.height}`);
          
          // Calculate progress percentage
          const startBlock = 22200000;
          const endBlock = 22290000;
          const totalBlocks = endBlock - startBlock;
          const syncedBlocks = latestBlock.height - startBlock;
          const progress = (syncedBlocks / totalBlocks) * 100;
          
          console.log(`Sync progress: ${progress.toFixed(2)}%`);
        } else {
          console.log('No blocks found in ponder_sync_blocks table.');
        }
      } catch (error) {
        console.error('Error querying ponder_sync_blocks:', error.message);
      }
    } else {
      console.log('ponder_sync_blocks table not found.');
      
      // Try looking for other tables with block info
      const checkPonderTables = `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' 
        AND table_name LIKE 'ponder%'
        AND table_name LIKE '%block%';
      `;
      
      const ponderTablesResult = await client.query(checkPonderTables);
      if (ponderTablesResult.rows.length > 0) {
        console.log('Found other potential block-related tables:');
        for (const row of ponderTablesResult.rows) {
          console.log(`- ${row.table_name}`);
        }
      }
    }
    
    // Check checkpoint table if it exists
    const checkpointQuery = `
      SELECT * 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'ponder_sync_checkpoint';
    `;
    
    const checkpointResult = await client.query(checkpointQuery);
    if (checkpointResult.rows.length > 0) {
      // Query the checkpoint
      const getCheckpointQuery = `
        SELECT * 
        FROM ponder_sync_checkpoint;
      `;
      
      try {
        const getCheckpointResult = await client.query(getCheckpointQuery);
        if (getCheckpointResult.rows.length > 0) {
          console.log('Checkpoint data:');
          console.log(getCheckpointResult.rows[0]);
        } else {
          console.log('No data found in ponder_sync_checkpoint table.');
        }
      } catch (error) {
        console.error('Error querying ponder_sync_checkpoint:', error.message);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

checkSyncProgress().catch(console.error); 