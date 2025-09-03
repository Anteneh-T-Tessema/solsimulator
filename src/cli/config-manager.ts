/**
 * Configuration Manager - Handles loading, validation, and management of CLI configuration
 */

import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { EmulatorConfig, WalletProfile, LogLevel, PerformanceMode } from '../interfaces/common';

export interface CLIConfig {
  // Network configuration
  network?: {
    endpoint: string;
    commitment?: 'processed' | 'confirmed' | 'finalized';
    timeout?: number;
  };

  // Emulator configuration
  emulator?: {
    androidVersion: string;
    deviceProfile: string;
    memorySize: number;
    diskSize: number;
  };

  // Developer settings
  developer?: {
    debugMode: boolean;
    logLevel: LogLevel;
    autoApproveTransactions: boolean;
    simulateNetworkDelay: boolean;
    performanceMode: PerformanceMode;
  };

  // Wallet profiles
  wallets?: WalletProfile[];

  // CLI-specific settings
  cli?: {
    defaultInstanceId?: string;
    outputFormat?: 'text' | 'json';
    colorOutput?: boolean;
  };
}

export interface ConfigInitOptions {
  force?: boolean;
  template?: string;
}

/**
 * Default configuration templates
 */
const CONFIG_TEMPLATES: Record<string, CLIConfig> = {
  default: {
    network: {
      endpoint: 'https://api.devnet.solana.com',
      commitment: 'confirmed',
      timeout: 30000
    },
    emulator: {
      androidVersion: '33',
      deviceProfile: 'pixel_4',
      memorySize: 2048,
      diskSize: 8192
    },
    developer: {
      debugMode: false,
      logLevel: 'info',
      autoApproveTransactions: false,
      simulateNetworkDelay: false,
      performanceMode: 'development'
    },
    wallets: [
      {
        name: 'default',
        derivationPath: "m/44'/501'/0'/0'",
        network: 'devnet'
      }
    ],
    cli: {
      outputFormat: 'text',
      colorOutput: true
    }
  },

  development: {
    network: {
      endpoint: 'http://localhost:8899',
      commitment: 'processed',
      timeout: 10000
    },
    emulator: {
      androidVersion: '33',
      deviceProfile: 'pixel_4',
      memorySize: 4096,
      diskSize: 16384
    },
    developer: {
      debugMode: true,
      logLevel: 'debug',
      autoApproveTransactions: true,
      simulateNetworkDelay: false,
      performanceMode: 'development'
    },
    wallets: [
      {
        name: 'dev-wallet-1',
        derivationPath: "m/44'/501'/0'/0'",
        network: 'localhost'
      },
      {
        name: 'dev-wallet-2',
        derivationPath: "m/44'/501'/1'/0'",
        network: 'localhost'
      }
    ],
    cli: {
      outputFormat: 'text',
      colorOutput: true
    }
  },

  testing: {
    network: {
      endpoint: 'https://api.testnet.solana.com',
      commitment: 'finalized',
      timeout: 60000
    },
    emulator: {
      androidVersion: '33',
      deviceProfile: 'pixel_4',
      memorySize: 2048,
      diskSize: 8192
    },
    developer: {
      debugMode: false,
      logLevel: 'warn',
      autoApproveTransactions: false,
      simulateNetworkDelay: true,
      performanceMode: 'testing'
    },
    wallets: [
      {
        name: 'test-wallet',
        derivationPath: "m/44'/501'/0'/0'",
        network: 'testnet'
      }
    ],
    cli: {
      outputFormat: 'json',
      colorOutput: false
    }
  },

  production: {
    network: {
      endpoint: 'https://api.mainnet-beta.solana.com',
      commitment: 'finalized',
      timeout: 60000
    },
    emulator: {
      androidVersion: '33',
      deviceProfile: 'pixel_4',
      memorySize: 4096,
      diskSize: 16384
    },
    developer: {
      debugMode: false,
      logLevel: 'error',
      autoApproveTransactions: false,
      simulateNetworkDelay: false,
      performanceMode: 'performance'
    },
    wallets: [
      {
        name: 'mainnet-wallet',
        derivationPath: "m/44'/501'/0'/0'",
        network: 'mainnet'
      }
    ],
    cli: {
      outputFormat: 'text',
      colorOutput: true
    }
  }
};

/**
 * Manages configuration loading, validation, and persistence
 */
export class ConfigManager {
  private config: CLIConfig = {};
  private configPath: string = '';

  /**
   * Load configuration from file
   */
  async loadConfig(configPath: string): Promise<CLIConfig> {
    this.configPath = resolve(configPath);

    try {
      // Check if config file exists
      await fs.access(this.configPath);
      
      // Read and parse config file
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      
      // Validate configuration
      this.validateConfigObject(parsedConfig);
      
      // Merge with default configuration
      this.config = this.mergeWithDefaults(parsedConfig);
      
      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Config file doesn't exist, use default configuration
        this.config = CONFIG_TEMPLATES.default;
        return this.config;
      } else if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${this.configPath}`);
      } else {
        throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CLIConfig {
    return { ...this.config };
  }

  /**
   * Initialize configuration file
   */
  async initializeConfig(configPath: string, options: ConfigInitOptions = {}): Promise<void> {
    const fullPath = resolve(configPath);

    try {
      // Check if file already exists
      if (!options.force) {
        try {
          await fs.access(fullPath);
          throw new Error(`Configuration file already exists: ${fullPath}. Use --force to overwrite.`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
          // File doesn't exist, continue with creation
        }
      }

      // Get template configuration
      const template = options.template || 'default';
      const templateConfig = CONFIG_TEMPLATES[template];
      
      if (!templateConfig) {
        throw new Error(`Unknown configuration template: ${template}. Available templates: ${Object.keys(CONFIG_TEMPLATES).join(', ')}`);
      }

      // Write configuration file
      const configContent = JSON.stringify(templateConfig, null, 2);
      await fs.writeFile(fullPath, configContent, 'utf-8');

      // Update internal config
      this.config = { ...templateConfig };
      this.configPath = fullPath;

    } catch (error) {
      throw new Error(`Failed to initialize configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate configuration file
   */
  async validateConfig(configPath?: string): Promise<boolean> {
    const pathToValidate = configPath ? resolve(configPath) : this.configPath;

    try {
      // Read configuration file
      const configContent = await fs.readFile(pathToValidate, 'utf-8');
      const parsedConfig = JSON.parse(configContent);
      
      // Validate configuration object
      this.validateConfigObject(parsedConfig);
      
      return true;
    } catch (error) {
      console.error(`Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Save current configuration to file
   */
  async saveConfig(): Promise<void> {
    if (!this.configPath) {
      throw new Error('No configuration file path set');
    }

    try {
      const configContent = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, configContent, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<CLIConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get available configuration templates
   */
  getAvailableTemplates(): string[] {
    return Object.keys(CONFIG_TEMPLATES);
  }

  /**
   * Get template configuration
   */
  getTemplate(templateName: string): CLIConfig | null {
    return CONFIG_TEMPLATES[templateName] || null;
  }

  /**
   * Convert CLI config to EmulatorConfig
   */
  toEmulatorConfig(): EmulatorConfig {
    const config = this.getConfig();
    
    return {
      networkEndpoint: config.network?.endpoint || 'https://api.devnet.solana.com',
      walletProfiles: config.wallets || [],
      debugMode: config.developer?.debugMode || false,
      performanceMode: config.developer?.performanceMode || 'development',
      emulator: {
        androidVersion: config.emulator?.androidVersion || '33',
        deviceProfile: config.emulator?.deviceProfile || 'pixel_4',
        memorySize: config.emulator?.memorySize || 2048,
        diskSize: config.emulator?.diskSize || 8192
      },
      developer: {
        logLevel: config.developer?.logLevel || 'info',
        autoApproveTransactions: config.developer?.autoApproveTransactions || false,
        simulateNetworkDelay: config.developer?.simulateNetworkDelay || false
      }
    };
  }

  /**
   * Validate configuration object structure and values
   */
  private validateConfigObject(config: any): void {
    if (typeof config !== 'object' || config === null) {
      throw new Error('Configuration must be an object');
    }

    // Validate network configuration
    if (config.network) {
      if (typeof config.network !== 'object') {
        throw new Error('network configuration must be an object');
      }
      
      if (config.network.endpoint && typeof config.network.endpoint !== 'string') {
        throw new Error('network.endpoint must be a string');
      }
      
      if (config.network.commitment && !['processed', 'confirmed', 'finalized'].includes(config.network.commitment)) {
        throw new Error('network.commitment must be one of: processed, confirmed, finalized');
      }
      
      if (config.network.timeout && (typeof config.network.timeout !== 'number' || config.network.timeout <= 0)) {
        throw new Error('network.timeout must be a positive number');
      }
    }

    // Validate emulator configuration
    if (config.emulator) {
      if (typeof config.emulator !== 'object') {
        throw new Error('emulator configuration must be an object');
      }
      
      if (config.emulator.memorySize && (typeof config.emulator.memorySize !== 'number' || config.emulator.memorySize < 512)) {
        throw new Error('emulator.memorySize must be a number >= 512');
      }
      
      if (config.emulator.diskSize && (typeof config.emulator.diskSize !== 'number' || config.emulator.diskSize < 1024)) {
        throw new Error('emulator.diskSize must be a number >= 1024');
      }
    }

    // Validate developer configuration
    if (config.developer) {
      if (typeof config.developer !== 'object') {
        throw new Error('developer configuration must be an object');
      }
      
      if (config.developer.logLevel && !['error', 'warn', 'info', 'debug'].includes(config.developer.logLevel)) {
        throw new Error('developer.logLevel must be one of: error, warn, info, debug');
      }
      
      if (config.developer.performanceMode && !['development', 'testing', 'performance'].includes(config.developer.performanceMode)) {
        throw new Error('developer.performanceMode must be one of: development, testing, performance');
      }
    }

    // Validate wallets configuration
    if (config.wallets) {
      if (!Array.isArray(config.wallets)) {
        throw new Error('wallets must be an array');
      }
      
      for (let i = 0; i < config.wallets.length; i++) {
        const wallet = config.wallets[i];
        if (typeof wallet !== 'object' || wallet === null) {
          throw new Error(`wallets[${i}] must be an object`);
        }
        
        if (!wallet.name || typeof wallet.name !== 'string') {
          throw new Error(`wallets[${i}].name is required and must be a string`);
        }
        
        if (!wallet.derivationPath || typeof wallet.derivationPath !== 'string') {
          throw new Error(`wallets[${i}].derivationPath is required and must be a string`);
        }
        
        if (!wallet.network || !['mainnet', 'devnet', 'testnet', 'localhost'].includes(wallet.network)) {
          throw new Error(`wallets[${i}].network must be one of: mainnet, devnet, testnet, localhost`);
        }
      }
    }
  }

  /**
   * Merge configuration with defaults
   */
  private mergeWithDefaults(config: CLIConfig): CLIConfig {
    const defaultConfig = CONFIG_TEMPLATES.default;
    
    return {
      network: { ...defaultConfig.network, ...config.network },
      emulator: { ...defaultConfig.emulator, ...config.emulator },
      developer: { ...defaultConfig.developer, ...config.developer },
      wallets: config.wallets || defaultConfig.wallets,
      cli: { ...defaultConfig.cli, ...config.cli }
    };
  }
}