import {
  Connection,
  PublicKey,
  Transaction,
  TransactionSignature,
  ParsedTransactionWithMeta,
  Keypair,
  VersionedTransaction
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount as getTokenAccount,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { encodeURL, createQR, parseURL, validateTransfer } from "@solana/pay";
import { solanaConnection, PROGRAM_IDS } from "../../config/solana";
import { logger } from "../../utils/logger";
import BigNumber from "bignumber.js";

export interface PaymentRequest {
  url: string;
  qrCode: string;
  reference: string;
}

export class SolanaPayService {
  private connection: Connection;
  private merchantWallet: PublicKey;
  private merchantKeypair: Keypair;
  private usdcMint: PublicKey;
  private readonly DECIMALS = 6; // USDC has 6 decimals

  constructor() {
    this.connection = solanaConnection;
    this.merchantWallet = new PublicKey(process.env.MERCHANT_WALLET_ADDRESS!);
    this.merchantKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(process.env.MERCHANT_WALLET_PRIVATE_KEY!))
    );
    this.usdcMint = PROGRAM_IDS.USDC_MINT;
  }

  async createPaymentRequest(
    amount: number,
    reference: PublicKey,
    label: string,
    message: string
  ): Promise<PaymentRequest> {
    try {
      // USDC has 6 decimals
      const amountBigNumber = new BigNumber(amount);

      const url = encodeURL({
        recipient: this.merchantWallet,
        amount: amountBigNumber,
        splToken: this.usdcMint,
        reference,
        label,
        message,
      });

      const qrCode = await this.generateQRCode(url);

      logger.info(
        `Payment request created: ${amount} USDC, reference: ${reference.toString()}`
      );

      return {
        url: url.toString(),
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
      logger.info(`Verifying transaction: ${signature}`);

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, "confirmed");

      // Get transaction details
      const transaction = await this.connection.getParsedTransaction(
        signature,
        { commitment: "confirmed", maxSupportedTransactionVersion: 0 }
      );

      if (!transaction) {
        logger.warn(`Transaction not found: ${signature}`);
        return false;
      }

      // Verify reference is in transaction
      const hasReference = transaction.transaction.message.accountKeys.some(
        (key) => key.pubkey.equals(reference)
      );

      if (!hasReference) {
        logger.warn(`Reference not found in transaction: ${signature}`);
        return false;
      }

      // Verify token transfer amount
      const isValid = await this.verifyTokenTransfer(
        transaction,
        this.merchantWallet,
        expectedAmount
      );

      logger.info(`Transaction verification result: ${isValid}`);
      return isValid;
    } catch (error) {
      logger.error("Transaction verification failed:", error);
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

  private async generateQRCode(url: URL): Promise<string> {
    try {
      const qr = createQR(url, 512, "transparent");
      const qrBuffer = await qr.getRawData("png");
      return `data:image/png;base64,${qrBuffer?.toString("base64")}`;
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
      const signature = await this.connection.sendRawTransaction(
        serialized,
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );
      
      logger.info(`Transaction sent: ${signature}`);
      return signature;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error sending transaction:', errorMessage);
      throw new Error(`Failed to send transaction: ${errorMessage}`);
    }
  }

  async confirmTransaction(
    signature: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed'
  ): Promise<boolean> {
    try {
      const status = await this.connection.confirmTransaction(signature, commitment);
      if (status.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }
      logger.info(`Transaction ${signature} confirmed`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error confirming transaction:', errorMessage);
      return false;
    }
  }

  async getTransactionDetails(signature: string): Promise<any> {
    try {
      return await this.connection.getParsedTransaction(
        signature,
        { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error fetching transaction details:', errorMessage);
      throw error;
    }
  }
}
