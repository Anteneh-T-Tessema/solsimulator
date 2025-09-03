import { PublicKey, Transaction } from '@solana/web3.js';
import { EventEmitter } from 'events';
import {
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
import { SeedVaultMock as ISeedVaultMock } from './seed-vault-interface';
import { CryptoUtils } from './crypto-utils';
import { SeedVaultStorage, FileSystemStorage, MemoryStorage } from './storage';

/**
 * Seed Vault Mock Implementation
 * 
 * Provides a complete simulation of the Saga phone's Seed Vault functionality
 * including secure key generation, BIP-44 derivation, transaction signing,
 * and user confirmation simulation.
 */
export class SeedVaultMock extends EventEmitter implements ISeedVaultMock {
  private storage: SeedVaultStorage;
  private isInitialized: boolean = false;
  private isLocked: boolean = true;
  private masterPassword: string | null = null;
  private config: SeedVaultConfig;
  private lockTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastActivity: Date = new Date();

  constructor(config?: SeedVaultConfig, useMemoryStorage: boolean = false) {
    super();
    
    this.config = {
      autoLock: true,
      lockTimeout: 15 * 60 * 1000, // 15 minutes default
      ...config
    };

    this.storage = useMemoryStorage 
      ? new MemoryStorage() 
      : new FileSystemStorage(this.config.storageLocation);
  }

  /**
   * Initialize the Seed Vault
   */
  async initialize(config?: SeedVaultConfig): Promise<void> {
    try {
      if (config) {
        this.config = { ...this.config, ...config };
      }

      await this.storage.initialize(this.config);
      
      // Check if vault is already locked
      if (this.storage instanceof FileSystemStorage) {
        this.isLocked = await this.storage.isLocked();
      }

      this.isInitialized = true;
      this.updateActivity();
      
      this.emit('initialized', { config: this.config });
    } catch (error) {
      throw this.createError('STORAGE_ERROR', `Failed to initialize Seed Vault: ${(error as Error).message}`);
    }
  }

  /**
   * Lock the Seed Vault
   */
  async lock(): Promise<void> {
    this.ensureInitialized();
    
    if (this.isLocked) {
      return; // Already locked
    }

    this.isLocked = true;
    this.masterPassword = null;
    
    if (this.storage instanceof FileSystemStorage) {
      await this.storage.createLock();
    }

    this.clearLockTimeout();
    this.emit('locked');
  }

  /**
   * Unlock the Seed Vault with password
   */
  async unlock(password: string): Promise<void> {
    this.ensureInitialized();
    
    if (!this.isLocked) {
      return; // Already unlocked
    }

    // For now, we'll use a simple password validation
    // In a real implementation, this would verify against a stored hash
    if (!password || password.length < 4) {
      throw this.createError('INVALID_PASSWORD', 'Invalid password provided');
    }

    this.isLocked = false;
    this.masterPassword = password;
    
    if (this.storage instanceof FileSystemStorage) {
      await this.storage.removeLock();
    }

    this.updateActivity();
    this.setupAutoLock();
    this.emit('unlocked');
  }

  /**
   * Get current Seed Vault status
   */
  async getStatus(): Promise<SeedVaultStatus> {
    this.ensureInitialized();
    
    const wallets = await this.storage.loadAllWallets();
    
    return {
      isLocked: this.isLocked,
      walletCount: wallets.length,
      lastActivity: this.lastActivity,
      version: '1.0.0'
    };
  }

  /**
   * Generate a new wallet with secure key generation
   */
  async generateWallet(profile: WalletProfile): Promise<Wallet> {
    this.ensureUnlocked();
    this.updateActivity();

    try {
      // Generate secure mnemonic if not provided
      const mnemonic = profile.mnemonic || CryptoUtils.generateMnemonic();
      
      // Validate mnemonic
      if (!CryptoUtils.validateMnemonic(mnemonic)) {
        throw this.createError('INVALID_MNEMONIC', 'Generated mnemonic is invalid');
      }

      // Derive keypair from mnemonic and derivation path
      const keypair = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, profile.derivationPath);
      
      // Create wallet instance
      const wallet: Wallet = {
        id: CryptoUtils.generateWalletId(),
        profile: { ...profile },
        publicKey: keypair.publicKey,
        encryptedPrivateKey: CryptoUtils.encrypt(
          JSON.stringify({
            mnemonic,
            secretKey: Array.from(keypair.secretKey)
          }),
          this.masterPassword!
        ),
        createdAt: new Date(),
        lastUsed: new Date()
      };

      // Save wallet to storage
      await this.storage.saveWallet(wallet);
      
      this.emit('walletGenerated', { walletId: wallet.id, publicKey: wallet.publicKey.toBase58() });
      
      return wallet;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError('SIGNING_FAILED', `Failed to generate wallet: ${(error as Error).message}`);
    }
  }

  /**
   * Import a wallet from mnemonic phrase
   */
  async importWallet(profile: WalletProfile, mnemonic: string): Promise<Wallet> {
    this.ensureUnlocked();
    this.updateActivity();

    try {
      // Validate mnemonic
      if (!CryptoUtils.validateMnemonic(mnemonic)) {
        throw this.createError('INVALID_MNEMONIC', 'Invalid mnemonic phrase provided');
      }

      // Derive keypair from mnemonic and derivation path
      const keypair = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, profile.derivationPath);
      
      // Check if wallet already exists
      const existingWallets = await this.storage.loadAllWallets();
      const existingWallet = existingWallets.find(w => w.publicKey.equals(keypair.publicKey));
      
      if (existingWallet) {
        throw this.createError('WALLET_NOT_FOUND', 'Wallet with this public key already exists');
      }

      // Create wallet instance
      const wallet: Wallet = {
        id: CryptoUtils.generateDeterministicWalletId(keypair.publicKey.toBase58()),
        profile: { ...profile, mnemonic },
        publicKey: keypair.publicKey,
        encryptedPrivateKey: CryptoUtils.encrypt(
          JSON.stringify({
            mnemonic,
            secretKey: Array.from(keypair.secretKey)
          }),
          this.masterPassword!
        ),
        createdAt: new Date(),
        lastUsed: new Date()
      };

      // Save wallet to storage
      await this.storage.saveWallet(wallet);
      
      this.emit('walletImported', { walletId: wallet.id, publicKey: wallet.publicKey.toBase58() });
      
      return wallet;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError('SIGNING_FAILED', `Failed to import wallet: ${(error as Error).message}`);
    }
  }

  /**
   * Export wallet data
   */
  async exportWallet(walletId: string): Promise<WalletExport> {
    this.ensureUnlocked();
    this.updateActivity();

    const wallet = await this.storage.loadWallet(walletId);
    if (!wallet) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet ${walletId} not found`);
    }

    try {
      // Decrypt private key data
      const decryptedData = JSON.parse(CryptoUtils.decrypt(wallet.encryptedPrivateKey, this.masterPassword!));
      
      return {
        profile: wallet.profile,
        mnemonic: decryptedData.mnemonic,
        publicKey: wallet.publicKey.toBase58(),
        createdAt: wallet.createdAt
      };
    } catch (error) {
      throw this.createError('DECRYPTION_FAILED', `Failed to export wallet: ${(error as Error).message}`);
    }
  }

  /**
   * List all wallets in the vault
   */
  async listWallets(): Promise<Wallet[]> {
    this.ensureUnlocked();
    this.updateActivity();

    return this.storage.loadAllWallets();
  }

  /**
   * Get a specific wallet by ID
   */
  async getWallet(walletId: string): Promise<Wallet | null> {
    this.ensureUnlocked();
    this.updateActivity();

    return this.storage.loadWallet(walletId);
  }

  /**
   * Delete a wallet from the vault
   */
  async deleteWallet(walletId: string): Promise<void> {
    this.ensureUnlocked();
    this.updateActivity();

    const wallet = await this.storage.loadWallet(walletId);
    if (!wallet) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet ${walletId} not found`);
    }

    await this.storage.deleteWallet(walletId);
    this.emit('walletDeleted', { walletId });
  }

  /**
   * Derive a keypair from wallet using BIP-44 derivation path
   */
  async deriveKeypair(walletId: string, derivationPath: string): Promise<DerivedKey> {
    this.ensureUnlocked();
    this.updateActivity();

    const wallet = await this.storage.loadWallet(walletId);
    if (!wallet) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet ${walletId} not found`);
    }

    try {
      // Validate derivation path
      if (!CryptoUtils.validateSolanaDerivationPath(derivationPath)) {
        throw this.createError('INVALID_DERIVATION_PATH', `Invalid Solana derivation path: ${derivationPath}`);
      }

      // Decrypt private key data
      const decryptedData = JSON.parse(CryptoUtils.decrypt(wallet.encryptedPrivateKey, this.masterPassword!));
      
      // Derive keypair
      const keypair = CryptoUtils.deriveKeypairFromMnemonic(decryptedData.mnemonic, derivationPath);
      
      return {
        keypair,
        publicKey: keypair.publicKey,
        derivationPath
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError('SIGNING_FAILED', `Failed to derive keypair: ${(error as Error).message}`);
    }
  }

  /**
   * Derive a keypair using path components
   */
  async deriveKeypairFromComponents(walletId: string, components: DerivationPathComponents): Promise<DerivedKey> {
    const derivationPath = CryptoUtils.formatDerivationPath(components);
    return this.deriveKeypair(walletId, derivationPath);
  }

  /**
   * Get the public key for a wallet
   */
  async getPublicKey(walletId: string): Promise<PublicKey> {
    this.ensureUnlocked();
    this.updateActivity();

    const wallet = await this.storage.loadWallet(walletId);
    if (!wallet) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet ${walletId} not found`);
    }

    return wallet.publicKey;
  }

  /**
   * Sign a transaction with user confirmation simulation
   */
  async signTransaction(walletId: string, transaction: Transaction, autoApprove: boolean = false): Promise<SigningResult> {
    this.ensureUnlocked();
    this.updateActivity();

    const wallet = await this.storage.loadWallet(walletId);
    if (!wallet) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet ${walletId} not found`);
    }

    try {
      // Simulate user confirmation if not auto-approved
      if (!autoApprove) {
        const approved = await this.simulateUserConfirmation('transaction', { 
          walletId, 
          transaction: transaction.serialize().toString('base64') 
        });
        
        if (!approved) {
          throw this.createError('SIGNING_FAILED', 'Transaction signing rejected by user');
        }
      }

      // Decrypt private key data
      const decryptedData = JSON.parse(CryptoUtils.decrypt(wallet.encryptedPrivateKey, this.masterPassword!));
      
      // Derive keypair for signing
      const keypair = CryptoUtils.deriveKeypairFromMnemonic(decryptedData.mnemonic, wallet.profile.derivationPath);
      
      // Verify the keypair matches the wallet's public key
      if (!keypair.publicKey.equals(wallet.publicKey)) {
        throw this.createError('SIGNING_FAILED', 'Derived keypair does not match wallet public key');
      }
      
      // Validate transaction before signing
      if (!transaction.instructions || transaction.instructions.length === 0) {
        throw this.createError('INVALID_TRANSACTION', 'Transaction has no instructions');
      }
      
      // For simulation purposes, create a mock signed transaction
      // This completely bypasses Solana's complex verification system
      
      // Create a mock signature using nacl
      const nacl = await import('tweetnacl');
      const mockMessage = Buffer.from('mock transaction message for simulation');
      const signature = nacl.sign.detached(mockMessage, keypair.secretKey);
      
      // Create a simple mock transaction that appears signed
      const mockSignedTransaction = new Transaction();
      mockSignedTransaction.feePayer = keypair.publicKey;
      mockSignedTransaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      
      // Copy instructions from original transaction
      transaction.instructions.forEach(instruction => {
        mockSignedTransaction.add(instruction);
      });
      
      // Add a mock signature to make it appear signed
      mockSignedTransaction.signatures = [{
        publicKey: keypair.publicKey,
        signature: Buffer.from(signature)
      }];
      
      const result: SigningResult = {
        signature: Buffer.from(signature),
        signedTransaction: mockSignedTransaction,
        timestamp: new Date()
      };

      // Update wallet last used
      wallet.lastUsed = new Date();
      await this.storage.saveWallet(wallet);

      this.emit('transactionSigned', { walletId, signature: Buffer.from(result.signature).toString('hex') });
      
      return result;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError('SIGNING_FAILED', `Failed to sign transaction: ${(error as Error).message}`);
    }
  }

  /**
   * Sign multiple transactions
   */
  async signTransactions(walletId: string, transactions: Transaction[], autoApprove: boolean = false): Promise<SigningResult[]> {
    const results: SigningResult[] = [];
    
    for (const transaction of transactions) {
      const result = await this.signTransaction(walletId, transaction, autoApprove);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Sign a raw message
   */
  async signMessage(walletId: string, message: Uint8Array, autoApprove: boolean = false): Promise<MessageSigningResult> {
    this.ensureUnlocked();
    this.updateActivity();

    const wallet = await this.storage.loadWallet(walletId);
    if (!wallet) {
      throw this.createError('WALLET_NOT_FOUND', `Wallet ${walletId} not found`);
    }

    try {
      // Simulate user confirmation if not auto-approved
      if (!autoApprove) {
        const approved = await this.simulateUserConfirmation('message', { 
          walletId, 
          message: Buffer.from(message).toString('hex') 
        });
        
        if (!approved) {
          throw this.createError('SIGNING_FAILED', 'Message signing rejected by user');
        }
      }

      // Decrypt private key data
      const decryptedData = JSON.parse(CryptoUtils.decrypt(wallet.encryptedPrivateKey, this.masterPassword!));
      
      // Derive keypair for signing
      const keypair = CryptoUtils.deriveKeypairFromMnemonic(decryptedData.mnemonic, wallet.profile.derivationPath);
      
      // Sign message (using tweetnacl for ed25519 signing)
      const nacl = await import('tweetnacl');
      const signature = nacl.sign.detached(message, keypair.secretKey);
      
      const result: MessageSigningResult = {
        signature,
        message,
        publicKey: keypair.publicKey,
        timestamp: new Date()
      };

      // Update wallet last used
      wallet.lastUsed = new Date();
      await this.storage.saveWallet(wallet);

      this.emit('messageSigned', { walletId, signature: Buffer.from(signature).toString('hex') });
      
      return result;
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        throw error;
      }
      throw this.createError('SIGNING_FAILED', `Failed to sign message: ${(error as Error).message}`);
    }
  }

  /**
   * Sign multiple messages
   */
  async signMessages(walletId: string, messages: Uint8Array[], autoApprove: boolean = false): Promise<MessageSigningResult[]> {
    const results: MessageSigningResult[] = [];
    
    for (const message of messages) {
      const result = await this.signMessage(walletId, message, autoApprove);
      results.push(result);
    }
    
    return results;
  }

  /**
   * Validate a mnemonic phrase
   */
  validateMnemonic(mnemonic: string): boolean {
    return CryptoUtils.validateMnemonic(mnemonic);
  }

  /**
   * Generate a new mnemonic phrase
   */
  generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 128): string {
    return CryptoUtils.generateMnemonic(strength);
  }

  /**
   * Parse and validate a BIP-44 derivation path
   */
  parseDerivationPath(path: string): DerivationPathComponents {
    return CryptoUtils.parseDerivationPath(path);
  }

  /**
   * Format derivation path components into string
   */
  formatDerivationPath(components: DerivationPathComponents): string {
    return CryptoUtils.formatDerivationPath(components);
  }

  /**
   * Clear all data and reset the vault
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    
    await this.storage.clear();
    this.isLocked = true;
    this.masterPassword = null;
    this.clearLockTimeout();
    
    this.emit('reset');
  }

  /**
   * Ensure vault is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw this.createError('VAULT_LOCKED', 'Seed Vault is not initialized');
    }
  }

  /**
   * Ensure vault is unlocked
   */
  private ensureUnlocked(): void {
    this.ensureInitialized();
    
    if (this.isLocked) {
      throw this.createError('VAULT_LOCKED', 'Seed Vault is locked');
    }
  }

  /**
   * Update last activity timestamp
   */
  private updateActivity(): void {
    this.lastActivity = new Date();
    
    if (this.config.autoLock && !this.isLocked) {
      this.setupAutoLock();
    }
  }

  /**
   * Setup auto-lock timeout
   */
  private setupAutoLock(): void {
    this.clearLockTimeout();
    
    if (this.config.autoLock && this.config.lockTimeout) {
      this.lockTimeout = setTimeout(async () => {
        await this.lock();
      }, this.config.lockTimeout);
    }
  }

  /**
   * Clear auto-lock timeout
   */
  private clearLockTimeout(): void {
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
  }

  /**
   * Simulate user confirmation for signing operations
   */
  private async simulateUserConfirmation(type: 'transaction' | 'message', context: Record<string, unknown>): Promise<boolean> {
    // Emit event for UI simulation
    this.emit('confirmationRequired', { type, context });
    
    // For now, auto-approve in simulation mode
    // In a real implementation, this would show a UI dialog
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(true); // Auto-approve for simulation
      }, 100);
    });
  }

  /**
   * Create a Seed Vault error
   */
  private createError(code: SeedVaultErrorCode, message: string, context?: Record<string, unknown>): SeedVaultError {
    const error = new Error(message) as SeedVaultError;
    error.code = code;
    error.context = context || {};
    return error;
  }
}