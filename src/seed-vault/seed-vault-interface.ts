import { PublicKey, Keypair, Transaction } from '@solana/web3.js';
import {
  WalletProfile,
  Wallet,
  DerivedKey,
  SigningResult,
  MessageSigningResult,
  WalletExport,
  SeedVaultConfig,
  SeedVaultStatus,
  DerivationPathComponents
} from './types';

/**
 * Seed Vault Mock Interface
 * 
 * Simulates the Saga phone's Seed Vault for secure key management and transaction signing.
 * Provides cryptographically secure key generation, BIP-44 derivation, and transaction signing
 * with user confirmation simulation.
 */
export interface SeedVaultMock {
  /**
   * Initialize the Seed Vault with configuration
   */
  initialize(config?: SeedVaultConfig): Promise<void>;

  /**
   * Lock the Seed Vault (requires password to unlock)
   */
  lock(): Promise<void>;

  /**
   * Unlock the Seed Vault with password
   */
  unlock(password: string): Promise<void>;

  /**
   * Get current Seed Vault status
   */
  getStatus(): Promise<SeedVaultStatus>;

  /**
   * Generate a new wallet with secure key generation
   */
  generateWallet(profile: WalletProfile): Promise<Wallet>;

  /**
   * Import a wallet from mnemonic phrase
   */
  importWallet(profile: WalletProfile, mnemonic: string): Promise<Wallet>;

  /**
   * Export wallet data (requires unlock)
   */
  exportWallet(walletId: string): Promise<WalletExport>;

  /**
   * List all wallets in the vault
   */
  listWallets(): Promise<Wallet[]>;

  /**
   * Get a specific wallet by ID
   */
  getWallet(walletId: string): Promise<Wallet | null>;

  /**
   * Delete a wallet from the vault
   */
  deleteWallet(walletId: string): Promise<void>;

  /**
   * Derive a keypair from wallet using BIP-44 derivation path
   */
  deriveKeypair(walletId: string, derivationPath: string): Promise<DerivedKey>;

  /**
   * Derive a keypair using path components
   */
  deriveKeypairFromComponents(walletId: string, components: DerivationPathComponents): Promise<DerivedKey>;

  /**
   * Get the public key for a wallet
   */
  getPublicKey(walletId: string): Promise<PublicKey>;

  /**
   * Sign a transaction with user confirmation simulation
   */
  signTransaction(walletId: string, transaction: Transaction, autoApprove?: boolean): Promise<SigningResult>;

  /**
   * Sign multiple transactions
   */
  signTransactions(walletId: string, transactions: Transaction[], autoApprove?: boolean): Promise<SigningResult[]>;

  /**
   * Sign a raw message
   */
  signMessage(walletId: string, message: Uint8Array, autoApprove?: boolean): Promise<MessageSigningResult>;

  /**
   * Sign multiple messages
   */
  signMessages(walletId: string, messages: Uint8Array[], autoApprove?: boolean): Promise<MessageSigningResult[]>;

  /**
   * Validate a mnemonic phrase
   */
  validateMnemonic(mnemonic: string): boolean;

  /**
   * Generate a new mnemonic phrase
   */
  generateMnemonic(strength?: 128 | 160 | 192 | 224 | 256): string;

  /**
   * Parse and validate a BIP-44 derivation path
   */
  parseDerivationPath(path: string): DerivationPathComponents;

  /**
   * Format derivation path components into string
   */
  formatDerivationPath(components: DerivationPathComponents): string;

  /**
   * Clear all data and reset the vault
   */
  reset(): Promise<void>;
}