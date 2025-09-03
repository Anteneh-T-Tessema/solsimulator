/**
 * CLI Manager - Handles all CLI command logic and interactions
 */

import { SimulatorManagerImpl } from '../simulator/simulator-manager';
import { ConfigManager } from './config-manager';
import { EmulatorConfig, EmulatorInstance, EmulatorStatus, LogLevel } from '../interfaces/common';
import { OutputFormatter } from './output-formatter';

export interface CLIOptions {
  config?: string;
  verbose?: boolean;
  debug?: boolean;
}

export interface StartOptions {
  port?: string;
  network?: string;
  androidVersion?: string;
  memory?: string;
  disk?: string;
  gui?: boolean;
}

export interface StopOptions {
  all?: boolean;
  force?: boolean;
}

export interface StatusOptions {
  json?: boolean;
  watch?: boolean;
}

export interface ListOptions {
  json?: boolean;
  status?: string;
}

export interface ResetOptions {
  force?: boolean;
}

export interface ConfigShowOptions {
  json?: boolean;
}

export interface ConfigInitOptions {
  force?: boolean;
  template?: string;
}

export interface ConfigValidateOptions {
  config?: string;
}

/**
 * Manages CLI operations and coordinates with SimulatorManager
 */
export class CLIManager {
  private simulatorManager: SimulatorManagerImpl | null = null;
  private outputFormatter: OutputFormatter;
  private initialized = false;

  constructor(private configManager: ConfigManager) {
    this.outputFormatter = new OutputFormatter();
  }

  /**
   * Initialize CLI manager with configuration
   */
  async initialize(options: CLIOptions): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load configuration
      const configPath = options.config || 'solana-sim.config.json';
      const config = await this.configManager.loadConfig(configPath);

      // Determine log level
      let logLevel: LogLevel = 'info';
      if (options.debug) {
        logLevel = 'debug';
      } else if (options.verbose) {
        logLevel = 'info';
      } else if (config.developer?.logLevel) {
        logLevel = config.developer.logLevel;
      }

      // Initialize simulator manager
      this.simulatorManager = new SimulatorManagerImpl(logLevel);

      // Set up event listeners
      this.setupEventListeners();

      this.initialized = true;
      this.outputFormatter.info('CLI initialized successfully');
    } catch (error) {
      this.outputFormatter.error(`Failed to initialize CLI: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle start command
   */
  async handleStart(options: StartOptions): Promise<void> {
    if (!this.simulatorManager) {
      throw new Error('CLI not initialized');
    }

    try {
      this.outputFormatter.info('Starting simulator...');

      // Get base configuration
      const baseConfig = this.configManager.getConfig();
      
      // Build emulator configuration from options and base config
      const emulatorConfig: EmulatorConfig = {
        networkEndpoint: options.network || baseConfig.network?.endpoint || 'https://api.devnet.solana.com',
        walletProfiles: baseConfig.wallets || [],
        debugMode: baseConfig.developer?.debugMode || false,
        performanceMode: baseConfig.developer?.performanceMode || 'development',
        emulator: {
          androidVersion: options.androidVersion || baseConfig.emulator?.androidVersion || '33',
          deviceProfile: baseConfig.emulator?.deviceProfile || 'pixel_4',
          memorySize: parseInt(options.memory || baseConfig.emulator?.memorySize?.toString() || '2048'),
          diskSize: parseInt(options.disk || baseConfig.emulator?.diskSize?.toString() || '8192')
        },
        developer: {
          logLevel: baseConfig.developer?.logLevel || 'info',
          autoApproveTransactions: baseConfig.developer?.autoApproveTransactions || false,
          simulateNetworkDelay: baseConfig.developer?.simulateNetworkDelay || false
        }
      };

      // Start the emulator
      const instance = await this.simulatorManager.startEmulator(emulatorConfig);

      this.outputFormatter.success(`Simulator started successfully!`);
      this.outputFormatter.info(`Instance ID: ${instance.id}`);
      this.outputFormatter.info(`Port: ${instance.port}`);
      this.outputFormatter.info(`ADB Port: ${instance.adbPort}`);
      this.outputFormatter.info(`Network: ${emulatorConfig.networkEndpoint}`);

    } catch (error) {
      this.outputFormatter.error(`Failed to start simulator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle stop command
   */
  async handleStop(instanceId?: string, options: StopOptions = {}): Promise<void> {
    if (!this.simulatorManager) {
      throw new Error('CLI not initialized');
    }

    try {
      if (options.all) {
        // Stop all running instances
        const instances = await this.simulatorManager.listInstances();
        const runningInstances = instances.filter(i => i.status === 'running' || i.status === 'starting');

        if (runningInstances.length === 0) {
          this.outputFormatter.info('No running instances to stop');
          return;
        }

        this.outputFormatter.info(`Stopping ${runningInstances.length} running instance(s)...`);

        for (const instance of runningInstances) {
          try {
            await this.simulatorManager.stopEmulator(instance.id);
            this.outputFormatter.success(`Stopped instance: ${instance.id}`);
          } catch (error) {
            this.outputFormatter.error(`Failed to stop instance ${instance.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      } else if (instanceId) {
        // Stop specific instance
        this.outputFormatter.info(`Stopping instance: ${instanceId}...`);
        await this.simulatorManager.stopEmulator(instanceId);
        this.outputFormatter.success(`Instance stopped: ${instanceId}`);
      } else {
        // Stop the most recent instance
        const instances = await this.simulatorManager.listInstances();
        const runningInstances = instances
          .filter(i => i.status === 'running' || i.status === 'starting')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        if (runningInstances.length === 0) {
          this.outputFormatter.info('No running instances to stop');
          return;
        }

        const latestInstance = runningInstances[0];
        this.outputFormatter.info(`Stopping latest instance: ${latestInstance.id}...`);
        await this.simulatorManager.stopEmulator(latestInstance.id);
        this.outputFormatter.success(`Instance stopped: ${latestInstance.id}`);
      }
    } catch (error) {
      this.outputFormatter.error(`Failed to stop simulator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle status command
   */
  async handleStatus(instanceId?: string, options: StatusOptions = {}): Promise<void> {
    if (!this.simulatorManager) {
      throw new Error('CLI not initialized');
    }

    try {
      if (instanceId) {
        // Show status for specific instance
        const instance = await this.simulatorManager.getInstance(instanceId);
        if (!instance) {
          this.outputFormatter.error(`Instance not found: ${instanceId}`);
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(instance, null, 2));
        } else {
          this.outputFormatter.displayInstanceStatus(instance);
        }
      } else {
        // Show status for all instances
        const instances = await this.simulatorManager.listInstances();
        
        if (instances.length === 0) {
          this.outputFormatter.info('No simulator instances found');
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(instances, null, 2));
        } else {
          this.outputFormatter.displayInstancesList(instances);
        }
      }

      // Watch mode
      if (options.watch && !options.json) {
        this.outputFormatter.info('Watching for status changes... (Press Ctrl+C to exit)');
        // Set up periodic status updates
        const watchInterval = setInterval(async () => {
          try {
            if (instanceId) {
              const instance = await this.simulatorManager!.getInstance(instanceId);
              if (instance) {
                console.clear();
                this.outputFormatter.displayInstanceStatus(instance);
              }
            } else {
              const instances = await this.simulatorManager!.listInstances();
              console.clear();
              this.outputFormatter.displayInstancesList(instances);
            }
          } catch (error) {
            this.outputFormatter.error(`Error updating status: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }, 2000);

        // Clean up on exit
        process.on('SIGINT', () => {
          clearInterval(watchInterval);
          process.exit(0);
        });
      }
    } catch (error) {
      this.outputFormatter.error(`Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle list command
   */
  async handleList(options: ListOptions = {}): Promise<void> {
    if (!this.simulatorManager) {
      throw new Error('CLI not initialized');
    }

    try {
      let instances = await this.simulatorManager.listInstances();

      // Filter by status if specified
      if (options.status) {
        const statusFilter = options.status as EmulatorStatus;
        instances = instances.filter(i => i.status === statusFilter);
      }

      if (instances.length === 0) {
        const statusMsg = options.status ? ` with status '${options.status}'` : '';
        this.outputFormatter.info(`No simulator instances found${statusMsg}`);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(instances, null, 2));
      } else {
        this.outputFormatter.displayInstancesList(instances);
      }
    } catch (error) {
      this.outputFormatter.error(`Failed to list instances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle reset command
   */
  async handleReset(instanceId: string, options: ResetOptions = {}): Promise<void> {
    if (!this.simulatorManager) {
      throw new Error('CLI not initialized');
    }

    try {
      // Check if instance exists
      const instance = await this.simulatorManager.getInstance(instanceId);
      if (!instance) {
        this.outputFormatter.error(`Instance not found: ${instanceId}`);
        return;
      }

      // Confirm reset unless force flag is used
      if (!options.force) {
        this.outputFormatter.warn(`This will reset instance ${instanceId} to its initial state.`);
        this.outputFormatter.warn('All data and state will be lost.');
        // In a real implementation, you'd prompt for confirmation here
        // For now, we'll proceed with the reset
      }

      this.outputFormatter.info(`Resetting instance: ${instanceId}...`);
      await this.simulatorManager.resetEmulator(instanceId);
      this.outputFormatter.success(`Instance reset successfully: ${instanceId}`);
    } catch (error) {
      this.outputFormatter.error(`Failed to reset instance: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle config show command
   */
  async handleConfigShow(options: ConfigShowOptions = {}): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      
      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
      } else {
        this.outputFormatter.displayConfig(config);
      }
    } catch (error) {
      this.outputFormatter.error(`Failed to show configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle config init command
   */
  async handleConfigInit(options: ConfigInitOptions = {}): Promise<void> {
    try {
      const configPath = 'solana-sim.config.json';
      
      await this.configManager.initializeConfig(configPath, {
        force: options.force || false,
        template: options.template || 'default'
      });

      this.outputFormatter.success(`Configuration file created: ${configPath}`);
      this.outputFormatter.info('You can now customize the configuration and run commands.');
    } catch (error) {
      this.outputFormatter.error(`Failed to initialize configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Handle config validate command
   */
  async handleConfigValidate(options: ConfigValidateOptions = {}): Promise<void> {
    try {
      const configPath = options.config || 'solana-sim.config.json';
      
      const isValid = await this.configManager.validateConfig(configPath);
      
      if (isValid) {
        this.outputFormatter.success(`Configuration is valid: ${configPath}`);
      } else {
        this.outputFormatter.error(`Configuration is invalid: ${configPath}`);
        process.exit(1);
      }
    } catch (error) {
      this.outputFormatter.error(`Failed to validate configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.simulatorManager) {
      try {
        // Stop all running instances
        const instances = await this.simulatorManager.listInstances();
        const runningInstances = instances.filter(i => i.status === 'running' || i.status === 'starting');

        for (const instance of runningInstances) {
          try {
            await this.simulatorManager.stopEmulator(instance.id);
          } catch (error) {
            // Ignore errors during cleanup
          }
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Set up event listeners for simulator manager
   */
  private setupEventListeners(): void {
    if (!this.simulatorManager) {
      return;
    }

    this.simulatorManager.on('instanceStarted', (instance: EmulatorInstance) => {
      this.outputFormatter.success(`Instance started: ${instance.id}`);
    });

    this.simulatorManager.on('instanceStopped', (instance: EmulatorInstance) => {
      this.outputFormatter.info(`Instance stopped: ${instance.id}`);
    });

    this.simulatorManager.on('instanceStatusChanged', ({ instanceId, status }: { instanceId: string; status: EmulatorStatus }) => {
      this.outputFormatter.info(`Instance ${instanceId} status changed to: ${status}`);
    });

    this.simulatorManager.on('error', (error: any) => {
      this.outputFormatter.error(`Simulator error: ${error.message}`);
    });
  }
}