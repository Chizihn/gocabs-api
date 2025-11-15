// mint-nft-real.mjs
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { createSignerFromKeypair, keypairIdentity, percentAmount, generateSigner, some } from '@metaplex-foundation/umi';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import fs from 'fs';
import fetch from 'node-fetch';  // npm install node-fetch@2 if needed

// Load wallet
const secretKey = JSON.parse(fs.readFileSync("secret-key.json", "utf8"));
const umi = createUmi("https://api.devnet.solana.com")
  .use(irysUploader({ address: "https://devnet.irys.xyz" }))  // REAL UPLOAD
  .use(mplTokenMetadata());

const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
umi.use(keypairIdentity(createSignerFromKeypair(umi, keypair)));

const mint = generateSigner(umi);

(async () => {
  try {
    console.log("Downloading image...");
    const imageUrl = "https://i.ibb.co/XktnsHsf/gocabs-nft.jpg";
    const imageRes = await fetch(imageUrl);
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
    await createNft(umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5),
      creators: some([{ address: umi.identity.publicKey, share: 100 }]),
      isMutable: true,
    }).sendAndConfirm(umi);

    console.log("\nNFT MINTED WITH REAL IMAGE & METADATA!");
    console.log("Mint Address:", mint.publicKey);
    console.log("Image:", imageUri);
    console.log("Metadata:", metadataUri);
    console.log("Explorer:", `https://explorer.solana.com/address/${mint.publicKey}?cluster=devnet`);
    console.log(`\nADD TO .env:\nNEXT_PUBLIC_NFT_COLLECTION_ADDRESS=${mint.publicKey}`);
  } catch (error) {
    console.error("\nError:", error.message);
    if (error.message.includes("insufficient")) {
      console.log("Airdrop: solana airdrop 0.1 " + umi.identity.publicKey + " --url devnet");
    }
  }
})();