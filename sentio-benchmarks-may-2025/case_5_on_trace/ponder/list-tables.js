// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

async function listTables() {
  console.log('Listing all tables in PostgreSQL...');
  
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
    
    // List all tables in public schema
    const tablesQuery = `
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const tablesResult = await client.query(tablesQuery);
    
    if (tablesResult.rows.length === 0) {
      console.log('No tables found in public schema.');
    } else {
      console.log(`Found ${tablesResult.rows.length} tables in public schema:`);
      
      for (const table of tablesResult.rows) {
        console.log(`- ${table.table_name}`);
        
        // Get column info for the table
        const columnsQuery = `
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
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
          FROM ${table.table_name};
        `;
        
        try {
          const countResult = await client.query(countQuery);
          console.log(`  Row count: ${countResult.rows[0].count}`);
        } catch (error) {
          console.log(`  Error getting row count: ${error.message}`);
        }
        
        console.log('');
      }
    }
    
    // Check for non-public schemas
    const schemasQuery = `
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name != 'public'
      AND schema_name NOT LIKE 'pg_%'
      AND schema_name NOT LIKE 'information_schema';
    `;
    
    const schemasResult = await client.query(schemasQuery);
    
    if (schemasResult.rows.length > 0) {
      console.log('Found non-public schemas:');
      for (const schema of schemasResult.rows) {
        console.log(`- ${schema.schema_name}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

listTables().catch(console.error); 