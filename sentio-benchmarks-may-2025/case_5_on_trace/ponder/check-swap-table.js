import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

async function checkSwapTable() {
  try {
    console.log('Opening SQLite database...');
    const dbPath = path.join(process.cwd(), 'data', 'ponder.db');
    console.log(`Database path: ${dbPath}`);
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    console.log('Connected to SQLite database');
    
    // Check if the swap table exists
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables in database:', tables.map(row => row.name).join(', '));
    
    // Check if there are any records in the swap table
    if (tables.some(row => row.name === 'swap')) {
      const countResult = await db.get('SELECT COUNT(*) as count FROM swap');
      console.log(`Number of records in swap table: ${countResult.count}`);
      
      if (parseInt(countResult.count) > 0) {
        const sampleRows = await db.all('SELECT * FROM swap LIMIT 3');
        console.log('Sample records:');
        console.log(sampleRows);
      }
    } else {
      console.log('Swap table does not exist yet');
    }
    
    await db.close();
    console.log('Disconnected from SQLite database');
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSwapTable(); 