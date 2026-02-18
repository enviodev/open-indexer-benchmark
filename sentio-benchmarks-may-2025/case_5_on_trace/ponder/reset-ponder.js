// Import pg as CommonJS module
import pkg from 'pg';
const { Client } = pkg;

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetPonder() {
  console.log('Resetting Ponder database and cache...');
  
  // 1. Connect to PostgreSQL with the correct password from .env.local
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
    
    // 2. Drop Ponder-related tables
    console.log('Dropping Ponder tables...');
    
    // Drop all tables in the public schema
    const dropTablesQuery = `
      DO $$ 
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `;
    
    await client.query(dropTablesQuery);
    console.log('Tables dropped successfully');
    
    // 3. Remove any Ponder-related schemas
    console.log('Dropping Ponder schemas...');
    
    const dropSchemasQuery = `
      DO $$ 
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT schema_name FROM information_schema.schemata 
                  WHERE schema_name LIKE 'ponder%' OR schema_name LIKE '%_ponder%') LOOP
          EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE';
        END LOOP;
      END $$;
    `;
    
    await client.query(dropSchemasQuery);
    console.log('Schemas dropped successfully');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('Disconnected from PostgreSQL');
  }
  
  // 4. Remove .ponder directory
  try {
    const ponderDir = path.join(__dirname, '.ponder');
    if (fs.existsSync(ponderDir)) {
      fs.removeSync(ponderDir);
      console.log('.ponder directory removed');
    } else {
      console.log('.ponder directory not found, skipping');
    }
  } catch (error) {
    console.error('Error removing .ponder directory:', error);
  }
  
  // 5. Remove data files
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    const files = fs.readdirSync(dataDir);
    let removed = 0;
    
    for (const file of files) {
      if (file.startsWith('swaps_') && file.endsWith('.parquet')) {
        fs.removeSync(path.join(dataDir, file));
        removed++;
      }
    }
    
    console.log(`Removed ${removed} Parquet files from data directory`);
  } catch (error) {
    console.error('Error removing data files:', error);
  }
  
  console.log('Ponder reset complete. You can now start Ponder with a clean slate.');
}

resetPonder().catch(console.error); 