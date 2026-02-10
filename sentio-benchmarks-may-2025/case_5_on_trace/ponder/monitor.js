// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function monitorPonder() {
  console.log('Monitoring Ponder progress...');
  
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
    
    // Check if the schema exists
    const schemaQuery = `
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name = 'public';
    `;
    
    const schemaResult = await client.query(schemaQuery);
    if (schemaResult.rows.length === 0) {
      console.log('Public schema not found.');
      return;
    }
    
    // Check if swap table exists
    const tableQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename = 'swap';
    `;
    
    const tableResult = await client.query(tableQuery);
    if (tableResult.rows.length === 0) {
      console.log('Swap table not found.');
      return;
    }
    
    // Check how many swaps have been recorded
    const swapCountQuery = `
      SELECT COUNT(*) as count 
      FROM public.swap;
    `;
    
    const swapCountResult = await client.query(swapCountQuery);
    const swapCount = swapCountResult.rows[0].count;
    console.log(`Total swaps recorded: ${swapCount}`);
    
    if (swapCount > 0) {
      // Get the latest swaps
      const latestSwapsQuery = `
        SELECT * 
        FROM public.swap 
        ORDER BY "blockNumber" DESC 
        LIMIT 5;
      `;
      
      const latestSwapsResult = await client.query(latestSwapsQuery);
      console.log('Latest swaps:');
      latestSwapsResult.rows.forEach(swap => {
        console.log(`  Block: ${swap.blockNumber}, TX: ${swap.transactionHash}`);
      });
    }
    
    // Check data directory for Parquet files
    const dataDir = path.join(__dirname, '..', 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir);
      let ponderFiles = [];
      
      for (const file of files) {
        if (file.startsWith('swaps_') && file.endsWith('.parquet')) {
          const filePath = path.join(dataDir, file);
          const stats = fs.statSync(filePath);
          ponderFiles.push({
            name: file,
            size: stats.size,
            created: stats.birthtime
          });
        }
      }
      
      if (ponderFiles.length > 0) {
        console.log('Parquet files created by Ponder:');
        ponderFiles.forEach(file => {
          console.log(`  ${file.name} (${(file.size / 1024).toFixed(2)} KB) - Created: ${file.created}`);
        });
      } else {
        console.log('No Parquet files created by Ponder yet.');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
}

monitorPonder().catch(console.error); 