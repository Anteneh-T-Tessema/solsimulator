import { PublicKey, Keypair, Transaction } from '@solana/web3.js';

/**
 * Wallet profile configuration
 */
export interface WalletProfile {
  name: string;
  mnemonic?: string; // Optional for deterministic testing
  derivationPath: string;
  network: 'mainnet' | 'devnet' | 'testnet' | 'localhost';
}

/**
 * Wallet instance with encrypted private key
 */
export interface Wallet {
  id: string;
  profile: WalletProfile;
  publicKey: PublicKey;
  encryptedPrivateKey: string;
  createdAt: Date;
  lastUsed: Date;
}

/**
 * Key derivation result
 */
export interface DerivedKey {
  keypair: Keypair;
  publicKey: PublicKey;
  derivationPath: string;
}

/**
 * Transaction signing result
 */
export interface SigningResult {
  signature: Uint8Array;
  signedTransaction: Transaction;
  timestamp: Date;
}

/**
 * Message signing result
 */
export interface MessageSigningResult {
  signature: Uint8Array;
  message: Uint8Array;
  publicKey: PublicKey;
  timestamp: Date;
}

/**
 * Wallet export data
 */
export interface WalletExport {
  profile: WalletProfile;
  mnemonic: string;
  publicKey: string;
  createdAt: Date;
}

/**
 * Seed Vault configuration
 */
export interface SeedVaultConfig {
  encryptionKey?: string; // Optional custom encryption key
  storageLocation?: string; // Optional custom storage location
  autoLock?: boolean; // Auto-lock after inactivity
  lockTimeout?: number; // Lock timeout in milliseconds
}

/**
 * Seed Vault status
 */
export interface SeedVaultStatus {
  isLocked: boolean;
  walletCount: number;
  lastActivity: Date;
  version: string;
}

/**
 * BIP-44 derivation path components
 */
export interface DerivationPathComponents {
  purpose: number; // Usually 44 for BIP-44
  coinType: number; // 501 for Solana
  account: number; // Account index
  change: number; // Change index (0 for external, 1 for internal)
  addressIndex: number; // Address index
}

/**
 * Seed Vault error types
 */
export type SeedVaultErrorCode = 
  | 'VAULT_LOCKED'
  | 'INVALID_MNEMONIC'
  | 'WALLET_NOT_FOUND'
  | 'INVALID_DERIVATION_PATH'
  | 'ENCRYPTION_FAILED'
  | 'DECRYPTION_FAILED'
  | 'INVALID_TRANSACTION'
  | 'SIGNING_FAILED'
  | 'STORAGE_ERROR'
  | 'INVALID_PASSWORD';

/**
 * Seed Vault error
 */
export interface SeedVaultError extends Error {
  code: SeedVaultErrorCode;
  context?: Record<string, unknown>;
}