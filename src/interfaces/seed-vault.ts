import { PublicKey, Transaction, Keypair } from '@solana/web3.js';
import { Wallet, WalletProfile } from './common';

/**
 * Seed Vault Mock Interface
 * Simulates the Saga phone's Seed Vault for secure key management
 */

export interface SignedTransaction {
  transaction: Transaction;
  signature: string;
}

export interface SeedVaultMock {
  /**
   * Generate a new wallet with the given profile
   */
  generateWallet(profile: WalletProfile): Promise<Wallet>;

  /**
   * Import a wallet from a mnemonic phrase
   */
  importWallet(profile: WalletProfile, mnemonic: string): Promise<Wallet>;

  /**
   * Derive a keypair from a wallet using the specified derivation path
   */
  deriveKeypair(wallet: Wallet, derivationPath: string): Promise<Keypair>;

  /**
   * Sign a transaction using the wallet's private key
   */
  signTransaction(wallet: Wallet, transaction: Transaction): Promise<SignedTransaction>;

  /**
   * Sign an arbitrary message using the wallet's private key
   */
  signMessage(wallet: Wallet, message: Uint8Array): Promise<Uint8Array>;

  /**
   * Export the public key for a wallet
   */
  exportPublicKey(wallet: Wallet): Promise<PublicKey>;

  /**
   * Get all available wallets
   */
  getWallets(): Promise<Wallet[]>;

  /**
   * Get a specific wallet by ID
   */
  getWallet(walletId: string): Promise<Wallet | null>;

  /**
   * Delete a wallet (for testing purposes)
   */
  deleteWallet(walletId: string): Promise<void>;

  /**
   * Check if a wallet exists
   */
  hasWallet(walletId: string): Promise<boolean>;
}