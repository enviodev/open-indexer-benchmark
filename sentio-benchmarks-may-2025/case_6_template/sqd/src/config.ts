import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: '.env' });

export const config = {
  ARCHIVE_NODE: process.env.ARCHIVE_NODE || 'https://eth.archive.subsquid.io',
  CHAIN_NODE: process.env.CHAIN_NODE || process.env.RPC_URL,
}; 