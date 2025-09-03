import { SimulatorManager } from '../interfaces/simulator-manager';
import { EmulatorConfig, EmulatorInstance, EmulatorStatus, SimulatorError, LogLevel } from '../interfaces/common';
import { AndroidSDK } from '../emulator/android-sdk';
import { EmulatorInstance as EmulatorInstanceImpl } from '../emulator/emulator-instance';
import { EventEmitter } from 'events';

/**
 * Logger interface for the simulator
 */
interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * Simple console-based logger implementation
 */
class ConsoleLogger implements Logger {
  constructor(private logLevel: LogLevel = 'info') {}

  private shouldLog(level: LogLevel): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private formatMessage(level: string, message: string, context?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, context));
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, context));
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message, context));
    }
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      
    }
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}

/**
 * Implementation of the Simulator Manager
 * Orchestrates emulator lifecycle, configuration, and developer tools
 */
export class SimulatorManagerImpl extends EventEmitter implements SimulatorManager {
  private instances: Map<string, EmulatorInstance> = new Map();
  private emulatorInstances: Map<string, EmulatorInstanceImpl> = new Map();
  private androidSdk: AndroidSDK;
  private logger: ConsoleLogger;
  private nextPort = 5554; // Starting port for emulator instances
  private nextAdbPort = 5555; // Starting ADB port

  constructor(logLevel: LogLevel = 'info', androidSdkConfig?: any) {
    super();
    this.logger = new ConsoleLogger(logLevel);
    this.androidSdk = new AndroidSDK(androidSdkConfig);
    this.logger.info('SimulatorManager initialized');
  }

  /**
   * Generate a unique instance ID
   */
  private generateInstanceId(): string {
    return `emulator-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Allocate ports for a new emulator instance
   */
  private allocatePorts(): { port: number; adbPort: number } {
    const port = this.nextPort;
    const adbPort = this.nextAdbPort;
    this.nextPort += 2;
    this.nextAdbPort += 2;
    return { port, adbPort };
  }

  /**
   * Validate emulator configuration
   */
  private validateConfig(config: EmulatorConfig): void {
    if (!config.networkEndpoint) {
      throw this.createError('INVALID_CONFIG', 'Network endpoint is required', 'emulator');
    }

    if (!config.emulator.androidVersion) {
      throw this.createError('INVALID_CONFIG', 'Android version is required', 'emulator');
    }

    if (config.emulator.memorySize < 512) {
      throw this.createError('INVALID_CONFIG', 'Memory size must be at least 512MB', 'emulator');
    }

    if (config.emulator.diskSize < 1024) {
      throw this.createError('INVALID_CONFIG', 'Disk size must be at least 1GB', 'emulator');
    }
  }

  /**
   * Create a standardized error
   */
  private createError(code: string, message: string, category: SimulatorError['category'], context?: Record<string, unknown>): Error {
    const error = new Error(message);
    (error as any).code = code;
    (error as any).category = category;
    (error as any).context = context || {};
    (error as any).timestamp = new Date();
    return error;
  }

  /**
   * Handle errors with logging and recovery
   */
  private handleError(error: Error, instanceId?: string): void {
    const simulatorError: SimulatorError = {
      code: (error as any).code || 'UNKNOWN_ERROR',
      message: error.message,
      category: (error as any).category || 'emulator',
      severity: 'high',
      context: { instanceId, ...(error as any).context },
      timestamp: new Date(),
      recoverable: false
    };

    this.logger.error(`Error occurred: ${error.message}`, simulatorError.context);
    this.emit('error', simulatorError);
  }

  async startEmulator(config: EmulatorConfig): Promise<EmulatorInstance> {
    try {
      this.logger.info('Starting new emulator instance');
      
      // Validate configuration first
      this.validateConfig(config);

      // Validate Android SDK
      const sdkValid = await this.androidSdk.validateSDK();
      if (!sdkValid) {
        throw this.createError('SDK_NOT_FOUND', 'Android SDK not found or invalid', 'emulator');
      }

      // Generate instance details
      const instanceId = this.generateInstanceId();
      const { port, adbPort } = this.allocatePorts();
      const avdName = `solana-sim-${instanceId}`;

      // Create emulator instance data
      const instance: EmulatorInstance = {
        id: instanceId,
        status: 'starting',
        config: { ...config },
        createdAt: new Date(),
        lastActivity: new Date(),
        port,
        adbPort
      };

      // Store instance
      this.instances.set(instanceId, instance);

      // Create actual emulator instance
      const emulatorInstance = new EmulatorInstanceImpl(
        this.androidSdk,
        avdName,
        port,
        adbPort
      );

      // Set up event handlers
      this.setupEmulatorEventHandlers(instanceId, emulatorInstance);

      // Store emulator instance
      this.emulatorInstances.set(instanceId, emulatorInstance);

      this.logger.info(`Emulator instance created`, { instanceId, port, adbPort, avdName });

      // Start the actual emulator
      await emulatorInstance.start(config);

      // Update instance status
      const currentInstance = this.instances.get(instanceId);
      if (currentInstance) {
        currentInstance.status = 'running';
        currentInstance.lastActivity = new Date();
        this.instances.set(instanceId, currentInstance);
        this.logger.info(`Emulator instance started successfully`, { instanceId });
        this.emit('instanceStarted', currentInstance);
      }

      return instance;
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }

  async stopEmulator(instanceId: string): Promise<void> {
    try {
      this.logger.info(`Stopping emulator instance`, { instanceId });

      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw this.createError('INSTANCE_NOT_FOUND', `Emulator instance ${instanceId} not found`, 'emulator', { instanceId });
      }

      if (instance.status === 'stopped') {
        this.logger.warn(`Emulator instance already stopped`, { instanceId });
        return;
      }

      // Update status to stopping
      instance.status = 'stopping';
      instance.lastActivity = new Date();
      this.instances.set(instanceId, instance);

      // Stop the actual emulator
      const emulatorInstance = this.emulatorInstances.get(instanceId);
      if (emulatorInstance) {
        await emulatorInstance.stop();
      }

      // Update instance status
      const currentInstance = this.instances.get(instanceId);
      if (currentInstance) {
        currentInstance.status = 'stopped';
        currentInstance.lastActivity = new Date();
        this.instances.set(instanceId, currentInstance);
        this.logger.info(`Emulator instance stopped successfully`, { instanceId });
        this.emit('instanceStopped', currentInstance);
      }

    } catch (error) {
      this.handleError(error as Error, instanceId);
      throw error;
    }
  }

  async resetEmulator(instanceId: string): Promise<void> {
    try {
      this.logger.info(`Resetting emulator instance`, { instanceId });

      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw this.createError('INSTANCE_NOT_FOUND', `Emulator instance ${instanceId} not found`, 'emulator', { instanceId });
      }

      // Update status to starting (reset in progress)
      instance.status = 'starting';
      instance.lastActivity = new Date();
      this.instances.set(instanceId, instance);

      // Reset the actual emulator
      const emulatorInstance = this.emulatorInstances.get(instanceId);
      if (emulatorInstance) {
        await emulatorInstance.reset();
      }

      // Update instance status
      const updatedInstance = this.instances.get(instanceId);
      if (updatedInstance) {
        updatedInstance.status = 'running';
        updatedInstance.lastActivity = new Date();
        this.instances.set(instanceId, updatedInstance);
        this.logger.info(`Emulator instance reset successfully`, { instanceId });
        this.emit('instanceReset', updatedInstance);
      }

    } catch (error) {
      this.handleError(error as Error, instanceId);
      throw error;
    }
  }

  async getStatus(instanceId: string): Promise<EmulatorStatus> {
    try {
      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw this.createError('INSTANCE_NOT_FOUND', `Emulator instance ${instanceId} not found`, 'emulator', { instanceId });
      }

      // Update last activity
      instance.lastActivity = new Date();
      this.instances.set(instanceId, instance);

      return instance.status;
    } catch (error) {
      this.handleError(error as Error, instanceId);
      throw error;
    }
  }

  async updateConfig(instanceId: string, config: Partial<EmulatorConfig>): Promise<void> {
    try {
      this.logger.info(`Updating configuration for emulator instance`, { instanceId });

      const instance = this.instances.get(instanceId);
      if (!instance) {
        throw this.createError('INSTANCE_NOT_FOUND', `Emulator instance ${instanceId} not found`, 'emulator', { instanceId });
      }

      // Merge configuration
      const updatedConfig = { ...instance.config, ...config };
      
      // Validate the updated configuration
      this.validateConfig(updatedConfig);

      // Update instance
      instance.config = updatedConfig;
      instance.lastActivity = new Date();
      this.instances.set(instanceId, instance);

      // Update logger level if provided
      if (config.developer?.logLevel) {
        this.logger.setLogLevel(config.developer.logLevel);
      }

      this.logger.info(`Configuration updated successfully`, { instanceId });
      this.emit('configUpdated', instance);

    } catch (error) {
      this.handleError(error as Error, instanceId);
      throw error;
    }
  }

  async listInstances(): Promise<EmulatorInstance[]> {
    return Array.from(this.instances.values());
  }

  async getInstance(instanceId: string): Promise<EmulatorInstance | null> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      // Update last activity
      instance.lastActivity = new Date();
      this.instances.set(instanceId, instance);
    }
    return instance || null;
  }

  /**
   * Set the log level for the simulator manager
   */
  setLogLevel(level: LogLevel): void {
    this.logger.setLogLevel(level);
    this.logger.info(`Log level updated to ${level}`);
  }

  /**
   * Get all instances with a specific status
   */
  getInstancesByStatus(status: EmulatorStatus): EmulatorInstance[] {
    return Array.from(this.instances.values()).filter(instance => instance.status === status);
  }

  /**
   * Clean up stopped instances (remove from memory)
   */
  cleanupStoppedInstances(): number {
    const stoppedInstances = this.getInstancesByStatus('stopped');
    let cleanedCount = 0;

    for (const instance of stoppedInstances) {
      // Only cleanup instances that have been stopped for more than 5 minutes
      const timeSinceLastActivity = Date.now() - instance.lastActivity.getTime();
      if (timeSinceLastActivity > 5 * 60 * 1000) {
        this.instances.delete(instance.id);
        this.emulatorInstances.delete(instance.id);
        cleanedCount++;
        this.logger.debug(`Cleaned up stopped instance`, { instanceId: instance.id });
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} stopped instances`);
    }

    return cleanedCount;
  }

  /**
   * Get emulator instance implementation
   */
  getEmulatorInstance(instanceId: string): EmulatorInstanceImpl | undefined {
    return this.emulatorInstances.get(instanceId);
  }

  /**
   * Get Android SDK instance
   */
  getAndroidSDK(): AndroidSDK {
    return this.androidSdk;
  }

  /**
   * Set up event handlers for emulator instance
   */
  private setupEmulatorEventHandlers(instanceId: string, emulatorInstance: EmulatorInstanceImpl): void {
    emulatorInstance.on('statusChanged', (status: EmulatorStatus) => {
      const instance = this.instances.get(instanceId);
      if (instance) {
        instance.status = status;
        instance.lastActivity = new Date();
        this.instances.set(instanceId, instance);
        this.emit('instanceStatusChanged', { instanceId, status });
      }
    });

    emulatorInstance.on('error', (error: Error) => {
      this.handleError(error, instanceId);
    });

    emulatorInstance.on('healthCheck', (healthCheck: any) => {
      this.emit('instanceHealthCheck', { instanceId, healthCheck });
    });

    emulatorInstance.on('stdout', (data: string) => {
      this.logger.debug(`Emulator stdout [${instanceId}]: ${data.trim()}`);
    });

    emulatorInstance.on('stderr', (data: string) => {
      this.logger.debug(`Emulator stderr [${instanceId}]: ${data.trim()}`);
    });
  }
}