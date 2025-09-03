/**
 * Tests for SimulatorManager implementation
 */

import { SimulatorManagerImpl } from '../simulator-manager';
import { EmulatorConfig } from '../../interfaces/common';
import { AndroidSDK } from '../../emulator/android-sdk';
import { EmulatorInstance as EmulatorInstanceImpl } from '../../emulator/emulator-instance';

// Mock AndroidSDK
jest.mock('../../emulator/android-sdk');
const MockAndroidSDK = AndroidSDK as jest.MockedClass<typeof AndroidSDK>;

// Mock EmulatorInstance
jest.mock('../../emulator/emulator-instance');
const MockEmulatorInstance = EmulatorInstanceImpl as jest.MockedClass<typeof EmulatorInstanceImpl>;

describe('SimulatorManagerImpl', () => {
  let simulatorManager: SimulatorManagerImpl;
  let validConfig: EmulatorConfig;
  let mockAndroidSdk: jest.Mocked<AndroidSDK>;
  let mockEmulatorInstance: jest.Mocked<EmulatorInstanceImpl>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock AndroidSDK
    mockAndroidSdk = new MockAndroidSDK() as jest.Mocked<AndroidSDK>;
    mockAndroidSdk.validateSDK.mockResolvedValue(true);
    mockAndroidSdk.listAvds.mockResolvedValue(['existing-avd']);
    mockAndroidSdk.createAvd.mockResolvedValue();
    mockAndroidSdk.getConfig.mockReturnValue({
      resolvedSdkPath: '/mock/sdk',
      resolvedEmulatorPath: '/mock/emulator',
      resolvedAdbPath: '/mock/adb',
      resolvedAvdPath: '/mock/avd'
    });

    // Setup mock EmulatorInstance
    mockEmulatorInstance = new MockEmulatorInstance(mockAndroidSdk, 'test-avd', 5554, 5555) as jest.Mocked<EmulatorInstanceImpl>;
    mockEmulatorInstance.start.mockResolvedValue();
    mockEmulatorInstance.stop.mockResolvedValue();
    mockEmulatorInstance.reset.mockResolvedValue();
    mockEmulatorInstance.getStatus.mockReturnValue('running');
    mockEmulatorInstance.getPort.mockReturnValue(5554);
    mockEmulatorInstance.getAdbPort.mockReturnValue(5555);
    mockEmulatorInstance.getAvdName.mockReturnValue('test-avd');
    mockEmulatorInstance.on = jest.fn();
    mockEmulatorInstance.emit = jest.fn();

    MockEmulatorInstance.mockImplementation(() => mockEmulatorInstance);

    simulatorManager = new SimulatorManagerImpl('error'); // Use error level to reduce test noise
    validConfig = {
      networkEndpoint: 'https://api.devnet.solana.com',
      walletProfiles: [],
      debugMode: true,
      performanceMode: 'development',
      emulator: {
        androidVersion: '13',
        deviceProfile: 'pixel_6',
        memorySize: 2048,
        diskSize: 8192
      },
      developer: {
        logLevel: 'info',
        autoApproveTransactions: false,
        simulateNetworkDelay: false
      }
    };
  });

  afterEach(() => {
    // Clean up any running instances
    simulatorManager.removeAllListeners();
  });

  describe('Initialization', () => {
    test('should be instantiable', () => {
      expect(simulatorManager).toBeInstanceOf(SimulatorManagerImpl);
    });

    test('should initialize with empty instances list', async () => {
      const instances = await simulatorManager.listInstances();
      expect(instances).toHaveLength(0);
    });
  });

  describe('Configuration Validation', () => {
    test('should reject config without network endpoint', async () => {
      const invalidConfig = { ...validConfig, networkEndpoint: '' };
      await expect(simulatorManager.startEmulator(invalidConfig)).rejects.toThrow('Network endpoint is required');
    });

    test('should reject config without android version', async () => {
      const invalidConfig = { ...validConfig };
      invalidConfig.emulator.androidVersion = '';
      await expect(simulatorManager.startEmulator(invalidConfig)).rejects.toThrow('Android version is required');
    });

    test('should reject config with insufficient memory', async () => {
      const invalidConfig = { ...validConfig };
      invalidConfig.emulator.memorySize = 256;
      await expect(simulatorManager.startEmulator(invalidConfig)).rejects.toThrow('Memory size must be at least 512MB');
    });

    test('should reject config with insufficient disk space', async () => {
      const invalidConfig = { ...validConfig };
      invalidConfig.emulator.diskSize = 512;
      await expect(simulatorManager.startEmulator(invalidConfig)).rejects.toThrow('Disk size must be at least 1GB');
    });
  });

  describe('Emulator Lifecycle', () => {
    test('should start emulator with valid configuration', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      expect(instance).toBeDefined();
      expect(instance.id).toBeTruthy();
      expect(instance.status).toBe('running'); // Updated to reflect actual implementation
      expect(instance.config).toEqual(validConfig);
      expect(instance.port).toBeGreaterThan(0);
      expect(instance.adbPort).toBeGreaterThan(0);
      expect(instance.createdAt).toBeInstanceOf(Date);
      expect(instance.lastActivity).toBeInstanceOf(Date);
      
      // Verify Android SDK integration
      expect(mockAndroidSdk.validateSDK).toHaveBeenCalled();
      expect(mockEmulatorInstance.start).toHaveBeenCalledWith(validConfig);
    });

    test('should handle SDK validation failure', async () => {
      mockAndroidSdk.validateSDK.mockResolvedValue(false);
      
      await expect(simulatorManager.startEmulator(validConfig)).rejects.toThrow('Android SDK not found or invalid');
    });

    test('should stop running emulator', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      await simulatorManager.stopEmulator(instance.id);
      
      expect(mockEmulatorInstance.stop).toHaveBeenCalled();
      
      const status = await simulatorManager.getStatus(instance.id);
      expect(status).toBe('stopped');
    });

    test('should reset emulator', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      await simulatorManager.resetEmulator(instance.id);
      
      expect(mockEmulatorInstance.reset).toHaveBeenCalled();
      
      const status = await simulatorManager.getStatus(instance.id);
      expect(status).toBe('running');
    });

    test('should throw error when stopping non-existent emulator', async () => {
      await expect(simulatorManager.stopEmulator('non-existent-id')).rejects.toThrow('Emulator instance non-existent-id not found');
    });

    test('should throw error when resetting non-existent emulator', async () => {
      await expect(simulatorManager.resetEmulator('non-existent-id')).rejects.toThrow('Emulator instance non-existent-id not found');
    });

    test('should throw error when getting status of non-existent emulator', async () => {
      await expect(simulatorManager.getStatus('non-existent-id')).rejects.toThrow('Emulator instance non-existent-id not found');
    });
  });

  describe('Instance Management', () => {
    test('should list all instances', async () => {
      const instance1 = await simulatorManager.startEmulator(validConfig);
      const instance2 = await simulatorManager.startEmulator(validConfig);
      
      const instances = await simulatorManager.listInstances();
      expect(instances).toHaveLength(2);
      expect(instances.map(i => i.id)).toContain(instance1.id);
      expect(instances.map(i => i.id)).toContain(instance2.id);
    });

    test('should get specific instance', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      const retrievedInstance = await simulatorManager.getInstance(instance.id);
      expect(retrievedInstance).toBeDefined();
      expect(retrievedInstance!.id).toBe(instance.id);
    });

    test('should return null for non-existent instance', async () => {
      const retrievedInstance = await simulatorManager.getInstance('non-existent-id');
      expect(retrievedInstance).toBeNull();
    });

    test('should get instances by status', async () => {
      const instance1 = await simulatorManager.startEmulator(validConfig);
      const instance2 = await simulatorManager.startEmulator(validConfig);
      
      const runningInstances = simulatorManager.getInstancesByStatus('running');
      expect(runningInstances).toHaveLength(2);
      expect(runningInstances.map(i => i.id)).toContain(instance1.id);
      expect(runningInstances.map(i => i.id)).toContain(instance2.id);
    });
  });

  describe('Configuration Management', () => {
    test('should update emulator configuration', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      const configUpdate = {
        debugMode: false,
        developer: {
          logLevel: 'debug' as const,
          autoApproveTransactions: true,
          simulateNetworkDelay: true
        }
      };
      
      await simulatorManager.updateConfig(instance.id, configUpdate);
      
      const updatedInstance = await simulatorManager.getInstance(instance.id);
      expect(updatedInstance!.config.debugMode).toBe(false);
      expect(updatedInstance!.config.developer.logLevel).toBe('debug');
      expect(updatedInstance!.config.developer.autoApproveTransactions).toBe(true);
      expect(updatedInstance!.config.developer.simulateNetworkDelay).toBe(true);
    });

    test('should validate configuration updates', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      const invalidUpdate = {
        emulator: {
          androidVersion: '13',
          deviceProfile: 'pixel_6',
          memorySize: 256, // Too low
          diskSize: 8192
        }
      };
      
      await expect(simulatorManager.updateConfig(instance.id, invalidUpdate)).rejects.toThrow('Memory size must be at least 512MB');
    });

    test('should throw error when updating non-existent instance', async () => {
      await expect(simulatorManager.updateConfig('non-existent-id', { debugMode: false })).rejects.toThrow('Emulator instance non-existent-id not found');
    });
  });

  describe('Error Handling', () => {
    test('should emit error events', (done) => {
      simulatorManager.on('error', (error) => {
        expect(error.code).toBeTruthy();
        expect(error.message).toBeTruthy();
        expect(error.category).toBeTruthy();
        expect(error.timestamp).toBeInstanceOf(Date);
        done();
      });
      
      // Trigger an error
      simulatorManager.getStatus('non-existent-id').catch(() => {
        // Expected to fail
      });
    });

    test('should handle stopping already stopped emulator gracefully', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      // Stop it once
      await simulatorManager.stopEmulator(instance.id);
      
      // Stop it again - should not throw
      await expect(simulatorManager.stopEmulator(instance.id)).resolves.toBeUndefined();
    });
  });

  describe('Utility Functions', () => {
    test('should set log level', () => {
      expect(() => simulatorManager.setLogLevel('debug')).not.toThrow();
    });

    test('should cleanup stopped instances', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      await simulatorManager.stopEmulator(instance.id);
      
      // Should not cleanup immediately (needs 5 minutes)
      const cleanedCount = simulatorManager.cleanupStoppedInstances();
      expect(cleanedCount).toBe(0);
      
      const instances = await simulatorManager.listInstances();
      expect(instances).toHaveLength(1);
    });

    test('should provide access to Android SDK and emulator instances', async () => {
      const instance = await simulatorManager.startEmulator(validConfig);
      
      const androidSdk = simulatorManager.getAndroidSDK();
      expect(androidSdk).toBeDefined();
      
      const emulatorInstance = simulatorManager.getEmulatorInstance(instance.id);
      expect(emulatorInstance).toBeDefined();
    });
  });

  describe('Port Allocation', () => {
    test('should allocate unique ports for multiple instances', async () => {
      const instance1 = await simulatorManager.startEmulator(validConfig);
      const instance2 = await simulatorManager.startEmulator(validConfig);
      
      expect(instance1.port).not.toBe(instance2.port);
      expect(instance1.adbPort).not.toBe(instance2.adbPort);
      expect(instance1.port).toBeLessThan(instance2.port);
      expect(instance1.adbPort).toBeLessThan(instance2.adbPort);
    });
  });
});