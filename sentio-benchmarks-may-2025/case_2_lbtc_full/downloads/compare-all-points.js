const fs = require('fs');
const path = require('path');
const parquet = require('parquetjs');

// Helper function to calculate ranks
function calculateRanks(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const ranks = new Map();
  let currentRank = 1;
  let currentValue = sorted[0];
  let count = 1;

  for (let i = 1; i <= sorted.length; i++) {
    if (i === sorted.length || sorted[i] !== currentValue) {
      const rank = currentRank + (count - 1) / 2;
      for (let j = i - count; j < i; j++) {
        ranks.set(sorted[j], rank);
      }
      if (i < sorted.length) {
        currentValue = sorted[i];
        currentRank = i + 1;
        count = 1;
      }
    } else {
      count++;
    }
  }

  return values.map(v => ranks.get(v));
}

async function readParquetFile(filePath) {
  const reader = await parquet.ParquetReader.openFile(filePath);
  const cursor = reader.getCursor();
  const points = new Map();
  
  let record = null;
  while (record = await cursor.next()) {
    // Normalize ID to lowercase
    const normalizedId = record.id.toLowerCase();
    points.set(normalizedId, {
      point: parseFloat(record.point),
      balance: record.balance,
      timestamp: record.timestamp,
      originalId: record.id // Keep original ID for reference
    });
  }
  
  await reader.close();
  return points;
}

async function compareAllPoints() {
  const dataDir = path.join(__dirname, '..', 'data');
  
  // Read points from all platforms
  console.log('Reading points from all platforms...');
  const [subgraphPoints, ponderPoints, sentioBIPoints, sentioTIPoints, envioPoints] = await Promise.all([
    readParquetFile(path.join(dataDir, 'subgraph-case2-accounts.parquet')),
    readParquetFile(path.join(dataDir, 'ponder-case2-accounts.parquet')),
    readParquetFile(path.join(dataDir, 'sentio-case2-accounts-bi.parquet')),
    readParquetFile(path.join(dataDir, 'sentio-case2-accounts-ti.parquet')),
    readParquetFile(path.join(dataDir, 'envio-case2-accounts.parquet'))
  ]);

  // Get all unique account IDs (already normalized to lowercase)
  const allAccounts = new Set([
    ...subgraphPoints.keys(),
    ...ponderPoints.keys(),
    ...sentioBIPoints.keys(),
    ...sentioTIPoints.keys(),
    ...envioPoints.keys()
  ]);

  // Prepare data for correlation analysis
  const platforms = {
    'Subgraph': subgraphPoints,
    'Ponder': ponderPoints,
    'Sentio BI': sentioBIPoints,
    'Sentio TI': sentioTIPoints,
    'Envio': envioPoints
  };

  // Calculate correlations and prepare data for visualization
  const pearsonMatrix = {};
  const spearmanMatrix = {};

  for (const platform1 of Object.keys(platforms)) {
    pearsonMatrix[platform1] = {};
    spearmanMatrix[platform1] = {};
    
    for (const platform2 of Object.keys(platforms)) {
      // Prepare data for both correlations
      const points1 = [];
      const points2 = [];
      
      for (const accountId of allAccounts) {
        const point1 = platforms[platform1].get(accountId)?.point || 0;
        const point2 = platforms[platform2].get(accountId)?.point || 0;
        
        if (point1 > 0 || point2 > 0) {
          points1.push(point1);
          points2.push(point2);
        }
      }

      // Log transform the points for Pearson correlation to handle large numbers better
      const logPoints1 = points1.map(p => Math.log(p + 1)); // +1 to handle zero values
      const logPoints2 = points2.map(p => Math.log(p + 1));

      // Calculate Pearson correlation using log-transformed values
      let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0;
      const n = logPoints1.length;
      
      for (let i = 0; i < n; i++) {
        sum1 += logPoints1[i];
        sum2 += logPoints2[i];
        sum1Sq += logPoints1[i] * logPoints1[i];
        sum2Sq += logPoints2[i] * logPoints2[i];
        pSum += logPoints1[i] * logPoints2[i];
      }

      const num = pSum - (sum1 * sum2 / n);
      const den = Math.sqrt((sum1Sq - sum1 * sum1 / n) * (sum2Sq - sum2 * sum2 / n));
      const pearsonCorrelation = den === 0 ? 0 : num / den;
      
      // Calculate Spearman correlation using original values
      const ranks1 = calculateRanks(points1);
      const ranks2 = calculateRanks(points2);
      
      let rankSum1 = 0, rankSum2 = 0, rankSum1Sq = 0, rankSum2Sq = 0, rankPSum = 0;
      
      for (let i = 0; i < n; i++) {
        rankSum1 += ranks1[i];
        rankSum2 += ranks2[i];
        rankSum1Sq += ranks1[i] * ranks1[i];
        rankSum2Sq += ranks2[i] * ranks2[i];
        rankPSum += ranks1[i] * ranks2[i];
      }

      const rankNum = rankPSum - (rankSum1 * rankSum2 / n);
      const rankDen = Math.sqrt((rankSum1Sq - rankSum1 * rankSum1 / n) * (rankSum2Sq - rankSum2 * rankSum2 / n));
      const spearmanCorrelation = rankDen === 0 ? 0 : rankNum / rankDen;
      
      // Debug output for first few comparisons
      if (platform1 === 'Subgraph' && platform2 === 'Sentio BI') {
        console.log('\nDebug correlation calculation:');
        console.log(`Number of points: ${n}`);
        console.log(`Sample points (first 3):`);
        console.log(`Platform 1: ${points1.slice(0, 3).map(p => p.toExponential(2)).join(', ')}`);
        console.log(`Platform 2: ${points2.slice(0, 3).map(p => p.toExponential(2)).join(', ')}`);
        console.log(`Log-transformed (first 3):`);
        console.log(`Platform 1: ${logPoints1.slice(0, 3).map(p => p.toFixed(2)).join(', ')}`);
        console.log(`Platform 2: ${logPoints2.slice(0, 3).map(p => p.toFixed(2)).join(', ')}`);
        console.log(`Pearson correlation: ${pearsonCorrelation.toFixed(4)}`);
        console.log(`Spearman correlation: ${spearmanCorrelation.toFixed(4)}`);
      }
      
      pearsonMatrix[platform1][platform2] = pearsonCorrelation;
      spearmanMatrix[platform1][platform2] = spearmanCorrelation;
    }
  }

  // Generate HTML with visualizations
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Points Comparison Across Platforms</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .chart-container {
            margin: 20px 0;
            height: 400px;
        }
        .correlation-matrix {
            margin: 20px 0;
            border-collapse: collapse;
            width: 100%;
        }
        .correlation-matrix th, .correlation-matrix td {
            padding: 8px;
            text-align: center;
            border: 1px solid #ddd;
        }
        .correlation-matrix th {
            background-color: #f8f9fa;
        }
        .correlation-matrix td {
            background-color: rgba(54, 162, 235, 0.1);
        }
        .correlation-matrix td:hover {
            background-color: rgba(54, 162, 235, 0.2);
        }
        .summary {
            margin: 20px 0;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 4px;
        }
        .matrix-container {
            display: flex;
            gap: 20px;
            margin: 20px 0;
        }
        .matrix-container > div {
            flex: 1;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Points Comparison Across Platforms</h1>
        
        <div class="summary">
            <h2>Summary</h2>
            <p>Total unique accounts (case-insensitive): ${allAccounts.size}</p>
            <p>Note: Account IDs have been normalized to lowercase for comparison</p>
        </div>

        <div class="matrix-container">
            <div>
                <h2>Pearson Correlation Matrix</h2>
                <p>Measures linear correlation between platforms</p>
                <table class="correlation-matrix">
                    <tr>
                        <th></th>
                        ${Object.keys(platforms).map(p => `<th>${p}</th>`).join('')}
                    </tr>
                    ${Object.keys(platforms).map(p1 => `
                        <tr>
                            <th>${p1}</th>
                            ${Object.keys(platforms).map(p2 => `
                                <td>${pearsonMatrix[p1][p2].toFixed(4)}</td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
            
            <div>
                <h2>Spearman Rank Correlation Matrix</h2>
                <p>Measures monotonic correlation between platforms</p>
                <table class="correlation-matrix">
                    <tr>
                        <th></th>
                        ${Object.keys(platforms).map(p => `<th>${p}</th>`).join('')}
                    </tr>
                    ${Object.keys(platforms).map(p1 => `
                        <tr>
                            <th>${p1}</th>
                            ${Object.keys(platforms).map(p2 => `
                                <td>${spearmanMatrix[p1][p2].toFixed(4)}</td>
                            `).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
        </div>

        <h2>Points Distribution</h2>
        <div class="chart-container">
            <canvas id="pointsChart"></canvas>
        </div>
    </div>

    <script>
        const ctx = document.getElementById('pointsChart').getContext('2d');
        new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: ${JSON.stringify(Object.keys(platforms).map((platform, index) => {
                    // Get all points for this platform and sort them
                    const platformData = Array.from(allAccounts)
                        .map(accountId => {
                            const point = platforms[platform].get(accountId)?.point || 0;
                            return { 
                                x: accountId,
                                y: point,
                                originalId: platforms[platform].get(accountId)?.originalId || accountId
                            };
                        })
                        .filter(d => d.y > 0)
                        .sort((a, b) => b.y - a.y); // Sort by point value in descending order

                    return {
                        label: platform,
                        data: platformData,
                        backgroundColor: [
                            'rgba(54, 162, 235, 0.5)',
                            'rgba(255, 99, 132, 0.5)',
                            'rgba(75, 192, 192, 0.5)',
                            'rgba(153, 102, 255, 0.5)',
                            'rgba(255, 159, 64, 0.5)'
                        ][index],
                        borderColor: [
                            'rgba(54, 162, 235, 1)',
                            'rgba(255, 99, 132, 1)',
                            'rgba(75, 192, 192, 1)',
                            'rgba(153, 102, 255, 1)',
                            'rgba(255, 159, 64, 1)'
                        ][index],
                        borderWidth: 1
                    };
                }))}
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'category',
                        title: {
                            display: true,
                            text: 'Account ID (lowercase)'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Points'
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const data = context.dataset.data[context.dataIndex];
                                return [
                                    \`Platform: \${context.dataset.label}\`,
                                    \`Original ID: \${data.originalId}\`,
                                    \`Points: \${data.y.toFixed(2)}\`
                                ];
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>
  `;

  // Write HTML file
  const outputPath = path.join(dataDir, 'points-comparison-all.html');
  fs.writeFileSync(outputPath, html);
  console.log(`Comparison generated at: ${outputPath}`);

  // Print summary statistics
  console.log('\nSummary Statistics:');
  console.log('==================');
  console.log(`Total unique accounts (case-insensitive): ${allAccounts.size}`);
  
  console.log('\nPearson Correlation Matrix (Linear Correlation):');
  Object.keys(pearsonMatrix).forEach(p1 => {
    console.log(`${p1}:`);
    Object.keys(pearsonMatrix[p1]).forEach(p2 => {
      console.log(`  ${p2}: ${pearsonMatrix[p1][p2].toFixed(4)}`);
    });
  });

  console.log('\nSpearman Rank Correlation Matrix (Monotonic Correlation):');
  Object.keys(spearmanMatrix).forEach(p1 => {
    console.log(`${p1}:`);
    Object.keys(spearmanMatrix[p1]).forEach(p2 => {
      console.log(`  ${p2}: ${spearmanMatrix[p1][p2].toFixed(4)}`);
    });
  });
}

// Run the comparison
compareAllPoints().catch(error => {
  console.error('Error during comparison:', error);
  process.exit(1);
}); 