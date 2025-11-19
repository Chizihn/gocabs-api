// // mint-nft-real.mjs
// import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
// import {
//   createNft,
//   mplTokenMetadata,
// } from "@metaplex-foundation/mpl-token-metadata";
// import {
//   createSignerFromKeypair,
//   keypairIdentity,
//   percentAmount,
//   generateSigner,
//   some,
//   publicKey,
// } from "@metaplex-foundation/umi";
// import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
// import fs from "fs";
// import fetch from "node-fetch"; // npm install node-fetch@2 if needed
// import dotenv from "dotenv"; // npm install dotenv
// dotenv.config();

// // Load wallet
// const secretKey = JSON.parse(fs.readFileSync("secret-key.json", "utf8"));
// const umi = createUmi("https://api.devnet.solana.com")
//   .use(irysUploader({ address: "https://devnet.irys.xyz" }))
//   .use(mplTokenMetadata());

// const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
// umi.use(keypairIdentity(createSignerFromKeypair(umi, keypair)));

// const mint = generateSigner(umi);

// // Get recipient address from command line arguments
// const args = process.argv.slice(2);
// const recipientAddress = args[0] ? publicKey(args[0]) : umi.identity.publicKey;

// (async () => {
//   try {
//     const collectionAddress = process.env.NFT_COLLECTION_ADDRESS;
//     if (!collectionAddress) {
//       throw new Error(
//         "NFT_COLLECTION_ADDRESS is not set in your .env file. Please run create-collection.js first."
//       );
//     }
//     console.log(`Minting a new NFT for collection: ${collectionAddress}`);

//     console.log("Downloading image...");
//     const imageUrl = "https://i.ibb.co/XktnsHsf/gocabs-nft.jpg";
//     const imageRes = await fetch(imageUrl);
//     const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

//     console.log("Uploading image to Irys...");
//     const [imageUri] = await umi.uploader.upload([imageBuffer], {
//       tags: [{ name: "Content-Type", value: "image/jpeg" }],
//     });
//     console.log("Image URI:", imageUri);

//     const metadata = {
//       name: "GoCabs Access Pass",
//       symbol: "GCAB",
//       description: "Access pass for GoCabs premium features",
//       image: imageUri,
//       attributes: [
//         { trait_type: "Access", value: "Premium" },
//         { trait_type: "Tier", value: "1" },
//       ],
//       properties: {
//         files: [{ uri: imageUri, type: "image/jpeg" }],
//         category: "image",
//       },
//     };

//     console.log("Uploading metadata JSON...");
//     const metadataUri = await umi.uploader.uploadJson(metadata);
//     console.log("Metadata URI:", metadataUri);

//     console.log("Minting NFT...");
//     await createNft(umi, {
//       mint,
//       name: metadata.name,
//       symbol: metadata.symbol,
//       uri: metadataUri,
//       sellerFeeBasisPoints: percentAmount(5),
//       creators: some([{ address: umi.identity.publicKey, share: 100 }]),
//       isMutable: true,
//       tokenOwner: recipientAddress,
//       // Add the NFT to the collection
//       collection: some({
//         key: publicKey(collectionAddress),
//         verified: false, // This will be false until you verify it
//       }),
//     }).sendAndConfirm(umi);

//     console.log(`\nNFT MINTED SUCCESSFULLY FOR: ${recipientAddress}`);
//     console.log("Mint Address:", mint.publicKey);
//     console.log("Belongs to Collection:", collectionAddress);
//     console.log(
//       "Explorer:",
//       `https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet`
//     );

//     console.log(
//       "\nNext Step: You may need to verify the NFT in the collection. This is an advanced step, but for now, the backend will recognize it."
//     );
//   } catch (error) {
//     console.error("\nError:", error.message);
//     if (error.message.includes("insufficient")) {
//       console.log(
//         "Airdrop: solana airdrop 0.1 " +
//           umi.identity.publicKey +
//           " --url devnet"
//       );
//     }
//   }
// })();

// mint-nft-real.mjs (updated)
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createNft, mplTokenMetadata, updateV1 } from "@metaplex-foundation/mpl-token-metadata";
import { createSignerFromKeypair, keypairIdentity, percentAmount, generateSigner, some, publicKey } from "@metaplex-foundation/umi";
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
import fs from "fs";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Load wallet
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
    if (!collectionAddress) {
      throw new Error("NFT_COLLECTION_ADDRESS is not set in your .env file. Please run create-collection.js first.");
    }
    console.log(`Minting a new NFT for collection: ${collectionAddress}`);

    console.log("Downloading image...");
    const imageUrl = "https://i.ibb.co/XktnsHsf/gocabs-nft.jpg";
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error(`Image fetch failed: ${imageRes.status}`);
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    console.log("Uploading image to Irys...");
    const [imageUri] = await umi.uploader.upload([imageBuffer], {
      tags: [{ name: "Content-Type", value: "image/jpeg" }],
    });
    console.log("Image URI:", imageUri);

    const metadata = {
      name: "GoCabs Access Pass",
      symbol: "GCAB",
      description: "Access pass for GoCabs premium features",
      image: imageUri,
      attributes: [
        { trait_type: "Access", value: "Premium" },
        { trait_type: "Tier", value: "1" },
      ],
      properties: {
        files: [{ uri: imageUri, type: "image/jpeg" }],
        category: "image",
      },
    };

    console.log("Uploading metadata JSON...");
    const metadataUri = await umi.uploader.uploadJson(metadata);
    console.log("Metadata URI:", metadataUri);

    console.log("Minting NFT...");
    const { signature } = await createNft(umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      creators: some([{ address: umi.identity.publicKey, share: 100 }]),
      isMutable: true,
      tokenOwner: recipientAddress,
      collection: some({
        key: publicKey(collectionAddress),
        verified: false,
      }),
    }).sendAndConfirm(umi);

    console.log(`\nNFT MINTED SUCCESSFULLY! Tx Sig: ${signature}`);
    console.log("Mint Address:", mint.publicKey);
    console.log("Belongs to Collection:", collectionAddress);
    console.log("Explorer:", `https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet`);
    console.log("Wallet Explorer:", `https://explorer.helius.xyz/address/${recipientAddress}?nft=true&cluster=devnet`);

    // Optional: Verify collection (requires collection authority)
    // Uncomment if your minter is the collection update authority
    // await updateV1(umi, {
    //   mint: publicKey(mint.publicKey),
    //   authority: umi.identity,
    //   collection: some({ key: publicKey(collectionAddress), verified: true }),
    // }).sendAndConfirm(umi);
    // console.log("Collection verified!");

  } catch (error) {
    console.error("\nFull Error:", error);
    console.error("Error Message:", error.message);
    if (error.message.includes("insufficient")) {
      console.log("Airdrop to minter: solana airdrop 0.5 " + umi.identity.publicKey + " --url devnet");
    }
    if (error.signature) {
      console.log("Failed Tx Sig:", error.signature);
      console.log("Check: https://explorer.solana.com/tx/" + error.signature + "?cluster=devnet");
    }
  }
})();