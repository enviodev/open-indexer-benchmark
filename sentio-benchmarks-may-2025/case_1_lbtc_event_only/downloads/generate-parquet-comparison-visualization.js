const fs = require('fs');
const path = require('path');

// Read the JSON report
const reportPath = path.join(__dirname, 'parquet-comparison-report.json');
const outputPath = path.join(__dirname, 'parquet-comparison-report.html');

// Generate HTML from the report data
function generateHTML() {
  try {
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Indexer Benchmark Comparison</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
      line-height: 1.6;
    }
    h1, h2, h3 {
      margin-top: 20px;
      margin-bottom: 10px;
      color: #1a73e8;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f7f7f7;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .success {
      color: #28a745;
    }
    .failure {
      color: #dc3545;
    }
    .platform-comparison {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
    }
    .heat-table {
      border-collapse: collapse;
      width: 100%;
    }
    .heat-table td {
      height: 50px;
      text-align: center;
      vertical-align: middle;
      font-weight: bold;
      color: white;
    }
    .timestamp {
      font-size: 0.9em;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Indexer Benchmark Comparison Report</h1>
    <p class="timestamp">Generated on: ${new Date(reportData.timestamp).toLocaleString()}</p>
    
    <div class="card">
      <h2>Record Counts</h2>
      <table>
        <tr>
          <th>Platform</th>
          <th>Record Count</th>
          <th>Status</th>
        </tr>
        ${Object.entries(reportData.data_counts).map(([platform, data]) => `
          <tr>
            <td>${platform}</td>
            <td>${data.count}</td>
            <td class="${data.success ? 'success' : 'failure'}">${data.success ? 'Success' : 'Failed'}</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="card">
      <h2>Platform Statistics</h2>
      <table>
        <tr>
          <th>Platform</th>
          <th>Unique Blocks</th>
          <th>Unique Transactions</th>
          <th>Min Block</th>
          <th>Max Block</th>
          <th>Block Range</th>
        </tr>
        ${Object.keys(reportData.data_counts).map(platform => `
          <tr>
            <td>${platform}</td>
            <td>${reportData.unique_counts[platform].blocks}</td>
            <td>${reportData.unique_counts[platform].transactions}</td>
            <td>${reportData.block_ranges[platform].min || 'N/A'}</td>
            <td>${reportData.block_ranges[platform].max || 'N/A'}</td>
            <td>${reportData.block_ranges[platform].count}</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="card">
      <h2>Consistency Analysis</h2>
      <p>The heatmap below shows the Jaccard similarity between platforms (0 = no overlap, 1 = perfect match)</p>
      
      <table class="heat-table">
        <tr>
          <th></th>
          ${Object.keys(reportData.data_counts).map(platform => `<th>${platform}</th>`).join('')}
        </tr>
        ${Object.keys(reportData.data_counts).map(platform1 => `
          <tr>
            <th>${platform1}</th>
            ${Object.keys(reportData.data_counts).map(platform2 => {
              const key1 = `${platform1}_vs_${platform2}`;
              const key2 = `${platform2}_vs_${platform1}`;
              
              if (platform1 === platform2) {
                return `<td style="background-color: rgb(0, 128, 0);">1.00</td>`;
              } else if (reportData.consistency[key1]) {
                const similarity = reportData.consistency[key1].jaccard_similarity;
                const red = Math.floor(255 * (1 - similarity));
                const green = Math.floor(255 * similarity);
                return `<td style="background-color: rgb(${red}, ${green}, 0);">${similarity.toFixed(2)}</td>`;
              } else if (reportData.consistency[key2]) {
                const similarity = reportData.consistency[key2].jaccard_similarity;
                const red = Math.floor(255 * (1 - similarity));
                const green = Math.floor(255 * similarity);
                return `<td style="background-color: rgb(${red}, ${green}, 0);">${similarity.toFixed(2)}</td>`;
              } else {
                return `<td style="background-color: #888;">N/A</td>`;
              }
            }).join('')}
          </tr>
        `).join('')}
      </table>
    </div>

    ${reportData.content_comparison ? `
    <div class="card">
      <h2>Content-Based Comparison</h2>
      <p>This analysis compares platforms based on the actual transfer content (from, to, value) without relying on transaction hashes or block numbers.</p>
      
      <table class="heat-table">
        <tr>
          <th></th>
          ${Object.keys(reportData.data_counts).map(platform => `<th>${platform}</th>`).join('')}
        </tr>
        ${Object.keys(reportData.data_counts).map(platform1 => `
          <tr>
            <th>${platform1}</th>
            ${Object.keys(reportData.data_counts).map(platform2 => {
              const key1 = `${platform1}_vs_${platform2}`;
              const key2 = `${platform2}_vs_${platform1}`;
              
              if (platform1 === platform2) {
                return `<td style="background-color: rgb(0, 128, 0);">1.00</td>`;
              } else if (reportData.content_comparison && reportData.content_comparison[key1]) {
                const similarity = reportData.content_comparison[key1].jaccard_similarity;
                const red = Math.floor(255 * (1 - similarity));
                const green = Math.floor(255 * similarity);
                return `<td style="background-color: rgb(${red}, ${green}, 0);">${similarity.toFixed(2)}</td>`;
              } else if (reportData.content_comparison && reportData.content_comparison[key2]) {
                const similarity = reportData.content_comparison[key2].jaccard_similarity;
                const red = Math.floor(255 * (1 - similarity));
                const green = Math.floor(255 * similarity);
                return `<td style="background-color: rgb(${red}, ${green}, 0);">${similarity.toFixed(2)}</td>`;
              } else {
                return `<td style="background-color: #888;">N/A</td>`;
              }
            }).join('')}
          </tr>
        `).join('')}
      </table>
      
      <h3>Detailed Content Comparison</h3>
      <div class="platform-comparison">
        ${Object.entries(reportData.content_comparison).map(([comparison, data]) => {
          const [platform1, platform2] = comparison.split('_vs_');
          return `
            <div class="card">
              <h3>${platform1} vs ${platform2}</h3>
              <table>
                <tr><td>Common Transfers (matching from/to/value):</td><td>${data.common_transfers}</td></tr>
                <tr><td>Unique to ${platform1}:</td><td>${data.unique_to_1}</td></tr>
                <tr><td>Unique to ${platform2}:</td><td>${data.unique_to_2}</td></tr>
                <tr><td>Content Similarity:</td><td>${data.jaccard_similarity.toFixed(4)}</td></tr>
              </table>
              
              ${data.examples ? `
                <h4>Sample of Unique Transfers</h4>
                ${data.examples.unique_to_1.length > 0 ? `
                  <h5>Unique to ${platform1}</h5>
                  <table>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Value</th>
                    </tr>
                    ${data.examples.unique_to_1.map(transfer => `
                      <tr>
                        <td>${transfer.from.substring(0, 10)}...</td>
                        <td>${transfer.to.substring(0, 10)}...</td>
                        <td>${transfer.value}</td>
                      </tr>
                    `).join('')}
                  </table>
                ` : ''}
                
                ${data.examples.unique_to_2.length > 0 ? `
                  <h5>Unique to ${platform2}</h5>
                  <table>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Value</th>
                    </tr>
                    ${data.examples.unique_to_2.map(transfer => `
                      <tr>
                        <td>${transfer.from.substring(0, 10)}...</td>
                        <td>${transfer.to.substring(0, 10)}...</td>
                        <td>${transfer.value}</td>
                      </tr>
                    `).join('')}
                  </table>
                ` : ''}
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <div class="card">
      <h2>Detailed Comparisons</h2>
      <div class="platform-comparison">
        ${Object.entries(reportData.consistency).map(([comparison, data]) => {
          const [platform1, platform2] = comparison.split('_vs_');
          return `
            <div class="card">
              <h3>${platform1} vs ${platform2}</h3>
              <table>
                <tr><td>Common Transactions:</td><td>${data.common_transactions}</td></tr>
                <tr><td>Unique to ${platform1}:</td><td>${data.unique_to_1}</td></tr>
                <tr><td>Unique to ${platform2}:</td><td>${data.unique_to_2}</td></tr>
                <tr><td>Jaccard Similarity:</td><td>${data.jaccard_similarity.toFixed(4)}</td></tr>
              </table>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    ${reportData.field_comparisons ? `
    <div class="card">
      <h2>Field-by-Field Comparisons</h2>
      <p>This section shows detailed comparisons of individual fields across records with matching transaction hashes.</p>
      
      <table>
        <tr>
          <th>Comparison</th>
          <th>blockNumber Match</th>
          <th>from Match</th>
          <th>to Match</th>
          <th>value Match</th>
        </tr>
        ${Object.entries(reportData.field_comparisons).map(([comparison, data]) => {
          const [platform1, platform2] = comparison.split('_vs_');
          return `
            <tr>
              <td><strong>${platform1} vs ${platform2}</strong></td>
              <td>${data.blockNumber_match_percent} (${data.blockNumber_matches}/${data.blockNumber_matches + data.blockNumber_mismatches})</td>
              <td>${data.from_match_percent} (${data.from_matches}/${data.from_matches + data.from_mismatches})</td>
              <td>${data.to_match_percent} (${data.to_matches}/${data.to_matches + data.to_mismatches})</td>
              <td>${data.value_match_percent} (${data.value_matches}/${data.value_matches + data.value_mismatches})</td>
            </tr>
          `;
        }).join('')}
      </table>
      
      <h3>Mismatch Examples</h3>
      ${Object.entries(reportData.field_comparisons).map(([comparison, data]) => {
        const [platform1, platform2] = comparison.split('_vs_');
        
        if (!data.examples || data.examples.length === 0) {
          return `<div class="card">
            <h4>${platform1} vs ${platform2}</h4>
            <p>No mismatches found in sample.</p>
          </div>`;
        }
        
        return `
          <div class="card">
            <h4>${platform1} vs ${platform2}</h4>
            ${data.examples.map((example, i) => `
              <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                <p><strong>Example ${i+1}:</strong> Transaction Hash: ${example.txHash.substring(0, 10)}...</p>
                <table>
                  <tr>
                    <th>Field</th>
                    <th>${platform1}</th>
                    <th>${platform2}</th>
                    <th>Match</th>
                  </tr>
                  <tr>
                    <td>blockNumber</td>
                    <td>${example[platform1].blockNumber || 'null'}</td>
                    <td>${example[platform2].blockNumber || 'null'}</td>
                    <td>${example[platform1].blockNumber === example[platform2].blockNumber ? '✓' : '✗'}</td>
                  </tr>
                  <tr>
                    <td>from</td>
                    <td>${example[platform1].from || 'null'}</td>
                    <td>${example[platform2].from || 'null'}</td>
                    <td>${example[platform1].from === example[platform2].from ? '✓' : '✗'}</td>
                  </tr>
                  <tr>
                    <td>to</td>
                    <td>${example[platform1].to || 'null'}</td>
                    <td>${example[platform2].to || 'null'}</td>
                    <td>${example[platform1].to === example[platform2].to ? '✓' : '✗'}</td>
                  </tr>
                  <tr>
                    <td>value</td>
                    <td>${example[platform1].value || 'null'}</td>
                    <td>${example[platform2].value || 'null'}</td>
                    <td>${example[platform1].value === example[platform2].value ? '✓' : '✗'}</td>
                  </tr>
                </table>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}
  </div>
</body>
</html>
    `;
    
    fs.writeFileSync(outputPath, html);
    console.log(`Visualization saved to ${outputPath}`);
    
  } catch (error) {
    console.error('Error generating visualization:', error);
  }
}

generateHTML(); 