// check-collection-master-edition.js
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  findMasterEditionPda,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";
import dotenv from "dotenv";

dotenv.config();

const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());
const collectionMint = publicKey(`${process.env.NFT_COLLECTION_ADDRESS}`);

const masterEditionPda = findMasterEditionPda(umi, { mint: collectionMint });
console.log("Collection Master Edition PDA:", masterEditionPda[0]);

try {
  const account = await umi.rpc.getAccount(masterEditionPda[0]);
  console.log("✅ Exists?", account.exists);
  console.log("Owner:", account.owner);
} catch (e) {
  console.log("❌ DOES NOT EXIST");
  console.log("Your collection was NOT created with isCollection: true");
}
