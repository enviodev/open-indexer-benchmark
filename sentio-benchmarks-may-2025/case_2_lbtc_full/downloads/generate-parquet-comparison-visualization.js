const fs = require('fs');
const path = require('path');

// Function to generate HTML for a specific data type report
function generateReportHTML(dataType) {
  // Read the JSON report
  const reportPath = path.join(__dirname, `parquet-${dataType}-report.json`);
  const outputPath = path.join(__dirname, `parquet-${dataType}-report.html`);

  try {
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Case 2 ${dataType.charAt(0).toUpperCase() + dataType.slice(1)} Comparison</title>
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
    <h1>Case 2 ${dataType.charAt(0).toUpperCase() + dataType.slice(1)} Comparison Report</h1>
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
          <th>Unique Entities</th>
        </tr>
        ${Object.keys(reportData.data_counts).map(platform => `
          <tr>
            <td>${platform}</td>
            <td>${reportData.unique_counts[platform]?.entities || 'N/A'}</td>
          </tr>
        `).join('')}
      </table>
    </div>

    <div class="card">
      <h2>Content-Based Comparison</h2>
      <p>This analysis compares platforms based on the actual ${dataType} content without relying on record IDs.</p>
      
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
        ${Object.entries(reportData.content_comparison || {}).map(([comparison, data]) => {
          const [platform1, platform2] = comparison.split('_vs_');
          return `
            <div class="card">
              <h3>${platform1} vs ${platform2}</h3>
              <table>
                <tr><td>Common Records (matching content):</td><td>${data.common_records}</td></tr>
                <tr><td>Unique to ${platform1}:</td><td>${data.unique_to_1}</td></tr>
                <tr><td>Unique to ${platform2}:</td><td>${data.unique_to_2}</td></tr>
                <tr><td>Content Similarity:</td><td>${data.jaccard_similarity.toFixed(4)}</td></tr>
              </table>
              
              ${data.examples ? `
                <h4>Sample of Unique Records</h4>
                ${data.examples.unique_to_1.length > 0 ? `
                  <h5>Unique to ${platform1}</h5>
                  <table>
                    <tr>
                      ${dataType === 'transfers' ? `
                        <th>From</th>
                        <th>To</th>
                        <th>Value</th>
                      ` : `
                        <th>ID</th>
                        <th>Balance</th>
                      `}
                    </tr>
                    ${data.examples.unique_to_1.map(record => {
                      if (dataType === 'transfers') {
                        return `
                          <tr>
                            <td>${record.from.substring(0, 10)}...</td>
                            <td>${record.to.substring(0, 10)}...</td>
                            <td>${record.value}</td>
                          </tr>
                        `;
                      } else {
                        return `
                          <tr>
                            <td>${record.id.substring(0, 10)}...</td>
                            <td>${record.balance}</td>
                          </tr>
                        `;
                      }
                    }).join('')}
                  </table>
                ` : ''}
                
                ${data.examples.unique_to_2.length > 0 ? `
                  <h5>Unique to ${platform2}</h5>
                  <table>
                    <tr>
                      ${dataType === 'transfers' ? `
                        <th>From</th>
                        <th>To</th>
                        <th>Value</th>
                      ` : `
                        <th>ID</th>
                        <th>Balance</th>
                      `}
                    </tr>
                    ${data.examples.unique_to_2.map(record => {
                      if (dataType === 'transfers') {
                        return `
                          <tr>
                            <td>${record.from.substring(0, 10)}...</td>
                            <td>${record.to.substring(0, 10)}...</td>
                            <td>${record.value}</td>
                          </tr>
                        `;
                      } else {
                        return `
                          <tr>
                            <td>${record.id.substring(0, 10)}...</td>
                            <td>${record.balance}</td>
                          </tr>
                        `;
                      }
                    }).join('')}
                  </table>
                ` : ''}
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  </div>
</body>
</html>
    `;
    
    fs.writeFileSync(outputPath, html);
    console.log(`Visualization saved to ${outputPath}`);
    
  } catch (error) {
    console.error(`Error generating visualization for ${dataType}:`, error);
  }
}

// Generate HTML reports for both transfers and accounts
generateReportHTML('transfers');
generateReportHTML('accounts'); 