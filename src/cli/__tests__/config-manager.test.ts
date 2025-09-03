/**
 * Tests for Configuration Manager
 */

import { promises as fs } from 'fs';
import { ConfigManager } from '../config-manager';

// Mock fs module
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn()
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    configManager = new ConfigManager();
    jest.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load valid configuration file', async () => {
      const mockConfig = {
        network: {
          endpoint: 'https://api.devnet.solana.com',
          commitment: 'confirmed'
        },
        emulator: {
          androidVersion: '33',
          memorySize: 2048
        }
      };

      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configManager.loadConfig('test-config.json');

      expect(mockFs.access).toHaveBeenCalledWith(expect.stringContaining('test-config.json'));
      expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringContaining('test-config.json'), 'utf-8');
      expect(result.network?.endpoint).toBe('https://api.devnet.solana.com');
    });

    it('should return default config when file does not exist', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);

      const result = await configManager.loadConfig('non-existent.json');

      expect(result.network?.endpoint).toBe('https://api.devnet.solana.com');
      expect(result.emulator?.androidVersion).toBe('33');
    });

    it('should throw error for invalid JSON', async () => {
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(configManager.loadConfig('invalid.json')).rejects.toThrow('Invalid JSON in configuration file');
    });

    it('should throw error for file access issues', async () => {
      const error = new Error('Permission denied');
      mockFs.access.mockRejectedValue(error);

      await expect(configManager.loadConfig('restricted.json')).rejects.toThrow('Failed to load configuration');
    });
  });

  describe('initializeConfig', () => {
    it('should create configuration file with default template', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);
      mockFs.writeFile.mockResolvedValue();

      await configManager.initializeConfig('new-config.json');

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('new-config.json'),
        expect.stringContaining('"endpoint": "https://api.devnet.solana.com"'),
        'utf-8'
      );
    });

    it('should create configuration file with development template', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);
      mockFs.writeFile.mockResolvedValue();

      await configManager.initializeConfig('dev-config.json', { template: 'development' });

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('dev-config.json'),
        expect.stringContaining('"endpoint": "http://localhost:8899"'),
        'utf-8'
      );
    });

    it('should throw error if file exists without force flag', async () => {
      mockFs.access.mockResolvedValue();

      await expect(configManager.initializeConfig('existing.json')).rejects.toThrow('Configuration file already exists');
    });

    it('should overwrite existing file with force flag', async () => {
      mockFs.access.mockResolvedValue();
      mockFs.writeFile.mockResolvedValue();

      await configManager.initializeConfig('existing.json', { force: true });

      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should throw error for unknown template', async () => {
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);

      await expect(configManager.initializeConfig('config.json', { template: 'unknown' })).rejects.toThrow('Unknown configuration template');
    });
  });

  describe('validateConfig', () => {
    it('should validate correct configuration', async () => {
      const validConfig = {
        network: {
          endpoint: 'https://api.devnet.solana.com',
          commitment: 'confirmed',
          timeout: 30000
        },
        emulator: {
          androidVersion: '33',
          memorySize: 2048,
          diskSize: 8192
        },
        developer: {
          logLevel: 'info',
          performanceMode: 'development'
        },
        wallets: [
          {
            name: 'test-wallet',
            derivationPath: "m/44'/501'/0'/0'",
            network: 'devnet'
          }
        ]
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(validConfig));

      const result = await configManager.validateConfig('valid-config.json');

      expect(result).toBe(true);
    });

    it('should return false for invalid configuration', async () => {
      const invalidConfig = {
        network: {
          endpoint: 123, // Should be string
          commitment: 'invalid' // Should be one of specific values
        }
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidConfig));

      const result = await configManager.validateConfig('invalid-config.json');

      expect(result).toBe(false);
    });

    it('should return false for invalid JSON', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      const result = await configManager.validateConfig('invalid.json');

      expect(result).toBe(false);
    });
  });

  describe('configuration validation', () => {
    beforeEach(async () => {
      // Load a basic config first
      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);
      await configManager.loadConfig('test.json');
    });

    it('should validate network configuration', () => {
      expect(() => {
        (configManager as any).validateConfigObject({
          network: {
            endpoint: 123 // Should be string
          }
        });
      }).toThrow('network.endpoint must be a string');

      expect(() => {
        (configManager as any).validateConfigObject({
          network: {
            commitment: 'invalid'
          }
        });
      }).toThrow('network.commitment must be one of: processed, confirmed, finalized');

      expect(() => {
        (configManager as any).validateConfigObject({
          network: {
            timeout: -1
          }
        });
      }).toThrow('network.timeout must be a positive number');
    });

    it('should validate emulator configuration', () => {
      expect(() => {
        (configManager as any).validateConfigObject({
          emulator: {
            memorySize: 256 // Too small
          }
        });
      }).toThrow('emulator.memorySize must be a number >= 512');

      expect(() => {
        (configManager as any).validateConfigObject({
          emulator: {
            diskSize: 512 // Too small
          }
        });
      }).toThrow('emulator.diskSize must be a number >= 1024');
    });

    it('should validate developer configuration', () => {
      expect(() => {
        (configManager as any).validateConfigObject({
          developer: {
            logLevel: 'invalid'
          }
        });
      }).toThrow('developer.logLevel must be one of: error, warn, info, debug');

      expect(() => {
        (configManager as any).validateConfigObject({
          developer: {
            performanceMode: 'invalid'
          }
        });
      }).toThrow('developer.performanceMode must be one of: development, testing, performance');
    });

    it('should validate wallets configuration', () => {
      expect(() => {
        (configManager as any).validateConfigObject({
          wallets: 'not-an-array'
        });
      }).toThrow('wallets must be an array');

      expect(() => {
        (configManager as any).validateConfigObject({
          wallets: [
            {
              // Missing name
              derivationPath: "m/44'/501'/0'/0'",
              network: 'devnet'
            }
          ]
        });
      }).toThrow('wallets[0].name is required and must be a string');

      expect(() => {
        (configManager as any).validateConfigObject({
          wallets: [
            {
              name: 'test',
              // Missing derivationPath
              network: 'devnet'
            }
          ]
        });
      }).toThrow('wallets[0].derivationPath is required and must be a string');

      expect(() => {
        (configManager as any).validateConfigObject({
          wallets: [
            {
              name: 'test',
              derivationPath: "m/44'/501'/0'/0'",
              network: 'invalid'
            }
          ]
        });
      }).toThrow('wallets[0].network must be one of: mainnet, devnet, testnet, localhost');
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return list of available templates', () => {
      const templates = configManager.getAvailableTemplates();

      expect(templates).toContain('default');
      expect(templates).toContain('development');
      expect(templates).toContain('testing');
      expect(templates).toContain('production');
    });
  });

  describe('getTemplate', () => {
    it('should return template configuration', () => {
      const template = configManager.getTemplate('development');

      expect(template).toBeDefined();
      expect(template?.network?.endpoint).toBe('http://localhost:8899');
      expect(template?.developer?.debugMode).toBe(true);
    });

    it('should return null for unknown template', () => {
      const template = configManager.getTemplate('unknown');

      expect(template).toBeNull();
    });
  });

  describe('toEmulatorConfig', () => {
    beforeEach(async () => {
      const mockConfig = {
        network: { endpoint: 'https://api.devnet.solana.com' },
        emulator: { androidVersion: '33', memorySize: 2048 },
        developer: { 
          logLevel: 'info' as const, 
          debugMode: false,
          autoApproveTransactions: true,
          simulateNetworkDelay: false,
          performanceMode: 'development' as const
        }
      };

      const error = new Error('File not found') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
      
      await configManager.loadConfig('test.json');
    });

    it('should convert CLI config to EmulatorConfig', () => {
      const emulatorConfig = configManager.toEmulatorConfig();

      expect(emulatorConfig.networkEndpoint).toBe('https://api.devnet.solana.com');
      expect(emulatorConfig.emulator.androidVersion).toBe('33');
      expect(emulatorConfig.emulator.memorySize).toBe(2048);
      expect(emulatorConfig.developer.logLevel).toBe('info');
      expect(emulatorConfig.developer.autoApproveTransactions).toBe(false);
    });
  });
});