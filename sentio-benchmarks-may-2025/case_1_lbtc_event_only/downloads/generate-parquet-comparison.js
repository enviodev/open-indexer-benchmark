const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');

// Path to data directory
const dataDir = path.join(__dirname, '..', 'data');

/**
 * Load data from a Parquet file
 */
async function loadParquetData(filepath, platform) {
  if (!fs.existsSync(filepath)) {
    console.error(`File does not exist: ${filepath}`);
    return null;
  }
  
  console.log(`Loading data from ${filepath}...`);
  
  try {
    // Open the parquet file for reading
    const reader = await parquet.ParquetReader.openFile(filepath);
    
    // Get the schema
    const schema = reader.schema;
    const fields = Object.keys(schema.fields);
    console.log(`Fields in ${platform}: ${fields.join(', ')}`);
    
    // We need to create a cursor to read records
    const cursor = reader.getCursor();
    
    // Read all records for a complete comparison
    console.log(`Reading all records from ${platform}...`);
    
    const records = [];
    let count = 0;
    
    try {
      // Read records one by one
      while (true) {
        const record = await cursor.next();
        if (record) {
          records.push(record);
          count++;
          
          // Log progress every 10000 records
          if (count % 10000 === 0) {
            console.log(`  Loaded ${count} records...`);
          }
        } else {
          break; // End of file
        }
      }
    } catch (e) {
      // End of file reached
      console.log(`  End of file reached after ${records.length} records`);
    }
    
    // Close the reader
    await reader.close();
    
    console.log(`Loaded ${records.length} total records from ${platform}`);
    return records;
  } catch (error) {
    console.error(`Error loading data from ${filepath}:`, error);
    return null;
  }
}

/**
 * Generate comparison report between different data sources
 */
async function generateComparisonReport() {
  console.log('Generating comparison report from Parquet files...');
  
  // Define platforms and their corresponding Parquet files
  const platformFiles = [
    { name: 'sentio', file: 'sentio-case1-complete.parquet' },
    { name: 'envio', file: 'envio-case1-complete.parquet' },
    { name: 'ponder', file: 'ponder-case1-complete.parquet' },
    { name: 'subsquid', file: 'subsquid-case1-complete.parquet' },
    { name: 'subgraph', file: 'subgraph-case1-complete.parquet' }
  ];
  
  // Extract platform names for comparison
  const platforms = platformFiles.map(p => p.name);
  
  const dataMap = {};
  const loadSuccess = {};
  
  // Load data from all available Parquet files
  for (const platform of platformFiles) {
    const filepath = path.join(dataDir, platform.file);
    const data = await loadParquetData(filepath, platform.name);
    
    dataMap[platform.name] = data || [];
    loadSuccess[platform.name] = !!data;
    
    console.log(`${platform.name}: ${data ? data.length : 0} records loaded (success: ${loadSuccess[platform.name]})`);
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    data_counts: {},
    unique_counts: {},
    block_ranges: {},
    consistency: {},
    content_comparison: {},
    field_comparisons: {}
  };
  
  // Data counts
  for (const platform of platformFiles) {
    report.data_counts[platform.name] = {
      count: dataMap[platform.name].length,
      success: loadSuccess[platform.name]
    };
  }
  
  // Unique blocks and transactions per platform
  for (const platform of platformFiles) {
    if (dataMap[platform.name].length > 0) {
      // For each platform, extract block numbers and transaction hashes
      const blocks = new Set();
      const transactions = new Set();
      
      for (const record of dataMap[platform.name]) {
        // Handle different field naming conventions
        let blockField, txField;
        
        if (platform.name === 'sentio') {
          // Sentio format has different field names
          // First try the direct blockNumber field if available
          if (record.blockNumber !== undefined) {
            blockField = record.blockNumber;
          }
          // If not available, try to extract from __genBlockChain__
          else if (record.__genBlockChain__ && typeof record.__genBlockChain__ === 'string') {
            const parts = record.__genBlockChain__.split(':');
            blockField = parts.length > 1 ? parts[1] : null;
          } else if (record.__genBlockChain__ && typeof record.__genBlockChain__ === 'object') {
            // It might be an object with block information
            blockField = record.__genBlockChain__.blockNumber || record.__genBlockChain__.number || null;
          } else {
            blockField = null;
          }
          txField = record.transactionHash || record.id;
        } else if (platform.name === 'subsquid') {
          blockField = record.block_number;
          // Handle Uint8Array transaction hash by converting to hex string
          if (record.transaction_hash && record.transaction_hash instanceof Buffer) {
            txField = record.transaction_hash.toString('hex');
          } else if (record.transaction_hash && typeof record.transaction_hash === 'object') {
            // If it's an ArrayBuffer or similar object but not a proper Buffer
            txField = Buffer.from(record.transaction_hash).toString('hex');
          } else {
            txField = record.transaction_hash;
          }
        } else {
          // Standard format for other platforms
          blockField = record.blockNumber;
          txField = record.transactionHash;
        }
        
        if (blockField) blocks.add(String(blockField));
        if (txField) transactions.add(String(txField));
      }
      
      report.unique_counts[platform.name] = {
        blocks: blocks.size,
        transactions: transactions.size
      };
    } else {
      report.unique_counts[platform.name] = {
        blocks: 0,
        transactions: 0
      };
    }
  }
  
  // Block ranges for each platform
  for (const platform of platformFiles) {
    if (dataMap[platform.name].length > 0) {
      let minBlock = Infinity;
      let maxBlock = -Infinity;
      let totalBlocks = 0;
      
      for (const record of dataMap[platform.name]) {
        let blockField;
        
        if (platform.name === 'sentio') {
          // Sentio format has different field names
          // First try the direct blockNumber field if available
          if (record.blockNumber !== undefined) {
            blockField = record.blockNumber;
          }
          // If not available, try to extract from __genBlockChain__
          else if (record.__genBlockChain__ && typeof record.__genBlockChain__ === 'string') {
            const parts = record.__genBlockChain__.split(':');
            blockField = parts.length > 1 ? parts[1] : null;
          } else if (record.__genBlockChain__ && typeof record.__genBlockChain__ === 'object') {
            // It might be an object with block information
            blockField = record.__genBlockChain__.blockNumber || record.__genBlockChain__.number || null;
          } else {
            blockField = null;
          }
        } else if (platform.name === 'subsquid') {
          blockField = record.block_number;
        } else {
          blockField = record.blockNumber;
        }
        
        if (blockField) {
          const blockNum = parseInt(blockField, 10);
          if (!isNaN(blockNum)) {
            minBlock = Math.min(minBlock, blockNum);
            maxBlock = Math.max(maxBlock, blockNum);
            totalBlocks++;
          }
        }
      }
      
      report.block_ranges[platform.name] = {
        min: minBlock !== Infinity ? minBlock : null,
        max: maxBlock !== -Infinity ? maxBlock : null,
        count: totalBlocks
      };
    } else {
      report.block_ranges[platform.name] = {
        min: null,
        max: null,
        count: 0
      };
    }
  }
  
  // After block ranges, add a section to compare based on from, to, and value fields 
  console.log('Performing content-based comparisons (from, to, and value)...');

  // Create fingerprints of transfers for each platform
  const transferFingerprints = {};
  report.content_comparison = {};
  
  for (const platform of platformFiles) {
    if (dataMap[platform.name] && dataMap[platform.name].length > 0) {
      // Create a set of unique transfer fingerprints
      const fingerprints = new Set();
      
      for (const record of dataMap[platform.name]) {
        // Extract fields from record based on platform
        let from, to, value;
        
        if (platform.name === 'sentio') {
          from = record.from__ ? String(record.from__).toLowerCase() : null;
          to = record.to__ ? String(record.to__).toLowerCase() : null;
          value = record.value ? String(record.value) : null;
        } else if (platform.name === 'subsquid') {
          from = record.from ? String(record.from).toLowerCase() : null;
          to = record.to ? String(record.to).toLowerCase() : null;
          value = record.value ? String(record.value) : null;
        } else {
          from = record.from ? String(record.from).toLowerCase() : null;
          to = record.to ? String(record.to).toLowerCase() : null;
          value = record.value ? String(record.value) : null;
        }
        
        // If all fields are present, create a fingerprint
        if (from && to && value) {
          const fingerprint = `${from}:${to}:${value}`;
          fingerprints.add(fingerprint);
        }
      }
      
      transferFingerprints[platform.name] = fingerprints;
      console.log(`Created ${fingerprints.size} unique transfer fingerprints for ${platform.name}`);
    }
  }
  
  // Compare transfer fingerprints across platforms
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      if (transferFingerprints[platform1] && transferFingerprints[platform2]) {
        const fingerprints1 = transferFingerprints[platform1];
        const fingerprints2 = transferFingerprints[platform2];
        
        // Find common fingerprints
        const common = new Set([...fingerprints1].filter(x => fingerprints2.has(x)));
        const uniqueToFirst = new Set([...fingerprints1].filter(x => !fingerprints2.has(x)));
        const uniqueToSecond = new Set([...fingerprints2].filter(x => !fingerprints1.has(x)));
        
        // Calculate Jaccard similarity for fingerprints
        const union = new Set([...fingerprints1, ...fingerprints2]);
        const jaccardSimilarity = union.size > 0 ? common.size / union.size : 0;
        
        report.content_comparison[`${platform1}_vs_${platform2}`] = {
          common_transfers: common.size,
          unique_to_1: uniqueToFirst.size,
          unique_to_2: uniqueToSecond.size,
          jaccard_similarity: jaccardSimilarity
        };
        
        console.log(`${platform1} vs ${platform2} content comparison: ${common.size} common transfers, similarity: ${jaccardSimilarity.toFixed(4)}`);
        
        // Add sample of unique transfers
        if (uniqueToFirst.size > 0 || uniqueToSecond.size > 0) {
          report.content_comparison[`${platform1}_vs_${platform2}`].examples = {
            unique_to_1: Array.from(uniqueToFirst).slice(0, 5).map(fp => {
              const [from, to, value] = fp.split(':');
              return { from, to, value };
            }),
            unique_to_2: Array.from(uniqueToSecond).slice(0, 5).map(fp => {
              const [from, to, value] = fp.split(':');
              return { from, to, value };
            })
          };
        }
      }
    }
  }
  
  // Consistency comparison between platforms
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      if (dataMap[platform1].length > 0 && dataMap[platform2].length > 0) {
        // Compare transaction hashes
        const txHashes1 = new Set();
        const txHashes2 = new Set();
        
        // Extract transaction hashes based on platform
        for (const record of dataMap[platform1]) {
          let txField;
          if (platform1 === 'sentio') {
            txField = record.transactionHash || record.id;
          } else if (platform1 === 'subsquid') {
            // Handle Uint8Array transaction hash for subsquid
            if (record.transaction_hash && record.transaction_hash instanceof Buffer) {
              txField = record.transaction_hash.toString('hex');
            } else if (record.transaction_hash && typeof record.transaction_hash === 'object') {
              // If it's an ArrayBuffer or similar object but not a proper Buffer
              txField = Buffer.from(record.transaction_hash).toString('hex');
            } else {
              txField = record.transaction_hash;
            }
          } else {
            txField = record.transactionHash;
          }
          if (txField) txHashes1.add(String(txField));
        }
        
        for (const record of dataMap[platform2]) {
          let txField;
          if (platform2 === 'sentio') {
            txField = record.transactionHash || record.id;
          } else if (platform2 === 'subsquid') {
            // Handle Uint8Array transaction hash for subsquid
            if (record.transaction_hash && record.transaction_hash instanceof Buffer) {
              txField = record.transaction_hash.toString('hex');
            } else if (record.transaction_hash && typeof record.transaction_hash === 'object') {
              // If it's an ArrayBuffer or similar object but not a proper Buffer
              txField = Buffer.from(record.transaction_hash).toString('hex');
            } else {
              txField = record.transaction_hash;
            }
          } else {
            txField = record.transactionHash;
          }
          if (txField) txHashes2.add(String(txField));
        }
        
        // Find intersection and differences
        const common = new Set([...txHashes1].filter(x => txHashes2.has(x)));
        const uniqueToFirst = new Set([...txHashes1].filter(x => !txHashes2.has(x)));
        const uniqueToSecond = new Set([...txHashes2].filter(x => !txHashes1.has(x)));
        
        // Calculate Jaccard similarity: |A ∩ B| / |A ∪ B|
        const union = new Set([...txHashes1, ...txHashes2]);
        const jaccardSimilarity = union.size > 0 ? common.size / union.size : 0;
        
        report.consistency[`${platform1}_vs_${platform2}`] = {
          common_transactions: common.size,
          unique_to_1: uniqueToFirst.size,
          unique_to_2: uniqueToSecond.size,
          jaccard_similarity: jaccardSimilarity
        };
      } else {
        report.consistency[`${platform1}_vs_${platform2}`] = {
          common_transactions: 0,
          unique_to_1: 0,
          unique_to_2: 0,
          jaccard_similarity: 0
        };
      }
    }
  }
  
  // After the consistency comparison section, add field-by-field comparisons
  console.log('Performing field-by-field comparisons...');
  
  // Create a mapping of transaction hashes to records for each platform
  const recordsByTxHash = {};
  
  for (const platform of platformFiles) {
    if (dataMap[platform.name] && dataMap[platform.name].length > 0) {
      recordsByTxHash[platform.name] = new Map();
      
      for (const record of dataMap[platform.name]) {
        let txField;
        
        if (platform.name === 'sentio') {
          txField = record.transactionHash || record.id;
        } else if (platform.name === 'subsquid') {
          if (record.transaction_hash && record.transaction_hash instanceof Buffer) {
            txField = record.transaction_hash.toString('hex');
          } else if (record.transaction_hash && typeof record.transaction_hash === 'object') {
            txField = Buffer.from(record.transaction_hash).toString('hex');
          } else {
            txField = record.transaction_hash;
          }
        } else {
          txField = record.transactionHash;
        }
        
        if (txField) {
          recordsByTxHash[platform.name].set(String(txField), record);
        }
      }
      
      console.log(`Indexed ${recordsByTxHash[platform.name].size} records for ${platform.name}`);
    }
  }
  
  // Perform field comparisons between platforms
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      if (recordsByTxHash[platform1] && recordsByTxHash[platform2]) {
        const comparison = {
          blockNumber_matches: 0,
          blockNumber_mismatches: 0,
          from_matches: 0,
          from_mismatches: 0,
          to_matches: 0,
          to_mismatches: 0,
          value_matches: 0,
          value_mismatches: 0,
          examples: []
        };
        
        // Get common transaction hashes
        const commonTxHashes = [...recordsByTxHash[platform1].keys()].filter(
          txHash => recordsByTxHash[platform2].has(txHash)
        );
        
        console.log(`Comparing ${commonTxHashes.length} common transactions between ${platform1} and ${platform2}...`);
        
        // Compare each field for common transactions
        let exampleCount = 0;
        for (const txHash of commonTxHashes) {
          const record1 = recordsByTxHash[platform1].get(txHash);
          const record2 = recordsByTxHash[platform2].get(txHash);
          
          // Extract fields from each record based on platform
          let block1, from1, to1, value1;
          let block2, from2, to2, value2;
          
          if (platform1 === 'sentio') {
            if (record1.__genBlockChain__ && typeof record1.__genBlockChain__ === 'string') {
              const parts = record1.__genBlockChain__.split(':');
              block1 = parts.length > 1 ? parts[1] : null;
            } else if (record1.__genBlockChain__ && typeof record1.__genBlockChain__ === 'object') {
              block1 = record1.__genBlockChain__.blockNumber || record1.__genBlockChain__.number || null;
            } else {
              block1 = null;
            }
            from1 = record1.from__;
            to1 = record1.to__;
            value1 = record1.value;
          } else if (platform1 === 'subsquid') {
            block1 = record1.block_number;
            from1 = record1.from;
            to1 = record1.to;
            value1 = record1.value;
          } else {
            block1 = record1.blockNumber;
            from1 = record1.from;
            to1 = record1.to;
            value1 = record1.value;
          }
          
          if (platform2 === 'sentio') {
            if (record2.__genBlockChain__ && typeof record2.__genBlockChain__ === 'string') {
              const parts = record2.__genBlockChain__.split(':');
              block2 = parts.length > 1 ? parts[1] : null;
            } else if (record2.__genBlockChain__ && typeof record2.__genBlockChain__ === 'object') {
              block2 = record2.__genBlockChain__.blockNumber || record2.__genBlockChain__.number || null;
            } else {
              block2 = null;
            }
            from2 = record2.from__;
            to2 = record2.to__;
            value2 = record2.value;
          } else if (platform2 === 'subsquid') {
            block2 = record2.block_number;
            from2 = record2.from;
            to2 = record2.to;
            value2 = record2.value;
          } else {
            block2 = record2.blockNumber;
            from2 = record2.from;
            to2 = record2.to;
            value2 = record2.value;
          }
          
          // Convert values to strings for comparison
          block1 = block1 ? String(block1) : null;
          block2 = block2 ? String(block2) : null;
          from1 = from1 ? String(from1).toLowerCase() : null;
          from2 = from2 ? String(from2).toLowerCase() : null;
          to1 = to1 ? String(to1).toLowerCase() : null;
          to2 = to2 ? String(to2).toLowerCase() : null;
          value1 = value1 ? String(value1) : null;
          value2 = value2 ? String(value2) : null;
          
          // Compare block numbers
          if (block1 && block2 && block1 === block2) {
            comparison.blockNumber_matches++;
          } else {
            comparison.blockNumber_mismatches++;
          }
          
          // Compare from addresses
          if (from1 && from2 && from1 === from2) {
            comparison.from_matches++;
          } else {
            comparison.from_mismatches++;
          }
          
          // Compare to addresses
          if (to1 && to2 && to1 === to2) {
            comparison.to_matches++;
          } else {
            comparison.to_mismatches++;
          }
          
          // Compare values
          if (value1 && value2 && value1 === value2) {
            comparison.value_matches++;
          } else {
            comparison.value_mismatches++;
          }
          
          // Collect a few examples of mismatches for analysis
          if (exampleCount < 5 && (
            (block1 !== block2) || 
            (from1 !== from2) || 
            (to1 !== to2) || 
            (value1 !== value2)
          )) {
            comparison.examples.push({
              txHash,
              [platform1]: {
                blockNumber: block1,
                from: from1,
                to: to1,
                value: value1
              },
              [platform2]: {
                blockNumber: block2,
                from: from2,
                to: to2,
                value: value2
              }
            });
            exampleCount++;
          }
        }
        
        // Calculate match percentages
        const totalComparisons = commonTxHashes.length;
        comparison.blockNumber_match_percent = totalComparisons > 0 
          ? (comparison.blockNumber_matches / totalComparisons * 100).toFixed(2) + '%' 
          : '0%';
        comparison.from_match_percent = totalComparisons > 0 
          ? (comparison.from_matches / totalComparisons * 100).toFixed(2) + '%' 
          : '0%';
        comparison.to_match_percent = totalComparisons > 0 
          ? (comparison.to_matches / totalComparisons * 100).toFixed(2) + '%' 
          : '0%';
        comparison.value_match_percent = totalComparisons > 0 
          ? (comparison.value_matches / totalComparisons * 100).toFixed(2) + '%' 
          : '0%';
        
        report.field_comparisons[`${platform1}_vs_${platform2}`] = comparison;
      }
    }
  }
  
  // Save the report to a file
  const reportJson = JSON.stringify(report, null, 2);
  fs.writeFileSync('parquet-comparison-report.json', reportJson);
  console.log('Comparison report saved to parquet-comparison-report.json');
  
  return report;
}

// Run the report generator
generateComparisonReport().catch(error => {
  console.error('Error generating comparison report:', error);
}); 