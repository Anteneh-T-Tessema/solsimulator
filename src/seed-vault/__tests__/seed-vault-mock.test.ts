import { SeedVaultMock } from '../seed-vault-mock';
import { WalletProfile, SeedVaultConfig } from '../types';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';

describe('SeedVaultMock', () => {
  let seedVault: SeedVaultMock;
  let testProfile: WalletProfile;

  beforeEach(async () => {
    seedVault = new SeedVaultMock({}, true); // Use memory storage for tests
    testProfile = {
      name: 'Test Wallet',
      derivationPath: "m/44'/501'/0'/0'/0'",
      network: 'devnet'
    };
  });

  afterEach(() => {
    seedVault.removeAllListeners();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await expect(seedVault.initialize()).resolves.not.toThrow();
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(true);
      expect(status.walletCount).toBe(0);
    });

    it('should initialize with custom config', async () => {
      const config: SeedVaultConfig = {
        autoLock: false,
        lockTimeout: 30000
      };
      
      await seedVault.initialize(config);
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(true); // Still locked initially
    });

    it('should emit initialized event', async () => {
      const initSpy = jest.fn();
      seedVault.on('initialized', initSpy);
      
      await seedVault.initialize();
      
      expect(initSpy).toHaveBeenCalledWith({ config: expect.any(Object) });
    });
  });

  describe('lock/unlock operations', () => {
    beforeEach(async () => {
      await seedVault.initialize();
    });

    it('should unlock with valid password', async () => {
      await seedVault.unlock('test-password');
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(false);
    });

    it('should emit unlocked event', async () => {
      const unlockSpy = jest.fn();
      seedVault.on('unlocked', unlockSpy);
      
      await seedVault.unlock('test-password');
      
      expect(unlockSpy).toHaveBeenCalled();
    });

    it('should reject invalid password', async () => {
      await expect(seedVault.unlock('')).rejects.toThrow('Invalid password provided');
      await expect(seedVault.unlock('123')).rejects.toThrow('Invalid password provided');
    });

    it('should lock vault', async () => {
      await seedVault.unlock('test-password');
      await seedVault.lock();
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(true);
    });

    it('should emit locked event', async () => {
      await seedVault.unlock('test-password');
      
      const lockSpy = jest.fn();
      seedVault.on('locked', lockSpy);
      
      await seedVault.lock();
      
      expect(lockSpy).toHaveBeenCalled();
    });

    it('should handle multiple unlock attempts', async () => {
      await seedVault.unlock('test-password');
      await seedVault.unlock('test-password'); // Should not throw
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(false);
    });

    it('should handle multiple lock attempts', async () => {
      await seedVault.lock();
      await seedVault.lock(); // Should not throw
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(true);
    });
  });

  describe('wallet generation', () => {
    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
    });

    it('should generate new wallet', async () => {
      const wallet = await seedVault.generateWallet(testProfile);
      
      expect(wallet.id).toBeDefined();
      expect(wallet.profile).toEqual(testProfile);
      expect(wallet.publicKey).toBeInstanceOf(PublicKey);
      expect(wallet.encryptedPrivateKey).toBeDefined();
      expect(wallet.createdAt).toBeInstanceOf(Date);
      expect(wallet.lastUsed).toBeInstanceOf(Date);
    });

    it('should generate wallet with custom mnemonic', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const profileWithMnemonic = { ...testProfile, mnemonic };
      
      const wallet = await seedVault.generateWallet(profileWithMnemonic);
      
      expect(wallet.profile.mnemonic).toBe(mnemonic);
    });

    it('should emit walletGenerated event', async () => {
      const generateSpy = jest.fn();
      seedVault.on('walletGenerated', generateSpy);
      
      const wallet = await seedVault.generateWallet(testProfile);
      
      expect(generateSpy).toHaveBeenCalledWith({
        walletId: wallet.id,
        publicKey: wallet.publicKey.toBase58()
      });
    });

    it('should reject invalid mnemonic', async () => {
      const invalidProfile = { ...testProfile, mnemonic: 'invalid mnemonic phrase' };
      
      await expect(seedVault.generateWallet(invalidProfile)).rejects.toThrow('Generated mnemonic is invalid');
    });

    it('should require unlocked vault', async () => {
      await seedVault.lock();
      
      await expect(seedVault.generateWallet(testProfile)).rejects.toThrow('Seed Vault is locked');
    });
  });

  describe('wallet import', () => {
    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
    });

    it('should import wallet from mnemonic', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      const wallet = await seedVault.importWallet(testProfile, mnemonic);
      
      expect(wallet.id).toBeDefined();
      expect(wallet.profile).toEqual({ ...testProfile, mnemonic });
      expect(wallet.publicKey).toBeInstanceOf(PublicKey);
    });

    it('should emit walletImported event', async () => {
      const importSpy = jest.fn();
      seedVault.on('walletImported', importSpy);
      
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const wallet = await seedVault.importWallet(testProfile, mnemonic);
      
      expect(importSpy).toHaveBeenCalledWith({
        walletId: wallet.id,
        publicKey: wallet.publicKey.toBase58()
      });
    });

    it('should reject invalid mnemonic', async () => {
      const invalidMnemonic = 'invalid mnemonic phrase';
      
      await expect(seedVault.importWallet(testProfile, invalidMnemonic)).rejects.toThrow('Invalid mnemonic phrase provided');
    });

    it('should generate deterministic wallet ID', async () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      const wallet1 = await seedVault.importWallet(testProfile, mnemonic);
      
      // Reset vault and import same wallet
      await seedVault.reset();
      await seedVault.initialize();
      await seedVault.unlock('test-password');
      
      const wallet2 = await seedVault.importWallet(testProfile, mnemonic);
      
      expect(wallet1.id).toBe(wallet2.id);
      expect(wallet1.publicKey.equals(wallet2.publicKey)).toBe(true);
    });
  });

  describe('wallet management', () => {
    let testWallet: any;

    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
      testWallet = await seedVault.generateWallet(testProfile);
    });

    it('should list wallets', async () => {
      const wallets = await seedVault.listWallets();
      
      expect(wallets).toHaveLength(1);
      expect(wallets[0].id).toBe(testWallet.id);
    });

    it('should get specific wallet', async () => {
      const wallet = await seedVault.getWallet(testWallet.id);
      
      expect(wallet).not.toBeNull();
      expect(wallet!.id).toBe(testWallet.id);
    });

    it('should return null for non-existent wallet', async () => {
      const wallet = await seedVault.getWallet('non-existent-id');
      
      expect(wallet).toBeNull();
    });

    it('should get wallet public key', async () => {
      const publicKey = await seedVault.getPublicKey(testWallet.id);
      
      expect(publicKey.equals(testWallet.publicKey)).toBe(true);
    });

    it('should export wallet', async () => {
      const exportData = await seedVault.exportWallet(testWallet.id);
      
      expect(exportData.profile).toEqual(testWallet.profile);
      expect(exportData.publicKey).toBe(testWallet.publicKey.toBase58());
      expect(exportData.mnemonic).toBeDefined();
      expect(exportData.createdAt).toEqual(testWallet.createdAt);
    });

    it('should delete wallet', async () => {
      const deleteSpy = jest.fn();
      seedVault.on('walletDeleted', deleteSpy);
      
      await seedVault.deleteWallet(testWallet.id);
      
      const wallet = await seedVault.getWallet(testWallet.id);
      expect(wallet).toBeNull();
      expect(deleteSpy).toHaveBeenCalledWith({ walletId: testWallet.id });
    });

    it('should throw error when deleting non-existent wallet', async () => {
      await expect(seedVault.deleteWallet('non-existent')).rejects.toThrow('Wallet non-existent not found');
    });
  });

  describe('key derivation', () => {
    let testWallet: any;

    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
      testWallet = await seedVault.generateWallet(testProfile);
    });

    it('should derive keypair from derivation path', async () => {
      const derivationPath = "m/44'/501'/0'/0'/1'";
      
      const derivedKey = await seedVault.deriveKeypair(testWallet.id, derivationPath);
      
      expect(derivedKey.keypair).toBeDefined();
      expect(derivedKey.publicKey).toBeInstanceOf(PublicKey);
      expect(derivedKey.derivationPath).toBe(derivationPath);
    });

    it('should derive keypair from components', async () => {
      const components = {
        purpose: 44,
        coinType: 501,
        account: 0,
        change: 0,
        addressIndex: 1
      };
      
      const derivedKey = await seedVault.deriveKeypairFromComponents(testWallet.id, components);
      
      expect(derivedKey.derivationPath).toBe("m/44'/501'/0'/0'/1'");
    });

    it('should derive different keys for different paths', async () => {
      const key1 = await seedVault.deriveKeypair(testWallet.id, "m/44'/501'/0'/0'/0'");
      const key2 = await seedVault.deriveKeypair(testWallet.id, "m/44'/501'/0'/0'/1'");
      
      expect(key1.publicKey.equals(key2.publicKey)).toBe(false);
    });

    it('should derive consistent keys for same path', async () => {
      const derivationPath = "m/44'/501'/0'/0'/1'";
      
      const key1 = await seedVault.deriveKeypair(testWallet.id, derivationPath);
      const key2 = await seedVault.deriveKeypair(testWallet.id, derivationPath);
      
      expect(key1.publicKey.equals(key2.publicKey)).toBe(true);
    });

    it('should reject invalid derivation paths', async () => {
      const invalidPaths = [
        "m/43'/501'/0'/0'/0'", // wrong purpose
        "m/44'/0'/0'/0'/0'", // wrong coin type
        "invalid/path"
      ];
      
      for (const path of invalidPaths) {
        await expect(seedVault.deriveKeypair(testWallet.id, path)).rejects.toThrow();
      }
    });
  });

  describe('transaction signing', () => {
    let testWallet: any;

    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
      testWallet = await seedVault.generateWallet(testProfile);
    });

    const createTestTransaction = (wallet: any) => {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey('11111111111111111111111111111112'),
          lamports: 1000000
        })
      );
      transaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      transaction.feePayer = wallet.publicKey;
      return transaction;
    };

    it('should sign transaction with auto-approve', async () => {
      const signSpy = jest.fn();
      seedVault.on('transactionSigned', signSpy);
      
      const transaction = createTestTransaction(testWallet);
      const result = await seedVault.signTransaction(testWallet.id, transaction, true);
      
      expect(result.signature).toBeDefined();
      expect(result.signedTransaction).toBe(transaction);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(transaction.signature).not.toBeNull();
      expect(signSpy).toHaveBeenCalled();
    });

    it('should sign transaction with user confirmation simulation', async () => {
      const confirmSpy = jest.fn();
      seedVault.on('confirmationRequired', confirmSpy);
      
      const transaction = createTestTransaction(testWallet);
      const result = await seedVault.signTransaction(testWallet.id, transaction, false);
      
      expect(result.signature).toBeDefined();
      expect(confirmSpy).toHaveBeenCalledWith({
        type: 'transaction',
        context: expect.objectContaining({ walletId: testWallet.id })
      });
    });

    it('should sign multiple transactions', async () => {
      const transaction1 = createTestTransaction(testWallet);
      const transaction2 = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: testWallet.publicKey,
          toPubkey: new PublicKey('11111111111111111111111111111113'),
          lamports: 2000000
        })
      );
      transaction2.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      transaction2.feePayer = testWallet.publicKey;
      
      const results = await seedVault.signTransactions(testWallet.id, [transaction1, transaction2], true);
      
      expect(results).toHaveLength(2);
      expect(results[0].signature).toBeDefined();
      expect(results[1].signature).toBeDefined();
    });

    it('should update wallet last used time after signing', async () => {
      const beforeTime = new Date();
      
      const transaction = createTestTransaction(testWallet);
      await seedVault.signTransaction(testWallet.id, transaction, true);
      
      const wallet = await seedVault.getWallet(testWallet.id);
      expect(wallet!.lastUsed.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should throw error for non-existent wallet', async () => {
      const transaction = createTestTransaction(testWallet);
      await expect(seedVault.signTransaction('non-existent', transaction, true))
        .rejects.toThrow('Wallet non-existent not found');
    });
  });

  describe('message signing', () => {
    let testWallet: any;
    let testMessage: Uint8Array;

    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
      testWallet = await seedVault.generateWallet(testProfile);
      testMessage = new TextEncoder().encode('Hello, Solana!');
    });

    it('should sign message with auto-approve', async () => {
      const signSpy = jest.fn();
      seedVault.on('messageSigned', signSpy);
      
      const result = await seedVault.signMessage(testWallet.id, testMessage, true);
      
      expect(result.signature).toBeDefined();
      expect(result.message).toBe(testMessage);
      expect(result.publicKey).toBeInstanceOf(PublicKey);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(signSpy).toHaveBeenCalled();
    });

    it('should sign message with user confirmation simulation', async () => {
      const confirmSpy = jest.fn();
      seedVault.on('confirmationRequired', confirmSpy);
      
      const result = await seedVault.signMessage(testWallet.id, testMessage, false);
      
      expect(result.signature).toBeDefined();
      expect(confirmSpy).toHaveBeenCalledWith({
        type: 'message',
        context: expect.objectContaining({ walletId: testWallet.id })
      });
    });

    it('should sign multiple messages', async () => {
      const message2 = new TextEncoder().encode('Second message');
      
      const results = await seedVault.signMessages(testWallet.id, [testMessage, message2], true);
      
      expect(results).toHaveLength(2);
      expect(results[0].signature).toBeDefined();
      expect(results[1].signature).toBeDefined();
    });

    it('should produce valid signatures', async () => {
      const result = await seedVault.signMessage(testWallet.id, testMessage, true);
      
      // Verify signature length (ed25519 signatures are 64 bytes)
      expect(result.signature.length).toBe(64);
    });
  });

  describe('mnemonic operations', () => {
    beforeEach(async () => {
      await seedVault.initialize();
    });

    it('should generate valid mnemonic', () => {
      const mnemonic = seedVault.generateMnemonic();
      
      expect(mnemonic.split(' ')).toHaveLength(12);
      expect(seedVault.validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate mnemonics of different strengths', () => {
      const strengths = [128, 160, 192, 224, 256] as const;
      const expectedWordCounts = [12, 15, 18, 21, 24];
      
      strengths.forEach((strength, index) => {
        const mnemonic = seedVault.generateMnemonic(strength);
        const words = mnemonic.split(' ');
        
        expect(words).toHaveLength(expectedWordCounts[index]);
        expect(seedVault.validateMnemonic(mnemonic)).toBe(true);
      });
    });

    it('should validate mnemonics correctly', () => {
      const validMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const invalidMnemonic = 'invalid mnemonic phrase';
      
      expect(seedVault.validateMnemonic(validMnemonic)).toBe(true);
      expect(seedVault.validateMnemonic(invalidMnemonic)).toBe(false);
    });
  });

  describe('derivation path operations', () => {
    beforeEach(async () => {
      await seedVault.initialize();
    });

    it('should parse derivation paths', () => {
      const path = "m/44'/501'/0'/0/0";
      const components = seedVault.parseDerivationPath(path);
      
      expect(components).toEqual({
        purpose: 44,
        coinType: 501,
        account: 0,
        change: 0,
        addressIndex: 0
      });
    });

    it('should format derivation paths', () => {
      const components = {
        purpose: 44,
        coinType: 501,
        account: 1,
        change: 0,
        addressIndex: 5
      };
      
      const path = seedVault.formatDerivationPath(components);
      expect(path).toBe("m/44'/501'/1'/0'/5'");
    });
  });

  describe('vault reset', () => {
    beforeEach(async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
    });

    it('should reset vault and clear all data', async () => {
      const resetSpy = jest.fn();
      seedVault.on('reset', resetSpy);
      
      // Add some data
      await seedVault.generateWallet(testProfile);
      
      let wallets = await seedVault.listWallets();
      expect(wallets).toHaveLength(1);
      
      // Reset vault
      await seedVault.reset();
      
      // Vault should be locked and empty
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(true);
      expect(status.walletCount).toBe(0);
      expect(resetSpy).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw error when not initialized', async () => {
      const uninitializedVault = new SeedVaultMock({}, true);
      
      await expect(uninitializedVault.getStatus()).rejects.toThrow('Seed Vault is not initialized');
    });

    it('should throw error when locked', async () => {
      await seedVault.initialize();
      
      await expect(seedVault.generateWallet(testProfile)).rejects.toThrow('Seed Vault is locked');
      await expect(seedVault.listWallets()).rejects.toThrow('Seed Vault is locked');
    });

    it('should handle storage errors gracefully', async () => {
      await seedVault.initialize();
      await seedVault.unlock('test-password');
      
      // Mock storage error
      const originalSaveWallet = (seedVault as any).storage.saveWallet;
      (seedVault as any).storage.saveWallet = jest.fn().mockRejectedValue(new Error('Storage error'));
      
      await expect(seedVault.generateWallet(testProfile)).rejects.toThrow();
      
      // Restore original method
      (seedVault as any).storage.saveWallet = originalSaveWallet;
    });
  });

  describe('auto-lock functionality', () => {
    it('should support auto-lock configuration', async () => {
      const config: SeedVaultConfig = {
        autoLock: true,
        lockTimeout: 100 // Very short timeout for testing
      };
      
      await seedVault.initialize(config);
      await seedVault.unlock('test-password');
      
      // Wait for auto-lock timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(true);
    });

    it('should reset auto-lock timer on activity', async () => {
      const config: SeedVaultConfig = {
        autoLock: true,
        lockTimeout: 200
      };
      
      await seedVault.initialize(config);
      await seedVault.unlock('test-password');
      
      // Perform activity to reset timer
      setTimeout(async () => {
        await seedVault.getStatus();
      }, 100);
      
      // Wait less than the timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const status = await seedVault.getStatus();
      expect(status.isLocked).toBe(false);
    });
  });
});