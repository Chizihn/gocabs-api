import { Request, Response } from "express";
import {
  createMintPaymentTransaction,
  executeMintAfterPayment,
  findMintTransaction,
} from "../services/blockchain/NFTMintService";
import { logger } from "../utils/logger";
import { PublicKey } from "@solana/web3.js";
import { generateToken } from "../middleware/auth";
import { prisma } from "../config/database";

/**
 * REST API endpoint for preparing NFT mint payment transactions
 * GET /api/nft/mint?walletAddress=<address>
 * Returns a payment transaction that the user needs to sign
 * After payment, the NFT will be minted server-side
 */
export const nftMintHandler = async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.query;

    if (!walletAddress || typeof walletAddress !== "string") {
      return res.status(400).json({
        error: "Missing or invalid walletAddress parameter",
      });
    }

    // Validate Solana address
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid Solana wallet address",
      });
    }

    logger.info(
      `[NFT Mint API] Creating payment transaction for ${walletAddress}`
    );

    // Create the payment transaction
    const { transaction, price, reference } =
      await createMintPaymentTransaction(walletAddress);

    logger.info(
      `[NFT Mint API] Payment transaction created. Price: ${price} SOL`
    );

    return res.status(200).json({
      transaction,
      price,
      reference, // Return the unique reference to the client
      network: process.env.SOLANA_NETWORK || "devnet",
    });
  } catch (error: any) {
    logger.error("[NFT Mint API] Error creating payment transaction:", error);
    return res.status(500).json({
      error: "Failed to create payment transaction",
      message: error.message,
    });
  }
};

/**
 * REST API endpoint for checking mint transaction status
 * GET /api/nft/mint/status/:reference
 * Polls for a transaction signature using the reference key.
 */
export const nftMintStatusHandler = async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ error: "Missing reference parameter" });
    }

    logger.debug(`[NFT Mint Status API] Polling for reference: ${reference}`);

    const { signature } = await findMintTransaction(reference);

    if (signature) {
      // Transaction is found and confirmed
      return res.status(200).json({ status: "CONFIRMED", signature });
    } else {
      // Transaction not yet found, client should continue polling
      return res.status(200).json({ status: "PENDING", signature: null });
    }
  } catch (error: any) {
    logger.error("[NFT Mint Status API] Error polling for transaction:", error);
    return res.status(500).json({
      error: "Failed to check transaction status",
      message: error.message,
    });
  }
};

/**
 * REST API endpoint for checking the status of a queued mint job. Changed to POST to prevent caching.
 * POST /api/nft/mint/job-status
 * Body: { paymentSignature: string }
 */
export const nftMintJobStatusHandler = async (req: Request, res: Response) => {
  try {
    const { paymentSignature } = req.body;

    if (!paymentSignature) {
      return res
        .status(400)
        .json({ error: "Missing paymentSignature parameter" });
    }

    const mintAttempt = await prisma.mintAttempt.findUnique({
      where: { paymentSignature },
    });

    if (!mintAttempt) {
      return res.status(404).json({ status: "NOT_FOUND" });
    }

    return res.status(200).json({
      status: mintAttempt.status,
      mintAddress: mintAttempt.mintAddress,
      errorMessage: mintAttempt.errorMessage,
    });
  } catch (error: any) {
    logger.error("[NFT Mint Job Status] Error polling for job:", error);
    return res.status(500).json({
      error: "Failed to check job status",
      message: error.message,
    });
  }
};

/**
 * REST API endpoint for executing mint after payment
 * POST /api/nft/mint/execute
 * Body: { walletAddress, paymentSignature }
 * Executes the mint server-side after payment is confirmed
 */
export const nftMintExecuteHandler = async (req: Request, res: Response) => {
  try {
    const { walletAddress, paymentSignature } = req.body;

    if (!walletAddress || !paymentSignature) {
      return res.status(400).json({
        error: "Missing walletAddress or paymentSignature",
      });
    }

    // Validate Solana address
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid Solana wallet address",
      });
    }

    logger.info(
      `[NFT Mint API] Executing mint for ${walletAddress} after payment ${paymentSignature}`
    );

    // Instead of executing immediately, create a mint job in the database.
    // A background worker will process this job.
    const existingAttempt = await prisma.mintAttempt.findUnique({
      where: { paymentSignature },
    });

    if (existingAttempt) {
      logger.warn(
        `Mint execution for signature ${paymentSignature} already queued.`
      );
      return res.status(202).json({
        status: "MINT_ALREADY_QUEUED",
        paymentSignature,
      });
    }

    await prisma.mintAttempt.create({
      data: {
        paymentSignature,
        walletAddress,
      },
    });

    return res.status(202).json({
      status: "MINT_QUEUED",
      message:
        "Your payment is confirmed, and your NFT mint has been queued. It will appear in your wallet shortly.",
    });
  } catch (error: any) {
    logger.error("[NFT Mint API] Error executing mint:", error);
    return res.status(500).json({
      error: "Failed to execute mint",
      message: error.message,
    });
  }
};
