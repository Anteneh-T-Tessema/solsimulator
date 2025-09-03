/**
 * Tests for CLI Manager
 */

import { CLIManager } from '../cli-manager';
import { ConfigManager } from '../config-manager';
import { SimulatorManagerImpl } from '../../simulator/simulator-manager';

// Mock the SimulatorManager
jest.mock('../../simulator/simulator-manager');

describe('CLIManager', () => {
  let cliManager: CLIManager;
  let configManager: ConfigManager;
  let mockSimulatorManager: jest.Mocked<SimulatorManagerImpl>;

  beforeEach(() => {
    configManager = new ConfigManager();
    cliManager = new CLIManager(configManager);
    
    // Create mock simulator manager
    mockSimulatorManager = {
      startEmulator: jest.fn(),
      stopEmulator: jest.fn(),
      resetEmulator: jest.fn(),
      getStatus: jest.fn(),
      updateConfig: jest.fn(),
      listInstances: jest.fn(),
      getInstance: jest.fn(),
      on: jest.fn(),
      setLogLevel: jest.fn(),
      getInstancesByStatus: jest.fn(),
      cleanupStoppedInstances: jest.fn(),
      getEmulatorInstance: jest.fn(),
      getAndroidSDK: jest.fn()
    } as any;

    // Mock the constructor
    (SimulatorManagerImpl as jest.MockedClass<typeof SimulatorManagerImpl>).mockImplementation(() => mockSimulatorManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with default options', async () => {
      // Mock config loading
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({
        network: { endpoint: 'https://api.devnet.solana.com' },
        developer: { 
          logLevel: 'info',
          debugMode: false,
          autoApproveTransactions: false,
          simulateNetworkDelay: false,
          performanceMode: 'development'
        }
      });

      await cliManager.initialize({ config: 'test-config.json' });

      expect(configManager.loadConfig).toHaveBeenCalledWith('test-config.json');
      expect(SimulatorManagerImpl).toHaveBeenCalledWith('info');
    });

    it('should handle debug log level', async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});

      await cliManager.initialize({ debug: true });

      expect(SimulatorManagerImpl).toHaveBeenCalledWith('debug');
    });

    it('should handle verbose log level', async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});

      await cliManager.initialize({ verbose: true });

      expect(SimulatorManagerImpl).toHaveBeenCalledWith('info');
    });

    it('should throw error if initialization fails', async () => {
      jest.spyOn(configManager, 'loadConfig').mockRejectedValue(new Error('Config load failed'));

      await expect(cliManager.initialize({})).rejects.toThrow('Config load failed');
    });
  });

  describe('handleStart', () => {
    beforeEach(async () => {
      const mockConfig = {
        network: { endpoint: 'https://api.devnet.solana.com' },
        developer: { 
          logLevel: 'info' as const,
          debugMode: false,
          autoApproveTransactions: false,
          simulateNetworkDelay: false,
          performanceMode: 'development' as const
        }
      };
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue(mockConfig);
      jest.spyOn(configManager, 'getConfig').mockReturnValue(mockConfig);
      await cliManager.initialize({});
    });

    it('should start emulator with default configuration', async () => {
      const mockInstance = {
        id: 'test-instance',
        port: 5554,
        adbPort: 5555,
        status: 'running' as const,
        config: {} as any,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      mockSimulatorManager.startEmulator.mockResolvedValue(mockInstance);

      await cliManager.handleStart({});

      expect(mockSimulatorManager.startEmulator).toHaveBeenCalledWith(
        expect.objectContaining({
          networkEndpoint: 'https://api.devnet.solana.com',
          debugMode: false,
          performanceMode: 'development'
        })
      );
    });

    it('should start emulator with custom options', async () => {
      const mockInstance = {
        id: 'test-instance',
        port: 5554,
        adbPort: 5555,
        status: 'running' as const,
        config: {} as any,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      mockSimulatorManager.startEmulator.mockResolvedValue(mockInstance);

      await cliManager.handleStart({
        network: 'https://api.mainnet-beta.solana.com',
        memory: '4096',
        disk: '16384',
        androidVersion: '34'
      });

      expect(mockSimulatorManager.startEmulator).toHaveBeenCalledWith(
        expect.objectContaining({
          networkEndpoint: 'https://api.mainnet-beta.solana.com',
          emulator: expect.objectContaining({
            memorySize: 4096,
            diskSize: 16384,
            androidVersion: '34'
          })
        })
      );
    });

    it('should handle start errors', async () => {
      mockSimulatorManager.startEmulator.mockRejectedValue(new Error('Start failed'));

      await expect(cliManager.handleStart({})).rejects.toThrow('Start failed');
    });
  });

  describe('handleStop', () => {
    beforeEach(async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});
      await cliManager.initialize({});
    });

    it('should stop specific instance', async () => {
      mockSimulatorManager.stopEmulator.mockResolvedValue();

      await cliManager.handleStop('test-instance', {});

      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledWith('test-instance');
    });

    it('should stop all instances when --all flag is used', async () => {
      const mockInstances = [
        { id: 'instance-1', status: 'running' as const },
        { id: 'instance-2', status: 'starting' as const },
        { id: 'instance-3', status: 'stopped' as const }
      ];

      mockSimulatorManager.listInstances.mockResolvedValue(mockInstances as any);
      mockSimulatorManager.stopEmulator.mockResolvedValue();

      await cliManager.handleStop(undefined, { all: true });

      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledTimes(2);
      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledWith('instance-1');
      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledWith('instance-2');
    });

    it('should stop latest instance when no instance ID provided', async () => {
      const mockInstances = [
        { 
          id: 'instance-1', 
          status: 'running' as const, 
          createdAt: new Date('2023-01-01') 
        },
        { 
          id: 'instance-2', 
          status: 'running' as const, 
          createdAt: new Date('2023-01-02') 
        }
      ];

      mockSimulatorManager.listInstances.mockResolvedValue(mockInstances as any);
      mockSimulatorManager.stopEmulator.mockResolvedValue();

      await cliManager.handleStop(undefined, {});

      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledWith('instance-2');
    });

    it('should handle no running instances', async () => {
      mockSimulatorManager.listInstances.mockResolvedValue([]);

      // Should not throw error
      await cliManager.handleStop(undefined, {});

      expect(mockSimulatorManager.stopEmulator).not.toHaveBeenCalled();
    });
  });

  describe('handleStatus', () => {
    beforeEach(async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});
      await cliManager.initialize({});
    });

    it('should show status for specific instance', async () => {
      const mockInstance = {
        id: 'test-instance',
        status: 'running' as const,
        port: 5554,
        adbPort: 5555,
        config: {
          networkEndpoint: 'https://api.devnet.solana.com',
          emulator: { androidVersion: '33' },
          walletProfiles: [],
          debugMode: false
        },
        createdAt: new Date(),
        lastActivity: new Date()
      };

      mockSimulatorManager.getInstance.mockResolvedValue(mockInstance as any);

      await cliManager.handleStatus('test-instance', {});

      expect(mockSimulatorManager.getInstance).toHaveBeenCalledWith('test-instance');
    });

    it('should show status for all instances', async () => {
      const mockInstances = [
        { 
          id: 'instance-1', 
          status: 'running' as const,
          port: 5554,
          adbPort: 5555,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.devnet.solana.com',
            walletProfiles: []
          }
        },
        { 
          id: 'instance-2', 
          status: 'stopped' as const,
          port: 5556,
          adbPort: 5557,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.testnet.solana.com',
            walletProfiles: []
          }
        }
      ];

      mockSimulatorManager.listInstances.mockResolvedValue(mockInstances as any);

      await cliManager.handleStatus(undefined, {});

      expect(mockSimulatorManager.listInstances).toHaveBeenCalled();
    });

    it('should handle instance not found', async () => {
      mockSimulatorManager.getInstance.mockResolvedValue(null);

      // Should not throw error
      await cliManager.handleStatus('non-existent', {});

      expect(mockSimulatorManager.getInstance).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('handleList', () => {
    beforeEach(async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});
      await cliManager.initialize({});
    });

    it('should list all instances', async () => {
      const mockInstances = [
        { 
          id: 'instance-1', 
          status: 'running' as const,
          port: 5554,
          adbPort: 5555,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.devnet.solana.com',
            walletProfiles: []
          }
        },
        { 
          id: 'instance-2', 
          status: 'stopped' as const,
          port: 5556,
          adbPort: 5557,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.testnet.solana.com',
            walletProfiles: []
          }
        }
      ];

      mockSimulatorManager.listInstances.mockResolvedValue(mockInstances as any);

      await cliManager.handleList({});

      expect(mockSimulatorManager.listInstances).toHaveBeenCalled();
    });

    it('should filter instances by status', async () => {
      const mockInstances = [
        { 
          id: 'instance-1', 
          status: 'running' as const,
          port: 5554,
          adbPort: 5555,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.devnet.solana.com',
            walletProfiles: []
          }
        },
        { 
          id: 'instance-2', 
          status: 'stopped' as const,
          port: 5556,
          adbPort: 5557,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.testnet.solana.com',
            walletProfiles: []
          }
        },
        { 
          id: 'instance-3', 
          status: 'running' as const,
          port: 5558,
          adbPort: 5559,
          createdAt: new Date(),
          lastActivity: new Date(),
          config: {
            networkEndpoint: 'https://api.devnet.solana.com',
            walletProfiles: []
          }
        }
      ];

      mockSimulatorManager.listInstances.mockResolvedValue(mockInstances as any);

      await cliManager.handleList({ status: 'running' });

      expect(mockSimulatorManager.listInstances).toHaveBeenCalled();
    });

    it('should handle empty instance list', async () => {
      mockSimulatorManager.listInstances.mockResolvedValue([]);

      // Should not throw error
      await cliManager.handleList({});

      expect(mockSimulatorManager.listInstances).toHaveBeenCalled();
    });
  });

  describe('handleReset', () => {
    beforeEach(async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});
      await cliManager.initialize({});
    });

    it('should reset specific instance', async () => {
      const mockInstance = {
        id: 'test-instance',
        status: 'running' as const
      };

      mockSimulatorManager.getInstance.mockResolvedValue(mockInstance as any);
      mockSimulatorManager.resetEmulator.mockResolvedValue();

      await cliManager.handleReset('test-instance', {});

      expect(mockSimulatorManager.getInstance).toHaveBeenCalledWith('test-instance');
      expect(mockSimulatorManager.resetEmulator).toHaveBeenCalledWith('test-instance');
    });

    it('should handle instance not found', async () => {
      mockSimulatorManager.getInstance.mockResolvedValue(null);

      // Should not throw error
      await cliManager.handleReset('non-existent', {});

      expect(mockSimulatorManager.getInstance).toHaveBeenCalledWith('non-existent');
      expect(mockSimulatorManager.resetEmulator).not.toHaveBeenCalled();
    });

    it('should reset with force flag', async () => {
      const mockInstance = {
        id: 'test-instance',
        status: 'running' as const
      };

      mockSimulatorManager.getInstance.mockResolvedValue(mockInstance as any);
      mockSimulatorManager.resetEmulator.mockResolvedValue();

      await cliManager.handleReset('test-instance', { force: true });

      expect(mockSimulatorManager.resetEmulator).toHaveBeenCalledWith('test-instance');
    });
  });

  describe('cleanup', () => {
    beforeEach(async () => {
      jest.spyOn(configManager, 'loadConfig').mockResolvedValue({});
      await cliManager.initialize({});
    });

    it('should stop all running instances during cleanup', async () => {
      const mockInstances = [
        { id: 'instance-1', status: 'running' as const },
        { id: 'instance-2', status: 'starting' as const },
        { id: 'instance-3', status: 'stopped' as const }
      ];

      mockSimulatorManager.listInstances.mockResolvedValue(mockInstances as any);
      mockSimulatorManager.stopEmulator.mockResolvedValue();

      await cliManager.cleanup();

      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledTimes(2);
      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledWith('instance-1');
      expect(mockSimulatorManager.stopEmulator).toHaveBeenCalledWith('instance-2');
    });

    it('should handle cleanup errors gracefully', async () => {
      mockSimulatorManager.listInstances.mockRejectedValue(new Error('List failed'));

      // Should not throw error
      await expect(cliManager.cleanup()).resolves.not.toThrow();
    });
  });
});