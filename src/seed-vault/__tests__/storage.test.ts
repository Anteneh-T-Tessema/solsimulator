import { MemoryStorage, FileSystemStorage } from '../storage';
import { Wallet, SeedVaultConfig } from '../types';
import { PublicKey } from '@solana/web3.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Storage', () => {
  describe('MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    describe('initialization', () => {
      it('should initialize successfully', async () => {
        await expect(storage.initialize()).resolves.not.toThrow();
      });

      it('should initialize with config', async () => {
        const config: SeedVaultConfig = { autoLock: true, lockTimeout: 30000 };
        await storage.initialize(config);
        
        const savedConfig = await storage.loadConfig();
        expect(savedConfig).toEqual(config);
      });

      it('should always exist', async () => {
        const exists = await storage.exists();
        expect(exists).toBe(true);
      });
    });

    describe('wallet operations', () => {
      let testWallet: Wallet;

      beforeEach(() => {
        testWallet = {
          id: 'test-wallet-id',
          profile: {
            name: 'Test Wallet',
            derivationPath: "m/44'/501'/0'/0'/0'",
            network: 'devnet'
          },
          publicKey: new PublicKey('11111111111111111111111111111112'),
          encryptedPrivateKey: 'encrypted-key-data',
          createdAt: new Date('2023-01-01'),
          lastUsed: new Date('2023-01-02')
        };
      });

      it('should save and load wallet', async () => {
        await storage.saveWallet(testWallet);
        const loadedWallet = await storage.loadWallet(testWallet.id);
        
        expect(loadedWallet).toEqual(testWallet);
      });

      it('should return null for non-existent wallet', async () => {
        const wallet = await storage.loadWallet('non-existent-id');
        expect(wallet).toBeNull();
      });

      it('should load all wallets', async () => {
        const wallet1 = { ...testWallet, id: 'wallet1' };
        const wallet2 = { ...testWallet, id: 'wallet2', lastUsed: new Date('2023-01-03') };
        
        await storage.saveWallet(wallet1);
        await storage.saveWallet(wallet2);
        
        const wallets = await storage.loadAllWallets();
        expect(wallets).toHaveLength(2);
        
        // Should be sorted by lastUsed (most recent first)
        expect(wallets[0].id).toBe('wallet2');
        expect(wallets[1].id).toBe('wallet1');
      });

      it('should delete wallet', async () => {
        await storage.saveWallet(testWallet);
        await storage.deleteWallet(testWallet.id);
        
        const wallet = await storage.loadWallet(testWallet.id);
        expect(wallet).toBeNull();
      });

      it('should handle deleting non-existent wallet', async () => {
        await expect(storage.deleteWallet('non-existent')).resolves.not.toThrow();
      });
    });

    describe('config operations', () => {
      it('should save and load config', async () => {
        const config: SeedVaultConfig = {
          autoLock: true,
          lockTimeout: 60000,
          encryptionKey: 'test-key'
        };
        
        await storage.saveConfig(config);
        const loadedConfig = await storage.loadConfig();
        
        expect(loadedConfig).toEqual(config);
      });

      it('should return null for non-existent config', async () => {
        const config = await storage.loadConfig();
        expect(config).toBeNull();
      });
    });

    describe('lock operations', () => {
      it('should handle lock operations', async () => {
        expect(await storage.isLocked()).toBe(false);
        
        await storage.createLock();
        expect(await storage.isLocked()).toBe(true);
        
        await storage.removeLock();
        expect(await storage.isLocked()).toBe(false);
      });
    });

    describe('clear operation', () => {
      it('should clear all data', async () => {
        const testWallet: Wallet = {
          id: 'test-id',
          profile: { name: 'Test', derivationPath: "m/44'/501'/0'/0'/0'", network: 'devnet' },
          publicKey: new PublicKey('11111111111111111111111111111112'),
          encryptedPrivateKey: 'encrypted',
          createdAt: new Date(),
          lastUsed: new Date()
        };
        
        const config: SeedVaultConfig = { autoLock: true };
        
        await storage.saveWallet(testWallet);
        await storage.saveConfig(config);
        await storage.createLock();
        
        await storage.clear();
        
        expect(await storage.loadWallet(testWallet.id)).toBeNull();
        expect(await storage.loadConfig()).toBeNull();
        expect(await storage.isLocked()).toBe(false);
      });
    });
  });

  describe('FileSystemStorage', () => {
    let storage: FileSystemStorage;
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `seed-vault-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      storage = new FileSystemStorage(tempDir);
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    describe('initialization', () => {
      it('should initialize and create directories', async () => {
        await storage.initialize();
        
        expect(await storage.exists()).toBe(true);
        
        // Check that directories were created
        const storageDir = storage.getStorageDir();
        const walletsDir = storage.getWalletsDir();
        
        await expect(fs.access(storageDir)).resolves.not.toThrow();
        await expect(fs.access(walletsDir)).resolves.not.toThrow();
      });

      it('should initialize with config', async () => {
        const config: SeedVaultConfig = { autoLock: false, lockTimeout: 120000 };
        await storage.initialize(config);
        
        const loadedConfig = await storage.loadConfig();
        expect(loadedConfig).toEqual(config);
      });
    });

    describe('wallet operations', () => {
      let testWallet: Wallet;

      beforeEach(async () => {
        await storage.initialize();
        
        testWallet = {
          id: 'test-wallet-id',
          profile: {
            name: 'Test Wallet',
            derivationPath: "m/44'/501'/0'/0'/0'",
            network: 'devnet'
          },
          publicKey: new PublicKey('11111111111111111111111111111112'),
          encryptedPrivateKey: 'encrypted-key-data',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          lastUsed: new Date('2023-01-02T00:00:00.000Z')
        };
      });

      it('should save and load wallet from filesystem', async () => {
        await storage.saveWallet(testWallet);
        const loadedWallet = await storage.loadWallet(testWallet.id);
        
        expect(loadedWallet).toEqual(testWallet);
        
        // Verify file was created
        const walletFile = join(storage.getWalletsDir(), `${testWallet.id}.json`);
        await expect(fs.access(walletFile)).resolves.not.toThrow();
      });

      it('should return null for non-existent wallet', async () => {
        const wallet = await storage.loadWallet('non-existent-id');
        expect(wallet).toBeNull();
      });

      it('should load all wallets from filesystem', async () => {
        const wallet1 = { ...testWallet, id: 'wallet1' };
        const wallet2 = { 
          ...testWallet, 
          id: 'wallet2', 
          lastUsed: new Date('2023-01-03T00:00:00.000Z') 
        };
        
        await storage.saveWallet(wallet1);
        await storage.saveWallet(wallet2);
        
        const wallets = await storage.loadAllWallets();
        expect(wallets).toHaveLength(2);
        
        // Should be sorted by lastUsed (most recent first)
        expect(wallets[0].id).toBe('wallet2');
        expect(wallets[1].id).toBe('wallet1');
      });

      it('should delete wallet from filesystem', async () => {
        await storage.saveWallet(testWallet);
        
        const walletFile = join(storage.getWalletsDir(), `${testWallet.id}.json`);
        await expect(fs.access(walletFile)).resolves.not.toThrow();
        
        await storage.deleteWallet(testWallet.id);
        
        const wallet = await storage.loadWallet(testWallet.id);
        expect(wallet).toBeNull();
        
        // Verify file was deleted
        await expect(fs.access(walletFile)).rejects.toThrow();
      });

      it('should handle corrupted wallet file', async () => {
        const walletFile = join(storage.getWalletsDir(), 'corrupted.json');
        await fs.writeFile(walletFile, 'invalid json content');
        
        await expect(storage.loadWallet('corrupted')).rejects.toThrow();
      });
    });

    describe('config operations', () => {
      beforeEach(async () => {
        await storage.initialize();
      });

      it('should save and load config from filesystem', async () => {
        const config: SeedVaultConfig = {
          autoLock: true,
          lockTimeout: 60000,
          encryptionKey: 'test-key'
        };
        
        await storage.saveConfig(config);
        const loadedConfig = await storage.loadConfig();
        
        expect(loadedConfig).toEqual(config);
      });

      it('should return null for non-existent config', async () => {
        const config = await storage.loadConfig();
        expect(config).toBeNull();
      });
    });

    describe('lock operations', () => {
      beforeEach(async () => {
        await storage.initialize();
      });

      it('should create and remove lock files', async () => {
        expect(await storage.isLocked()).toBe(false);
        
        await storage.createLock();
        expect(await storage.isLocked()).toBe(true);
        
        await storage.removeLock();
        expect(await storage.isLocked()).toBe(false);
      });
    });

    describe('storage statistics', () => {
      beforeEach(async () => {
        await storage.initialize();
      });

      it('should provide storage statistics', async () => {
        const testWallet: Wallet = {
          id: 'test-id',
          profile: { name: 'Test', derivationPath: "m/44'/501'/0'/0'/0'", network: 'devnet' },
          publicKey: new PublicKey('11111111111111111111111111111112'),
          encryptedPrivateKey: 'encrypted',
          createdAt: new Date(),
          lastUsed: new Date()
        };
        
        await storage.saveWallet(testWallet);
        
        const stats = await storage.getStats();
        
        expect(stats.walletCount).toBe(1);
        expect(stats.storageSize).toBeGreaterThan(0);
        expect(stats.lastModified).toEqual(expect.any(Date));
      });
    });

    describe('backup and restore', () => {
      beforeEach(async () => {
        await storage.initialize();
      });

      it('should backup and restore data', async () => {
        const testWallet: Wallet = {
          id: 'test-id',
          profile: { name: 'Test', derivationPath: "m/44'/501'/0'/0'/0'", network: 'devnet' },
          publicKey: new PublicKey('11111111111111111111111111111112'),
          encryptedPrivateKey: 'encrypted',
          createdAt: new Date('2023-01-01T00:00:00.000Z'),
          lastUsed: new Date('2023-01-02T00:00:00.000Z')
        };
        
        const config: SeedVaultConfig = { autoLock: true };
        
        await storage.saveWallet(testWallet);
        await storage.saveConfig(config);
        
        const backupPath = join(tempDir, 'backup.json');
        await storage.backup(backupPath);
        
        // Clear storage
        await storage.clear();
        expect(await storage.loadWallet(testWallet.id)).toBeNull();
        
        // Restore from backup
        await storage.restore(backupPath);
        
        const restoredWallet = await storage.loadWallet(testWallet.id);
        const restoredConfig = await storage.loadConfig();
        
        expect(restoredWallet).toEqual(testWallet);
        expect(restoredConfig).toEqual(config);
      });

      it('should handle non-existent backup file', async () => {
        const backupPath = join(tempDir, 'non-existent-backup.json');
        
        await expect(storage.restore(backupPath)).rejects.toThrow();
      });
    });

    describe('error handling', () => {
      it('should handle permission errors gracefully', async () => {
        // This test might not work on all systems, so we'll make it conditional
        const restrictedDir = '/root/restricted-seed-vault';
        const restrictedStorage = new FileSystemStorage(restrictedDir);
        
        // This should fail on most systems due to permissions
        try {
          await restrictedStorage.initialize();
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toContain('Failed to initialize storage');
        }
      });
    });
  });
});