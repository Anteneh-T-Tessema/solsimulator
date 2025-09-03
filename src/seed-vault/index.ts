/**
 * Seed Vault Mock Module
 * 
 * Provides a complete simulation of the Saga phone's Seed Vault functionality
 * including secure key generation, BIP-44 derivation, transaction signing,
 * and user confirmation simulation.
 */

export { SeedVaultMock } from './seed-vault-mock';
export { SeedVaultMock as ISeedVaultMock } from './seed-vault-interface';
export { CryptoUtils } from './crypto-utils';
export { SeedVaultStorage, FileSystemStorage, MemoryStorage } from './storage';

export {
  WalletProfile,
  Wallet,
  DerivedKey,
  SigningResult,
  MessageSigningResult,
  WalletExport,
  SeedVaultConfig,
  SeedVaultStatus,
  DerivationPathComponents,
  SeedVaultError,
  SeedVaultErrorCode
} from './types';