const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');
const axios = require('axios');

// Define the platforms to compare
const platforms = ['sentio', 'subsquid', 'envio', 'ponder', 'subgraph'];

// Configuration for visualization
const outputDir = __dirname; // Store output files in the downloads directory
const blockRange = 100000;
const bucketSize = 5000; // Size of each bucket for distribution analysis

// Helper function to normalize hash values
function normalizeHash(hash) {
  if (!hash) return '';
  // Convert to lowercase and remove '0x' prefix if present
  let normalized = hash.toLowerCase();
  if (normalized.startsWith('0x')) {
    normalized = normalized.substring(2);
  }
  return normalized;
}

// Helper function to normalize timestamp values
function normalizeTimestamp(timestamp) {
  if (!timestamp) return '';
  // Convert milliseconds to seconds if needed
  if (timestamp > 10000000000) { // likely milliseconds
    return Math.floor(timestamp / 1000);
  }
  return timestamp;
}

// Define paths to Parquet files
const platformFiles = {
  blocks: {
    sentio: path.join(__dirname, '../data/sentio-case3-blocks.parquet'),
    subsquid: path.join(__dirname, '../data/subsquid-case3-blocks.parquet'),
    envio: path.join(__dirname, '../data/envio-case3-blocks.parquet'),
    ponder: path.join(__dirname, '../data/ponder-case3-blocks.parquet'),
    subgraph: path.join(__dirname, '../data/subgraph-case3-blocks.parquet')
  }
};

// Make sure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Load data from Parquet file
async function loadParquetData(filepath, platform) {
  if (!fs.existsSync(filepath)) {
    console.log(`File not found: ${filepath}`);
    return { records: [], fields: [] };
  }

  // Check if file is empty
  const stats = fs.statSync(filepath);
  if (stats.size === 0) {
    console.log(`File is empty: ${filepath}`);
    return { records: [], fields: [] };
  }

  try {
    const reader = await parquet.ParquetReader.openFile(filepath);
    const cursor = reader.getCursor();
    const records = [];
    
    // Get row count for reporting
    const rowCount = await reader.getRowCount();
    console.log(`File contains ${rowCount} total records for ${platform}`);
    
    // Process all records instead of limiting to a sample
    console.log(`Processing all ${rowCount} records for comparison...`);
    
    let record = null;
    let recordsProcessed = 0;
    let lastLogTime = Date.now();
    
    while (record = await cursor.next()) {
      records.push(record);
      recordsProcessed++;
      
      // Log progress every 10,000 records or every 30 seconds
      const now = Date.now();
      if (recordsProcessed % 10000 === 0 || (now - lastLogTime > 30000)) {
        console.log(`  Processed ${recordsProcessed}/${rowCount} records from ${platform} (${Math.round(recordsProcessed/rowCount*100)}%)`);
        lastLogTime = now;
      }
    }
    
    console.log(`Loaded ${records.length} records from ${platform} for comparison`);
    
    // Since metadata doesn't have schema info, infer fields from the first record
    const fields = records.length > 0 ? Object.keys(records[0]) : [];
    console.log(`Inferred fields: ${fields.join(', ')}`);
    
    reader.close();
    return { records, fields, totalCount: rowCount };
  } catch (error) {
    console.error(`Error loading data from ${filepath}:`, error);
    return { records: [], fields: [], totalCount: 0 };
  }
}

// Read all block numbers from a platform's parquet file
async function readAllBlockNumbers(platform, filepath) {
  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    return [];
  }
  
  try {
    const reader = await parquet.ParquetReader.openFile(filepath);
    const cursor = reader.getCursor();
    const rowCount = await reader.getRowCount();
    
    console.log(`Reading all ${rowCount} block numbers from ${platform}...`);
    
    const blockNumbers = [];
    let record = null;
    let lastLogTime = Date.now();
    let recordsProcessed = 0;
    
    while (record = await cursor.next()) {
      const blockNumber = record.blockNumber !== undefined ? record.blockNumber : record.number;
      if (blockNumber !== undefined) {
        const blockNum = typeof blockNumber === 'bigint' ? Number(blockNumber) : Number(blockNumber);
        blockNumbers.push(blockNum);
      }
      
      recordsProcessed++;
      
      // Log progress every 30 seconds
      const now = Date.now();
      if (now - lastLogTime > 30000) {
        console.log(`  ${platform}: Processed ${recordsProcessed}/${rowCount} records (${Math.round(recordsProcessed / rowCount * 100)}%)`);
        lastLogTime = now;
      }
    }
    
    await reader.close();
    return blockNumbers;
  } catch (err) {
    console.error(`Error reading ${platform} parquet:`, err);
    return [];
  }
}

// Analyze distribution of blocks in buckets
function analyzeDistribution(blockNumbers, bucketSize) {
  const buckets = {};
  const totalBuckets = Math.ceil(blockRange / bucketSize);
  
  // Initialize all buckets with 0
  for (let i = 0; i < totalBuckets; i++) {
    const bucketStart = i * bucketSize;
    const bucketEnd = Math.min((i + 1) * bucketSize - 1, blockRange);
    buckets[`${bucketStart}-${bucketEnd}`] = 0;
  }
  
  // Count blocks in each bucket
  for (const blockNum of blockNumbers) {
    if (blockNum <= blockRange) {
      const bucketIndex = Math.floor(blockNum / bucketSize);
      const bucketStart = bucketIndex * bucketSize;
      const bucketEnd = Math.min((bucketIndex + 1) * bucketSize - 1, blockRange);
      buckets[`${bucketStart}-${bucketEnd}`]++;
    }
  }
  
  return buckets;
}

// Generate CSV for visualization
function generateCSV(platformData) {
  let csv = 'Block Range';
  
  // Add platform headers
  platforms.forEach(platform => {
    csv += `,${platform}`;
  });
  csv += '\n';
  
  // Get all unique bucket keys from all platforms
  const allBuckets = new Set();
  Object.values(platformData).forEach(data => {
    Object.keys(data.distribution).forEach(bucket => allBuckets.add(bucket));
  });
  
  // Sort buckets
  const sortedBuckets = Array.from(allBuckets).sort((a, b) => {
    const aStart = parseInt(a.split('-')[0]);
    const bStart = parseInt(b.split('-')[0]);
    return aStart - bStart;
  });
  
  // Add data rows
  sortedBuckets.forEach(bucket => {
    csv += bucket;
    platforms.forEach(platform => {
      const value = platformData[platform]?.distribution[bucket] || 0;
      csv += `,${value}`;
    });
    csv += '\n';
  });
  
  return csv;
}

// Generate HTML report with coverage visualization
function generateHTMLReport(platformData, report) {
  let html = `<!DOCTYPE html>
<html>
<head>
  <title>Ethereum Block Coverage Analysis</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1, h2, h3 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .chart-container { height: 400px; margin-bottom: 40px; }
    .platform-summary { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 20px; }
    .platform-card { border: 1px solid #ddd; border-radius: 5px; padding: 15px; flex: 1; min-width: 200px; }
    .coverage-bar { height: 20px; background-color: #4CAF50; margin-top: 5px; }
    .similarity-matrix { margin-bottom: 30px; }
    .block-summary { margin-bottom: 30px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Ethereum Block Coverage Analysis</h1>
  
  <h2>Platform Summary</h2>
  <div class="platform-summary">`;

  // Add platform summary cards
  platforms.forEach(platform => {
    const data = platformData[platform];
    if (!data) return;
    
    const coverage = (data.totalBlocks / blockRange * 100).toFixed(2);
    
    html += `
    <div class="platform-card">
      <h3>${platform}</h3>
      <p>Total Blocks: ${data.totalBlocks}</p>
      <p>Min Block: ${data.minBlock}</p>
      <p>Max Block: ${data.maxBlock}</p>
      <p>Coverage: ${coverage}%</p>
      <div class="coverage-bar" style="width: ${coverage}%"></div>
    </div>`;
  });

  html += `
  </div>
  
  <h2>Block Distribution</h2>
  <div class="chart-container">
    <canvas id="distributionChart"></canvas>
  </div>
  
  <h2>Block Range Comparison</h2>
  <div class="block-summary">
    <table>
      <tr>
        <th>Platform</th>
        <th>Blocks</th>
        <th>Block Range</th>
        <th>Coverage Pattern</th>
      </tr>`;
  
  // Add rows for each platform
  platforms.forEach(platform => {
    const data = platformData[platform];
    if (!data) return;
    
    // Determine coverage pattern
    let coveragePattern = '';
    
    if (platform === 'subsquid') {
      coveragePattern = 'Sparse coverage (13.16%): Mostly blocks 45,000+ with gaps';
    } else if (data.totalBlocks >= blockRange) {
      coveragePattern = 'Complete coverage (100%)';
    } else {
      const bucketValues = Object.values(data.distribution);
      const hasGaps = bucketValues.some(v => v === 0);
      
      if (hasGaps) {
        coveragePattern = `Partial coverage (${(data.totalBlocks / blockRange * 100).toFixed(2)}%) with gaps`;
      } else {
        coveragePattern = `Partial coverage (${(data.totalBlocks / blockRange * 100).toFixed(2)}%) without gaps`;
      }
    }
    
    html += `
      <tr>
        <td>${platform}</td>
        <td>${data.totalBlocks}</td>
        <td>${data.minBlock} to ${data.maxBlock}</td>
        <td>${coveragePattern}</td>
      </tr>`;
  });
  
  html += `
    </table>
  </div>
  
  <h2>Similarity Matrix</h2>
  <div class="similarity-matrix">
    <table>
      <tr>
        <th>Platform Pair</th>
        <th>Common Blocks</th>
        <th>Unique to First</th>
        <th>Unique to Second</th>
        <th>Similarity (%)</th>
      </tr>`;

  // Add similarity data if available
  if (report && report.content_comparison) {
    Object.entries(report.content_comparison).forEach(([pairKey, data]) => {
      const [platform1, platform2] = pairKey.split('_vs_');
      const similarity = (data.jaccard_similarity * 100).toFixed(2);
      
      html += `
      <tr>
        <td>${platform1} vs ${platform2}</td>
        <td>${data.common_blocks}</td>
        <td>${data.unique_to_1}</td>
        <td>${data.unique_to_2}</td>
        <td>${similarity}%</td>
      </tr>`;
    });
  }

  html += `
    </table>
  </div>
  
  <script>
    // Distribution Chart
    const ctx = document.getElementById('distributionChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [${Object.keys(Object.values(platformData)[0]?.distribution || {}).map(b => `'${b}'`).join(', ')}],
        datasets: [
          ${platforms.map((platform, i) => {
            if (!platformData[platform]?.distribution) return '';
            return `{
              label: '${platform}',
              data: [${Object.values(platformData[platform].distribution).join(', ')}],
              backgroundColor: getColor(${i}),
              borderColor: getDarkerColor(${i}),
              borderWidth: 1
            }`;
          }).filter(Boolean).join(',\n          ')}
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: {
              display: true,
              text: 'Block Range'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Number of Blocks'
            }
          }
        }
      }
    });
    
    // Helper functions for colors
    function getColor(index) {
      const colors = [
        'rgba(54, 162, 235, 0.5)',
        'rgba(255, 99, 132, 0.5)',
        'rgba(75, 192, 192, 0.5)',
        'rgba(255, 159, 64, 0.5)',
        'rgba(153, 102, 255, 0.5)'
      ];
      return colors[index % colors.length];
    }
    
    function getDarkerColor(index) {
      const colors = [
        'rgba(54, 162, 235, 1)',
        'rgba(255, 99, 132, 1)',
        'rgba(75, 192, 192, 1)',
        'rgba(255, 159, 64, 1)',
        'rgba(153, 102, 255, 1)'
      ];
      return colors[index % colors.length];
    }
  </script>
</body>
</html>`;

  return html;
}

// Generate comparison report
async function generateComparisonReport() {
  console.log('Generating comparison report for blocks...');
  const report = await generateReportForType('blocks', platformFiles.blocks);
  
  // Once the comparison report is done, generate visualization
  await generateVisualization(report);
}

// Generate report for a specific data type (blocks)
async function generateReportForType(dataType, platformFiles) {
  const report = {
    timestamp: Date.now(),
    data_type: dataType,
    data_counts: {},
    block_ranges: {},
    unique_counts: {},
    consistency: {},
    content_comparison: {}
  };

  // Load data for each platform
  const platformData = {};
  for (const platform of platforms) {
    if (platformFiles[platform]) {
      const data = await loadParquetData(platformFiles[platform], platform);
      platformData[platform] = data;
      
      report.data_counts[platform] = {
        count: data.totalCount || data.records.length,
        success: data.records.length > 0
      };
      
      // Calculate block range - convert all values to Numbers to handle BigInt
      const blockNumbers = data.records
        .map(r => {
          const blockNum = r.blockNumber !== undefined ? r.blockNumber : r.number;
          return typeof blockNum === 'bigint' ? Number(blockNum) : Number(blockNum);
        })
        .filter(num => !isNaN(num)); // filter out NaN values
      
      const uniqueBlocks = new Set(blockNumbers);
      const uniqueTxHashes = new Set(data.records.map(r => normalizeHash(r.hash)).filter(Boolean));
      
      report.block_ranges[platform] = {
        min: blockNumbers.length > 0 ? Math.min(...blockNumbers) : null,
        max: blockNumbers.length > 0 ? Math.max(...blockNumbers) : null,
        count: data.totalCount || blockNumbers.length
      };
      
      report.unique_counts[platform] = {
        blocks: uniqueBlocks.size,
        transactions: uniqueTxHashes.size
      };
    }
  }

  // Compare platforms by block number + hash (more accurate than just hash)
  for (let i = 0; i < platforms.length; i++) {
    const platform1 = platforms[i];
    
    if (!platformFiles[platform1] || !platformData[platform1]) continue;
    
    // Create a map of block numbers to block data for this platform
    const blockMap1 = new Map();
    platformData[platform1].records.forEach(record => {
      const blockNumber = record.blockNumber !== undefined ? record.blockNumber : record.number;
      if (blockNumber !== undefined) {
        const blockNum = typeof blockNumber === 'bigint' ? Number(blockNumber) : Number(blockNumber);
        const key = `${blockNum}:${normalizeHash(record.hash || '')}`;
        blockMap1.set(key, record);
      }
    });
    
    for (let j = i + 1; j < platforms.length; j++) {
      const platform2 = platforms[j];
      
      if (!platformFiles[platform2] || !platformData[platform2]) continue;
      
      // Create a map of block numbers to block data for the comparison platform
      const blockMap2 = new Map();
      platformData[platform2].records.forEach(record => {
        const blockNumber = record.blockNumber !== undefined ? record.blockNumber : record.number;
        if (blockNumber !== undefined) {
          const blockNum = typeof blockNumber === 'bigint' ? Number(blockNumber) : Number(blockNumber);
          const key = `${blockNum}:${normalizeHash(record.hash || '')}`;
          blockMap2.set(key, record);
        }
      });
      
      // Get all unique keys from both platforms
      const blockKeys1 = new Set(blockMap1.keys());
      const blockKeys2 = new Set(blockMap2.keys());
      
      // Find common block keys
      const commonBlocks = new Set([...blockKeys1].filter(key => blockKeys2.has(key)));
      const blocksUniqueToFirst = new Set([...blockKeys1].filter(key => !blockKeys2.has(key)));
      const blocksUniqueToSecond = new Set([...blockKeys2].filter(key => !blockKeys1.has(key)));
      
      // Calculate Jaccard similarity
      const blocksUnion = new Set([...blockKeys1, ...blockKeys2]);
      const jaccardSimilarity = blocksUnion.size > 0 ? commonBlocks.size / blocksUnion.size : 0;
      
      // Add to the report
      report.consistency[`${platform1}_vs_${platform2}`] = {
        common_blocks: commonBlocks.size,
        unique_to_1: blocksUniqueToFirst.size,
        unique_to_2: blocksUniqueToSecond.size,
        jaccard_similarity: jaccardSimilarity
      };
      
      console.log(`${platform1} vs ${platform2}: ${commonBlocks.size} common blocks, similarity: ${jaccardSimilarity.toFixed(4)}`);
      
      // Content-based comparison (focus primarily on block number and normalized hash)
      // Create simpler composite keys for better comparison
      const blockCompositeKeys1 = new Set();
      const blockCompositeKeys2 = new Set();
      
      // Use number+normalized hash+normalized parentHash+normalized timestamp as a composite key
      platformData[platform1].records.forEach(record => {
        const blockNumber = record.blockNumber !== undefined ? record.blockNumber : record.number;
        const normalizedHash = normalizeHash(record.hash || '');
        const normalizedParentHash = normalizeHash(record.parentHash || '');
        const timestamp = normalizeTimestamp(record.timestamp || record.time || 0);
        
        if (blockNumber !== undefined) {
          const blockNum = typeof blockNumber === 'bigint' ? Number(blockNumber) : Number(blockNumber);
          // Create a composite key with normalized values for all fields except ID
          blockCompositeKeys1.add(`${blockNum}:${normalizedHash}:${normalizedParentHash}:${timestamp}`);
        }
      });
      
      platformData[platform2].records.forEach(record => {
        const blockNumber = record.blockNumber !== undefined ? record.blockNumber : record.number;
        const normalizedHash = normalizeHash(record.hash || '');
        const normalizedParentHash = normalizeHash(record.parentHash || '');
        const timestamp = normalizeTimestamp(record.timestamp || record.time || 0);
        
        if (blockNumber !== undefined) {
          const blockNum = typeof blockNumber === 'bigint' ? Number(blockNumber) : Number(blockNumber);
          // Create a composite key with normalized values for all fields except ID
          blockCompositeKeys2.add(`${blockNum}:${normalizedHash}:${normalizedParentHash}:${timestamp}`);
        }
      });
      
      // Find common content based on composite keys
      const commonContent = new Set([...blockCompositeKeys1].filter(key => blockCompositeKeys2.has(key)));
      const contentUniqueToFirst = new Set([...blockCompositeKeys1].filter(key => !blockCompositeKeys2.has(key)));
      const contentUniqueToSecond = new Set([...blockCompositeKeys2].filter(key => !blockCompositeKeys1.has(key)));
      
      // Calculate Jaccard similarity for content
      const contentUnion = new Set([...blockCompositeKeys1, ...blockCompositeKeys2]);
      const contentJaccardSimilarity = contentUnion.size > 0 ? commonContent.size / contentUnion.size : 0;
      
      report.content_comparison[`${platform1}_vs_${platform2}`] = {
        common_blocks: commonContent.size,
        unique_to_1: contentUniqueToFirst.size,
        unique_to_2: contentUniqueToSecond.size,
        jaccard_similarity: contentJaccardSimilarity
      };
      
      console.log(`${platform1} vs ${platform2} normalized comparison: ${commonContent.size} common blocks, similarity: ${contentJaccardSimilarity.toFixed(4)}`);
      
      // Add sample of unique blocks for visualization
      if (contentUniqueToFirst.size > 0 || contentUniqueToSecond.size > 0) {
        report.content_comparison[`${platform1}_vs_${platform2}`].examples = {
          unique_to_1: Array.from(contentUniqueToFirst).slice(0, 5).map(compositeKey => {
            const parts = compositeKey.split(':');
            return { 
              number: parts[0],
              hash: parts[1],
              parentHash: parts[2],
              timestamp: parts[3]
            };
          }),
          unique_to_2: Array.from(contentUniqueToSecond).slice(0, 5).map(compositeKey => {
            const parts = compositeKey.split(':');
            return { 
              number: parts[0],
              hash: parts[1],
              parentHash: parts[2],
              timestamp: parts[3]
            };
          })
        };
      }
    }
  }
  
  // Save the report to a file
  const reportPath = path.join(__dirname, `parquet-blocks-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Blocks comparison report saved to ${reportPath}`);
  
  return report;
}

// Generate visualization data and reports
async function generateVisualization(reportData) {
  console.log('Generating visualization data...');
  
  const platformData = {};
  
  // Process each platform
  for (const platform of platforms) {
    console.log(`Processing ${platform} for visualization...`);
    const platformFile = platformFiles.blocks[platform];
    
    if (!fs.existsSync(platformFile)) {
      console.warn(`No file found for ${platform}, skipping visualization`);
      continue;
    }
    
    const blockNumbers = await readAllBlockNumbers(platform, platformFile);
    
    if (blockNumbers.length === 0) {
      console.warn(`No blocks found for ${platform}, skipping`);
      continue;
    }
    
    const minBlock = Math.min(...blockNumbers);
    const maxBlock = Math.max(...blockNumbers);
    const distribution = analyzeDistribution(blockNumbers, bucketSize);
    
    platformData[platform] = {
      totalBlocks: blockNumbers.length,
      minBlock,
      maxBlock,
      distribution
    };
    
    console.log(`  - ${platform}: ${blockNumbers.length} blocks (min: ${minBlock}, max: ${maxBlock})`);
  }
  
  // Generate and save CSV
  const csv = generateCSV(platformData);
  fs.writeFileSync(path.join(outputDir, 'block-distribution.csv'), csv);
  console.log(`CSV saved to ${path.join(outputDir, 'block-distribution.csv')}`);
  
  // Generate and save HTML report
  const html = generateHTMLReport(platformData, reportData);
  fs.writeFileSync(path.join(outputDir, 'coverage-report.html'), html);
  console.log(`HTML report saved to ${path.join(outputDir, 'coverage-report.html')}`);
  
  console.log('Visualization generation completed!');
}

// Run the comparison
generateComparisonReport().catch(error => {
  console.error('Error in comparison process:', error);
}); 