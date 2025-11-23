import {
  Connection,
  PublicKey,
  Transaction,
  ParsedTransactionWithMeta,
  Keypair,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
} from "@solana/spl-token"; // createQR is removed as it's for client-side
import { encodeURL, parseURL, validateTransfer } from "@solana/pay";
import { solanaConnection, PROGRAM_IDS } from "../../config/solana";
import { logger } from "../../utils/logger";
import BigNumber from "bignumber.js";
import qrcode from "qrcode"; // Use a server-side friendly QR code library

export interface PaymentRequest {
  url: string;
  qrCode: string;
  reference: string;
}

export class SolanaPayService {
  public connection: Connection;
  private merchantWallet: PublicKey;
  private merchantKeypair: Keypair;
  private usdcMint: PublicKey;
  private readonly DECIMALS = 6; // USDC has 6 decimals

  constructor() {
    this.connection = solanaConnection;

    // 1. Public key (must be base58 string, e.g. 7x123...abc)
    this.merchantWallet = new PublicKey(process.env.MERCHANT_WALLET_ADDRESS!);

    // 2. Private key (must be the [1,2,3,...] array string)
    const secretKeyString = process.env.MERCHANT_WALLET_PRIVATE_KEY;
    if (!secretKeyString) {
      throw new Error(
        "Missing MERCHANT_WALLET_PRIVATE_KEY environment variable"
      );
    }

    let secretKey: Uint8Array;
    try {
      const parsed = JSON.parse(secretKeyString);
      if (!Array.isArray(parsed) || parsed.length !== 64) {
        throw new Error("Private key must be a 64-number array");
      }
      secretKey = Uint8Array.from(parsed);
    } catch (e) {
      throw new Error(`Invalid MERCHANT_WALLET_PRIVATE_KEY format: `);
    }

    this.merchantKeypair = Keypair.fromSecretKey(secretKey);

    this.usdcMint = PROGRAM_IDS.USDC_MINT;

    logger.info(
      `[SolanaPayService] Initialized with merchant wallet: ${this.merchantWallet.toBase58()}`
    );
  }

  async createPaymentRequest(
    amount: number,
    reference: PublicKey,
    label: string,
    message: string,
    bookingId?: string
  ): Promise<PaymentRequest> {
    try {
      logger.info(
        `[createPaymentRequest] Received request: amount=${amount}, reference=${reference.toBase58()}`
      );
      const isMainnet = process.env.SOLANA_NETWORK === "mainnet-beta";
      let paymentAmount: BigNumber;
      let splToken: PublicKey | undefined;
      let finalMessage = message;

      if (isMainnet) {
        // Mainnet: Use USDC directly.
        paymentAmount = new BigNumber(amount);
        splToken = new PublicKey(
          "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        ); // Mainnet USDC
        logger.info(`[SolanaPay] Creating mainnet payment for ${amount} USDC.`);
      } else {
        // Devnet: Convert USDC to an equivalent amount in SOL for testing.
        // This rate is for testing convenience and should be periodically updated.
        const usdcToSolRate = 0.0085; // Approx. rate: 1 USDC ≈ 0.0085 SOL
        const solAmount = new BigNumber(amount).times(usdcToSolRate);
        paymentAmount = solAmount;
        splToken = undefined; // Omit splToken to request native SOL.
        finalMessage = `${message} (~${solAmount.toPrecision(4)} SOL)`;
        logger.info(
          `[SolanaPay] Creating devnet payment for ${amount} USDC as ${solAmount.toPrecision(
            4
          )} SOL.`
        );
      }

      // REVERTING to the simple Transfer Request flow.
      const urlParams: any = {
        recipient: this.merchantWallet,
        amount: paymentAmount,
        reference,
        label,
        memo: finalMessage,
      };

      // Add splToken only if it's a mainnet USDC transaction
      if (splToken) {
        urlParams.splToken = splToken;
      }

      // 1. Create the base Solana Pay URL.
      const baseUrl = encodeURL(urlParams);

      // 2. Create return URL with booking context (Solana Pay will append signature)
      // The return URL should include the reference and bookingId so we can identify the booking
      // Solana Pay will append &signature=xxx to this URL
      let returnUrlPath = `gocabs://processing-transaction?reference=${reference.toBase58()}`;
      if (bookingId) {
        returnUrlPath += `&bookingId=${bookingId}`;
      }
      const returnUrl = encodeURIComponent(returnUrlPath);
      const finalUrl = `${baseUrl.toString()}&return=${returnUrl}`;

      // 3. Generate the QR code from the *exact same* final URL.
      const qrCode = await this.generateQRCode(finalUrl);

      logger.info(
        `[createPaymentRequest] Generated Solana Pay URL: ${finalUrl}`
      );

      return {
        url: finalUrl,
        qrCode,
        reference: reference.toString(),
      };
    } catch (error) {
      logger.error("Failed to create payment request:", error);
      throw new Error("Failed to create payment request");
    }
  }

  async verifyTransaction(
    signature: string,
    reference: PublicKey,
    expectedAmount: number
  ): Promise<boolean> {
    try {
      logger.info(
        `[verifyTransaction] Verifying signature: ${signature} for reference: ${reference.toBase58()}, expectedAmount: ${expectedAmount}`
      );

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, "confirmed");

      // Get transaction details
      const transaction = await this.connection.getParsedTransaction(
        signature,
        { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
      );

      if (!transaction) {
        logger.warn(
          `[verifyTransaction] Transaction not found after confirmation: ${signature}`
        );
        return false;
      }

      // Verify reference is in transaction
      const hasReference = transaction.transaction.message.accountKeys.some(
        (key) => key.pubkey.equals(reference)
      );

      if (!hasReference) {
        logger.warn(
          `[verifyTransaction] Reference ${reference.toBase58()} not found in transaction: ${signature}`
        );
        return false;
      }

      const isMainnet = process.env.SOLANA_NETWORK === "mainnet-beta";
      let isValid = false;

      if (isMainnet) {
        // On mainnet, verify the USDC token transfer
        logger.info(`[Verify] Running mainnet (USDC) verification.`);
        isValid = await this.verifyTokenTransfer(
          transaction,
          this.merchantWallet,
          expectedAmount
        );
      } else {
        // On devnet, verify the native SOL transfer
        logger.info(`[Verify] Running devnet (SOL) verification.`);
        const usdcToSolRate = 0.0085; // Must match the rate in createPaymentRequest
        const expectedSolAmount = new BigNumber(expectedAmount).times(
          usdcToSolRate
        );
        isValid = this.verifySolTransfer(
          transaction,
          this.merchantWallet,
          expectedSolAmount
        );
      }

      logger.info(
        `[verifyTransaction] Final verification result for ${signature}: ${isValid}`
      );
      return isValid;
    } catch (error) {
      logger.error(`[verifyTransaction] Error verifying ${signature}:`, error);
      return false;
    }
  }

  private async verifyTokenTransfer(
    transaction: ParsedTransactionWithMeta,
    recipient: PublicKey,
    expectedAmount: number
  ): Promise<boolean> {
    try {
      const preBalances = transaction.meta?.preTokenBalances || [];
      const postBalances = transaction.meta?.postTokenBalances || [];

      // Find recipient's token account balance change
      for (const postBalance of postBalances) {
        if (postBalance.owner === recipient.toString()) {
          const preBalance = preBalances.find(
            (pre) => pre.accountIndex === postBalance.accountIndex
          );

          if (preBalance) {
            const amountReceived =
              parseFloat(postBalance.uiTokenAmount.uiAmountString || "0") -
              parseFloat(preBalance.uiTokenAmount.uiAmountString || "0");

            // Allow small rounding errors (0.01 USDC)
            const isValid = Math.abs(amountReceived - expectedAmount) < 0.01;

            logger.info(
              `Amount verification: expected ${expectedAmount}, received ${amountReceived}, valid: ${isValid}`
            );
            return isValid;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error("Token transfer verification failed:", error);
      return false;
    }
  }

  private verifySolTransfer(
    transaction: ParsedTransactionWithMeta,
    recipient: PublicKey,
    expectedAmount: BigNumber
  ): boolean {
    try {
      const recipientIndex =
        transaction.transaction.message.accountKeys.findIndex((key) =>
          key.pubkey.equals(recipient)
        );

      if (recipientIndex === -1) {
        logger.warn(
          `[Verify SOL] Recipient ${recipient.toBase58()} not found in transaction.`
        );
        return false;
      }

      const preBalance = transaction.meta?.preBalances[recipientIndex] || 0;
      const postBalance = transaction.meta?.postBalances[recipientIndex] || 0;

      const amountReceivedLamports = postBalance - preBalance;
      const amountReceivedSol = new BigNumber(amountReceivedLamports).div(
        1_000_000_000
      );

      // Allow a small tolerance for floating point inaccuracies
      const isValid = amountReceivedSol.isGreaterThanOrEqualTo(
        expectedAmount.times(0.999)
      );

      logger.info(
        `[Verify SOL] Amount verification: expected ~${expectedAmount.toPrecision(
          8
        )} SOL, received ${amountReceivedSol.toPrecision(
          8
        )} SOL. Valid: ${isValid}`
      );

      return isValid;
    } catch (error) {
      logger.error("[Verify SOL] SOL transfer verification failed:", error);
      return false;
    }
  }

  async createUSDCTransfer(
    fromWallet: PublicKey,
    toWallet: PublicKey,
    amount: number
  ): Promise<Transaction> {
    try {
      const fromTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        fromWallet
      );

      const toTokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        toWallet
      );

      // USDC has 6 decimals
      const amountInSmallestUnit = Math.floor(amount * 1_000_000);

      const transaction = new Transaction();

      transaction.add(
        createTransferCheckedInstruction(
          fromTokenAccount,
          this.usdcMint,
          toTokenAccount,
          fromWallet,
          amountInSmallestUnit,
          6 // USDC decimals
        )
      );

      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromWallet;

      logger.info(`USDC transfer transaction created: ${amount} USDC`);
      return transaction;
    } catch (error) {
      logger.error("Failed to create USDC transfer:", error);
      throw new Error("Failed to create USDC transfer transaction");
    }
  }

  private async generateQRCode(url: string): Promise<string> {
    try {
      // Switched from @solana/pay's createQR to the 'qrcode' library
      // to generate the QR code on the server without a DOM.
      return await qrcode.toDataURL(url, {
        errorCorrectionLevel: "high",
      });
    } catch (error) {
      logger.error("Failed to generate QR code:", error);
      return "";
    }
  }

  async getUSDCBalance(walletAddress: PublicKey): Promise<number> {
    try {
      const tokenAccount = await getAssociatedTokenAddress(
        this.usdcMint,
        walletAddress
      );

      const accountInfo = await getTokenAccount(this.connection, tokenAccount);
      const balance = Number(accountInfo.amount) / 1_000_000; // Convert from smallest unit

      return balance;
    } catch (error) {
      logger.error("Failed to get USDC balance:", error);
      return 0;
    }
  }

  async signAndSendTransaction(transaction: Transaction): Promise<string> {
    try {
      // Sign the transaction
      transaction.sign(this.merchantKeypair);

      // Send the transaction
      const serialized = transaction.serialize();
      const signature = await this.connection.sendRawTransaction(serialized, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      logger.info(`Transaction sent: ${signature}`);
      return signature;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error sending transaction:", errorMessage);
      throw new Error(`Failed to send transaction: ${errorMessage}`);
    }
  }

  async confirmTransaction(
    signature: string,
    commitment: "processed" | "confirmed" | "finalized" = "confirmed"
  ): Promise<boolean> {
    try {
      const status = await this.connection.confirmTransaction(
        signature,
        commitment
      );
      if (status.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(status.value.err)}`
        );
      }
      logger.info(`Transaction ${signature} confirmed`);
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error confirming transaction:", errorMessage);
      return false;
    }
  }

  async getTransactionDetails(signature: string): Promise<any> {
    try {
      return await this.connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("Error fetching transaction details:", errorMessage);
      throw error;
    }
  }

  async findTransactionSignature(
    reference: PublicKey,
    commitment: "confirmed" | "finalized" = "confirmed"
  ): Promise<string | null> {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        reference,
        { limit: 1 },
        commitment
      );

      if (signatures.length > 0) {
        const signatureInfo = signatures[0]; // This is where the potential issue is.
        if (signatureInfo) {
          logger.info(
            `[findTransactionSignature] Found signature ${
              signatureInfo.signature
            } for reference ${reference.toBase58()}`
          );
          return signatureInfo.signature;
        }
      }

      return null;
    } catch (error) {
      logger.error(
        `Error finding transaction signature for reference ${reference.toBase58()}:`,
        error
      );
      return null;
    }
  }
}
