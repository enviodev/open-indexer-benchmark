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
  
  const fileSize = fs.statSync(filepath).size;
  if (fileSize < 100) {  // Arbitrary small file size check
    console.error(`File is too small to be a valid Parquet file: ${filepath} (${fileSize} bytes)`);
    return null;
  }
  
  console.log(`Loading data from ${filepath}...`);
  
  try {
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
    
    // Read records one by one
    while (true) {
      const record = await cursor.next();
      if (record) {
        records.push(record);
        count++;
        
        // Log progress every 1000 records
        if (count % 1000 === 0) {
          console.log(`  Loaded ${count} records...`);
        }
      } else {
        break; // End of file
      }
    }
    
    // Close the reader
    await reader.close();
    
    console.log(`Loaded ${records.length} total records from ${platform}`);
    return records;
  } catch (error) {
    console.error(`Error loading data from ${platform}: ${error.message}`);
    return null;
  }
}

/**
 * Generate comparison report between different data sources
 */
async function generateComparisonReport() {
  console.log('Generating comparison report from Parquet files...');
  
  // Define platforms and their corresponding Parquet files for transfers
  const platformFiles = [
    { name: 'sentio_ti', file: 'sentio-case2-transfers-ti.parquet' },
    { name: 'sentio_bi', file: 'sentio-case2-transfers-bi.parquet' },
    { name: 'envio', file: 'envio-case2-transfers.parquet' },
    { name: 'ponder', file: 'ponder-case2-transfers.parquet' },
    { name: 'subsquid', file: 'sqd-case2-transfers.parquet' },
    { name: 'subgraph', file: 'subgraph-case2-transfers.parquet' }
  ];

  // Define platforms and their corresponding Parquet files for accounts
  const accountFiles = [
    { name: 'sentio_ti', file: 'sentio-case2-accounts-ti.parquet' },
    { name: 'sentio_bi', file: 'sentio-case2-accounts-bi.parquet' },
    { name: 'envio', file: 'envio-case2-accounts.parquet' },
    { name: 'ponder', file: 'ponder-case2-accounts.parquet' },
    { name: 'subsquid', file: 'sqd-case2-accounts.parquet' },
    { name: 'subgraph', file: 'subgraph-case2-accounts.parquet' }
  ];
  
  // Generate reports for transfers and accounts
  await generateReportForType('transfers', platformFiles);
  await generateReportForType('accounts', accountFiles);
}

/**
 * Generate comparison report for a specific data type (transfers or accounts)
 */
async function generateReportForType(dataType, platformFiles) {
  const platforms = platformFiles.map(p => p.name);
  const dataMap = {};
  const loadSuccess = {};
  
  // Load data from all available Parquet files
  for (const platform of platformFiles) {
    const filepath = path.join(dataDir, platform.file);
    try {
      const data = await loadParquetData(filepath, platform.name);
      
      dataMap[platform.name] = data || [];
      loadSuccess[platform.name] = !!data;
      
      console.log(`${platform.name} ${dataType}: ${data ? data.length : 0} records loaded (success: ${loadSuccess[platform.name]})`);
    } catch (error) {
      console.error(`Error processing ${platform.name} ${dataType}: ${error.message}`);
      dataMap[platform.name] = [];
      loadSuccess[platform.name] = false;
    }
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    data_type: dataType,
    data_counts: {},
    unique_counts: {},
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
  
  // Unique entity counts per platform
  for (const platform of platformFiles) {
    if (dataMap[platform.name].length > 0) {
      // For each platform, extract block numbers and transaction hashes for transfers, or just IDs for accounts
      const entities = new Set();
      
      for (const record of dataMap[platform.name]) {
        entities.add(String(record.id));
      }
      
      report.unique_counts[platform.name] = {
        entities: entities.size
      };
    } else {
      report.unique_counts[platform.name] = {
        entities: 0
      };
    }
  }
  
  // Perform content-based comparisons based on from, to, and value or id and balance
  console.log(`Performing content-based comparisons for ${dataType}...`);
  
  // Create fingerprints of data for each platform
  const dataFingerprints = {};
  
  // For point comparison
  const pointFingerprints = {};
  
  for (const platform of platformFiles) {
    if (dataMap[platform.name] && dataMap[platform.name].length > 0) {
      // Create a set of unique data fingerprints
      const fingerprints = new Set();
      
      // For point comparison
      const pointFPs = new Set();
      
      for (const record of dataMap[platform.name]) {
        // Extract fields from record based on data type
        let fingerprint;
        
        if (dataType === 'transfers') {
          const from = record.from ? String(record.from).toLowerCase() : null;
          const to = record.to ? String(record.to).toLowerCase() : null;
          const value = record.value ? String(record.value) : null;
          
          // If all fields are present, create a fingerprint
          if (from && to && value) {
            fingerprint = `${from}:${to}:${value}`;
          }
        } else { // accounts
          const id = record.id ? String(record.id).toLowerCase() : null;
          const balance = record.balance ? String(record.balance) : null;
          
          // If all fields are present, create a fingerprint
          if (id && balance) {
            fingerprint = `${id}:${balance}`;
          }
          
          // For point comparison
          if (id && record.point) {
            pointFPs.add(`${id}:${record.point}`);
          }
        }
        
        if (fingerprint) {
          fingerprints.add(fingerprint);
        }
      }
      
      dataFingerprints[platform.name] = fingerprints;
      console.log(`Created ${fingerprints.size} unique ${dataType} fingerprints for ${platform.name}`);
      
      // For point comparison
      if (dataType === 'accounts') {
        pointFingerprints[platform.name] = pointFPs;
        console.log(`Created ${pointFPs.size} unique point fingerprints for ${platform.name}`);
      }
    }
  }
  
  // Compare fingerprints across platforms
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      if (dataFingerprints[platform1] && dataFingerprints[platform2]) {
        const fingerprints1 = dataFingerprints[platform1];
        const fingerprints2 = dataFingerprints[platform2];
        
        // Find common fingerprints
        const common = new Set([...fingerprints1].filter(x => fingerprints2.has(x)));
        const uniqueToFirst = new Set([...fingerprints1].filter(x => !fingerprints2.has(x)));
        const uniqueToSecond = new Set([...fingerprints2].filter(x => !fingerprints1.has(x)));
        
        // Calculate Jaccard similarity for fingerprints
        const union = new Set([...fingerprints1, ...fingerprints2]);
        const jaccardSimilarity = union.size > 0 ? common.size / union.size : 0;
        
        report.content_comparison[`${platform1}_vs_${platform2}`] = {
          common_records: common.size,
          unique_to_1: uniqueToFirst.size,
          unique_to_2: uniqueToSecond.size,
          jaccard_similarity: jaccardSimilarity
        };
        
        console.log(`${platform1} vs ${platform2} ${dataType} comparison: ${common.size} common records, similarity: ${jaccardSimilarity.toFixed(4)}`);
        
        // Compare points if this is accounts data
        if (dataType === 'accounts' && 
            pointFingerprints[platform1] && 
            pointFingerprints[platform2]) {
          
          const points1 = pointFingerprints[platform1];
          const points2 = pointFingerprints[platform2];
          
          // Find common point fingerprints
          const commonPoints = new Set([...points1].filter(x => points2.has(x)));
          const pointsUniqueToFirst = new Set([...points1].filter(x => !points2.has(x)));
          const pointsUniqueToSecond = new Set([...points2].filter(x => !points1.has(x)));
          
          // Calculate Jaccard similarity for point fingerprints
          const pointsUnion = new Set([...points1, ...points2]);
          const pointsJaccardSimilarity = pointsUnion.size > 0 ? commonPoints.size / pointsUnion.size : 0;
          
          report.content_comparison[`${platform1}_vs_${platform2}`].point_comparison = {
            common_points: commonPoints.size,
            points_unique_to_1: pointsUniqueToFirst.size,
            points_unique_to_2: pointsUniqueToSecond.size,
            points_jaccard_similarity: pointsJaccardSimilarity
          };
          
          console.log(`${platform1} vs ${platform2} points comparison: ${commonPoints.size} common points, similarity: ${pointsJaccardSimilarity.toFixed(4)}`);
        }
        
        // Add sample of unique records
        if (uniqueToFirst.size > 0 || uniqueToSecond.size > 0) {
          report.content_comparison[`${platform1}_vs_${platform2}`].examples = {
            unique_to_1: Array.from(uniqueToFirst).slice(0, 5).map(fp => {
              const parts = fp.split(':');
              if (dataType === 'transfers') {
                return { from: parts[0], to: parts[1], value: parts[2] };
              } else {
                return { id: parts[0], balance: parts[1] };
              }
            }),
            unique_to_2: Array.from(uniqueToSecond).slice(0, 5).map(fp => {
              const parts = fp.split(':');
              if (dataType === 'transfers') {
                return { from: parts[0], to: parts[1], value: parts[2] };
              } else {
                return { id: parts[0], balance: parts[1] };
              }
            })
          };
        }
      }
    }
  }
  
  // Save the report to a file
  const reportPath = path.join(__dirname, `parquet-${dataType}-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${dataType} comparison report saved to ${reportPath}`);
}

// Run the comparison
generateComparisonReport().catch(error => {
  console.error('Error in comparison process:', error);
}); 