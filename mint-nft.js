// mint-nft.mjs
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
} from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const secretKey = JSON.parse(fs.readFileSync("secret-key.json", "utf8"));
const umi = createUmi("https://api.devnet.solana.com")
  .use(irysUploader({ address: "https://devnet.irys.xyz" }))
  .use(mplTokenMetadata());

const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
umi.use(keypairIdentity(createSignerFromKeypair(umi, keypair)));

const mint = generateSigner(umi);
const args = process.argv.slice(2);
const recipientAddress = args[0] ? publicKey(args[0]) : umi.identity.publicKey;

(async () => {
  try {
    const collectionAddress = process.env.NFT_COLLECTION_ADDRESS;

    const imageRes = await fetch("https://i.ibb.co/XktnsHsf/gocabs-nft.jpg");
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const [imageUri] = await umi.uploader.upload([imageBuffer]);

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
    const metadataUri = await umi.uploader.uploadJson(metadata);

    // Mint with collection
    await createNft(umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      isMutable: true,
      tokenOwner: recipientAddress,
      collection: some({
        key: publicKey(collectionAddress),
        verified: false,
      }),
    }).sendAndConfirm(umi);

    console.log("✅ MINTED:", mint.publicKey);

    // Get PDAs
    const nftMetadataPda = findMetadataPda(umi, { mint: mint.publicKey });
    const nftMasterEditionPda = findMasterEditionPda(umi, {
      mint: mint.publicKey,
    });
    const collectionMetadataPda = findMetadataPda(umi, {
      mint: publicKey(collectionAddress),
    });
    const collectionMasterEditionPda = findMasterEditionPda(umi, {
      mint: publicKey(collectionAddress),
    });

    console.log("\n=== PDA Addresses ===");
    console.log("NFT Metadata:", nftMetadataPda[0]);
    console.log("NFT Master Edition:", nftMasterEditionPda[0]);
    console.log("Collection Metadata:", collectionMetadataPda[0]);
    console.log("Collection Master Edition:", collectionMasterEditionPda[0]);

    // Check if accounts exist
    console.log("\n=== Account Existence ===");
    const nftMetadataAccount = await umi.rpc.getAccount(nftMetadataPda[0]);
    console.log("NFT Metadata Exists?", nftMetadataAccount.exists);

    const nftMasterEditionAccount = await umi.rpc.getAccount(
      nftMasterEditionPda[0]
    );
    console.log("NFT Master Edition Exists?", nftMasterEditionAccount.exists);

    const collectionMetadataAccount = await umi.rpc.getAccount(
      collectionMetadataPda[0]
    );
    console.log(
      "Collection Metadata Exists?",
      collectionMetadataAccount.exists
    );

    const collectionMasterEditionAccount = await umi.rpc.getAccount(
      collectionMasterEditionPda[0]
    );
    console.log(
      "Collection Master Edition Exists?",
      collectionMasterEditionAccount.exists
    );

    // Get collection metadata to verify authority
    const collectionMetadata = await fetchMetadata(umi, collectionMetadataPda);
    console.log("\n=== Authority Check ===");
    console.log(
      "Collection Update Authority:",
      collectionMetadata.updateAuthority
    );
    console.log("Your Identity:", umi.identity.publicKey);

    if (collectionMetadata.updateAuthority !== umi.identity.publicKey) {
      throw new Error(
        `You are not the collection's update authority. Expected ${collectionMetadata.updateAuthority}, got ${umi.identity.publicKey}`
      );
    }

    // Try verification
    console.log("\n=== Attempting Verification ===");
    await verifyCollectionV1(umi, {
      metadata: nftMetadataPda,
      collectionMint: publicKey(collectionAddress),
      collectionMetadata: collectionMetadataPda,
      collectionMasterEdition: collectionMasterEditionPda,
      authority: umi.identity,
    }).sendAndConfirm(umi);

    console.log("✅ VERIFIED!");
    console.log(
      `https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet`
    );
  } catch (error) {
    console.error("\nERROR:", error.message);
    if (
      error.constructor.name === "SendTransactionError" &&
      typeof error.getLogs === "function"
    ) {
      console.error("TRANSACTION LOGS:");
      console.error(error.getLogs());
    }
  }
})();
