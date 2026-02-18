// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

async function checkTraces() {
  console.log('Checking traces for swapExactTokensForTokens...');
  
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
    
    // The method signature for swapExactTokensForTokens is '0x38ed1739'
    // Checking if we have any traces with this method signature
    const swapSigQuery = `
      SELECT COUNT(*) as count 
      FROM ponder_sync.traces 
      WHERE input LIKE '0x38ed1739%';
    `;
    
    const swapSigResult = await client.query(swapSigQuery);
    const swapSigCount = swapSigResult.rows[0].count;
    console.log(`Found ${swapSigCount} traces with swapExactTokensForTokens signature`);
    
    if (swapSigCount > 0) {
      // Get some examples of these traces
      const tracesQuery = `
        SELECT * 
        FROM ponder_sync.traces 
        WHERE input LIKE '0x38ed1739%' 
        LIMIT 5;
      `;
      
      const tracesResult = await client.query(tracesQuery);
      
      console.log('Example swapExactTokensForTokens traces:');
      for (const trace of tracesResult.rows) {
        console.log(`Block: ${trace.block_number}, From: ${trace.from}, To: ${trace.to}`);
        console.log(`Input length: ${trace.input.length} characters`);
        console.log(`Input prefix: ${trace.input.substring(0, 50)}...`);
        console.log(`Error: ${trace.error || 'None'}`);
        console.log('');
      }
    } else {
      // If no swapExactTokensForTokens found, check what traces we do have
      const uniqueInputPrefixesQuery = `
        SELECT SUBSTRING(input, 1, 10) as method_sig, COUNT(*) as count 
        FROM ponder_sync.traces 
        WHERE input IS NOT NULL AND LENGTH(input) >= 10
        GROUP BY method_sig 
        ORDER BY count DESC 
        LIMIT 10;
      `;
      
      const uniqueInputPrefixesResult = await client.query(uniqueInputPrefixesQuery);
      
      console.log('Top 10 method signatures in traces:');
      for (const row of uniqueInputPrefixesResult.rows) {
        console.log(`${row.method_sig}: ${row.count} occurrences`);
      }
      
      // Check for the UniswapV2Router02 address
      const uniswapAddressQuery = `
        SELECT COUNT(*) as count 
        FROM ponder_sync.traces 
        WHERE LOWER(to) = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';
      `;
      
      const uniswapAddressResult = await client.query(uniswapAddressQuery);
      console.log(`Found ${uniswapAddressResult.rows[0].count} traces to UniswapV2Router02 address`);
      
      if (uniswapAddressResult.rows[0].count > 0) {
        // Check what method signatures are being called on the router
        const routerSigsQuery = `
          SELECT SUBSTRING(input, 1, 10) as method_sig, COUNT(*) as count 
          FROM ponder_sync.traces 
          WHERE LOWER(to) = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
          AND input IS NOT NULL AND LENGTH(input) >= 10
          GROUP BY method_sig 
          ORDER BY count DESC 
          LIMIT 10;
        `;
        
        const routerSigsResult = await client.query(routerSigsQuery);
        
        console.log('Method signatures being called on UniswapV2Router02:');
        for (const row of routerSigsResult.rows) {
          console.log(`${row.method_sig}: ${row.count} occurrences`);
        }
        
        // Get block range we've synced
        const blockRangeQuery = `
          SELECT MIN(block_number) as min_block, MAX(block_number) as max_block 
          FROM ponder_sync.traces;
        `;
        
        const blockRangeResult = await client.query(blockRangeQuery);
        if (blockRangeResult.rows.length > 0) {
          const { min_block, max_block } = blockRangeResult.rows[0];
          console.log(`Block range synced: ${min_block} to ${max_block}`);
          
          // Calculate progress
          const startBlock = 22200000;
          const endBlock = 22290000;
          const totalBlocks = endBlock - startBlock;
          const syncedBlocks = max_block - startBlock;
          const progress = (syncedBlocks / totalBlocks) * 100;
          
          console.log(`Sync progress: ${progress.toFixed(2)}%`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

checkTraces().catch(console.error); 