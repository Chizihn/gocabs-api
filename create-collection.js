// create-collection.js
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, keypairIdentity, percentAmount, generateSigner, some } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import fs from 'fs';
import fetch from 'node-fetch';

async function main() {
  // Load wallet
  const secretKey = JSON.parse(fs.readFileSync("secret-key.json", "utf8"));
  const umi = createUmi("https://api.devnet.solana.com")
    .use(irysUploader({ address: "https://devnet.irys.xyz" }))
    .use(mplTokenMetadata());

  const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
  umi.use(keypairIdentity(createSignerFromKeypair(umi, keypair)));

  const collectionMint = generateSigner(umi);

  try {
    console.log("Preparing collection metadata...");
    // Using a generic image for the collection itself.
    const imageUrl = "https://i.ibb.co/XktnsHsf/gocabs-nft.jpg"; 
    const imageRes = await fetch(imageUrl);
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

    console.log("Uploading collection image...");
    const [imageUri] = await umi.uploader.upload([imageBuffer]);
    console.log("Collection Image URI:", imageUri);

    const metadata = {
      name: "GoCabs Access Pass Collection",
      symbol: "GCAB-C",
      description: "A collection of access passes for GoCabs premium features.",
      image: imageUri,
    };

    console.log("Uploading collection metadata...");
    const metadataUri = await umi.uploader.uploadJson(metadata);
    console.log("Collection Metadata URI:", metadataUri);

    console.log("Creating Collection NFT...");
    await createNft(umi, {
      mint: collectionMint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(0), // Usually 0 for collections
      isCollection: true, // This is crucial!
      isMutable: true,
    }).sendAndConfirm(umi);

    console.log("\n✅ COLLECTION NFT CREATED SUCCESSFULLY!");
    console.log("Collection Mint Address:", collectionMint.publicKey);
    console.log("Explorer:", `https://explorer.solana.com/address/${collectionMint.publicKey}?cluster=devnet`);
    console.log("\nIMPORTANT: Update your .env file with this address:");
    console.log(`NFT_COLLECTION_ADDRESS=${collectionMint.publicKey}`);

  } catch (error) {
    console.error("\nError creating collection:", error.message);
     if (error.message.includes("insufficient")) {
      console.log("Airdrop: solana airdrop 1 " + umi.identity.publicKey + " --url devnet");
    }
  }
}

main();
