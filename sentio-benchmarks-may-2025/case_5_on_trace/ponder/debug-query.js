// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

async function debugQuery() {
  console.log('Debugging queries for UniswapV2Router02.swapExactTokensForTokens events...');
  
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
    
    // Check if there are any matching traces with the correct function signature
    // and going to the correct contract address
    // Note: We need to quote 'to' as it's a reserved keyword in PostgreSQL
    const swapTraceQuery = `
      SELECT COUNT(*) as count 
      FROM ponder_sync.traces 
      WHERE LOWER("to") = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
      AND input LIKE '0x38ed1739%';
    `;
    
    const swapTraceResult = await client.query(swapTraceQuery);
    console.log(`Found ${swapTraceResult.rows[0].count} matching swapExactTokensForTokens traces`);
    
    if (swapTraceResult.rows[0].count > 0) {
      // Get a sample of these traces to analyze them
      const sampleTraceQuery = `
        SELECT * 
        FROM ponder_sync.traces 
        WHERE LOWER("to") = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
        AND input LIKE '0x38ed1739%'
        LIMIT 3;
      `;
      
      const sampleTraceResult = await client.query(sampleTraceQuery);
      
      console.log('Sample traces:');
      for (const trace of sampleTraceResult.rows) {
        console.log(`Block: ${trace.block_number}, From: ${trace.from}, To: ${trace.to}`);
        console.log(`Input: ${trace.input.substring(0, 50)}...`);
        console.log(`Error: ${trace.error || 'None'}`);
        
        // Try to parse the input to extract parameters
        const input = trace.input;
        // Skip the first 10 bytes (0x + 8 bytes method signature)
        const data = input.slice(10);
        
        try {
          // In a real parser we would carefully extract each parameter
          // For now we're just extracting some positions to verify data is there
          console.log(`Data length: ${data.length} characters`);
          console.log(`Data: ${data.substring(0, 100)}...`);
          console.log('');
        } catch (error) {
          console.log(`Error parsing input: ${error.message}`);
        }
      }
      
      // Check if transactions are being indexed
      const transactionsQuery = `
        SELECT COUNT(*) as count 
        FROM ponder_sync.transactions;
      `;
      
      const transactionsResult = await client.query(transactionsQuery);
      console.log(`Found ${transactionsResult.rows[0].count} transactions in sync data`);
      
      // Check if transactions match with the traces
      const matchingTransactionsQuery = `
        SELECT COUNT(*) as count 
        FROM ponder_sync.traces t
        JOIN ponder_sync.transactions tx
        ON t.block_number = tx.block_number AND t.transaction_index = tx.transaction_index
        WHERE LOWER(t."to") = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d'
        AND t.input LIKE '0x38ed1739%';
      `;
      
      try {
        const matchingTransactionsResult = await client.query(matchingTransactionsQuery);
        console.log(`Found ${matchingTransactionsResult.rows[0].count} matching transactions for the traces`);
      } catch (error) {
        console.log(`Error querying matching transactions: ${error.message}`);
      }
    }
    
    // Check Ponder's indexing strategy and configuration from metadata
    const ponderMetaQuery = `
      SELECT * FROM public._ponder_meta;
    `;
    
    const ponderMetaResult = await client.query(ponderMetaQuery);
    console.log('Ponder metadata:');
    for (const row of ponderMetaResult.rows) {
      console.log(`${row.key}: ${JSON.stringify(row.value)}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

debugQuery().catch(console.error); 