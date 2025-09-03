import { CryptoUtils } from '../crypto-utils';
import { Keypair } from '@solana/web3.js';

describe('CryptoUtils', () => {
  describe('generateSecureRandom', () => {
    it('should generate random bytes of specified length', () => {
      const length = 32;
      const randomBytes = CryptoUtils.generateSecureRandom(length);
      
      expect(randomBytes).toBeInstanceOf(Buffer);
      expect(randomBytes.length).toBe(length);
    });

    it('should generate different random bytes on each call', () => {
      const bytes1 = CryptoUtils.generateSecureRandom(16);
      const bytes2 = CryptoUtils.generateSecureRandom(16);
      
      expect(bytes1.equals(bytes2)).toBe(false);
    });
  });

  describe('generateMnemonic', () => {
    it('should generate a valid 12-word mnemonic by default', () => {
      const mnemonic = CryptoUtils.generateMnemonic();
      const words = mnemonic.split(' ');
      
      expect(words).toHaveLength(12);
      expect(CryptoUtils.validateMnemonic(mnemonic)).toBe(true);
    });

    it('should generate mnemonics of different lengths', () => {
      const strengths = [128, 160, 192, 224, 256] as const;
      const expectedWordCounts = [12, 15, 18, 21, 24];
      
      strengths.forEach((strength, index) => {
        const mnemonic = CryptoUtils.generateMnemonic(strength);
        const words = mnemonic.split(' ');
        
        expect(words).toHaveLength(expectedWordCounts[index]);
        expect(CryptoUtils.validateMnemonic(mnemonic)).toBe(true);
      });
    });

    it('should generate different mnemonics on each call', () => {
      const mnemonic1 = CryptoUtils.generateMnemonic();
      const mnemonic2 = CryptoUtils.generateMnemonic();
      
      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('validateMnemonic', () => {
    it('should validate correct mnemonics', () => {
      const validMnemonics = [
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        'legal winner thank year wave sausage worth useful legal winner thank yellow',
        'letter advice cage absurd amount doctor acoustic avoid letter advice cage above'
      ];
      
      validMnemonics.forEach(mnemonic => {
        expect(CryptoUtils.validateMnemonic(mnemonic)).toBe(true);
      });
    });

    it('should reject invalid mnemonics', () => {
      const invalidMnemonics = [
        'invalid mnemonic phrase',
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon', // too many words
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon', // too few words
        'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon invalid', // invalid word
        ''
      ];
      
      invalidMnemonics.forEach(mnemonic => {
        expect(CryptoUtils.validateMnemonic(mnemonic)).toBe(false);
      });
    });
  });

  describe('mnemonicToSeed', () => {
    it('should convert mnemonic to seed', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const seed = CryptoUtils.mnemonicToSeed(mnemonic);
      
      expect(seed).toBeInstanceOf(Buffer);
      expect(seed.length).toBe(64);
    });

    it('should generate different seeds for different mnemonics', () => {
      const mnemonic1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const mnemonic2 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
      
      const seed1 = CryptoUtils.mnemonicToSeed(mnemonic1);
      const seed2 = CryptoUtils.mnemonicToSeed(mnemonic2);
      
      expect(seed1.equals(seed2)).toBe(false);
    });

    it('should generate different seeds with different passphrases', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      const seed1 = CryptoUtils.mnemonicToSeed(mnemonic);
      const seed2 = CryptoUtils.mnemonicToSeed(mnemonic, 'passphrase');
      
      expect(seed1.equals(seed2)).toBe(false);
    });

    it('should throw error for invalid mnemonic', () => {
      expect(() => {
        CryptoUtils.mnemonicToSeed('invalid mnemonic');
      }).toThrow('Invalid mnemonic phrase');
    });
  });

  describe('deriveKeypairFromMnemonic', () => {
    it('should derive consistent keypairs from same mnemonic and path', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const derivationPath = "m/44'/501'/0'/0'/0'";
      
      const keypair1 = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, derivationPath);
      const keypair2 = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, derivationPath);
      
      expect(keypair1.publicKey.equals(keypair2.publicKey)).toBe(true);
      expect(keypair1.secretKey).toEqual(keypair2.secretKey);
    });

    it('should derive different keypairs for different derivation paths', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      
      const keypair1 = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, "m/44'/501'/0'/0'/0'");
      const keypair2 = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, "m/44'/501'/0'/0'/1'");
      
      expect(keypair1.publicKey.equals(keypair2.publicKey)).toBe(false);
    });

    it('should derive valid Solana keypairs', () => {
      const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      const derivationPath = "m/44'/501'/0'/0'/0'";
      
      const keypair = CryptoUtils.deriveKeypairFromMnemonic(mnemonic, derivationPath);
      
      expect(keypair).toBeInstanceOf(Keypair);
      expect(keypair.publicKey).toBeDefined();
      expect(keypair.secretKey).toBeDefined();
      expect(keypair.secretKey.length).toBe(64);
    });
  });

  describe('parseDerivationPath', () => {
    it('should parse valid BIP-44 derivation paths', () => {
      const testCases = [
        {
          path: "m/44'/501'/0'/0'/0'",
          expected: { purpose: 44, coinType: 501, account: 0, change: 0, addressIndex: 0 }
        },
        {
          path: "m/44'/501'/1'/1'/5'",
          expected: { purpose: 44, coinType: 501, account: 1, change: 1, addressIndex: 5 }
        },
        {
          path: "m/44'/0'/0'/0'/0'",
          expected: { purpose: 44, coinType: 0, account: 0, change: 0, addressIndex: 0 }
        },
        {
          path: "m/44'/501'/0'/0/0",
          expected: { purpose: 44, coinType: 501, account: 0, change: 0, addressIndex: 0 }
        }
      ];
      
      testCases.forEach(({ path, expected }) => {
        const result = CryptoUtils.parseDerivationPath(path);
        expect(result).toEqual(expected);
      });
    });

    it('should throw error for invalid derivation paths', () => {
      const invalidPaths = [
        "m/44/501/0/0/0", // missing hardened notation
        "44'/501'/0'/0/0", // missing m/
        "m/44'/501'/0'/0", // missing address index
        "m/44'/501'/0'/0/0/1", // too many components
        "invalid/path",
        ""
      ];
      
      invalidPaths.forEach(path => {
        expect(() => {
          CryptoUtils.parseDerivationPath(path);
        }).toThrow('Invalid derivation path format');
      });
    });
  });

  describe('formatDerivationPath', () => {
    it('should format derivation path components correctly', () => {
      const components = { purpose: 44, coinType: 501, account: 0, change: 0, addressIndex: 0 };
      const expected = "m/44'/501'/0'/0'/0'";
      
      const result = CryptoUtils.formatDerivationPath(components);
      expect(result).toBe(expected);
    });

    it('should handle different component values', () => {
      const components = { purpose: 44, coinType: 501, account: 5, change: 1, addressIndex: 10 };
      const expected = "m/44'/501'/5'/1'/10'";
      
      const result = CryptoUtils.formatDerivationPath(components);
      expect(result).toBe(expected);
    });
  });

  describe('generateSolanaDerivationPath', () => {
    it('should generate default Solana derivation path', () => {
      const path = CryptoUtils.generateSolanaDerivationPath();
      expect(path).toBe("m/44'/501'/0'/0'/0'");
    });

    it('should generate Solana derivation path with custom values', () => {
      const path = CryptoUtils.generateSolanaDerivationPath(1, 1, 5);
      expect(path).toBe("m/44'/501'/1'/1'/5'");
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const data = 'sensitive information';
      const password = 'strong-password-123';
      
      const encrypted = CryptoUtils.encrypt(data, password);
      const decrypted = CryptoUtils.decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
      expect(encrypted).not.toBe(data);
    });

    it('should generate different encrypted output for same data', () => {
      const data = 'test data';
      const password = 'password';
      
      const encrypted1 = CryptoUtils.encrypt(data, password);
      const encrypted2 = CryptoUtils.encrypt(data, password);
      
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to the same data
      expect(CryptoUtils.decrypt(encrypted1, password)).toBe(data);
      expect(CryptoUtils.decrypt(encrypted2, password)).toBe(data);
    });

    it('should fail to decrypt with wrong password', () => {
      const data = 'secret data';
      const correctPassword = 'correct-password';
      const wrongPassword = 'wrong-password';
      
      const encrypted = CryptoUtils.encrypt(data, correctPassword);
      
      expect(() => {
        CryptoUtils.decrypt(encrypted, wrongPassword);
      }).toThrow('Decryption failed');
    });

    it('should handle empty data', () => {
      const data = '';
      const password = 'password';
      
      const encrypted = CryptoUtils.encrypt(data, password);
      const decrypted = CryptoUtils.decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
    });

    it('should handle unicode data', () => {
      const data = '🔐 Unicode test data with émojis and spëcial chars 中文';
      const password = 'password';
      
      const encrypted = CryptoUtils.encrypt(data, password);
      const decrypted = CryptoUtils.decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
    });
  });

  describe('generateWalletId', () => {
    it('should generate unique wallet IDs', () => {
      const id1 = CryptoUtils.generateWalletId();
      const id2 = CryptoUtils.generateWalletId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(16);
      expect(id2).toHaveLength(16);
    });

    it('should generate hex string IDs', () => {
      const id = CryptoUtils.generateWalletId();
      expect(/^[a-f0-9]{16}$/.test(id)).toBe(true);
    });
  });

  describe('validateSolanaDerivationPath', () => {
    it('should validate correct Solana derivation paths', () => {
      const validPaths = [
        "m/44'/501'/0'/0'/0'",
        "m/44'/501'/1'/1'/1'",
        "m/44'/501'/2147483647'/2147483647'/2147483647'",
        "m/44'/501'/0'/0/0"
      ];
      
      validPaths.forEach(path => {
        expect(CryptoUtils.validateSolanaDerivationPath(path)).toBe(true);
      });
    });

    it('should reject invalid Solana derivation paths', () => {
      const invalidPaths = [
        "m/43'/501'/0'/0'/0'", // wrong purpose
        "m/44'/0'/0'/0'/0'", // wrong coin type
        "m/44'/501'/-1'/0'/0'", // negative account
        "invalid/path"
      ];
      
      invalidPaths.forEach(path => {
        expect(CryptoUtils.validateSolanaDerivationPath(path)).toBe(false);
      });
    });
  });

  describe('hash', () => {
    it('should generate consistent hashes', () => {
      const data = 'test data';
      const hash1 = CryptoUtils.hash(data);
      const hash2 = CryptoUtils.hash(data);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string
    });

    it('should generate different hashes for different data', () => {
      const hash1 = CryptoUtils.hash('data1');
      const hash2 = CryptoUtils.hash('data2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle Buffer input', () => {
      const data = Buffer.from('test data');
      const hash = CryptoUtils.hash(data);
      
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong passwords', () => {
      const strongPasswords = [
        'StrongPass123!',
        'MySecure@Password1',
        'Complex#Pass2023'
      ];
      
      strongPasswords.forEach(password => {
        const result = CryptoUtils.validatePasswordStrength(password);
        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    it('should reject weak passwords', () => {
      const weakPasswords = [
        { password: 'short', expectedErrors: 4 }, // too short, no uppercase, no number, no special
        { password: 'nouppercase123!', expectedErrors: 1 }, // no uppercase
        { password: 'NOLOWERCASE123!', expectedErrors: 1 }, // no lowercase
        { password: 'NoNumbers!', expectedErrors: 1 }, // no numbers
        { password: 'NoSpecialChars123', expectedErrors: 1 } // no special chars
      ];
      
      weakPasswords.forEach(({ password, expectedErrors }) => {
        const result = CryptoUtils.validatePasswordStrength(password);
        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(expectedErrors);
      });
    });
  });
});