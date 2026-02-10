async function fetchData() {
  const response = await fetch('https://indexer.dev.hyperindex.xyz/498f044/v1/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        {
          transfers(first: 10) {
            id
            from
            to
            value
            blockNumber
            transactionHash
          }
        }
      `
    }),
  });
  
  const data = await response.json();
  console.log(data);
}

fetchData();


// ts-node retrieve_data.ts      