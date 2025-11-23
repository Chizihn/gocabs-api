// // src/resolvers/NftResolver.ts
// import {
//   Resolver,
//   Mutation,
//   Arg,
//   Ctx,
//   Authorized,
//   ObjectType,
//   Field,
// } from "type-graphql";
// import { Context } from "../types/Context";
// import { BaseResponse } from "../types/graphql/responses";
// import { prisma } from "../config/database";
// import { GraphQLError } from "graphql";

// // Umi + Metaplex imports (2025 standard)
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
//   fromNodeBuffer,
// } from "@metaplex-foundation/umi";
// import { irysUploader } from "@metaplex-foundation/umi-uploader-irys";
// import fetch from "node-fetch";

// @ObjectType()
// class MintNftResponse extends BaseResponse {
//   @Field(() => String, { nullable: true })
//   nftAddress?: string;

//   @Field(() => String, { nullable: true })
//   transactionSignature?: string;
// }

// @Resolver()
// export class NftResolver {
//   // Shared Umi instance (same as your working script)
//   private getUmi() {
//     if (!process.env.SOLANA_SECRET_KEY) {
//       throw new Error("SOLANA_SECRET_KEY is missing in .env");
//     }

//     const secretKey = JSON.parse(process.env.SOLANA_SECRET_KEY) as number[];

//     const umi = createUmi("https://api.devnet.solana.com")
//       .use(irysUploader({ address: "https://devnet.irys.xyz" }))
//       .use(mplTokenMetadata());

//     const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
//     const signer = createSignerFromKeypair(umi, keypair);
//     umi.use(keypairIdentity(signer));

//     return umi;
//   }

//   @Authorized("SEEKER")
//   @Mutation(() => MintNftResponse)
//   async mintAccessNft(
//     @Arg("walletAddress", { nullable: true }) inputWalletAddress?: string,
//     @Ctx() { userId }: Context
//   ): Promise<MintNftResponse> {
//     try {
//       // Verify user exists
//       const user = await prisma.user.findUnique({
//         where: { id: userId! },
//       });

//       if (!user?.walletAddress) {
//         throw new GraphQLError("User not found or no wallet address");
//       }

//       // Determine recipient (input > user wallet)
//       const recipientAddress = inputWalletAddress
//         ? publicKey(inputWalletAddress)
//         : publicKey(user.walletAddress);

//       // Verify collection is set
//       if (!process.env.NFT_COLLECTION_ADDRESS) {
//         throw new Error("NFT_COLLECTION_ADDRESS not set in .env");
//       }

//       const umi = this.getUmi();
//       const mint = generateSigner(umi);

//       console.log("Downloading NFT image...");
//       const imageRes = await fetch("https://i.ibb.co/XktnsHsf/gocabs-nft.jpg");
//       if (!imageRes.ok) throw new Error("Failed to download image");
//       const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

//       console.log("Uploading image to Irys...");
//       const imageFile = fromNodeBuffer(imageBuffer, "gocabs-nft.jpg", "image/jpeg");
//       const [imageUri] = await umi.uploader.upload([imageFile]);
//       console.log("Image URI:", imageUri);

//       const metadata = {
//         name: "GoCabs Access Pass",
//         symbol: "GCAB",
//         description: "Access pass for GoCabs premium features",
//         image: imageUri,
//         attributes: [
//           { trait_type: "Access", value: "Premium" },
//           { trait_type: "Tier", value: "1" },
//         ],
//         properties: {
//           files: [{ uri: imageUri, type: "image/jpeg" }],
//           category: "image",
//         },
//       };

//       console.log("Uploading metadata JSON...");
//       const metadataUri = await umi.uploader.uploadJson(metadata);
//       console.log("Metadata URI:", metadataUri);

//       console.log("Minting NFT to:", recipientAddress);
//       const txBuilder = createNft(umi, {
//         mint,
//         name: metadata.name,
//         symbol: metadata.symbol,
//         uri: metadataUri,
//         sellerFeeBasisPoints: percentAmount(5),
//         creators: some([
//           {
//             address: umi.identity.publicKey,
//             verified: true,   // Required field
//             share: 100,
//           },
//         ]),
//         isMutable: true,
//         tokenOwner: recipientAddress,
//         collection: some({
//           key: publicKey(process.env.NFT_COLLECTION_ADDRESS),
//           verified: false, // Will be verified later if needed
//         }),
//       });

//       const signature = await txBuilder.sendAndConfirm(umi);

//       console.log("NFT Minted Successfully!");
//       console.log("Mint Address:", mint.publicKey);
//       console.log("Tx Signature:", signature.toString());

//       return {
//         success: true,
//         message: "GoCabs Access Pass minted successfully!",
//         nftAddress: mint.publicKey.toString(),
//         transactionSignature: signature.toString(),
//       };
//     } catch (error: any) {
//       console.error("Minting failed:", error);
//       return {
//         success: false,
//         message: error.message || "Failed to mint Access Pass NFT",
//       };
//     }
//   }
// }
