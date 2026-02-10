// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

async function testInsert() {
  console.log('Testing manual insert into swap table...');
  
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
    
    // Create a test swap record
    const testSwap = {
      id: 'test-' + Date.now(),
      block_number: 22200001,
      transaction_hash: '0x' + '1'.repeat(64),
      from: '0x' + '2'.repeat(40),
      to: '0x' + '3'.repeat(40),
      amount_in: 1000000000000000000n, // 1 ETH
      amount_out_min: 500000000000000000n, // 0.5 ETH
      deadline: 1745424562802n,
      path: '0x' + '4'.repeat(40) + ',0x' + '5'.repeat(40),
      path_length: 2
    };
    
    // Insert the test swap
    console.log('Inserting test swap record:', testSwap);
    
    const insertQuery = `
      INSERT INTO public.swap (
        id, 
        block_number, 
        transaction_hash, 
        "from", 
        "to", 
        amount_in, 
        amount_out_min, 
        deadline, 
        path, 
        path_length
      ) 
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      )
    `;
    
    const result = await client.query(
      insertQuery,
      [
        testSwap.id,
        testSwap.block_number,
        testSwap.transaction_hash,
        testSwap.from,
        testSwap.to,
        testSwap.amount_in.toString(),
        testSwap.amount_out_min.toString(),
        testSwap.deadline.toString(),
        testSwap.path,
        testSwap.path_length
      ]
    );
    
    console.log('Insert result:', result);
    console.log('Test swap record inserted successfully!');
    
    // Now check that we can query the record back
    const selectQuery = `
      SELECT * FROM public.swap WHERE id = $1
    `;
    
    const selectResult = await client.query(selectQuery, [testSwap.id]);
    console.log('Query result:', selectResult.rows[0]);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

testInsert().catch(console.error); 