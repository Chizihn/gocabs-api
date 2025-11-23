// check-collection-authority.mjs
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplTokenMetadata,
  findMetadataPda,
  deserializeMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import { publicKey } from "@metaplex-foundation/umi";

const umi = createUmi("https://api.devnet.solana.com").use(mplTokenMetadata());
const collectionMint = publicKey(
  "C56FGPkfYtHKubUCMQwrbAaNnadB5aH4NRprK2QjEwSs"
);

try {
  const metadataPda = findMetadataPda(umi, { mint: collectionMint });
  console.log("Metadata PDA:", metadataPda[0]);

  const account = await umi.rpc.getAccount(metadataPda[0]);

  if (!account.exists) {
    console.log("❌ Metadata account does not exist!");
  } else {
    console.log("✅ Metadata account exists");
    console.log("Owner:", account.owner);

    // Deserialize the metadata
    const metadata = deserializeMetadata(account);
    console.log("\n=== COLLECTION INFO ===");
    console.log("Name:", metadata.name);
    console.log("Symbol:", metadata.symbol);
    console.log("Update Authority:", metadata.updateAuthority);
    console.log("Mint:", metadata.mint);
    console.log("Is Mutable:", metadata.isMutable);

    console.log("\n=== YOUR WALLET ===");
    console.log("Gwd4bB5U2pZgifLsY1bftkddzN2D8UFV4v1ndWfKQjwx");

    console.log("\n=== MATCH? ===");
    const matches =
      metadata.updateAuthority ===
      "Gwd4bB5U2pZgifLsY1bftkddzN2D8UFV4v1ndWfKQjwx";
    console.log(
      matches
        ? "✅ YES - You can verify!"
        : "❌ NO - You need the authority wallet"
    );
  }
} catch (error) {
  console.error("Error:", error.message);
}
