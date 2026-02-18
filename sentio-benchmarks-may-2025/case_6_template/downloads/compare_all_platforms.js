const parquet = require('parquetjs');
const fs = require('fs');
const path = require('path');

// Configuration
const PLATFORMS = ['ponder', 'subgraph', 'sentio', 'sqd', 'envio'];
const DATA_DIR = path.join(__dirname, '..', 'data');

async function readParquetFile(platform, type = 'swaps') {
    const filePath = path.join(__dirname, '..', 'data', `${platform}_${type}.parquet`);
    
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return { data: [] };
    }

    try {
        const reader = await parquet.ParquetReader.openFile(filePath);
        const cursor = reader.getCursor();
        const records = [];
        let record = null;

        try {
            while (record = await cursor.next()) {
                records.push(record);
            }
        } catch (error) {
            console.error(`Error reading records from ${filePath}:`, error);
        }

        await reader.close();
        console.log(`Read ${records.length} records from ${filePath}`);
        return { data: records };
    } catch (error) {
        console.error(`Error opening parquet file ${filePath}:`, error);
        return { data: [] };
    }
}

function formatNumber(num) {
    if (typeof num !== 'number') return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

function normalizeHash(hash) {
    return (hash || '').toLowerCase().replace('0x', '');
}

function analyzeDataset(records, platform) {
    if (!records || records.length === 0) {
        return {
            platform,
            totalSwaps: 0,
            timeRange: { min: null, max: null },
            blockRange: { min: null, max: null },
            volumes: {
                amount0In: 0,
                amount0Out: 0,
                amount1In: 0,
                amount1Out: 0
            },
            uniquePairs: 0,
            uniqueSenders: 0,
            uniqueRecipients: 0
        };
    }

    const volumes = {
        amount0In: 0,
        amount0Out: 0,
        amount1In: 0,
        amount1Out: 0
    };

    const uniquePairs = new Set();
    const uniqueSenders = new Set();
    const uniqueRecipients = new Set();
    let minBlock = Infinity;
    let maxBlock = -Infinity;
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const record of records) {
        // Accumulate volumes
        volumes.amount0In += Number(record.amount0In || 0);
        volumes.amount0Out += Number(record.amount0Out || 0);
        volumes.amount1In += Number(record.amount1In || 0);
        volumes.amount1Out += Number(record.amount1Out || 0);

        // Track unique entities
        if (record.pair) uniquePairs.add(record.pair);
        if (record.pairId) uniquePairs.add(record.pairId);
        if (record.sender) uniqueSenders.add(record.sender);
        // Handle different field names for recipient
        const recipient = platform === 'sentio' ? record.to__ : record.to;
        if (recipient) uniqueRecipients.add(recipient);

        // Track ranges
        const blockNum = Number(record.blockNumber || record.createdAt || 0);
        let timestamp = Number(record.timestamp || 0);
        
        // Convert timestamps to milliseconds if needed
        if (timestamp > 0) {
            // If timestamp is in seconds (less than 1e10), convert to milliseconds
            if (timestamp < 1e10) {
                timestamp *= 1000;
            }
        }
        
        if (!isNaN(blockNum)) {
            minBlock = Math.min(minBlock, blockNum);
            maxBlock = Math.max(maxBlock, blockNum);
        }
        
        if (!isNaN(timestamp) && timestamp > 0) {
            minTime = Math.min(minTime, timestamp);
            maxTime = Math.max(maxTime, timestamp);
        }
    }

    return {
        platform,
        totalSwaps: records.length,
        timeRange: {
            min: minTime !== Infinity ? new Date(minTime).toISOString() : null,
            max: maxTime !== -Infinity ? new Date(maxTime).toISOString() : null
        },
        blockRange: {
            min: minBlock !== Infinity ? minBlock : null,
            max: maxBlock !== -Infinity ? maxBlock : null
        },
        volumes,
        uniquePairs: uniquePairs.size,
        uniqueSenders: uniqueSenders.size,
        uniqueRecipients: uniqueRecipients.size
    };
}

function analyzePairs(records, platform) {
    if (!records || records.length === 0) {
        return {
            platform,
            totalPairs: 0,
            uniqueTokens: new Set(),
            uniqueFactories: new Set(),
            blockRange: { min: null, max: null }
        };
    }

    const uniqueTokens = new Set();
    const uniqueFactories = new Set();
    let minBlock = Infinity;
    let maxBlock = -Infinity;

    for (const record of records) {
        if (record.token0) uniqueTokens.add(record.token0);
        if (record.token1) uniqueTokens.add(record.token1);
        if (record.factory) uniqueFactories.add(record.factory);

        const blockNum = Number(record.blockNumber || record.createdAt || 0);
        if (!isNaN(blockNum)) {
            minBlock = Math.min(minBlock, blockNum);
            maxBlock = Math.max(maxBlock, blockNum);
        }
    }

    return {
        platform,
        totalPairs: records.length,
        uniqueTokens: uniqueTokens.size,
        uniqueFactories: uniqueFactories.size,
        blockRange: {
            min: minBlock !== Infinity ? minBlock : null,
            max: maxBlock !== -Infinity ? maxBlock : null
        }
    };
}

// Function to generate a unique key for a swap
function getSwapKey(record) {
    // Use blockNumber, pair, and amounts to create a unique identifier
    const blockNumber = record.blockNumber || record.createdAt || 0;
    const pair = record.pair || record.pairId || '';
    const amounts = [
        record.amount0In || 0,
        record.amount0Out || 0,
        record.amount1In || 0,
        record.amount1Out || 0
    ].map(n => Number(n).toString()).join('_');
    
    return `${blockNumber}_${normalizeHash(pair)}_${amounts}`;
}

// Function to generate a unique key for a pair
function getPairKey(record) {
    const token0 = normalizeHash(record.token0 || '');
    const token1 = normalizeHash(record.token1 || '');
    return `${token0}_${token1}`;
}

// Function to compare two platforms
function comparePlatforms(data1, data2) {
    if (!data1.data || !data2.data) {
        return {
            commonSwaps: 0,
            uniqueToFirst: 0,
            uniqueToSecond: 0,
            jaccardSimilarity: 0
        };
    }

    const swapKeys1 = new Set(data1.data.map(getSwapKey));
    const swapKeys2 = new Set(data2.data.map(getSwapKey));

    const commonSwaps = new Set([...swapKeys1].filter(x => swapKeys2.has(x)));
    const uniqueToFirst = new Set([...swapKeys1].filter(x => !swapKeys2.has(x)));
    const uniqueToSecond = new Set([...swapKeys2].filter(x => !swapKeys1.has(x)));

    const jaccardSimilarity = commonSwaps.size / (swapKeys1.size + swapKeys2.size - commonSwaps.size);

    return {
        commonSwaps: commonSwaps.size,
        uniqueToFirst: uniqueToFirst.size,
        uniqueToSecond: uniqueToSecond.size,
        jaccardSimilarity: isNaN(jaccardSimilarity) ? 0 : jaccardSimilarity
    };
}

// Function to compare pairs between two platforms
function comparePairs(data1, data2) {
    if (!data1.data || !data2.data) {
        return {
            commonPairs: 0,
            uniqueToFirst: 0,
            uniqueToSecond: 0,
            jaccardSimilarity: 0
        };
    }

    const pairKeys1 = new Set(data1.data.map(getPairKey));
    const pairKeys2 = new Set(data2.data.map(getPairKey));

    const commonPairs = new Set([...pairKeys1].filter(x => pairKeys2.has(x)));
    const uniqueToFirst = new Set([...pairKeys1].filter(x => !pairKeys2.has(x)));
    const uniqueToSecond = new Set([...pairKeys2].filter(x => !pairKeys1.has(x)));

    const jaccardSimilarity = commonPairs.size / (pairKeys1.size + pairKeys2.size - commonPairs.size);

    return {
        commonPairs: commonPairs.size,
        uniqueToFirst: uniqueToFirst.size,
        uniqueToSecond: uniqueToSecond.size,
        jaccardSimilarity: isNaN(jaccardSimilarity) ? 0 : jaccardSimilarity
    };
}

// Function to find missing pairs between two platforms
function findMissingPairs(platform1Data, platform2Data, platform1Pairs, platform2Pairs) {
    if (!platform1Data.data || !platform2Data.data || !platform1Pairs.data || !platform2Pairs.data) {
        return {
            missing_in_platform2: [],
            missing_in_platform1: []
        };
    }

    const platform1PairKeys = new Set(platform1Pairs.data.map(getPairKey));
    const platform2PairKeys = new Set(platform2Pairs.data.map(getPairKey));

    const missingInPlatform2 = platform1Pairs.data
        .filter(pair => !platform2PairKeys.has(getPairKey(pair)))
        .map(pair => ({
            id: pair.id,
            token0: pair.token0,
            token1: pair.token1,
            createdAt: pair.createdAt
        }));

    const missingInPlatform1 = platform2Pairs.data
        .filter(pair => !platform1PairKeys.has(getPairKey(pair)))
        .map(pair => ({
            id: pair.id,
            token0: pair.token0,
            token1: pair.token1,
            createdAt: pair.createdAt
        }));

    return {
        missing_in_platform2: missingInPlatform2,
        missing_in_platform1: missingInPlatform1
    };
}

function generateHTML(report) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Platform Comparison Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        .chart-container { height: 400px; margin: 20px 0; }
        .comparison-matrix { margin: 20px 0; }
        .platform-card { border: 1px solid #ddd; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .highlight { background-color: #f0f8ff; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Platform Comparison Report</h1>
        <p>Generated on: ${new Date().toISOString()}</p>

        <h2>Overview</h2>
        <table>
            <tr>
                <th>Platform</th>
                <th>Total Swaps</th>
                <th>Unique Pairs (from swaps)</th>
                <th>Unique Tokens (from pairs)</th>
                <th>Unique Senders</th>
                <th>Unique Recipients</th>
            </tr>
            ${Object.entries(report.platforms).map(([platform, data]) => `
                <tr>
                    <td>${platform}</td>
                    <td>${formatNumber(data.totalSwaps)}</td>
                    <td>${formatNumber(data.uniquePairs)}</td>
                    <td class="highlight">${formatNumber(data.pairs.uniqueTokens)}</td>
                    <td>${formatNumber(data.uniqueSenders)}</td>
                    <td>${formatNumber(data.uniqueRecipients)}</td>
                </tr>
            `).join('')}
        </table>

        <h2>Pairs Analysis</h2>
        <table>
            <tr>
                <th>Platform</th>
                <th>Total Pairs</th>
                <th>Unique Tokens</th>
                <th>Unique Factories</th>
            </tr>
            ${Object.entries(report.platforms).map(([platform, data]) => `
                <tr>
                    <td>${platform}</td>
                    <td>${formatNumber(data.pairs.totalPairs)}</td>
                    <td class="highlight">${formatNumber(data.pairs.uniqueTokens)}</td>
                    <td>${formatNumber(data.pairs.uniqueFactories)}</td>
                </tr>
            `).join('')}
        </table>

        <h2>Volume Analysis</h2>
        <div class="chart-container">
            <canvas id="volumeChart"></canvas>
        </div>

        <h2>Platform Comparisons</h2>
        <div class="comparison-matrix">
            ${Object.entries(report.comparisons.swaps).map(([key, comparison]) => `
                <div class="platform-card">
                    <h3>${key}</h3>
                    <table>
                        <tr>
                            <td>Common Swaps:</td>
                            <td>${formatNumber(comparison.commonSwaps)}</td>
                        </tr>
                        <tr>
                            <td>Jaccard Similarity:</td>
                            <td>${(comparison.jaccardSimilarity * 100).toFixed(2)}%</td>
                        </tr>
                    </table>
                </div>
            `).join('')}
        </div>
    </div>

    <script>
        const ctx = document.getElementById('volumeChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ${JSON.stringify(Object.keys(report.platforms))},
                datasets: [
                    {
                        label: 'Amount0In',
                        data: ${JSON.stringify(Object.values(report.platforms).map(p => p.volumes.amount0In))},
                        backgroundColor: 'rgba(54, 162, 235, 0.5)'
                    },
                    {
                        label: 'Amount0Out',
                        data: ${JSON.stringify(Object.values(report.platforms).map(p => p.volumes.amount0Out))},
                        backgroundColor: 'rgba(255, 99, 132, 0.5)'
                    },
                    {
                        label: 'Amount1In',
                        data: ${JSON.stringify(Object.values(report.platforms).map(p => p.volumes.amount1In))},
                        backgroundColor: 'rgba(75, 192, 192, 0.5)'
                    },
                    {
                        label: 'Amount1Out',
                        data: ${JSON.stringify(Object.values(report.platforms).map(p => p.volumes.amount1Out))},
                        backgroundColor: 'rgba(255, 159, 64, 0.5)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    </script>
</body>
</html>`;
}

async function generateReport() {
    console.log('Starting platform comparison analysis...');
    
    const results = {
        timestamp: new Date().toISOString(),
        platforms: {},
        comparisons: {
            swaps: {},
            pairs: {},
            missingPairs: {}
        }
    };

    // Read and analyze swaps data
    for (const platform of PLATFORMS) {
        console.log(`Processing ${platform}...`);
        const { data: swapData } = await readParquetFile(platform, 'swaps');
        const { data: pairData } = await readParquetFile(platform, 'pairs');
        
        console.log(`- Loaded ${swapData.length} records from ${platform}`);
        
        results.platforms[platform] = {
            ...analyzeDataset(swapData, platform),
            pairs: analyzePairs(pairData, platform)
        };
    }

    // Compare platforms and find missing pairs
    for (let i = 0; i < PLATFORMS.length; i++) {
        for (let j = i + 1; j < PLATFORMS.length; j++) {
            const platform1 = PLATFORMS[i];
            const platform2 = PLATFORMS[j];
            
            const swapData1 = await readParquetFile(platform1, 'swaps');
            const swapData2 = await readParquetFile(platform2, 'swaps');
            const pairData1 = await readParquetFile(platform1, 'pairs');
            const pairData2 = await readParquetFile(platform2, 'pairs');
            
            results.comparisons.swaps[`${platform1}_vs_${platform2}`] = comparePlatforms(swapData1, swapData2);
            results.comparisons.pairs[`${platform1}_vs_${platform2}`] = comparePairs(pairData1, pairData2);
            
            // Find missing pairs using both swaps and pairs data
            const missingPairs = findMissingPairs(swapData1.data, swapData2.data, pairData1.data, pairData2.data);
            results.comparisons.missingPairs[`${platform1}_vs_${platform2}`] = {
                [`missing_in_${platform2}`]: missingPairs.missing_in_platform2,
                [`missing_in_${platform1}`]: missingPairs.missing_in_platform1
            };

            // Print missing pairs for SQD specifically
            if (platform1 === 'sqd' || platform2 === 'sqd') {
                const otherPlatform = platform1 === 'sqd' ? platform2 : platform1;
                const missingInSqd = platform1 === 'sqd' ? missingPairs.missing_in_platform1 : missingPairs.missing_in_platform2;
                const missingInOther = platform1 === 'sqd' ? missingPairs.missing_in_platform2 : missingPairs.missing_in_platform1;
                
                console.log(`\nComparing SQD with ${otherPlatform}:`);
                if (missingInSqd.length > 0) {
                    console.log(`Pairs missing in SQD: ${missingInSqd.map(p => `${p.id} - ${p.token0} - ${p.token1} - ${new Date(p.createdAt).toISOString()}`).join(', ')}`);
                }
                if (missingInOther.length > 0) {
                    console.log(`Pairs missing in ${otherPlatform}: ${missingInOther.map(p => `${p.id} - ${p.token0} - ${p.token1} - ${new Date(p.createdAt).toISOString()}`).join(', ')}`);
                }
            }
        }
    }

    // Save JSON report
    const jsonPath = path.join(DATA_DIR, 'template_comparison_report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`JSON report saved to: ${jsonPath}`);

    // Generate and save HTML report
    const htmlPath = path.join(DATA_DIR, 'template_comparison_report.html');
    fs.writeFileSync(htmlPath, generateHTML(results));
    console.log(`HTML report saved to: ${htmlPath}`);
}

// Run the report generation
generateReport().catch(console.error); 