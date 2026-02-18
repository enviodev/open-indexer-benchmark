// Script to fetch transaction gas data from Sentio
const fs = require('fs');
const path = require('path');
const https = require('https');

// Configuration
const API_KEY = 'hnZ7Z8cRsoxRadrVdhih2jRjBlH0lIYWl';
const PROJECT = 'yufei/case_1_lbtc_event_only';
const SQL_QUERY = 'SELECT * FROM transfers LIMIT 5000';
const OUTPUT_FILE = path.join(__dirname, 'sentio-data.json');

// Function to make HTTPS request
function makeRequest(options, requestData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (requestData) {
      req.write(requestData);
    }
    
    req.end();
  });
}

// Main function to fetch data
async function fetchSentioData() {
  try {
    console.log('Fetching data from Sentio...');
    
    const options = {
      hostname: 'app.sentio.xyz',
      path: `/api/v1/analytics/${PROJECT}/sql/execute`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': API_KEY
      }
    };
    
    const requestData = JSON.stringify({
      sqlQuery: {
        sql: SQL_QUERY
      }
    });
    
    const result = await makeRequest(options, requestData);
    
    // Save to file
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
    console.log(`Data saved to ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('Error fetching data:', error.message);
  }
}

// Run the script
fetchSentioData(); 