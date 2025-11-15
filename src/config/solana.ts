import { Connection, PublicKey, Cluster } from "@solana/web3.js";
import { logger } from "../utils/logger";

// Initialize Helius client with dynamic import to handle ESM compatibility
let heliusClient: any = null;

// Create a function to get the Helius client
// This ensures the import is done at runtime and handles any potential ESM issues
export async function getHeliusClient() {
  if (!heliusClient) {
    try {
      const { createHelius } = await import('helius-sdk');
      heliusClient = createHelius({
        apiKey: process.env.HELIUS_API_KEY || "",
      });
    } catch (error) {
      logger.error('Failed to initialize Helius client:', error);
      throw new Error('Failed to initialize Helius client. Please check your configuration.');
    }
  }
  return heliusClient;
}

export const SOLANA_CONFIG = {
  network: (process.env.SOLANA_NETWORK || "devnet") as Cluster,
  rpcEndpoint: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  commitment: "confirmed" as const,
};

export const PROGRAM_IDS = {
  TOKEN_PROGRAM: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  ASSOCIATED_TOKEN_PROGRAM: new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  ),
  USDC_MINT: new PublicKey(
    process.env.USDC_MINT_ADDRESS ||
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  ),
  GOCABS_NFT_COLLECTION: new PublicKey(process.env.NFT_COLLECTION_ADDRESS!),
};

export const solanaConnection = new Connection(
  SOLANA_CONFIG.rpcEndpoint,
  SOLANA_CONFIG.commitment
);


// Test connection
solanaConnection
  .getVersion()
  .then((version) => {
    logger.info(`✅ Solana connected - Version: ${version["solana-core"]}`);
  })
  .catch((error) => {
    logger.error("❌ Solana connection failed:", error);
  });
