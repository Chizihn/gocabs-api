import { Request, Response } from "express";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { solanaConnection, PROGRAM_IDS } from "../config/solana";
import BigNumber from "bignumber.js";

const MERCHANT_WALLET = new PublicKey(process.env.MERCHANT_WALLET_ADDRESS!);

export const solanaPayHandler = async (req: Request, res: Response) => {
  const { method } = req;

  if (method === "GET") {
    // --- GET Request: Wallet asks for metadata ---
    logger.info("[SolanaPay API] GET request received");
    return res.status(200).json({
      label: "GoCab Shuttle Booking",
      icon: "https://i.ibb.co/XktnsHsf/gocabs-nft.jpg", // Make sure this is a publicly accessible URL
    });
  } else if (method === "POST") {
    // --- POST Request: Wallet asks for the transaction to sign ---
    const { account } = req.body;
    const { reference } = req.query;

    logger.info(
      `[SolanaPay API] POST request received for reference: ${reference}, from account: ${account}`
    );

    if (!account || !reference) {
      return res.status(400).json({ error: "Missing account or reference" });
    }

    try {
      const booking = await prisma.booking.findUnique({
        where: { paymentReference: reference as string },
        include: {
          shuttle: {
            include: { vehicle: true }, // Include the vehicle to get the license plate
          },
        },
      });

      if (!booking) {
        logger.error(
          `[SolanaPay API] Booking not found for reference: ${reference}`
        );
        return res.status(404).json({ error: "Booking not found" });
      }

      const isMainnet = process.env.SOLANA_NETWORK === "mainnet-beta";
      const buyerPublicKey = new PublicKey(account);
      let transaction: Transaction;

      if (isMainnet) {
        // Mainnet: Create a USDC transfer transaction
        const usdcMint = PROGRAM_IDS.USDC_MINT;
        const amount = booking.totalPriceUsdc.toNumber();
        const amountInSmallestUnit = Math.floor(amount * 1_000_000); // 6 decimals for USDC

        const buyerUsdcAddress = await getAssociatedTokenAddress(
          usdcMint,
          buyerPublicKey
        );
        const merchantUsdcAddress = await getAssociatedTokenAddress(
          usdcMint,
          MERCHANT_WALLET
        );

        transaction = new Transaction().add(
          createTransferCheckedInstruction(
            buyerUsdcAddress,
            usdcMint,
            merchantUsdcAddress,
            buyerPublicKey,
            amountInSmallestUnit,
            6
          )
        );
      } else {
        // Devnet: Create a native SOL transfer transaction
        const usdcToSolRate = 0.0085; // Must match rate in SolanaPayService
        const solAmount = new BigNumber(
          booking.totalPriceUsdc.toNumber()
        ).times(usdcToSolRate);
        const lamports = solAmount
          .times(1_000_000_000)
          .integerValue(BigNumber.ROUND_FLOOR)
          .toNumber();

        transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: buyerPublicKey,
            toPubkey: MERCHANT_WALLET,
            lamports,
          })
        );
      }

      const { blockhash } = await solanaConnection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = buyerPublicKey;
      transaction.add(
        new TransactionInstruction({
          keys: [
            {
              // The reference is the booking's paymentReference, which is a public key
              pubkey: new PublicKey(reference),
              isSigner: false,
              isWritable: false,
            },
          ],
          programId: new PublicKey(
            "MemoSq4gqABAXKb96qnH8TysNcVtrp5GZuGg2EXnp2n"
          ),
          data: Buffer.from(booking.shuttle!.vehicle.licensePlate, "utf-8"),
        })
      );

      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
      });

      logger.info(
        `[SolanaPay API] Transaction created for reference: ${reference}`
      );
      return res.status(200).json({
        transaction: serializedTransaction.toString("base64"),
        message: `Booking for ${booking.shuttle!.vehicle.licensePlate}`,
      });
    } catch (error: any) {
      logger.error("[SolanaPay API] Error creating transaction:", error);
      return res.status(500).json({ error: "Error creating transaction" });
    }
  } else {
    return res.status(405).json({ error: "Method not allowed" });
  }
};
