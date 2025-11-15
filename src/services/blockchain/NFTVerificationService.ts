import { redisClient } from "../../config/redis";
import { getHeliusClient, PROGRAM_IDS } from "../../config/solana";
import { logger } from "../../utils/logger";

export class NFTVerificationService {
  private static CACHE_TTL = 300; // 5 minutes

  static async verifyNFTOwnership(
    walletAddress: string
  ): Promise<{ isHolder: boolean; nftTokens: string[] }> {
    const cacheKey = `nft:ownership:${walletAddress}`;

    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for wallet: ${walletAddress}`);
        return JSON.parse(cached);
      }

      // Fetch from Helius
      const heliusClient = await getHeliusClient();
      const response = await heliusClient.rpc.getAssetsByOwner({
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000,
      });

      // Filter for GoCabs collection NFTs
      const collectionAddress = PROGRAM_IDS.GOCABS_NFT_COLLECTION.toString();
      const goCabsNFTs = response.items.filter((nft: any) => {
        const grouping = nft.grouping || [];
        return grouping.some(
          (g: any) =>
            g.group_key === "collection" && g.group_value === collectionAddress
        );
      });

      const result = {
        isHolder: goCabsNFTs.length > 0,
        nftTokens: goCabsNFTs.map((nft: any) => nft.id),
      };

      // Cache the result
      await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

      logger.info(
        `NFT verification for ${walletAddress}: ${result.isHolder} (${result.nftTokens.length} NFTs)`
      );
      return result;
    } catch (error) {
      logger.error("NFT verification failed:", error);
      throw new Error("Failed to verify NFT ownership");
    }
  }

  static async verifySpecificNFT(
    walletAddress: string,
    nftMintAddress: string
  ): Promise<boolean> {
    try {
      const heliusClient = await getHeliusClient();
      const asset = await heliusClient.rpc.getAsset({
        id: nftMintAddress,
      });

      const isOwned = asset.ownership.owner === walletAddress;
      logger.info(
        `Specific NFT verification: ${nftMintAddress} owned by ${walletAddress}: ${isOwned}`
      );

      return isOwned;
    } catch (error) {
      logger.error("Specific NFT verification failed:", error);
      return false;
    }
  }

  static async invalidateCache(walletAddress: string): Promise<void> {
    const cacheKey = `nft:ownership:${walletAddress}`;
    await redisClient.del(cacheKey);
    logger.info(`Cache invalidated for wallet: ${walletAddress}`);
  }

  static async getNFTMetadata(nftMintAddress: string): Promise<any> {
    try {
      const heliusClient = await getHeliusClient();
      const asset = await heliusClient.rpc.getAsset({
        id: nftMintAddress,
      });

      return {
        name: asset.content?.metadata?.name,
        symbol: asset.content?.metadata?.symbol,
        image: asset.content?.links?.image,
        attributes: asset.content?.metadata?.attributes,
      };
    } catch (error) {
      logger.error("Failed to fetch NFT metadata:", error);
      return null;
    }
  }
}
