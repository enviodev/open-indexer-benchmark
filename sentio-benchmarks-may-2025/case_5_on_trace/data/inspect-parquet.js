const fs = require('fs');
const parquet = require('parquetjs');
const path = require('path');

async function inspectParquetFile(filePath) {
  console.log(`\nInspecting file: ${path.basename(filePath)}`);
  try {
    // Read the Parquet file
    const reader = await parquet.ParquetReader.openFile(filePath);
    
    // Get schema
    const schema = reader.metadata.schema;
    console.log('Schema fields:', Object.keys(schema.fields).join(', '));
    
    // Read the first 5 records to examine the data
    const cursor = reader.getCursor();
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const record = await cursor.next();
      if (record === null) break;
      samples.push(record);
    }
    
    // Display samples
    console.log('Sample records (first 5):');
    samples.forEach((record, i) => {
      console.log(`\nRecord #${i + 1}:`);
      Object.entries(record).forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    });
    
    // Read all records to count unique senders and other statistics
    console.log('\nAnalyzing all records for sender addresses...');
    
    const uniqueSenders = new Set();
    const senderCounts = new Map();
    let totalCount = 0;
    let noSenderCount = 0;
    
    // Reset cursor to read from the beginning
    await cursor.reset();
    
    let record;
    while ((record = await cursor.next()) !== null) {
      totalCount++;
      
      // Check all possible field names for the sender address
      const sender = record.from || record.from_address || record.sender || record.senderAddress || '';
      
      if (!sender || sender === '0x' || sender === '') {
        noSenderCount++;
        continue;
      }
      
      const normalizedSender = sender.toLowerCase().trim();
      uniqueSenders.add(normalizedSender);
      
      // Count occurrences of each sender
      senderCounts.set(normalizedSender, (senderCounts.get(normalizedSender) || 0) + 1);
    }
    
    // Display sender statistics
    console.log(`Total records: ${totalCount}`);
    console.log(`Records with no sender: ${noSenderCount}`);
    console.log(`Unique senders: ${uniqueSenders.size}`);
    
    // Show top 10 most common senders
    console.log('\nTop 10 most common senders:');
    const topSenders = Array.from(senderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    topSenders.forEach(([sender, count], i) => {
      console.log(`  ${i + 1}. ${sender}: ${count} records (${(count/totalCount*100).toFixed(2)}%)`);
    });
    
    await reader.close();
    
    return {
      uniqueSenders: Array.from(uniqueSenders),
      senderCounts,
      totalCount,
      noSenderCount
    };
    
  } catch (error) {
    console.error(`Error inspecting ${filePath}:`, error);
    return null;
  }
}

async function compareUniqueAddresses() {
  const files = [
    'sentio-case5-swaps.parquet',
    'subsquid-case5-swaps.parquet',
    'envio-case5-swaps.parquet',
    'subgraph-case5-swaps.parquet'
  ];
  
  const results = {};
  
  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.log(`File not found: ${file}`);
      continue;
    }
    
    const platformName = file.split('-')[0];
    results[platformName] = await inspectParquetFile(filePath);
  }
  
  // Find senders unique to Sentio compared to other platforms
  if (results.sentio && results.sentio.uniqueSenders) {
    const sentioUniqueSenders = new Set(results.sentio.uniqueSenders);
    
    // For each other platform, find senders in Sentio but not in that platform
    for (const [platform, data] of Object.entries(results)) {
      if (platform === 'sentio' || !data || !data.uniqueSenders) continue;
      
      const platformSenders = new Set(data.uniqueSenders);
      const uniqueToSentio = new Set(
        [...sentioUniqueSenders].filter(sender => !platformSenders.has(sender))
      );
      
      console.log(`\nSenders in Sentio but not in ${platform}: ${uniqueToSentio.size}`);
      
      // Display first 10 examples with their occurrence counts in Sentio
      console.log(`Examples of senders unique to Sentio compared to ${platform}:`);
      let count = 0;
      for (const sender of uniqueToSentio) {
        if (count >= 10) break;
        const occurrences = results.sentio.senderCounts.get(sender) || 0;
        console.log(`  ${sender}: ${occurrences} records in Sentio`);
        count++;
      }
    }
  }
}

// Run the comparison
compareUniqueAddresses().catch(err => {
  console.error('Error comparing unique addresses:', err);
}); 