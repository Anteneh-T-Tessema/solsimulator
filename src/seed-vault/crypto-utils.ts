import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, createHash } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';
import { validateMnemonic, generateMnemonic as bip39GenerateMnemonic, mnemonicToSeedSync } from 'bip39';
import { DerivationPathComponents, SeedVaultError } from './types';

/**
 * Cryptographic utilities for Seed Vault operations
 */
export class CryptoUtils {
  private static readonly ENCRYPTION_ALGORITHM = 'aes-256-cbc';
  private static readonly KEY_DERIVATION_ITERATIONS = 100000;
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 16;

  /**
   * Generate cryptographically secure random bytes
   */
  static generateSecureRandom(length: number): Buffer {
    return randomBytes(length);
  }

  /**
   * Generate a secure mnemonic phrase
   */
  static generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 128): string {
    return bip39GenerateMnemonic(strength);
  }

  /**
   * Validate a mnemonic phrase
   */
  static validateMnemonic(mnemonic: string): boolean {
    return validateMnemonic(mnemonic);
  }

  /**
   * Convert mnemonic to seed
   */
  static mnemonicToSeed(mnemonic: string, passphrase: string = ''): Buffer {
    if (!this.validateMnemonic(mnemonic)) {
      throw this.createError('INVALID_MNEMONIC', 'Invalid mnemonic phrase');
    }
    return mnemonicToSeedSync(mnemonic, passphrase);
  }

  /**
   * Derive a Solana keypair from seed using BIP-44 derivation path
   */
  static deriveKeypairFromSeed(seed: Buffer, derivationPath: string): Keypair {
    try {
      const derivedSeed = derivePath(derivationPath, seed.toString('hex')).key;
      return Keypair.fromSeed(derivedSeed);
    } catch (error) {
      throw this.createError('INVALID_DERIVATION_PATH', `Failed to derive keypair: ${(error as Error).message}`);
    }
  }

  /**
   * Derive a keypair from mnemonic and derivation path
   */
  static deriveKeypairFromMnemonic(mnemonic: string, derivationPath: string, passphrase: string = ''): Keypair {
    const seed = this.mnemonicToSeed(mnemonic, passphrase);
    return this.deriveKeypairFromSeed(seed, derivationPath);
  }

  /**
   * Parse BIP-44 derivation path string into components
   */
  static parseDerivationPath(path: string): DerivationPathComponents {
    // Support both hardened and non-hardened formats
    const hardenedRegex = /^m\/(\d+)'\/(\d+)'\/(\d+)'\/(\d+)'\/(\d+)'$/;
    const mixedRegex = /^m\/(\d+)'\/(\d+)'\/(\d+)'\/(\d+)\/(\d+)$/;
    
    let match = path.match(hardenedRegex);
    if (match) {
      return {
        purpose: parseInt(match[1], 10),
        coinType: parseInt(match[2], 10),
        account: parseInt(match[3], 10),
        change: parseInt(match[4], 10),
        addressIndex: parseInt(match[5], 10)
      };
    }
    
    match = path.match(mixedRegex);
    if (match) {
      return {
        purpose: parseInt(match[1], 10),
        coinType: parseInt(match[2], 10),
        account: parseInt(match[3], 10),
        change: parseInt(match[4], 10),
        addressIndex: parseInt(match[5], 10)
      };
    }

    throw this.createError('INVALID_DERIVATION_PATH', `Invalid derivation path format: ${path}`);
  }

  /**
   * Format derivation path components into string
   */
  static formatDerivationPath(components: DerivationPathComponents): string {
    // For ed25519-hd-key compatibility, use all hardened components
    return `m/${components.purpose}'/${components.coinType}'/${components.account}'/${components.change}'/${components.addressIndex}'`;
  }

  /**
   * Generate default Solana derivation path
   */
  static generateSolanaDerivationPath(account: number = 0, change: number = 0, addressIndex: number = 0): string {
    // For ed25519-hd-key, all components should be hardened
    return `m/44'/501'/${account}'/${change}'/${addressIndex}'`;
  }

  /**
   * Derive encryption key from password using PBKDF2
   */
  static deriveEncryptionKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, this.KEY_DERIVATION_ITERATIONS, 32, 'sha256');
  }

  /**
   * Encrypt data using AES-256-CBC
   */
  static encrypt(data: string, password: string): string {
    try {
      const salt = this.generateSecureRandom(this.SALT_LENGTH);
      const iv = this.generateSecureRandom(this.IV_LENGTH);
      const key = this.deriveEncryptionKey(password, salt);

      const cipher = createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
      cipher.setAutoPadding(true);

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Combine salt, iv, and encrypted data
      const result = Buffer.concat([salt, iv, Buffer.from(encrypted, 'hex')]);
      return result.toString('base64');
    } catch (error) {
      throw this.createError('ENCRYPTION_FAILED', `Encryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt data using AES-256-CBC
   */
  static decrypt(encryptedData: string, password: string): string {
    try {
      const data = Buffer.from(encryptedData, 'base64');
      
      // Extract salt, iv, and encrypted content
      const salt = data.subarray(0, this.SALT_LENGTH);
      const iv = data.subarray(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
      const encrypted = data.subarray(this.SALT_LENGTH + this.IV_LENGTH);

      const key = this.deriveEncryptionKey(password, salt);

      const decipher = createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
      decipher.setAutoPadding(true);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw this.createError('DECRYPTION_FAILED', `Decryption failed: ${(error as Error).message}`);
    }
  }

  /**
   * Generate a secure wallet ID
   */
  static generateWalletId(): string {
    const randomData = this.generateSecureRandom(16);
    return createHash('sha256').update(randomData).digest('hex').substring(0, 16);
  }

  /**
   * Hash data using SHA-256
   */
  static hash(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate a secure session token
   */
  static generateSessionToken(): string {
    return this.generateSecureRandom(32).toString('hex');
  }

  /**
   * Validate derivation path for Solana
   */
  static validateSolanaDerivationPath(path: string): boolean {
    try {
      const components = this.parseDerivationPath(path);
      
      // Validate Solana-specific constraints
      if (components.purpose !== 44) {
        return false; // Must use BIP-44
      }
      
      if (components.coinType !== 501) {
        return false; // Must use Solana coin type
      }
      
      // Validate reasonable ranges
      if (components.account < 0 || components.account > 2147483647) {
        return false;
      }
      
      if (components.change < 0 || components.change > 2147483647) {
        return false;
      }
      
      if (components.addressIndex < 0 || components.addressIndex > 2147483647) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a Seed Vault error
   */
  private static createError(code: string, message: string, context?: Record<string, unknown>): SeedVaultError {
    const error = new Error(message) as SeedVaultError;
    error.code = code as any;
    error.context = context || {};
    return error;
  }

  /**
   * Securely wipe sensitive data from memory
   */
  static wipeSensitiveData(data: Buffer | string): void {
    if (Buffer.isBuffer(data)) {
      data.fill(0);
    }
    // Note: For strings, we can't actually wipe them from memory in JavaScript
    // This is a limitation of the language, but we provide the interface for consistency
  }

  /**
   * Generate a deterministic wallet ID from public key
   */
  static generateDeterministicWalletId(publicKey: string): string {
    return this.hash(publicKey).substring(0, 16);
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}