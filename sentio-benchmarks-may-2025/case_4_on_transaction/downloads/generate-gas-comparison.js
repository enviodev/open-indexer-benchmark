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
    try {
      while (true) {
        const record = await cursor.next();
        if (!record) break; // End of file
        
        records.push(record);
        count++;
        
        // Log progress every 10000 records
        if (count % 10000 === 0) {
          console.log(`  Loaded ${count} records...`);
        }
      }
      
      // Close the reader
      await reader.close();
      
      console.log(`Loaded ${records.length} total records from ${platform}`);
      return records;
    } catch (readError) {
      console.error(`Error reading records from ${platform}: ${readError.message}`);
      await reader.close();
      return null;
    }
  } catch (error) {
    console.error(`Error opening Parquet file from ${platform}: ${error.message}`);
    return null;
  }
}

/**
 * Load data from a JSON file
 */
async function loadJsonData(filepath, platform) {
  if (!fs.existsSync(filepath)) {
    console.error(`File does not exist: ${filepath}`);
    return null;
  }
  
  console.log(`Loading JSON data from ${filepath}...`);
  
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    
    if (Array.isArray(data)) {
      console.log(`Loaded ${data.length} records from ${platform} JSON`);
      
      // Sample a few records to show fields
      if (data.length > 0) {
        const firstRecord = data[0];
        console.log(`Fields in ${platform} JSON: ${Object.keys(firstRecord).join(', ')}`);
      }
      
      return data;
    } else {
      console.error(`Invalid JSON format from ${platform}: Not an array`);
      return null;
    }
  } catch (error) {
    console.error(`Error loading JSON data from ${platform}: ${error.message}`);
    return null;
  }
}

/**
 * Generate comparison report for gas usage data
 */
async function generateGasComparisonReport() {
  console.log('Generating comparison report for gas usage data...');
  
  // Define platforms and their corresponding data files
  const platformFiles = [
    { name: 'envio', file: 'envio-case4-gas.parquet' },
    { name: 'sentio', file: 'sentio-case4-gas.parquet' },
    { name: 'subsquid', file: 'subsquid-case4-gas.parquet' },
    { name: 'ponder', file: 'ponder-case4-gas.parquet' },
  ];
  
  const dataMap = {};
  const loadSuccess = {};
  
  // Load data from all available files
  for (const platform of platformFiles) {
    const filepath = path.join(dataDir, platform.file);
    
    try {
      let data;
      if (platform.file.endsWith('.json')) {
        data = await loadJsonData(filepath, platform.name);
      } else {
        data = await loadParquetData(filepath, platform.name);
      }
      
      dataMap[platform.name] = data || [];
      loadSuccess[platform.name] = !!data;
      
      console.log(`${platform.name}: ${data ? data.length : 0} records loaded (success: ${loadSuccess[platform.name]})`);
    } catch (error) {
      console.error(`Error processing ${platform.name}: ${error.message}`);
      dataMap[platform.name] = [];
      loadSuccess[platform.name] = false;
    }
  }
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    data_type: 'gas_usage',
    data_counts: {},
    unique_counts: {},
    block_ranges: {},
    gas_stats: {},
    address_stats: {},
    content_comparison: {},
    differing_records_examples: {}
  };
  
  // Data counts
  for (const platform of platformFiles) {
    report.data_counts[platform.name] = {
      count: dataMap[platform.name].length,
      success: loadSuccess[platform.name]
    };
  }
  
  // Calculate statistics for each platform
  for (const platform of platformFiles) {
    const data = dataMap[platform.name];
    
    if (data && data.length > 0) {
      // Block ranges
      let minBlock = Number.MAX_SAFE_INTEGER;
      let maxBlock = 0;
      
      // Gas stats
      let totalGasValue = 0n;
      
      // Address stats
      const uniqueSenders = new Set();
      const uniqueRecipients = new Set();
      
      // Transaction fingerprints for content comparison
      const txFingerprints = new Set();
      
      for (const record of data) {
        // Block range
        if (record.blockNumber !== undefined) {
          const blockNum = Number(typeof record.blockNumber === 'bigint' ? record.blockNumber.toString() : record.blockNumber);
          minBlock = Math.min(minBlock, blockNum);
          maxBlock = Math.max(maxBlock, blockNum);
        }
        
        // Sender and recipient addresses
        const from = record.from || record.sender || '';
        const to = record.to || record.recipient || '';
        
        if (from) uniqueSenders.add(from.toLowerCase());
        if (to) uniqueRecipients.add(to.toLowerCase());
        
        // Gas value total
        let gasVal = '0';
        if (record.gasValue) {
          gasVal = record.gasValue;
        } else if (record.gasUsed) {
          gasVal = record.gasUsed;
        }
        
        try {
          if (gasVal) {
            totalGasValue += BigInt(gasVal);
          }
        } catch (e) {
          console.warn(`Could not convert gas value to BigInt: ${gasVal}`);
        }
        
        // Create transaction fingerprint for comparison
        const txHash = record.id || record.transactionHash || '';
        if (txHash) {
          txFingerprints.add(txHash.toLowerCase());
        }
      }
      
      // Store calculated stats in report
      report.block_ranges[platform.name] = {
        min_block: minBlock === Number.MAX_SAFE_INTEGER ? 0 : minBlock,
        max_block: maxBlock,
        block_count: maxBlock - (minBlock === Number.MAX_SAFE_INTEGER ? 0 : minBlock) + 1
      };
      
      report.gas_stats[platform.name] = {
        total_gas_value: totalGasValue.toString(),
        avg_gas_per_tx: data.length > 0 ? (Number(totalGasValue) / data.length).toString() : '0'
      };
      
      report.address_stats[platform.name] = {
        unique_senders: uniqueSenders.size,
        unique_recipients: uniqueRecipients.size
      };
      
      report.content_comparison[platform.name] = {
        tx_fingerprints: txFingerprints.size
      };
      
      console.log(`${platform.name} stats:
        - Block range: ${minBlock === Number.MAX_SAFE_INTEGER ? 'N/A' : minBlock} to ${maxBlock} (${report.block_ranges[platform.name].block_count} blocks)
        - Unique senders: ${uniqueSenders.size}
        - Unique recipients: ${uniqueRecipients.size}
        - Total gas value: ${totalGasValue.toString()}
        - Avg gas per tx: ${(Number(totalGasValue) / data.length).toLocaleString()}
      `);
    }
  }
  
  // Compare transaction overlap between platforms
  const platforms = platformFiles.map(p => p.name);
  
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      if (!report.content_comparison[platform1] || !report.content_comparison[platform2]) {
        continue;
      }
      
      // Create maps of transaction hashes to records for comparison
      const txHashMap1 = new Map();
      const txHashMap2 = new Map();
      
      for (const record of dataMap[platform1]) {
        const txHash = record.id || record.transactionHash || '';
        if (txHash) txHashMap1.set(txHash.toLowerCase(), record);
      }
      
      for (const record of dataMap[platform2]) {
        const txHash = record.id || record.transactionHash || '';
        if (txHash) txHashMap2.set(txHash.toLowerCase(), record);
      }
      
      // Find common transactions
      const commonTxs = new Set([...txHashMap1.keys()].filter(tx => txHashMap2.has(tx)));
      
      // Calculate Jaccard similarity
      const unionSize = new Set([...txHashMap1.keys(), ...txHashMap2.keys()]).size;
      const jaccardSimilarity = unionSize > 0 ? commonTxs.size / unionSize : 0;
      
      report.content_comparison[`${platform1}_vs_${platform2}`] = {
        common_txs: commonTxs.size,
        unique_to_1: txHashMap1.size - commonTxs.size,
        unique_to_2: txHashMap2.size - commonTxs.size,
        jaccard_similarity: jaccardSimilarity
      };
      
      console.log(`Comparison ${platform1} vs ${platform2}:
        - Common transactions: ${commonTxs.size}
        - Unique to ${platform1}: ${txHashMap1.size - commonTxs.size}
        - Unique to ${platform2}: ${txHashMap2.size - commonTxs.size}
        - Jaccard similarity: ${jaccardSimilarity.toFixed(4)}
      `);
      
      // Find examples of differing gas values for the same transaction
      const diffExamples = [];
      let examplesFound = 0;
      
      // First, look for transactions in both platforms with different gas values
      for (const txHash of commonTxs) {
        if (examplesFound >= 5) break; // Limit to 5 examples
        
        const record1 = txHashMap1.get(txHash);
        const record2 = txHashMap2.get(txHash);
        
        // Get gas values from both records
        const gas1 = record1.gasValue || record1.gasUsed || '0';
        const gas2 = record2.gasValue || record2.gasUsed || '0';
        
        // Compare gas values
        if (gas1 !== gas2) {
          diffExamples.push({
            txHash,
            [platform1]: {
              gasValue: gas1,
              blockNumber: record1.blockNumber,
              from: record1.from || record1.sender,
              to: record1.to || record1.recipient
            },
            [platform2]: {
              gasValue: gas2,
              blockNumber: record2.blockNumber,
              from: record2.from || record2.sender,
              to: record2.to || record2.recipient
            }
          });
          examplesFound++;
        }
      }
      
      // Next, add examples of transactions only in platform1
      const uniqueTo1 = [...txHashMap1.keys()].filter(tx => !txHashMap2.has(tx));
      for (let k = 0; k < Math.min(3, uniqueTo1.length); k++) {
        const txHash = uniqueTo1[k];
        const record = txHashMap1.get(txHash);
        diffExamples.push({
          txHash,
          [platform1]: {
            gasValue: record.gasValue || record.gasUsed || '0',
            blockNumber: record.blockNumber,
            from: record.from || record.sender,
            to: record.to || record.recipient
          },
          [platform2]: "Not present"
        });
      }
      
      // Next, add examples of transactions only in platform2
      const uniqueTo2 = [...txHashMap2.keys()].filter(tx => !txHashMap1.has(tx));
      for (let k = 0; k < Math.min(3, uniqueTo2.length); k++) {
        const txHash = uniqueTo2[k];
        const record = txHashMap2.get(txHash);
        diffExamples.push({
          txHash,
          [platform1]: "Not present",
          [platform2]: {
            gasValue: record.gasValue || record.gasUsed || '0',
            blockNumber: record.blockNumber,
            from: record.from || record.sender,
            to: record.to || record.recipient
          }
        });
      }
      
      if (diffExamples.length > 0) {
        report.differing_records_examples[`${platform1}_vs_${platform2}`] = diffExamples;
      }
    }
  }
  
  // Generate HTML report
  generateHtmlReport(report);
  
  // Write detailed JSON report
  fs.writeFileSync(
    path.join(__dirname, 'gas-usage-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log(`Report saved to ${path.join(__dirname, 'gas-usage-report.json')}`);
  console.log(`HTML report saved to ${path.join(__dirname, 'gas-usage-report.html')}`);
  
  return report;
}

/**
 * Generate HTML report
 */
function generateHtmlReport(report) {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Gas Usage Comparison - Case 4</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; padding: 20px; max-width: 1200px; margin: 0 auto; }
      h1, h2, h3 { color: #333; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; }
      tr:nth-child(even) { background-color: #f9f9f9; }
      .chart-container { height: 400px; margin: 20px 0; }
      .success { color: green; }
      .failure { color: red; }
      .transaction-hash { font-family: monospace; word-break: break-all; }
      .not-present { color: #999; font-style: italic; }
      details { margin: 20px 0; }
      summary { cursor: pointer; font-weight: bold; }
    </style>
  </head>
  <body>
    <h1>Gas Usage Comparison Report - Case 4</h1>
    <p>Generated at: ${report.timestamp}</p>
    
    <h2>1. Record Counts</h2>
    <table>
      <tr>
        <th>Platform</th>
        <th>Record Count</th>
        <th>Status</th>
      </tr>
      ${Object.entries(report.data_counts).map(([platform, data]) => `
        <tr>
          <td>${platform}</td>
          <td>${data.count.toLocaleString()}</td>
          <td class="${data.success ? 'success' : 'failure'}">${data.success ? 'Success' : 'Failed'}</td>
        </tr>
      `).join('')}
    </table>
    
    <h2>2. Block Ranges</h2>
    <table>
      <tr>
        <th>Platform</th>
        <th>Min Block</th>
        <th>Max Block</th>
        <th>Block Count</th>
      </tr>
      ${Object.entries(report.block_ranges).map(([platform, data]) => `
        <tr>
          <td>${platform}</td>
          <td>${data.min_block.toLocaleString()}</td>
          <td>${data.max_block.toLocaleString()}</td>
          <td>${data.block_count.toLocaleString()}</td>
        </tr>
      `).join('')}
    </table>
    
    <h2>3. Address Statistics</h2>
    <table>
      <tr>
        <th>Platform</th>
        <th>Unique Senders</th>
        <th>Unique Recipients</th>
      </tr>
      ${Object.entries(report.address_stats).map(([platform, data]) => `
        <tr>
          <td>${platform}</td>
          <td>${data.unique_senders.toLocaleString()}</td>
          <td>${data.unique_recipients.toLocaleString()}</td>
        </tr>
      `).join('')}
    </table>
    
    <h2>4. Gas Statistics</h2>
    <table>
      <tr>
        <th>Platform</th>
        <th>Total Gas Value</th>
        <th>Avg Gas Per Transaction</th>
      </tr>
      ${Object.entries(report.gas_stats).map(([platform, data]) => `
        <tr>
          <td>${platform}</td>
          <td>${BigInt(data.total_gas_value).toLocaleString()}</td>
          <td>${parseFloat(data.avg_gas_per_tx).toLocaleString()}</td>
        </tr>
      `).join('')}
    </table>
    
    <h2>5. Content Similarity</h2>
    <table>
      <tr>
        <th>Comparison</th>
        <th>Common Transactions</th>
        <th>Unique to First</th>
        <th>Unique to Second</th>
        <th>Jaccard Similarity</th>
      </tr>
      ${Object.entries(report.content_comparison)
        .filter(([key]) => key.includes('_vs_'))
        .map(([key, data]) => `
          <tr>
            <td>${key}</td>
            <td>${data.common_txs.toLocaleString()}</td>
            <td>${data.unique_to_1.toLocaleString()}</td>
            <td>${data.unique_to_2.toLocaleString()}</td>
            <td>${(data.jaccard_similarity * 100).toFixed(2)}%</td>
          </tr>
        `).join('')}
    </table>
    
    <h2>6. Example Differing Records</h2>
    ${Object.entries(report.differing_records_examples || {}).map(([comparison, examples]) => `
      <details>
        <summary>${comparison} (${examples.length} examples)</summary>
        <table>
          <tr>
            <th>Transaction Hash</th>
            <th>${comparison.split('_vs_')[0]}</th>
            <th>${comparison.split('_vs_')[1]}</th>
          </tr>
          ${examples.map(example => `
            <tr>
              <td class="transaction-hash">${example.txHash}</td>
              <td>
                ${example[comparison.split('_vs_')[0]] === "Not present" 
                  ? '<span class="not-present">Not present</span>' 
                  : `
                    <strong>Gas Value:</strong> ${example[comparison.split('_vs_')[0]].gasValue}<br>
                    <strong>Block:</strong> ${example[comparison.split('_vs_')[0]].blockNumber}<br>
                    <strong>From:</strong> ${example[comparison.split('_vs_')[0]].from}<br>
                    <strong>To:</strong> ${example[comparison.split('_vs_')[0]].to}
                  `
                }
              </td>
              <td>
                ${example[comparison.split('_vs_')[1]] === "Not present" 
                  ? '<span class="not-present">Not present</span>' 
                  : `
                    <strong>Gas Value:</strong> ${example[comparison.split('_vs_')[1]].gasValue}<br>
                    <strong>Block:</strong> ${example[comparison.split('_vs_')[1]].blockNumber}<br>
                    <strong>From:</strong> ${example[comparison.split('_vs_')[1]].from}<br>
                    <strong>To:</strong> ${example[comparison.split('_vs_')[1]].to}
                  `
                }
              </td>
            </tr>
          `).join('')}
        </table>
      </details>
    `).join('')}
    
    <h2>7. Summary</h2>
    <p>
      This report compares gas usage data from ${Object.keys(report.data_counts).length} different platforms.
      The most complete dataset came from ${
        Object.entries(report.data_counts)
          .sort((a, b) => b[1].count - a[1].count)
          .filter(([_, data]) => data.success)
          .map(([platform]) => platform)[0] || 'N/A'
      } with ${
        Math.max(...Object.values(report.data_counts).map(d => d.count)).toLocaleString()
      } records.
    </p>
  </body>
  </html>
  `;
  
  fs.writeFileSync(path.join(__dirname, 'gas-usage-report.html'), html);
}

// Run the main function
generateGasComparisonReport().catch(error => {
  console.error('Error generating comparison report:', error);
}); 