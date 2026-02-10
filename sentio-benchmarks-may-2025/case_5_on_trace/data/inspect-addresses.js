const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');

// Configuration
const DATA_DIR = __dirname;

// The platforms to compare
const PLATFORM_FILES = {
  'sentio': 'sentio-case5-swaps.parquet',
  'subsquid': 'subsquid-case5-swaps.parquet',
  'envio': 'envio-case5-swaps.parquet',
  'subgraph': 'subgraph-case5-swaps.parquet'
};

/**
 * Load data from a Parquet file
 */
async function loadParquetData(platform, filePath) {
  try {
    console.log(`Loading ${platform} data from ${filePath}...`);
    
    if (!fs.existsSync(filePath)) {
      console.warn(`${filePath} not found`);
      return { 
        count: 0,
        loadSuccess: false, 
        error: 'File not found',
        data: []
      };
    }
    
    // Read the Parquet file
    const reader = await parquet.ParquetReader.openFile(filePath);
    
    // Get row count and data
    let rowCount = 0;
    const data = [];
    
    try {
      // Use cursor to read all rows and count them
      const cursor = reader.getCursor();
      let row;
      while ((row = await cursor.next()) !== null) {
        data.push(row);
        rowCount++;
      }
    } catch (e) {
      console.error(`Error reading rows from ${platform}: ${e.message}`);
    }
    
    console.log(`Successfully loaded ${platform} with ${rowCount} rows`);
    
    await reader.close();
    
    return {
      count: rowCount,
      loadSuccess: true,
      error: null,
      data: data
    };
  } catch (error) {
    console.error(`Error loading ${platform} data:`, error.message);
    return { 
      count: 0,
      loadSuccess: false, 
      error: error.message,
      data: []
    };
  }
}

async function analyzeAddressDistribution() {
  console.log('Analyzing sender addresses across different platforms...');
  
  // Load data from each platform
  const platformData = {};
  
  for (const [platform, fileName] of Object.entries(PLATFORM_FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    platformData[platform] = await loadParquetData(platform, filePath);
  }
  
  // Extract sender addresses from each platform
  const platformSenders = {};
  
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.log(`No data available for ${platform}`);
      platformSenders[platform] = {
        uniqueSenders: new Set(),
        senderAddressField: null,
        senderCounts: new Map()
      };
      continue;
    }
    
    console.log(`\nAnalyzing ${platform} sender addresses...`);
    
    // Determine the field name used for sender address
    const firstRecord = data.data[0];
    let senderAddressField = null;
    
    if (firstRecord.from !== undefined) senderAddressField = 'from';
    else if (firstRecord.from_address !== undefined) senderAddressField = 'from_address';
    else if (firstRecord.sender !== undefined) senderAddressField = 'sender';
    else if (firstRecord.senderAddress !== undefined) senderAddressField = 'senderAddress';
    
    console.log(`Identified sender field for ${platform}: ${senderAddressField || 'UNKNOWN'}`);
    
    // Extract and count unique senders
    const uniqueSenders = new Set();
    const senderCounts = new Map();
    let totalValidSenders = 0;
    let missingSenders = 0;
    
    for (const record of data.data) {
      const sender = record[senderAddressField];
      
      if (!sender || sender === '0x' || sender === '') {
        missingSenders++;
        continue;
      }
      
      const normalizedSender = sender.toLowerCase().trim();
      uniqueSenders.add(normalizedSender);
      senderCounts.set(normalizedSender, (senderCounts.get(normalizedSender) || 0) + 1);
      totalValidSenders++;
    }
    
    console.log(`Total records: ${data.data.length}`);
    console.log(`Records with valid sender: ${totalValidSenders}`);
    console.log(`Records with missing sender: ${missingSenders}`);
    console.log(`Unique senders: ${uniqueSenders.size}`);
    
    // Show top 10 most common senders
    console.log('\nTop 10 most common senders:');
    const topSenders = Array.from(senderCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    topSenders.forEach(([sender, count], i) => {
      console.log(`  ${i + 1}. ${sender}: ${count} records (${(count/totalValidSenders*100).toFixed(2)}%)`);
    });
    
    platformSenders[platform] = {
      uniqueSenders,
      senderAddressField,
      senderCounts
    };
  }
  
  // Compare unique senders between platforms
  console.log('\n===== PLATFORM COMPARISON =====');
  
  for (const platform1 of Object.keys(platformSenders)) {
    for (const platform2 of Object.keys(platformSenders)) {
      if (platform1 >= platform2) continue; // Skip self-comparisons and duplicates
      
      const senders1 = platformSenders[platform1].uniqueSenders;
      const senders2 = platformSenders[platform2].uniqueSenders;
      
      const uniqueToPlat1 = Array.from(senders1).filter(sender => !senders2.has(sender));
      const uniqueToPlat2 = Array.from(senders2).filter(sender => !senders1.has(sender));
      const commonSenders = Array.from(senders1).filter(sender => senders2.has(sender));
      
      console.log(`\n${platform1} vs ${platform2}:`);
      console.log(`  Common senders: ${commonSenders.length}`);
      console.log(`  Unique to ${platform1}: ${uniqueToPlat1.length}`);
      console.log(`  Unique to ${platform2}: ${uniqueToPlat2.length}`);
      
      if (uniqueToPlat1.length > 0 && (platform1 === 'sentio' || platform2 === 'sentio')) {
        const platformToCheck = platform1 === 'sentio' ? platform1 : platform2;
        const uniqueList = platform1 === 'sentio' ? uniqueToPlat1 : uniqueToPlat2;
        
        console.log(`\nExamples of senders unique to ${platformToCheck} (showing first 10):`);
        for (let i = 0; i < Math.min(10, uniqueList.length); i++) {
          const sender = uniqueList[i];
          const count = platformSenders[platformToCheck].senderCounts.get(sender);
          console.log(`  ${sender}: ${count} records`);
          
          // Show a sample transaction for this sender if it's sentio
          if (platformToCheck === 'sentio') {
            const matchingRecords = platformData.sentio.data.filter(record => {
              const fieldName = platformSenders.sentio.senderAddressField;
              return record[fieldName]?.toLowerCase() === sender;
            });
            
            if (matchingRecords.length > 0) {
              const sample = matchingRecords[0];
              console.log(`    Sample transaction: ${sample.transactionHash || sample.transaction_hash}`);
              console.log(`    Block number: ${sample.blockNumber || sample.block_number}`);
              console.log(`    Recipient: ${sample.to || sample.recipient || 'N/A'}`);
            }
          }
        }
      }
    }
  }
}

// Run the analysis
analyzeAddressDistribution().catch(err => {
  console.error('Error analyzing address distribution:', err);
}); 