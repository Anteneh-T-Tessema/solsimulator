import { EmulatorConfig, EmulatorInstance, EmulatorStatus } from './common';

/**
 * Interface for the main Simulator Manager
 * Orchestrates emulator lifecycle, configuration, and developer tools
 */
export interface SimulatorManager {
  /**
   * Start a new emulator instance with the given configuration
   */
  startEmulator(config: EmulatorConfig): Promise<EmulatorInstance>;

  /**
   * Stop a running emulator instance
   */
  stopEmulator(instanceId: string): Promise<void>;

  /**
   * Reset an emulator instance to its initial state
   */
  resetEmulator(instanceId: string): Promise<void>;

  /**
   * Get the current status of an emulator instance
   */
  getStatus(instanceId: string): Promise<EmulatorStatus>;

  /**
   * Update configuration for a running emulator instance
   */
  updateConfig(instanceId: string, config: Partial<EmulatorConfig>): Promise<void>;

  /**
   * List all active emulator instances
   */
  listInstances(): Promise<EmulatorInstance[]>;

  /**
   * Get detailed information about a specific emulator instance
   */
  getInstance(instanceId: string): Promise<EmulatorInstance | null>;
}