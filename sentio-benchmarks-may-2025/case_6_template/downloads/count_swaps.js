const fetch = require('node-fetch');

const GRAPHQL_URL = 'http://localhost:42069/graphql';

const query = `
  query {
    swaps(limit: 1) {
      totalCount
    }
  }
`;

async function countSwaps() {
  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.errors) {
      console.error('Error fetching swaps:', result.errors);
      return;
    }

    console.log(`Total number of swaps: ${result.data.swaps.totalCount}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

countSwaps(); 