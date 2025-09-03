import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { Wallet, SeedVaultConfig, SeedVaultError } from './types';

/**
 * Storage interface for Seed Vault data persistence
 */
export interface SeedVaultStorage {
  initialize(config?: SeedVaultConfig): Promise<void>;
  saveWallet(wallet: Wallet): Promise<void>;
  loadWallet(walletId: string): Promise<Wallet | null>;
  loadAllWallets(): Promise<Wallet[]>;
  deleteWallet(walletId: string): Promise<void>;
  saveConfig(config: SeedVaultConfig): Promise<void>;
  loadConfig(): Promise<SeedVaultConfig | null>;
  clear(): Promise<void>;
  exists(): Promise<boolean>;
}

/**
 * File system based storage implementation
 */
export class FileSystemStorage implements SeedVaultStorage {
  private storageDir: string;
  private walletsDir: string;
  private configFile: string;
  private lockFile: string;

  constructor(customStorageLocation?: string) {
    this.storageDir = customStorageLocation || join(homedir(), '.solana-phone-simulator', 'seed-vault');
    this.walletsDir = join(this.storageDir, 'wallets');
    this.configFile = join(this.storageDir, 'config.json');
    this.lockFile = join(this.storageDir, '.lock');
  }

  /**
   * Initialize storage directories and files
   */
  async initialize(config?: SeedVaultConfig): Promise<void> {
    try {
      // Create storage directories
      await this.ensureDirectoryExists(this.storageDir);
      await this.ensureDirectoryExists(this.walletsDir);

      // Save initial config if provided
      if (config) {
        await this.saveConfig(config);
      }
    } catch (error) {
      throw this.createStorageError(`Failed to initialize storage: ${(error as Error).message}`);
    }
  }

  /**
   * Save wallet to storage
   */
  async saveWallet(wallet: Wallet): Promise<void> {
    try {
      const walletFile = join(this.walletsDir, `${wallet.id}.json`);
      const walletData = {
        ...wallet,
        publicKey: wallet.publicKey.toBase58(),
        createdAt: wallet.createdAt.toISOString(),
        lastUsed: wallet.lastUsed.toISOString()
      };

      await fs.writeFile(walletFile, JSON.stringify(walletData, null, 2), 'utf8');
    } catch (error) {
      throw this.createStorageError(`Failed to save wallet ${wallet.id}: ${(error as Error).message}`);
    }
  }

  /**
   * Load wallet from storage
   */
  async loadWallet(walletId: string): Promise<Wallet | null> {
    try {
      const walletFile = join(this.walletsDir, `${walletId}.json`);
      
      if (!(await this.fileExists(walletFile))) {
        return null;
      }

      const walletData = JSON.parse(await fs.readFile(walletFile, 'utf8'));
      
      return {
        ...walletData,
        publicKey: new (await import('@solana/web3.js')).PublicKey(walletData.publicKey),
        createdAt: new Date(walletData.createdAt),
        lastUsed: new Date(walletData.lastUsed)
      };
    } catch (error) {
      throw this.createStorageError(`Failed to load wallet ${walletId}: ${(error as Error).message}`);
    }
  }

  /**
   * Load all wallets from storage
   */
  async loadAllWallets(): Promise<Wallet[]> {
    try {
      const walletFiles = await fs.readdir(this.walletsDir);
      const wallets: Wallet[] = [];

      for (const file of walletFiles) {
        if (file.endsWith('.json')) {
          const walletId = file.replace('.json', '');
          const wallet = await this.loadWallet(walletId);
          if (wallet) {
            wallets.push(wallet);
          }
        }
      }

      return wallets.sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
    } catch (error) {
      throw this.createStorageError(`Failed to load wallets: ${(error as Error).message}`);
    }
  }

  /**
   * Delete wallet from storage
   */
  async deleteWallet(walletId: string): Promise<void> {
    try {
      const walletFile = join(this.walletsDir, `${walletId}.json`);
      
      if (await this.fileExists(walletFile)) {
        await fs.unlink(walletFile);
      }
    } catch (error) {
      throw this.createStorageError(`Failed to delete wallet ${walletId}: ${(error as Error).message}`);
    }
  }

  /**
   * Save configuration to storage
   */
  async saveConfig(config: SeedVaultConfig): Promise<void> {
    try {
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
      throw this.createStorageError(`Failed to save config: ${(error as Error).message}`);
    }
  }

  /**
   * Load configuration from storage
   */
  async loadConfig(): Promise<SeedVaultConfig | null> {
    try {
      if (!(await this.fileExists(this.configFile))) {
        return null;
      }

      const configData = await fs.readFile(this.configFile, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      throw this.createStorageError(`Failed to load config: ${(error as Error).message}`);
    }
  }

  /**
   * Clear all storage data
   */
  async clear(): Promise<void> {
    try {
      // Remove all wallet files
      const walletFiles = await fs.readdir(this.walletsDir);
      for (const file of walletFiles) {
        if (file.endsWith('.json')) {
          await fs.unlink(join(this.walletsDir, file));
        }
      }

      // Remove config file
      if (await this.fileExists(this.configFile)) {
        await fs.unlink(this.configFile);
      }

      // Remove lock file
      if (await this.fileExists(this.lockFile)) {
        await fs.unlink(this.lockFile);
      }
    } catch (error) {
      throw this.createStorageError(`Failed to clear storage: ${(error as Error).message}`);
    }
  }

  /**
   * Check if storage exists
   */
  async exists(): Promise<boolean> {
    try {
      await fs.access(this.storageDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create lock file to indicate vault is locked
   */
  async createLock(): Promise<void> {
    try {
      const lockData = {
        lockedAt: new Date().toISOString(),
        pid: process.pid
      };
      await fs.writeFile(this.lockFile, JSON.stringify(lockData, null, 2), 'utf8');
    } catch (error) {
      throw this.createStorageError(`Failed to create lock: ${(error as Error).message}`);
    }
  }

  /**
   * Remove lock file
   */
  async removeLock(): Promise<void> {
    try {
      if (await this.fileExists(this.lockFile)) {
        await fs.unlink(this.lockFile);
      }
    } catch (error) {
      throw this.createStorageError(`Failed to remove lock: ${(error as Error).message}`);
    }
  }

  /**
   * Check if vault is locked
   */
  async isLocked(): Promise<boolean> {
    return this.fileExists(this.lockFile);
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ walletCount: number; storageSize: number; lastModified: Date }> {
    try {
      const walletFiles = await fs.readdir(this.walletsDir);
      const walletCount = walletFiles.filter(file => file.endsWith('.json')).length;

      let storageSize = 0;
      let lastModified = new Date(0);

      // Calculate total storage size and find last modified date
      for (const file of walletFiles) {
        if (file.endsWith('.json')) {
          const filePath = join(this.walletsDir, file);
          const stats = await fs.stat(filePath);
          storageSize += stats.size;
          if (stats.mtime > lastModified) {
            lastModified = stats.mtime;
          }
        }
      }

      // Include config file
      if (await this.fileExists(this.configFile)) {
        const configStats = await fs.stat(this.configFile);
        storageSize += configStats.size;
        if (configStats.mtime > lastModified) {
          lastModified = configStats.mtime;
        }
      }

      return { walletCount, storageSize, lastModified };
    } catch (error) {
      throw this.createStorageError(`Failed to get storage stats: ${(error as Error).message}`);
    }
  }

  /**
   * Backup storage to specified location
   */
  async backup(backupPath: string): Promise<void> {
    try {
      await this.ensureDirectoryExists(dirname(backupPath));
      
      const backupData = {
        timestamp: new Date().toISOString(),
        wallets: await this.loadAllWallets(),
        config: await this.loadConfig()
      };

      // Serialize wallets for backup
      const serializedData = {
        ...backupData,
        wallets: backupData.wallets.map(wallet => ({
          ...wallet,
          publicKey: wallet.publicKey.toBase58(),
          createdAt: wallet.createdAt.toISOString(),
          lastUsed: wallet.lastUsed.toISOString()
        }))
      };

      await fs.writeFile(backupPath, JSON.stringify(serializedData, null, 2), 'utf8');
    } catch (error) {
      throw this.createStorageError(`Failed to create backup: ${(error as Error).message}`);
    }
  }

  /**
   * Restore storage from backup
   */
  async restore(backupPath: string): Promise<void> {
    try {
      if (!(await this.fileExists(backupPath))) {
        throw new Error('Backup file not found');
      }

      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf8'));
      
      // Clear existing data
      await this.clear();
      
      // Restore config
      if (backupData.config) {
        await this.saveConfig(backupData.config);
      }

      // Restore wallets
      if (backupData.wallets) {
        for (const walletData of backupData.wallets) {
          const wallet: Wallet = {
            ...walletData,
            publicKey: new (await import('@solana/web3.js')).PublicKey(walletData.publicKey),
            createdAt: new Date(walletData.createdAt),
            lastUsed: new Date(walletData.lastUsed)
          };
          await this.saveWallet(wallet);
        }
      }
    } catch (error) {
      throw this.createStorageError(`Failed to restore from backup: ${(error as Error).message}`);
    }
  }

  /**
   * Ensure directory exists, create if it doesn't
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create storage error
   */
  private createStorageError(message: string): SeedVaultError {
    const error = new Error(message) as SeedVaultError;
    error.code = 'STORAGE_ERROR';
    return error;
  }

  /**
   * Get storage directory path
   */
  getStorageDir(): string {
    return this.storageDir;
  }

  /**
   * Get wallets directory path
   */
  getWalletsDir(): string {
    return this.walletsDir;
  }
}

/**
 * In-memory storage implementation for testing
 */
export class MemoryStorage implements SeedVaultStorage {
  private wallets: Map<string, Wallet> = new Map();
  private config: SeedVaultConfig | null = null;
  private locked: boolean = false;

  async initialize(config?: SeedVaultConfig): Promise<void> {
    if (config) {
      this.config = config;
    }
  }

  async saveWallet(wallet: Wallet): Promise<void> {
    this.wallets.set(wallet.id, { ...wallet });
  }

  async loadWallet(walletId: string): Promise<Wallet | null> {
    const wallet = this.wallets.get(walletId);
    return wallet ? { ...wallet } : null;
  }

  async loadAllWallets(): Promise<Wallet[]> {
    return Array.from(this.wallets.values())
      .map(wallet => ({ ...wallet }))
      .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime());
  }

  async deleteWallet(walletId: string): Promise<void> {
    this.wallets.delete(walletId);
  }

  async saveConfig(config: SeedVaultConfig): Promise<void> {
    this.config = { ...config };
  }

  async loadConfig(): Promise<SeedVaultConfig | null> {
    return this.config ? { ...this.config } : null;
  }

  async clear(): Promise<void> {
    this.wallets.clear();
    this.config = null;
    this.locked = false;
  }

  async exists(): Promise<boolean> {
    return true; // Memory storage always "exists"
  }

  async createLock(): Promise<void> {
    this.locked = true;
  }

  async removeLock(): Promise<void> {
    this.locked = false;
  }

  async isLocked(): Promise<boolean> {
    return this.locked;
  }
}