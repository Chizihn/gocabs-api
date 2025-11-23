import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNft,
  mplTokenMetadata,
  verifyCollectionV1,
  findMetadataPda,
  findMasterEditionPda,
  fetchMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  createSignerFromKeypair,
  keypairIdentity,
  percentAmount,
  generateSigner,
  some,
  publicKey,
  createGenericFile,
  Umi,
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import { SOLANA_CONFIG, PROGRAM_IDS } from "../../config/solana";
import { logger } from "../../utils/logger";
import fetch from "node-fetch";
import {
  Transaction as Web3Transaction,
  PublicKey as Web3PublicKey,
  SystemProgram,
  Keypair as Web3Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { solanaConnection } from "../../config/solana";
import { NFTVerificationService } from "./NFTVerificationService";

let umiInstance: Umi | null = null;
let mintKeypair: any = null;

/**
 * Initialize UMI instance for NFT minting
 */
function getUmi(): Umi {
  if (!umiInstance) {
    umiInstance = createUmi(SOLANA_CONFIG.rpcEndpoint)
      .use(irysUploader({ address: "https://devnet.irys.xyz" }))
      .use(mplTokenMetadata());

    // Load the mint authority keypair from environment variable
    const secretKeyString = process.env.MERCHANT_WALLET_PRIVATE_KEY;
    if (secretKeyString) {
      try {
        const secretKey = JSON.parse(secretKeyString);
        mintKeypair = umiInstance.eddsa.createKeypairFromSecretKey(
          new Uint8Array(secretKey)
        );
        umiInstance.use(
          keypairIdentity(createSignerFromKeypair(umiInstance, mintKeypair))
        );
      } catch (e) {
        logger.error(
          "Failed to parse MINT_AUTHORITY_SECRET_KEY. Make sure it is a valid JSON array string."
        );
      }
    } else {
      logger.warn(
        "MINT_AUTHORITY_SECRET_KEY environment variable not set. Minting will fail if the authority is required."
      );
    }
  }
  return umiInstance;
}

/**
 * Create a payment + mint transaction bundle
 * Returns a web3.js Transaction for payment that user signs
 * After payment is confirmed, we mint the NFT server-side
 */
export async function createMintPaymentTransaction(
  recipientAddress: string
): Promise<{
  transaction: string; // Base64 encoded web3.js transaction for payment
  price: number;
  reference: string; // Unique reference for polling
}> {
  try {
    const umi = getUmi();
    const recipientWeb3Pubkey = new Web3PublicKey(recipientAddress);

    // Determine price based on network
    const isDevnet = SOLANA_CONFIG.network === "devnet";
    const price = isDevnet ? 0.001 : 0.1; // 0.01 SOL for devnet, 0.1 SOL for mainnet

    // Generate a unique reference for this transaction
    const referenceKeypair = Web3Keypair.generate();

    // Create a payment transaction
    const web3Transaction = new Web3Transaction();
    const { blockhash } = await solanaConnection.getLatestBlockhash();
    web3Transaction.recentBlockhash = blockhash;
    web3Transaction.feePayer = recipientWeb3Pubkey;

    // Add payment instruction
    const mintAuthorityPubkey = new Web3PublicKey(umi.identity.publicKey);
    web3Transaction.add(
      SystemProgram.transfer({
        fromPubkey: recipientWeb3Pubkey,
        toPubkey: mintAuthorityPubkey,
        lamports: price * LAMPORTS_PER_SOL,
      })
    );

    // Add the reference key to the transaction so we can find it later
    web3Transaction.add(
      SystemProgram.transfer({
        fromPubkey: recipientWeb3Pubkey,
        toPubkey: referenceKeypair.publicKey, // The key is just for reference
        lamports: 0, // No lamports transferred, just including the key
      })
    );

    // Serialize transaction
    const serialized = web3Transaction.serialize({
      requireAllSignatures: false,
    });
    const transactionBase64 = Buffer.from(serialized).toString("base64");

    logger.info(`Payment transaction created for ${recipientAddress}`);

    return {
      transaction: transactionBase64,
      price,
      reference: referenceKeypair.publicKey.toBase58(),
    };
  } catch (error: any) {
    logger.error("Error creating payment transaction:", error);
    throw new Error(`Failed to create payment transaction: ${error.message}`);
  }
}

/**
 * Execute the mint after payment is confirmed
 * This is called server-side after we detect the payment transaction
 */
export async function executeMintAfterPayment(
  recipientAddress: string,
  paymentSignature: string
): Promise<{ success: boolean; mintAddress: string }> {
  try {
    const umi = getUmi();
    const collectionAddress = PROGRAM_IDS.GOCABS_NFT_COLLECTION;

    if (!collectionAddress) {
      throw new Error("NFT_COLLECTION_ADDRESS not configured");
    }

    // Verify payment transaction
    const paymentTx = await solanaConnection.getTransaction(paymentSignature, {
      commitment: "confirmed",
    } as any); // Use `as any` to bypass potential version mismatch issues

    if (!paymentTx) {
      throw new Error("Payment transaction not found");
    }

    const recipientPubkey = publicKey(recipientAddress);

    // Upload NFT image
    logger.info("Uploading NFT image...");
    const imageRes = await fetch("https://i.ibb.co/XktnsHsf/gocabs-nft.jpg");
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const imageFile = createGenericFile(imageBuffer, "gocabs-nft.png", {
      contentType: "image/png",
    });

    const [imageUri] = await umi.uploader.upload([imageFile]);

    // Create metadata
    const metadata = {
      name: "GoCabs Access Pass",
      symbol: "GCAB",
      description: "Access pass for GoCabs premium features",
      image: imageUri,
      attributes: [
        { trait_type: "Access", value: "Premium" },
        { trait_type: "Tier", value: "1" },
      ],
    };

    logger.info("Uploading metadata...");
    const metadataUri = await umi.uploader.uploadJson(metadata);

    // Mint the NFT - we need to create a new signer for the mint
    // Since we pre-generated the mint address, we'll need to use it
    // Actually, we should generate a new mint signer here
    const mint = generateSigner(umi);

    logger.info(`Minting NFT to ${recipientAddress}...`);
    await createNft(umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      isMutable: true,
      tokenOwner: recipientPubkey,
      collection: some({
        key: publicKey(collectionAddress),
        verified: false,
      }),
    }).sendAndConfirm(umi);

    const actualMintAddress = mint.publicKey;

    logger.info(`✅ NFT minted successfully: ${actualMintAddress}`);

    // Invalidate the cache so the next check reflects the new ownership
    await NFTVerificationService.invalidateCache(recipientAddress);

    return {
      success: true,
      mintAddress: actualMintAddress,
    };
  } catch (error: any) {
    logger.error("Error executing mint:", error);
    throw new Error(`Failed to execute mint: ${error.message}`);
  }
}

/**
 * Verify the collection after minting
 * This should be called after the transaction is confirmed
 */
export async function verifyCollectionAfterMint(
  mintAddress: string
): Promise<void> {
  try {
    const umi = getUmi();
    const collectionAddress = PROGRAM_IDS.GOCABS_NFT_COLLECTION;

    if (!collectionAddress) {
      throw new Error("NFT_COLLECTION_ADDRESS not configured");
    }

    const nftMetadataPda = findMetadataPda(umi, {
      mint: publicKey(mintAddress),
    });
    const collectionUmiPubkey = publicKey(collectionAddress);
    const collectionMetadataPda = findMetadataPda(umi, {
      mint: collectionUmiPubkey,
    });
    const collectionMasterEditionPda = findMasterEditionPda(umi, {
      mint: collectionUmiPubkey,
    });

    // Get collection metadata to verify authority
    const collectionMetadata = await fetchMetadata(umi, collectionMetadataPda);

    if (collectionMetadata.updateAuthority !== umi.identity.publicKey) {
      throw new Error(
        `Not authorized to verify collection. Expected ${collectionMetadata.updateAuthority}, got ${umi.identity.publicKey}`
      );
    }

    // Verify the collection
    await verifyCollectionV1(umi, {
      metadata: nftMetadataPda,
      collectionMint: collectionUmiPubkey,
      collectionMetadata: collectionMetadataPda,
      collectionMasterEdition: collectionMasterEditionPda,
      authority: umi.identity,
    }).sendAndConfirm(umi);

    logger.info(`Collection verified for NFT: ${mintAddress}`);
  } catch (error: any) {
    logger.error("Error verifying collection:", error);
    throw new Error(`Failed to verify collection: ${error.message}`);
  }
}

/**
 * Finds a transaction signature by its reference key.
 * This is used for polling the transaction status from the client.
 */
export async function findMintTransaction(
  reference: string
): Promise<{ signature: string | null }> {
  try {
    const referencePubkey = new Web3PublicKey(reference);

    // Find the latest signature for the reference address
    const signatures = await solanaConnection.getSignaturesForAddress(
      referencePubkey,
      { limit: 1 },
      "confirmed"
    );

    if (signatures.length > 0 && signatures[0]) {
      logger.info(
        `[Mint Status] Found signature ${signatures[0].signature} for reference ${reference}`
      );
      return { signature: signatures[0].signature };
    }

    return { signature: null };
  } catch (error: any) {
    logger.error(
      `Error finding mint transaction for reference ${reference}:`,
      error
    );
    // Return null instead of throwing, as this is a polling endpoint
    return { signature: null };
  }
}
