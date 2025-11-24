import { redisClient } from "../../config/redis";
import {
  getHeliusClient,
  PROGRAM_IDS,
  SOLANA_CONFIG,
} from "../../config/solana";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { solanaConnection } from "../../config/solana";
import { prisma } from "../../config/database";
import { logger } from "../../utils/logger";

export class NFTVerificationService {
  private static CACHE_TTL = 300; // 5 minutes
  private static OWNERSHIP_CACHE_PREFIX = "nft:ownership:";
  private static STAKING_CACHE_PREFIX = "nft:staking:";

  /**
   * Check if a wallet owns any NFTs from the GoCabs collection
   */
  static async verifyNFTOwnership(
    walletAddress: string
  ): Promise<{ isHolder: boolean; nftTokens: string[] }> {
    const cacheKey = `${this.OWNERSHIP_CACHE_PREFIX}${walletAddress}`;
    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for wallet ownership: ${walletAddress}`);
        return JSON.parse(cached);
      }

      // Fetch from Helius (updated to direct method call)
      const heliusClient = await getHeliusClient();

      const response = await heliusClient.getAssetsByOwner({
        ownerAddress: walletAddress,
        page: 1,
        limit: 1000,
        displayOptions: {
          showNativeBalance: false,
          showCollectionMetadata: true,
        },
      });

      // NEW: Detailed debug logging of the raw Helius response
      logger.info(
        `[Helius] Raw response for ${walletAddress}: total=${response.total}, items=${response.items.length}`
      );

      // Filter for collection NFTs
      const collectionAddress = PROGRAM_IDS.GOCABS_NFT_COLLECTION.toString();
      const goCabsNFTs = response.items.filter((nft: any) => {
        const grouping = nft.grouping;
        if (!Array.isArray(grouping) || grouping.length === 0) {
          return false;
        }

        // Log the grouping info for the first few NFTs to help debug
        if (response.items.indexOf(nft) < 3) {
          logger.debug(`[Helius] Inspecting NFT ${nft.id} grouping:`, grouping);
        }

        // CRITICAL FIX: The group must match the collection address AND be verified.
        return grouping.some(
          (g: any) =>
            g.group_key === "collection" &&
            g.group_value === collectionAddress &&
            g.verified === true // Ensure the collection membership is verified
        );
      });

      // NEW: Log filter results
      logger.info(
        `[Helius] Filtered for collection ${collectionAddress}. Found ${goCabsNFTs.length} matching NFTs.`
      );

      const result = {
        isHolder: goCabsNFTs.length > 0,
        nftTokens: goCabsNFTs.map((nft: any) => nft.id),
      };

      // If the primary check fails OR returns no tokens, try a more direct verification for recently minted NFTs
      if (result.nftTokens.length === 0) {
        logger.warn(
          `Primary ownership check returned no NFTs for ${walletAddress}. Attempting secondary check on recent mints.`
        );

        const recentMint = await prisma.mintAttempt.findFirst({
          where: {
            walletAddress: walletAddress,
            status: "COMPLETED",
            createdAt: {
              // Widen the check to the last 20 minutes for robustness
              gte: new Date(new Date().getTime() - 20 * 60 * 1000),
            },
          },
          orderBy: { createdAt: "desc" },
        });

        if (recentMint?.mintAddress) {
          logger.info(
            // More detailed log
            `[Secondary Check] Found recent mint record: ${recentMint.mintAddress}. Verifying ownership directly via RPC.`
          );
          const ownsRecent = await this.verifySpecificNFTWithRpc(
            // Use the more direct RPC check
            walletAddress,
            recentMint.mintAddress
          );

          if (ownsRecent) {
            result.isHolder = true;
            result.nftTokens.push(recentMint.mintAddress);
            logger.info(
              `Secondary check successful: Wallet ${walletAddress} owns recently minted NFT ${recentMint.mintAddress}.`
            );
          }
        }
      }

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
      // Updated to direct method call
      const asset = await heliusClient.getAsset({
        id: nftMintAddress,
      });
      const isOwned = asset.ownership.owner === walletAddress;
      logger.info(
        `Specific NFT verification: ${nftMintAddress} owned by ${walletAddress}: ${isOwned}`
      );
      return isOwned;
    } catch (error) {
      // If Helius fails with "Asset Not Found", it might be an indexing delay.
      // Fallback to a direct RPC check.
      if ((error as Error).message?.includes("Asset Not Found")) {
        logger.warn(
          `Helius couldn't find ${nftMintAddress}. Falling back to direct RPC check.`
        );
        return this.verifySpecificNFTWithRpc(walletAddress, nftMintAddress);
      }
      logger.error("Helius specific NFT verification failed:", error);
      return false;
    }
  }

  /**
   * Verifies NFT ownership directly against a Solana RPC node.
   * This is a fallback for when indexers like Helius are lagging.
   */
  private static async verifySpecificNFTWithRpc(
    walletAddress: string,
    nftMintAddress: string
  ): Promise<boolean> {
    try {
      const mintPubkey = new (await import("@solana/web3.js")).PublicKey(
        nftMintAddress
      );
      const ownerPubkey = new (await import("@solana/web3.js")).PublicKey(
        walletAddress
      );

      const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
      const tokenAccount = await getAccount(solanaConnection, ata);

      const isOwned =
        tokenAccount.owner.equals(ownerPubkey) && tokenAccount.amount === 1n;
      logger.info(
        `[RPC Check] Verification for ${nftMintAddress} owned by ${walletAddress}: ${isOwned}`
      );
      return isOwned;
    } catch (rpcError: any) {
      logger.error(
        `[RPC Check] Direct RPC verification failed for ${nftMintAddress}:`,
        rpcError.message
      );
      return false;
    }
  }
  /**
   * Check if a wallet has any staked NFTs
   */
  static async checkStakedNFTs(
    walletAddress: string
  ): Promise<{ hasStaked: boolean; stakedTokens: string[] }> {
    const cacheKey = `${this.STAKING_CACHE_PREFIX}${walletAddress}`;
    try {
      // Check cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        logger.info(`Cache hit for staked NFTs: ${walletAddress}`);
        return JSON.parse(cached);
      }

      // Check database for staked NFTs
      const stakedNFTs = await prisma.stakedNFT.findMany({
        where: { walletAddress },
        select: { tokenMint: true },
      });

      const result = {
        hasStaked: stakedNFTs.length > 0,
        stakedTokens: stakedNFTs.map(
          (nft: { tokenMint: string }) => nft.tokenMint
        ),
      };

      // Cache the result
      await redisClient.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      logger.info(
        `Staked NFTs check for ${walletAddress}: ${result.hasStaked} (${result.stakedTokens.length} staked)`
      );
      return result;
    } catch (error) {
      logger.error(`Error checking staked NFTs for ${walletAddress}:`, error);
      return { hasStaked: false, stakedTokens: [] };
    }
  }

  /**
   * Check if a wallet has access to GoCabs features by either:
   * 1. Owning NFTs from the GoCabs collection, or
   * 2. Having staked NFTs from the GoCabs collection
   *
   * @param walletAddress - The wallet address to check
   * @returns Object with access status and reason
   */
  static async hasNFTAccess(walletAddress: string): Promise<{
    hasAccess: boolean;
    reason: "owns_nft" | "has_staked" | "none";
    collectionAddress?: string;
  }> {
    const collectionAddress = PROGRAM_IDS.GOCABS_NFT_COLLECTION.toString();
    try {
      logger.info(
        `Checking NFT access for wallet: ${walletAddress}, collection: ${collectionAddress}`
      );

      // Check direct ownership first
      const { isHolder, nftTokens } = await this.verifyNFTOwnership(
        walletAddress
      );
      if (isHolder) {
        logger.info(
          `Wallet ${walletAddress} has direct NFT ownership: ${nftTokens.length} NFTs found`
        );
        return {
          hasAccess: true,
          reason: "owns_nft",
          collectionAddress,
        };
      }

      // If no direct ownership, check staked NFTs
      const { hasStaked, stakedTokens } = await this.checkStakedNFTs(
        walletAddress
      );
      if (hasStaked) {
        logger.info(
          `Wallet ${walletAddress} has staked NFTs: ${stakedTokens.length} staked`
        );
        return {
          hasAccess: true,
          reason: "has_staked",
          collectionAddress,
        };
      }

      logger.info(`No GoCabs NFT access for wallet: ${walletAddress}`);
      return {
        hasAccess: false,
        reason: "none",
        collectionAddress,
      };
    } catch (error) {
      logger.error(`Error checking NFT access for ${walletAddress}:`, error);
      return {
        hasAccess: false,
        reason: "none",
        collectionAddress,
      };
    }
  }

  /**
   * Invalidate cache for both ownership and staking
   */
  static async invalidateCache(walletAddress: string): Promise<void> {
    const ownershipKey = `${this.OWNERSHIP_CACHE_PREFIX}${walletAddress}`;
    const stakingKey = `${this.STAKING_CACHE_PREFIX}${walletAddress}`;
    await Promise.all([
      redisClient.del(ownershipKey),
      redisClient.del(stakingKey),
    ]);
    logger.info(`Invalidated NFT caches for wallet: ${walletAddress}`);
  }

  static async getNFTMetadata(nftMintAddress: string): Promise<any> {
    try {
      const heliusClient = await getHeliusClient();
      // Updated to direct method call
      const asset = await heliusClient.getAsset({
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
