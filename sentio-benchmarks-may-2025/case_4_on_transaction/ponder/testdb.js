import pkg from 'pg';
const { Client } = pkg;

async function testConnection() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'ponder',
    user: 'ponder',
    password: 'ponder'
  });

  try {
    console.log('Connecting to PostgreSQL...');
    await client.connect();
    console.log('Connection successful!');

    const result = await client.query('SELECT NOW() as time');
    console.log('Current time:', result.rows[0].time);

    await client.end();
    console.log('Connection closed');
  } catch (err) {
    console.error('Error connecting to database:', err);
  }
}

testConnection(); 