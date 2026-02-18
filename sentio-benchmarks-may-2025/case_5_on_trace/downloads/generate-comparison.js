const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');

// Parse command line arguments
const args = process.argv.slice(2);
const argMap = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    argMap[key] = value;
  }
});

// Configuration
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(__dirname, 'comparison-report.json');
const HTML_OUTPUT_FILE = path.join(__dirname, 'comparison-report.html');

// The platforms to compare
const PLATFORM_FILES = {
  'sentio': 'sentio-case5-swaps.parquet',
  'subsquid': 'subsquid-case5-swaps.parquet',
  'envio': argMap['envio-file'] || 'envio-case5-swaps.parquet',
  'ponder': 'ponder-case5-swaps.parquet',
  'subgraph': 'subgraph-case5-swaps.parquet'
};

// Log which files are being used
console.log('Using the following files:');
Object.entries(PLATFORM_FILES).forEach(([platform, file]) => {
  console.log(`- ${platform}: ${file}`);
});

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

/**
 * Extract trace identifier from a record
 * This is a crucial enhancement to handle trace-level comparisons
 */
function getTraceIdentifier(record) {
  // Prioritize explicit trace identifiers if they exist
  const traceIndex = record.traceIndex !== undefined ? record.traceIndex : 
                     record.trace_index !== undefined ? record.trace_index : 
                     record.traceId !== undefined ? record.traceId : 
                     record.trace_id !== undefined ? record.trace_id : 0;
  
  const txHash = (record.transactionHash || record.transaction_hash || '').toLowerCase();
  
  // Create a composite key of transactionHash_traceIndex
  return `${txHash}_${traceIndex}`;
}

/**
 * Create composite keys for transaction and trace-level analysis
 */
function createCompositeKeys(data) {
  const txHashSet = new Set();
  const traceKeys = new Set();
  const txToTraces = new Map();
  
  for (const record of data) {
    const txHash = (record.transactionHash || record.transaction_hash || '').toLowerCase();
    const traceKey = getTraceIdentifier(record);
    
    if (txHash) {
      txHashSet.add(txHash);
      
      // Map transaction hash to its traces
      if (!txToTraces.has(txHash)) {
        txToTraces.set(txHash, new Set());
      }
      txToTraces.get(txHash).add(traceKey);
    }
    
    if (traceKey.includes('_')) {
      traceKeys.add(traceKey);
    }
  }
  
  return {
    txHashes: Array.from(txHashSet),
    traceKeys: Array.from(traceKeys),
    txToTraces
  };
}

// Find and improve the section that processes amount values for statistical calculation
// Replace the existing BigInt conversion code with this improved version
function safeConvertToBigInt(value) {
  if (value === undefined || value === null) {
    return BigInt(0);
  }
  
  try {
    // For numbers in scientific notation (e.g., 1.23e+21)
    if (typeof value === 'number' || (typeof value === 'string' && /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/.test(value))) {
      // First convert to Number to handle any strings that are already in scientific notation
      const num = Number(value);
      if (isNaN(num)) {
        throw new Error('Not a valid number');
      }
      
      // For very large numbers, use a more precise method than toLocaleString
      if (Math.abs(num) > 1e20) {
        // Use the Decimal library if available, otherwise fallback to string manipulation
        if (typeof Decimal === 'function') {
          return BigInt(new Decimal(num).toFixed());
        } else {
          // Manual conversion from scientific to decimal notation
          const str = num.toString();
          const match = str.match(/^([+-]?\d+\.\d+|\d+)[eE]([+-]?\d+)$/);
          if (match) {
            const mantissa = match[1].replace('.', '');
            const exponent = parseInt(match[2], 10);
            const decimalPos = match[1].indexOf('.');
            const mantissaLength = decimalPos >= 0 ? match[1].length - 1 : match[1].length;
            
            // Calculate the number of decimal places to shift
            const effectiveExponent = exponent - (decimalPos >= 0 ? mantissaLength - decimalPos : 0);
            
            if (effectiveExponent >= 0) {
              // Add zeros if needed
              return BigInt(mantissa + '0'.repeat(effectiveExponent));
          } else {
              // Handle negative exponents (should not happen for our use case)
              throw new Error(`Cannot convert scientific notation with negative effective exponent: ${value}`);
            }
          }
        }
      }
      
      // For smaller numbers, use toLocaleString which works well for numbers < 1e20
      return BigInt(num.toLocaleString('fullwide', {useGrouping: false}));
    }
    
    // For regular string representations of integers
    return BigInt(value.toString());
  } catch (error) {
    console.warn(`Error converting to BigInt: ${value} (${typeof value})`);
    return BigInt(0);
  }
}

async function generateComparisonReport() {
  console.log('Generating Parquet data comparison report...');
  
  // Load data from each platform
  const platformData = {};
  
  for (const [platform, fileName] of Object.entries(PLATFORM_FILES)) {
    const filePath = path.join(DATA_DIR, fileName);
    platformData[platform] = await loadParquetData(platform, filePath);
  }
  
  // Initialize report structure
  const report = {
    timestamp: new Date().toISOString(),
    data_type: 'uniswap_swaps',
    data_counts: {},
    unique_counts: {},
    block_ranges: {},
    amount_stats: {},
    address_stats: {},
    path_stats: {},
    content_comparison: {},
    differing_records_examples: {},
    transaction_analysis: {},
    trace_comparison: {}
  };
  
  // Process data counts
  for (const [platform, data] of Object.entries(platformData)) {
    report.data_counts[platform] = {
      count: data.count,
      loadSuccess: data.loadSuccess,
      error: data.error
    };
  }
  
  // Process unique blocks and transactions for each platform
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.data || !Array.isArray(data.data)) {
      report.unique_counts[platform] = {
        uniqueBlocks: 0,
        uniqueTxs: 0
      };
      continue;
    }
    
    const blocks = new Set();
    const transactions = new Set();
    
    for (const item of data.data) {
      // Handle both camelCase and snake_case formats
      const blockNumber = item.blockNumber || item.block_number;
      const txHash = item.transactionHash || item.transaction_hash;
      
      if (blockNumber) blocks.add(parseInt(blockNumber.toString()));
      if (txHash) transactions.add(txHash.toString());
    }
    
    report.unique_counts[platform] = {
      uniqueBlocks: blocks.size,
      uniqueTxs: transactions.size
    };
  }
  
  // Process transaction and trace analysis for each platform
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.loadSuccess || !data.data || !Array.isArray(data.data)) continue;
    
    // Generate composite keys for analysis
    const { txHashes, traceKeys, txToTraces } = createCompositeKeys(data.data);
    
    // Calculate transaction statistics
    const txWithMultipleTraces = Array.from(txToTraces.entries())
      .filter(([_, traces]) => traces.size > 1)
      .length;
    
    const maxTracesPerTx = Math.max(...Array.from(txToTraces.values()).map(traces => traces.size), 0);
    const avgTracesPerTx = txHashes.length > 0 ? traceKeys.length / txHashes.length : 0;
    
    report.transaction_analysis[platform] = {
      total_records: data.data.length,
      unique_transactions: txHashes.length,
      transactions_with_multiple_traces: txWithMultipleTraces,
      max_traces_per_transaction: maxTracesPerTx,
      avg_traces_per_transaction: avgTracesPerTx,
      unique_composite_keys: traceKeys.length
    };
  }
  
  // Calculate block ranges for each platform
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      report.block_ranges[platform] = {
        min: null,
        max: null,
        count: 0
      };
      continue;
    }
    
    let minBlock = Infinity;
    let maxBlock = 0;
    
    for (const item of data.data) {
      // Handle both camelCase and snake_case formats
      const blockNumber = item.blockNumber || item.block_number;
      
      if (blockNumber) {
        const blockNum = parseInt(blockNumber.toString());
        if (blockNum < minBlock) minBlock = blockNum;
        if (blockNum > maxBlock) maxBlock = blockNum;
      }
    }
    
    report.block_ranges[platform] = {
      min: minBlock === Infinity ? null : minBlock,
      max: maxBlock === 0 ? null : maxBlock,
      count: maxBlock - minBlock + 1
    };
  }
  
  // Calculate amount statistics for each platform
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      report.amount_stats[platform] = {
        total_amount_in: "0",
        avg_amount_in: "0",
        total_amount_out_min: "0",
        avg_amount_out_min: "0"
      };
      continue;
    }
    
    let totalAmountIn = 0n;
    let totalAmountOutMin = 0n;
    let validAmountInCount = 0;
    let validAmountOutMinCount = 0;
    
    for (const item of data.data) {
      // Handle both camelCase and snake_case formats
      const amountIn = item.amountIn || item.amount_in;
      const amountOutMin = item.amountOutMin || item.amount_out_min;
      
      if (amountIn) {
        try {
          totalAmountIn += safeConvertToBigInt(amountIn);
          validAmountInCount++;
        } catch (error) {
          console.warn(`Error processing amountIn: ${amountIn} (${typeof amountIn})`);
        }
      }
      
      if (amountOutMin) {
        try {
          totalAmountOutMin += safeConvertToBigInt(amountOutMin);
          validAmountOutMinCount++;
        } catch (error) {
          console.warn(`Error processing amountOutMin: ${amountOutMin} (${typeof amountOutMin})`);
        }
      }
    }
    
    report.amount_stats[platform] = {
      total_amount_in: totalAmountIn.toString(),
      avg_amount_in: validAmountInCount > 0 ? (Number(totalAmountIn) / validAmountInCount).toString() : "0",
      total_amount_out_min: totalAmountOutMin.toString(),
      avg_amount_out_min: validAmountOutMinCount > 0 ? (Number(totalAmountOutMin) / validAmountOutMinCount).toString() : "0"
    };
    
    console.log(`${platform} amount stats:
      - Total amountIn: ${totalAmountIn.toString()}
      - Avg amountIn: ${report.amount_stats[platform].avg_amount_in}
      - Total amountOutMin: ${totalAmountOutMin.toString()}
      - Avg amountOutMin: ${report.amount_stats[platform].avg_amount_out_min}
    `);
  }
  
  // Calculate address statistics for each platform
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      report.address_stats[platform] = {
        unique_senders: 0,
        unique_recipients: 0
      };
      continue;
    }
    
    const uniqueSenders = new Set();
    const uniqueRecipients = new Set();
    
    for (const item of data.data) {
      // Handle all possible field name variations
      const from = item.from || item.from_address || item.sender || item.senderAddress || '';
      const to = item.to || item.to_address || item.recipient || item.recipientAddress || '';
      
      // Better normalization: ensure lowercase and trim any whitespace
      // Also check for valid address format (0x followed by 40 hex chars)
      if (from && typeof from === 'string') {
        const normalizedFrom = from.toLowerCase().trim();
        if (normalizedFrom.match(/^0x[0-9a-f]{40}$/)) {
          uniqueSenders.add(normalizedFrom);
        } else if (normalizedFrom.length > 0 && normalizedFrom !== '0x') {
          console.warn(`Potentially invalid sender address format in ${platform}: ${normalizedFrom}`);
          // Still add it to the set, but warn about it
          uniqueSenders.add(normalizedFrom);
        }
      }
      
      if (to && typeof to === 'string') {
        const normalizedTo = to.toLowerCase().trim();
        if (normalizedTo.match(/^0x[0-9a-f]{40}$/)) {
          uniqueRecipients.add(normalizedTo);
        } else if (normalizedTo.length > 0 && normalizedTo !== '0x') {
          console.warn(`Potentially invalid recipient address format in ${platform}: ${normalizedTo}`);
          // Still add it to the set, but warn about it
          uniqueRecipients.add(normalizedTo);
        }
      }
    }
    
    report.address_stats[platform] = {
      unique_senders: uniqueSenders.size,
      unique_recipients: uniqueRecipients.size
    };
    
    console.log(`${platform} address stats:
      - Unique senders: ${uniqueSenders.size}
      - Unique recipients: ${uniqueRecipients.size}
      - First 5 sender examples: ${Array.from(uniqueSenders).slice(0, 5).join(', ')}
      - First 5 recipient examples: ${Array.from(uniqueRecipients).slice(0, 5).join(', ')}
    `);
  }
  
  // Calculate path statistics for each platform
  for (const [platform, data] of Object.entries(platformData)) {
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      report.path_stats[platform] = {
        avg_path_length: 0,
        unique_tokens: 0,
        most_common_tokens: []
      };
      continue;
    }
    
    let totalPathLength = 0;
    let validPathLengthCount = 0;
    const tokenCounts = new Map();
    
    for (const item of data.data) {
      // Handle all possible field name variations
      const pathLength = item.pathLength || item.path_length || 0;
      const path = item.path || item.token_path || '';
      
      if (pathLength && !isNaN(parseInt(pathLength.toString()))) {
        const pathLengthNum = parseInt(pathLength.toString());
        totalPathLength += pathLengthNum;
        validPathLengthCount++;
      }
      
      if (path) {
        // Handle both comma-separated and other formats
        let tokens = [];
        
        if (typeof path === 'string') {
          // Try comma-separated first
          tokens = path.split(',');
          
          // If there's only one token but it's long, it might be a concatenated string of addresses
          if (tokens.length === 1 && tokens[0].length > 50) {
            // Try to parse as concatenated hex addresses (each 42 chars including 0x)
            const longPath = tokens[0];
            tokens = [];
            for (let i = 0; i < longPath.length; i += 42) {
              if (i + 42 <= longPath.length) {
                tokens.push(longPath.substring(i, i + 42));
              }
            }
          }
        } else if (Array.isArray(path)) {
          // Some platforms might store path as an array of addresses
          tokens = path;
        }
        
        // Process and normalize each token address
        tokens.forEach(token => {
          let normalizedToken = '';
          
          if (typeof token === 'string') {
            normalizedToken = token.toLowerCase().trim();
          } else if (token && typeof token === 'object' && token.address) {
            // Handle case where token might be an object with an address property
            normalizedToken = token.address.toLowerCase().trim();
          }
          
          // Only count valid-looking addresses
          if (normalizedToken && normalizedToken.match(/^0x[0-9a-f]{40}$/)) {
            tokenCounts.set(normalizedToken, (tokenCounts.get(normalizedToken) || 0) + 1);
          } else if (normalizedToken && normalizedToken.length > 0 && normalizedToken !== '0x') {
            // Attempt to fix addresses without 0x prefix or with wrong length
            if (!normalizedToken.startsWith('0x') && normalizedToken.length === 40) {
              const fixedToken = '0x' + normalizedToken;
              console.log(`Fixed token address format in ${platform}: ${normalizedToken} -> ${fixedToken}`);
              tokenCounts.set(fixedToken, (tokenCounts.get(fixedToken) || 0) + 1);
            } else {
              console.warn(`Skipping invalid token address in ${platform}: ${normalizedToken}`);
            }
          }
        });
      }
    }
    
    // Get most common tokens
    const mostCommonTokens = Array.from(tokenCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([token, count]) => ({ token, count }));
    
    report.path_stats[platform] = {
      avg_path_length: validPathLengthCount > 0 ? totalPathLength / validPathLengthCount : 0,
      unique_tokens: tokenCounts.size,
      most_common_tokens: mostCommonTokens
    };
    
    console.log(`${platform} path stats:
      - Avg path length: ${report.path_stats[platform].avg_path_length.toFixed(2)}
      - Unique tokens: ${tokenCounts.size}
      - Top tokens: ${mostCommonTokens.map(t => `${t.token} (${t.count})`).join(', ')}
    `);
  }
  
  // Compare data consistency between platforms (only if we have data)
  const platforms = Object.keys(PLATFORM_FILES);
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      const data1 = platformData[platform1].data;
      const data2 = platformData[platform2].data;
      
      if (!Array.isArray(data1) || !Array.isArray(data2) || data1.length === 0 || data2.length === 0) {
        report.content_comparison[`${platform1}_vs_${platform2}`] = {
          platform1Count: Array.isArray(data1) ? data1.length : 0,
          platform2Count: Array.isArray(data2) ? data2.length : 0,
          commonTxs: 0,
          uniqueToPlat1: 0,
          uniqueToPlat2: 0,
          jaccardSimilarity: 0
        };
        continue;
      }
      
      // Create maps of transaction hashes to records for comparison
      const txHashMap1 = {};
      const txHashMap2 = {};
      
      // Handle both camelCase and snake_case field names
      for (const record of data1) {
        // Check for different field name variations
        let txHash = record.transactionHash || record.transaction_hash || '';
        if (txHash) txHashMap1[txHash.toLowerCase()] = record;
      }
      
      for (const record of data2) {
        let txHash = record.transactionHash || record.transaction_hash || '';
        if (txHash) txHashMap2[txHash.toLowerCase()] = record;
      }
      
      // Compare content of the records
      let commonTxs = 0;
      let identicalRecords = 0;
      let differentRecords = 0;
      let uniqueToPlat1 = 0;
      let uniqueToPlat2 = 0;
      const diffExamples = {};
      let diffExamplesCount = 0;
      const MAX_EXAMPLES = 5;
      
      // Process records that are in both datasets
      for (const txHash in txHashMap1) {
        if (!txHashMap1.hasOwnProperty(txHash)) continue;
        
        if (txHashMap2[txHash]) {
          // Both datasets have this transaction
          commonTxs++;
          
          const record1 = txHashMap1[txHash];
          const record2 = txHashMap2[txHash];
          
          // Define fields to compare (exclude ID field)
          const fieldsToCompare = [
            { p1: 'blockNumber', p2: 'block_number' },
            { p1: 'transactionHash', p2: 'transaction_hash' },
            { p1: 'from', p2: 'from' },
            { p1: 'to', p2: 'to' },
            { p1: 'amountIn', p2: 'amount_in' },
            { p1: 'amountOutMin', p2: 'amount_out_min' },
            { p1: 'deadline', p2: 'deadline' },
            { p1: 'path', p2: 'path' },
            { p1: 'pathLength', p2: 'path_length' }
          ];
          
          // Check if all fields match
          let isIdentical = true;
          const differences = [];
          const reportedErrors = {};
          
          for (const field of fieldsToCompare) {
            // Get field values from both records, checking both camelCase and snake_case formats
            let value1 = record1[field.p1];
            if (value1 === undefined && record1[field.p2] !== undefined) {
              value1 = record1[field.p2];
            }
            
            let value2 = record2[field.p2];
            if (value2 === undefined && record2[field.p1] !== undefined) {
              value2 = record2[field.p1];
            }
            
            // Convert values to string for comparison
            const strValue1 = String(value1 !== undefined ? value1 : '');
            const strValue2 = String(value2 !== undefined ? value2 : '');
            
            // If both values are undefined, they're considered equal
            if (value1 === undefined && value2 === undefined) {
              continue;
            }
            
            // Try to normalize numbers - convert scientific notation and regular integers to same format
            let normalizedValue1 = strValue1;
            let normalizedValue2 = strValue2;
            
            // Check if both values can be parsed as numbers
            const num1 = Number(strValue1);
            const num2 = Number(strValue2);
            
            if (!isNaN(num1) && !isNaN(num2)) {
              // If they represent the same number, consider them identical
              if (num1 === num2) {
                // Values are numerically identical, continue to next field
                continue;
              }
              
              // For amount fields, try to handle scientific notation vs. regular notation
              if (field.p1.includes('amount') || field.p1.includes('deadline')) {
                try {
                  // First check if they're within a small relative difference
                  const relDiff = Math.abs((num1 - num2) / (Math.abs(num1) + Math.abs(num2) / 2));
                  if (relDiff < 0.0001) { // Use a smaller threshold for more precision
                    continue;
                  }
                  
                  // Try to compare as BigInt with more robust handling
                  const bigInt1 = safeConvertToBigInt(num1);
                  const bigInt2 = safeConvertToBigInt(num2);
                  
                  if (bigInt1 === bigInt2) {
                    continue;
                  }
                } catch (error) {
                  // Only log this error once per field to avoid flooding the console
                  const errorKey = `${field.p1}_conversion`;
                  if (!reportedErrors[errorKey]) {
                    console.log(`Error comparing ${field.p1}: ${strValue1} vs ${strValue2}`);
                    reportedErrors[errorKey] = true;
                  }
                }
              }
            }
            
            if (normalizedValue1 !== normalizedValue2) {
              isIdentical = false;
              differences.push({
                field: field.p1,
                value1: strValue1,
                value2: strValue2
              });
            }
          }
          
          if (isIdentical) {
            identicalRecords++;
          } else {
            differentRecords++;
            
            // Store examples of differing records
            if (diffExamplesCount < MAX_EXAMPLES) {
              const p1 = platform1;
              const p2 = platform2;
              
              if (!diffExamples[`${p1}_vs_${p2}`]) {
                diffExamples[`${p1}_vs_${p2}`] = [];
              }
              
              // Add example with differences highlighted
              diffExamples[`${p1}_vs_${p2}`].push({
                txHash: txHash,
                differences: differences,
                [p1]: record1,
                [p2]: record2
              });
              
              diffExamplesCount++;
            }
          }
        } else {
          // Only in first dataset
          uniqueToPlat1++;
        }
      }
      
      // Check for records in platform2 that are not in platform1
      for (const txHash in txHashMap2) {
        if (!txHashMap2.hasOwnProperty(txHash)) continue;
        
        if (!txHashMap1[txHash]) {
          uniqueToPlat2++;
        }
      }
      
      // Calculate similarity metrics
      const txCount1 = Object.keys(txHashMap1).length;
      const txCount2 = Object.keys(txHashMap2).length;
      const unionSize = txCount1 + txCount2 - commonTxs;
      const jaccardSimilarity = unionSize > 0 ? commonTxs / unionSize : 0;
      
      // Content-based similarity (proportion of records that are identical)
      const contentSimilarity = commonTxs > 0 ? identicalRecords / commonTxs : 0;
      
      report.content_comparison[`${platform1}_vs_${platform2}`] = {
        platform1Count: txCount1,
        platform2Count: txCount2,
        commonTxs: commonTxs,
        identicalRecords,
        differentRecords: differentRecords,
        uniqueToPlat1: uniqueToPlat1,
        uniqueToPlat2: uniqueToPlat2,
        jaccardSimilarity,
        contentSimilarity
      };
      
      report.differing_records_examples[`${platform1}_vs_${platform2}`] = diffExamples[`${platform1}_vs_${platform2}`] || [];
      
      console.log(`Comparison ${platform1} vs ${platform2}:
        - Common transactions: ${commonTxs}
        - Identical records: ${identicalRecords}
        - Different records: ${differentRecords}
        - Unique to ${platform1}: ${uniqueToPlat1}
        - Unique to ${platform2}: ${uniqueToPlat2}
        - Jaccard similarity: ${(jaccardSimilarity * 100).toFixed(2)}%
        - Content similarity: ${(contentSimilarity * 100).toFixed(2)}%
      `);
    }
  }
  
  // Perform trace-level comparison between platforms
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const platform1 = platforms[i];
      const platform2 = platforms[j];
      
      const data1 = platformData[platform1].data;
      const data2 = platformData[platform2].data;
      
      if (!Array.isArray(data1) || !Array.isArray(data2)) continue;
      
      // Transaction-level comparison from composite keys
      const { txHashes: txHashes1, traceKeys: traceKeys1, txToTraces: txToTraces1 } = createCompositeKeys(data1);
      const { txHashes: txHashes2, traceKeys: traceKeys2, txToTraces: txToTraces2 } = createCompositeKeys(data2);
      
      // Create sets for easier comparison
      const txSet1 = new Set(txHashes1);
      const txSet2 = new Set(txHashes2);
      const traceSet1 = new Set(traceKeys1);
      const traceSet2 = new Set(traceKeys2);
      
      // Find common transactions
      const commonTxs = txHashes1.filter(tx => txSet2.has(tx));
      const uniqueToPlat1 = txHashes1.filter(tx => !txSet2.has(tx));
      const uniqueToPlat2 = txHashes2.filter(tx => !txSet1.has(tx));
      
      // Find common traces (exact match of txHash_traceIndex)
      const commonTraces = traceKeys1.filter(trace => traceSet2.has(trace));
      const uniqueTracesToPlat1 = traceKeys1.filter(trace => !traceSet2.has(trace));
      const uniqueTracesToPlat2 = traceKeys2.filter(trace => !traceSet1.has(trace));
      
      // Calculate trace similarity (Jaccard index)
      const traceSimilarity = (traceKeys1.length + traceKeys2.length) > 0 
        ? commonTraces.length / (traceKeys1.length + traceKeys2.length - commonTraces.length) 
        : 0;
      
      // Calculate transaction similarity (Jaccard index)
      const txSimilarity = (txHashes1.length + txHashes2.length) > 0 
        ? commonTxs.length / (txHashes1.length + txHashes2.length - commonTxs.length) 
        : 0;
      
      // Find an example of a trace unique to platform 1
      let exampleTraceUnique1 = null;
      if (uniqueTracesToPlat1.length > 0) {
        const exampleTraceKey = uniqueTracesToPlat1[0];
        const txHash = exampleTraceKey.split('_')[0];
        
        // Check if the transaction exists in platform 2 but with different traces
        const sameTransactionDifferentTraces = txSet2.has(txHash);
        const traceCountInOtherPlatform = sameTransactionDifferentTraces && txToTraces2.has(txHash) 
          ? txToTraces2.get(txHash).size 
          : 0;
        
        exampleTraceUnique1 = {
          traceKey: exampleTraceKey,
          sameTransactionDifferentTraces,
          traceCountInOtherPlatform
        };
      }
      
      // Find an example of a trace unique to platform 2
      let exampleTraceUnique2 = null;
      if (uniqueTracesToPlat2.length > 0) {
        const exampleTraceKey = uniqueTracesToPlat2[0];
        const txHash = exampleTraceKey.split('_')[0];
        
        // Check if the transaction exists in platform 1 but with different traces
        const sameTransactionDifferentTraces = txSet1.has(txHash);
        const traceCountInOtherPlatform = sameTransactionDifferentTraces && txToTraces1.has(txHash) 
          ? txToTraces1.get(txHash).size 
          : 0;
        
        exampleTraceUnique2 = {
          traceKey: exampleTraceKey,
          sameTransactionDifferentTraces,
          traceCountInOtherPlatform
        };
      }
      
      report.trace_comparison[`${platform1}_vs_${platform2}`] = {
        platform1Traces: traceKeys1.length,
        platform2Traces: traceKeys2.length,
        commonTraces: commonTraces.length,
        uniqueToPlat1: uniqueTracesToPlat1.length,
        uniqueToPlat2: uniqueTracesToPlat2.length,
        traceSimilarity: traceSimilarity,
        exampleTraceUnique1,
        exampleTraceUnique2,
        // Include transaction-level metrics for convenience
        platform1Txs: txHashes1.length,
        platform2Txs: txHashes2.length,
        commonTxs: commonTxs.length,
        uniqueTxToPlat1: uniqueToPlat1.length,
        uniqueTxToPlat2: uniqueToPlat2.length,
        txSimilarity: txSimilarity
      };
      
      console.log(`\nTransaction-level comparison: ${platform1} vs ${platform2}`);
      console.log(` - ${platform1} unique transactions: ${txHashes1.length}`);
      console.log(` - ${platform2} unique transactions: ${txHashes2.length}`);
      console.log(` - Common transactions: ${commonTxs.length}`);
      console.log(` - Unique to ${platform1}: ${uniqueToPlat1.length}`);
      console.log(` - Unique to ${platform2}: ${uniqueToPlat2.length}`);
      console.log(` - Transaction similarity: ${(txSimilarity * 100).toFixed(2)}%`);
      
      console.log(`\nTrace-level comparison: ${platform1} vs ${platform2}`);
      console.log(` - ${platform1} unique traces: ${traceKeys1.length}`);
      console.log(` - ${platform2} unique traces: ${traceKeys2.length}`);
      console.log(` - Common traces: ${commonTraces.length}`);
      console.log(` - Unique to ${platform1}: ${uniqueTracesToPlat1.length}`);
      console.log(` - Unique to ${platform2}: ${uniqueTracesToPlat2.length}`);
      console.log(` - Trace similarity: ${(traceSimilarity * 100).toFixed(2)}%`);
      
      if (exampleTraceUnique1) {
        console.log(`\nExample trace unique to ${platform1}: ${exampleTraceUnique1.traceKey}`);
        if (exampleTraceUnique1.sameTransactionDifferentTraces) {
          console.log(` - Same transaction has ${exampleTraceUnique1.traceCountInOtherPlatform} different traces in ${platform2}`);
        } else {
          console.log(` - Transaction does not exist in ${platform2}`);
        }
      }
      
      if (exampleTraceUnique2) {
        console.log(`\nExample trace unique to ${platform2}: ${exampleTraceUnique2.traceKey}`);
        if (exampleTraceUnique2.sameTransactionDifferentTraces) {
          console.log(` - Same transaction has ${exampleTraceUnique2.traceCountInOtherPlatform} different traces in ${platform1}`);
        } else {
          console.log(` - Transaction does not exist in ${platform1}`);
        }
      }
    }
  }
  
  // Save the report to a file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`Comparison report saved to ${OUTPUT_FILE}`);
  
  // Generate HTML report
  generateHTMLReport(report);
  
  return report;
}

function generateHTMLReport(report) {
  // Helper function to safely format numbers
  const formatNumber = (value) => {
    if (value === null || value === undefined) return 'N/A';
    return value.toLocaleString();
  };

  // Generate HTML content
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Uniswap V2 Swaps Comparison Report - Case 5</title>
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
    .info-box { background-color: #e7f3fe; border-left: 6px solid #2196F3; padding: 10px; margin: 15px 0; }
  </style>
</head>
<body>
  <h1>Uniswap V2 Swaps Comparison Report - Case 5</h1>
  <p>Generated at: ${report.timestamp}</p>
  
  <div class="info-box">
    <p><strong>Transaction Amount Analysis</strong>: Similar to gas usage metrics in Case 4, this report analyzes the economic values (amounts) involved in Uniswap V2 swaps across different indexing platforms. The comparison includes total amounts, average amounts, and transaction counts to provide insights into the economic activity captured by each platform.</p>
  </div>
  
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
        <td>${formatNumber(data.count)}</td>
        <td class="${data.loadSuccess ? 'success' : 'failure'}">${data.loadSuccess ? 'Success' : 'Failed'}</td>
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
        <td>${data.min === null ? 'N/A' : formatNumber(data.min)}</td>
        <td>${data.max === null ? 'N/A' : formatNumber(data.max)}</td>
        <td>${formatNumber(data.count)}</td>
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
        <td>${formatNumber(data.unique_senders)}</td>
        <td>${formatNumber(data.unique_recipients)}</td>
      </tr>
    `).join('')}
  </table>
  
  <h2>4. Amount Statistics</h2>
  <table>
    <tr>
      <th>Platform</th>
      <th>Total Amount In</th>
      <th>Avg Amount In</th>
      <th>Total Amount Out Min</th>
      <th>Avg Amount Out Min</th>
    </tr>
    ${Object.entries(report.amount_stats).map(([platform, data]) => `
      <tr>
        <td>${platform}</td>
        <td>${data.total_amount_in || '0'}</td>
        <td>${data.avg_amount_in ? parseFloat(data.avg_amount_in).toLocaleString() : '0'}</td>
        <td>${data.total_amount_out_min || '0'}</td>
        <td>${data.avg_amount_out_min ? parseFloat(data.avg_amount_out_min).toLocaleString() : '0'}</td>
      </tr>
    `).join('')}
  </table>
  
  <h2>5. Path Statistics</h2>
  <table>
    <tr>
      <th>Platform</th>
      <th>Avg Path Length</th>
      <th>Unique Tokens</th>
      <th>Most Common Tokens</th>
    </tr>
    ${Object.entries(report.path_stats).map(([platform, data]) => `
      <tr>
        <td>${platform}</td>
        <td>${data.avg_path_length !== undefined ? data.avg_path_length.toFixed(2) : 'N/A'}</td>
        <td>${formatNumber(data.unique_tokens)}</td>
        <td>${data.most_common_tokens && data.most_common_tokens.length > 0 ? 
          data.most_common_tokens.map(t => `${t.token.slice(0, 8)}... (${t.count})`).join(', ') : 'N/A'}</td>
      </tr>
    `).join('')}
  </table>
  
  <h2>6. Content Similarity</h2>
  <div class="info-box">
    <p><strong>New Similarity Metrics:</strong> We've enhanced our comparison to evaluate all fields (except the ID field) for more comprehensive analysis:</p>
    <ul>
      <li><strong>Jaccard Similarity:</strong> Measures the intersection over union of transaction sets, showing what percentage of all transactions are common to both platforms.</li>
      <li><strong>Content Similarity:</strong> Of the transactions found in both platforms, what percentage have identical values across all fields (excluding ID).</li>
    </ul>
    <p>Higher percentages indicate greater similarity between the datasets.</p>
  </div>
  <table>
    <tr>
      <th>Comparison</th>
      <th>Common Transactions</th>
      <th>Identical Records</th>
      <th>Different Records</th>
      <th>Unique to First</th>
      <th>Unique to Second</th>
      <th>Jaccard Similarity</th>
      <th>Content Similarity</th>
    </tr>
    ${Object.entries(report.content_comparison || {})
      .filter(([key]) => key.includes('_vs_'))
      .map(([key, data]) => `
        <tr>
          <td>${key}</td>
          <td>${formatNumber(data.commonTxs)}</td>
          <td>${formatNumber(data.identicalRecords)}</td>
          <td>${formatNumber(data.differentRecords)}</td>
          <td>${formatNumber(data.uniqueToPlat1)}</td>
          <td>${formatNumber(data.uniqueToPlat2)}</td>
          <td>${data.jaccardSimilarity !== undefined ? (data.jaccardSimilarity * 100).toFixed(2) : 'N/A'}%</td>
          <td>${data.contentSimilarity !== undefined ? (data.contentSimilarity * 100).toFixed(2) : 'N/A'}%</td>
        </tr>
      `).join('')}
  </table>
  
  <h2>7. Example Differing Records</h2>
  ${Object.entries(report.differing_records_examples || {}).map(([comparison, examples]) => `
    <details>
      <summary>${comparison} (${examples.length} examples)</summary>
      <table>
        <tr>
          <th>Transaction Hash</th>
          <th>${comparison.split('_vs_')[0]}</th>
          <th>${comparison.split('_vs_')[1]}</th>
          <th>Fields with Differences</th>
        </tr>
        ${examples.map(example => `
          <tr>
            <td class="transaction-hash">${example.txHash}</td>
            <td>
              ${example[comparison.split('_vs_')[0]] === "Not present" 
                ? '<span class="not-present">Not present</span>' 
                : `
                  <strong>Amount In:</strong> ${example[comparison.split('_vs_')[0]].amountIn || example[comparison.split('_vs_')[0]].amount_in || 'N/A'}<br>
                  <strong>Block:</strong> ${example[comparison.split('_vs_')[0]].blockNumber || example[comparison.split('_vs_')[0]].block_number || 'N/A'}<br>
                  <strong>From:</strong> ${example[comparison.split('_vs_')[0]].from || 'N/A'}<br>
                  <strong>To:</strong> ${example[comparison.split('_vs_')[0]].to || 'N/A'}<br>
                  <strong>Path Length:</strong> ${example[comparison.split('_vs_')[0]].pathLength || example[comparison.split('_vs_')[0]].path_length || 'N/A'}
                `
              }
            </td>
            <td>
              ${example[comparison.split('_vs_')[1]] === "Not present" 
                ? '<span class="not-present">Not present</span>' 
                : `
                  <strong>Amount In:</strong> ${example[comparison.split('_vs_')[1]].amountIn || example[comparison.split('_vs_')[1]].amount_in || 'N/A'}<br>
                  <strong>Block:</strong> ${example[comparison.split('_vs_')[1]].blockNumber || example[comparison.split('_vs_')[1]].block_number || 'N/A'}<br>
                  <strong>From:</strong> ${example[comparison.split('_vs_')[1]].from || 'N/A'}<br>
                  <strong>To:</strong> ${example[comparison.split('_vs_')[1]].to || 'N/A'}<br>
                  <strong>Path Length:</strong> ${example[comparison.split('_vs_')[1]].pathLength || example[comparison.split('_vs_')[1]].path_length || 'N/A'}
                `
              }
            </td>
            <td>
              ${Array.isArray(example.differences) 
                ? example.differences.map(diff => `
                  <strong>${diff.field}:</strong> ${diff.value1 || 'undefined'} vs ${diff.value2 || 'undefined'}
                `).join('<br>') 
                : '(Unknown)'}
            </td>
          </tr>
        `).join('')}
      </table>
    </details>
  `).join('')}
  
  <h2>8. Summary</h2>
  <p>
    This report compares Uniswap V2 swap data from ${Object.keys(report.data_counts).length} different platforms.
    The most complete dataset came from ${
      Object.entries(report.data_counts)
        .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
        .filter(([_, data]) => data.loadSuccess)
        .map(([platform]) => platform)[0] || 'N/A'
    } with ${
      Math.max(...Object.values(report.data_counts).map(d => d.count || 0)).toLocaleString()
    } records.
  </p>
  
  <h2>9. Subsquid Data Fix</h2>
  <div class="info-box">
    <p><strong>Issue:</strong> The original Subsquid implementation had problems with the <code>to</code> address and <code>path</code> fields being set to zero addresses instead of properly extracting them from the transaction call data.</p>
    <p><strong>Fix Applied:</strong> The Subsquid indexer implementation was updated to properly decode the transaction calldata. Specifically:</p>
    <ul>
      <li>The <code>to</code> address is now extracted from bytes 192-256 of the calldata (taking the last 20 bytes)</li>
      <li>The <code>path</code> array is extracted by calculating the offset in the calldata based on the path pointer, then reading each address</li>
      <li>The <code>deadline</code> parameter is now properly read from the calldata</li>
    </ul>
    <p>These changes ensure that Subsquid correctly captures all the necessary fields for Uniswap V2 swaps, with proper addresses for <code>to</code> and token <code>path</code> entries.</p>
  </div>

  <h2>6. Trace-Level Comparisons</h2>
  <p>This section compares records at the trace level, taking into account both transaction hash and trace address.</p>
  <table>
    <tr>
      <th>Platforms</th>
      <th>Platform 1 Traces</th>
      <th>Platform 2 Traces</th>
      <th>Common Traces</th>
      <th>Unique to Platform 1</th>
      <th>Unique to Platform 2</th>
      <th>Trace Similarity</th>
    </tr>
    ${Object.entries(report.trace_comparison || {}).map(([key, data]) => {
      const platforms = key.split('_vs_');
      return `
        <tr>
          <td>${platforms[0]} vs ${platforms[1]}</td>
          <td>${formatNumber(data.platform1Traces)}</td>
          <td>${formatNumber(data.platform2Traces)}</td>
          <td>${formatNumber(data.commonTraces)}</td>
          <td>${formatNumber(data.uniqueToPlat1)}</td>
          <td>${formatNumber(data.uniqueToPlat2)}</td>
          <td>${(data.traceSimilarity * 100).toFixed(2)}%</td>
        </tr>
      `;
    }).join('')}
  </table>

  <h3>Transaction-Level Comparisons Based on Trace Data</h3>
  <table>
    <tr>
      <th>Platforms</th>
      <th>Platform 1 Transactions</th>
      <th>Platform 2 Transactions</th>
      <th>Common Transactions</th>
      <th>Unique to Platform 1</th>
      <th>Unique to Platform 2</th>
      <th>Transaction Similarity</th>
    </tr>
    ${Object.entries(report.trace_comparison || {}).map(([key, data]) => {
      const platforms = key.split('_vs_');
      return `
        <tr>
          <td>${platforms[0]} vs ${platforms[1]}</td>
          <td>${formatNumber(data.platform1Txs)}</td>
          <td>${formatNumber(data.platform2Txs)}</td>
          <td>${formatNumber(data.commonTxs)}</td>
          <td>${formatNumber(data.uniqueTxToPlat1)}</td>
          <td>${formatNumber(data.uniqueTxToPlat2)}</td>
          <td>${(data.txSimilarity * 100).toFixed(2)}%</td>
        </tr>
      `;
    }).join('')}
  </table>

  <details>
    <summary>Example Traces Unique to Each Platform</summary>
    <table>
      <tr>
        <th>Comparison</th>
        <th>Example Trace ID</th>
        <th>Notes</th>
      </tr>
      ${Object.entries(report.trace_comparison || {}).map(([key, data]) => {
        const platforms = key.split('_vs_');
        let rows = [];
        
        if (data.exampleTraceUnique1) {
          rows.push(`
            <tr>
              <td>${platforms[0]} vs ${platforms[1]}</td>
              <td class="transaction-hash">${data.exampleTraceUnique1.traceKey}</td>
              <td>
                ${data.exampleTraceUnique1.sameTransactionDifferentTraces 
                  ? `Same transaction has ${data.exampleTraceUnique1.traceCountInOtherPlatform} different traces in ${platforms[1]}`
                  : `Transaction does not exist in ${platforms[1]}`}
              </td>
            </tr>
          `);
        }
        
        if (data.exampleTraceUnique2) {
          rows.push(`
            <tr>
              <td>${platforms[0]} vs ${platforms[1]}</td>
              <td class="transaction-hash">${data.exampleTraceUnique2.traceKey}</td>
              <td>
                ${data.exampleTraceUnique2.sameTransactionDifferentTraces 
                  ? `Same transaction has ${data.exampleTraceUnique2.traceCountInOtherPlatform} different traces in ${platforms[0]}`
                  : `Transaction does not exist in ${platforms[0]}`}
              </td>
            </tr>
          `);
        }
        
        return rows.join('');
      }).join('')}
    </table>
  </details>
</body>
</html>
  `;
  
  fs.writeFileSync(HTML_OUTPUT_FILE, html);
  console.log(`HTML report saved to ${HTML_OUTPUT_FILE}`);
}

// Run the comparison
generateComparisonReport().catch(err => {
  console.error('Error generating comparison report:', err);
}); 