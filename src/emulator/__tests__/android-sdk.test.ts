import { AndroidSDK, AndroidSDKConfig, AVDConfig } from '../android-sdk';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock fs
jest.mock('fs', () => ({
  promises: {
    access: jest.fn()
  }
}));
const mockFsAccess = fs.access as jest.MockedFunction<typeof fs.access>;

// Mock os
jest.mock('os', () => ({
  homedir: () => '/home/testuser',
  platform: () => 'linux'
}));

describe('AndroidSDK', () => {
  let androidSdk: AndroidSDK;
  let mockProcess: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = {
      write: jest.fn(),
      end: jest.fn()
    };
    
    mockSpawn.mockReturnValue(mockProcess as any);
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      androidSdk = new AndroidSDK();
      const config = androidSdk.getConfig();
      
      expect(config.resolvedSdkPath).toContain('Android/Sdk');
      expect(config.resolvedEmulatorPath).toContain('emulator');
      expect(config.resolvedAdbPath).toContain('adb');
    });

    it('should initialize with custom configuration', () => {
      const customConfig: AndroidSDKConfig = {
        sdkPath: '/custom/android/sdk',
        emulatorPath: '/custom/emulator',
        adbPath: '/custom/adb'
      };
      
      androidSdk = new AndroidSDK(customConfig);
      const config = androidSdk.getConfig();
      
      expect(config.resolvedSdkPath).toBe('/custom/android/sdk');
      expect(config.resolvedEmulatorPath).toBe('/custom/emulator');
      expect(config.resolvedAdbPath).toBe('/custom/adb');
    });
  });

  describe('validateSDK', () => {
    beforeEach(() => {
      androidSdk = new AndroidSDK();
    });

    it('should return true when SDK is valid', async () => {
      mockFsAccess.mockResolvedValue(undefined);
      
      const isValid = await androidSdk.validateSDK();
      
      expect(isValid).toBe(true);
      expect(mockFsAccess).toHaveBeenCalledTimes(3); // emulator, adb, avd paths
    });

    it('should return false when SDK is invalid', async () => {
      mockFsAccess.mockRejectedValue(new Error('File not found'));
      
      const isValid = await androidSdk.validateSDK();
      
      expect(isValid).toBe(false);
    });
  });

  describe('listAvds', () => {
    beforeEach(() => {
      androidSdk = new AndroidSDK();
    });

    it('should list available AVDs', async () => {
      const expectedAvds = ['test-avd-1', 'test-avd-2', 'solana-sim-avd'];
      
      const listPromise = androidSdk.listAvds();
      
      // Simulate successful command execution
      setTimeout(() => {
        mockProcess.stdout.emit('data', expectedAvds.join('\n') + '\n');
        mockProcess.emit('close', 0);
      }, 10);
      
      const avds = await listPromise;
      
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('emulator'),
        ['-list-avds'],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      expect(avds).toEqual(expectedAvds);
    });

    it('should handle empty AVD list', async () => {
      const listPromise = androidSdk.listAvds();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', '');
        mockProcess.emit('close', 0);
      }, 10);
      
      const avds = await listPromise;
      
      expect(avds).toEqual([]);
    });

    it('should handle command failure', async () => {
      const listPromise = androidSdk.listAvds();
      
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Command failed');
        mockProcess.emit('close', 1);
      }, 10);
      
      await expect(listPromise).rejects.toThrow('Failed to list AVDs: Command failed');
    });

    it('should handle process error', async () => {
      const listPromise = androidSdk.listAvds();
      
      setTimeout(() => {
        mockProcess.emit('error', new Error('Process error'));
      }, 10);
      
      await expect(listPromise).rejects.toThrow('Failed to execute emulator command: Process error');
    });
  });

  describe('createAvd', () => {
    beforeEach(() => {
      androidSdk = new AndroidSDK();
    });

    it('should create AVD successfully', async () => {
      const avdConfig: AVDConfig = {
        name: 'test-avd',
        target: 'android-33',
        abi: 'x86_64',
        device: 'pixel_6',
        sdcardSize: '512M'
      };
      
      const createPromise = androidSdk.createAvd(avdConfig);
      
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(createPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('avdmanager'),
        [
          'create', 'avd',
          '--name', 'test-avd',
          '--package', 'system-images;android-33;google_apis;x86_64',
          '--device', 'pixel_6',
          '--sdcard', '512M'
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
      expect(mockProcess.stdin.write).toHaveBeenCalledWith('no\n');
    });

    it('should create AVD without optional parameters', async () => {
      const avdConfig: AVDConfig = {
        name: 'simple-avd',
        target: 'android-30',
        abi: 'arm64-v8a',
        device: 'pixel_4'
      };
      
      const createPromise = androidSdk.createAvd(avdConfig);
      
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(createPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('avdmanager'),
        [
          'create', 'avd',
          '--name', 'simple-avd',
          '--package', 'system-images;android-30;google_apis;arm64-v8a',
          '--device', 'pixel_4'
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] }
      );
    });

    it('should handle AVD creation failure', async () => {
      const avdConfig: AVDConfig = {
        name: 'failing-avd',
        target: 'android-33',
        abi: 'x86_64',
        device: 'pixel_6'
      };
      
      const createPromise = androidSdk.createAvd(avdConfig);
      
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Creation failed');
        mockProcess.emit('close', 1);
      }, 10);
      
      await expect(createPromise).rejects.toThrow('Failed to create AVD: Creation failed');
    });
  });

  describe('launchEmulator', () => {
    beforeEach(() => {
      androidSdk = new AndroidSDK();
    });

    it('should launch emulator with basic options', async () => {
      const emulatorProcess = await androidSdk.launchEmulator('test-avd');
      
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('emulator'),
        ['-avd', 'test-avd'],
        { stdio: ['pipe', 'pipe', 'pipe'], detached: false }
      );
      expect(emulatorProcess).toBe(mockProcess);
    });

    it('should launch emulator with all options', async () => {
      const options = {
        port: 5554,
        noWindow: true,
        noAudio: true,
        noSnapshot: true,
        wipeData: true,
        verbose: true,
        gpu: 'host' as const,
        memory: 2048,
        cores: 4
      };
      
      await androidSdk.launchEmulator('test-avd', options);
      
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('emulator'),
        [
          '-avd', 'test-avd',
          '-port', '5554',
          '-no-window',
          '-no-audio',
          '-no-snapshot',
          '-wipe-data',
          '-verbose',
          '-gpu', 'host',
          '-memory', '2048',
          '-cores', '4'
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], detached: false }
      );
    });

    it('should launch emulator with partial options', async () => {
      const options = {
        port: 5556,
        noWindow: true,
        gpu: 'swiftshader_indirect' as const
      };
      
      await androidSdk.launchEmulator('test-avd', options);
      
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.stringContaining('emulator'),
        [
          '-avd', 'test-avd',
          '-port', '5556',
          '-no-window',
          '-gpu', 'swiftshader_indirect'
        ],
        { stdio: ['pipe', 'pipe', 'pipe'], detached: false }
      );
    });
  });

  describe('getConfig', () => {
    it('should return complete configuration', () => {
      const customConfig: AndroidSDKConfig = {
        sdkPath: '/test/sdk',
        avdPath: '/test/avd'
      };
      
      androidSdk = new AndroidSDK(customConfig);
      const config = androidSdk.getConfig();
      
      expect(config).toMatchObject({
        sdkPath: '/test/sdk',
        avdPath: '/test/avd',
        resolvedSdkPath: '/test/sdk',
        resolvedEmulatorPath: expect.stringContaining('emulator'),
        resolvedAdbPath: expect.stringContaining('adb'),
        resolvedAvdPath: '/test/avd'
      });
    });
  });
});