import { AdbClient } from '../adb-client';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('AdbClient', () => {
  let adbClient: AdbClient;
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
    mockProcess.kill = jest.fn();
    
    mockSpawn.mockReturnValue(mockProcess as any);
    
    adbClient = new AdbClient('/path/to/adb');
  });

  describe('constructor', () => {
    it('should initialize without device ID', () => {
      const client = new AdbClient('/path/to/adb');
      expect(client.getDeviceId()).toBeUndefined();
    });

    it('should initialize with device ID', () => {
      const client = new AdbClient('/path/to/adb', 'emulator-5554');
      expect(client.getDeviceId()).toBe('emulator-5554');
    });
  });

  describe('listDevices', () => {
    it('should list connected devices', async () => {
      const devicesOutput = `List of devices attached
emulator-5554	device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:generic_x86_64 transport_id:1
emulator-5556	offline
`;
      
      const listPromise = adbClient.listDevices();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', devicesOutput);
        mockProcess.emit('close', 0);
      }, 10);
      
      const devices = await listPromise;
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['devices', '-l'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      expect(devices).toHaveLength(2);
      expect(devices[0]).toEqual({
        id: 'emulator-5554',
        state: 'device',
        product: 'sdk_gphone64_x86_64',
        model: 'sdk_gphone64_x86_64',
        device: 'generic_x86_64',
        transport_id: '1'
      });
      expect(devices[1]).toEqual({
        id: 'emulator-5556',
        state: 'offline'
      });
    });

    it('should handle empty device list', async () => {
      const devicesOutput = `List of devices attached
`;
      
      const listPromise = adbClient.listDevices();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', devicesOutput);
        mockProcess.emit('close', 0);
      }, 10);
      
      const devices = await listPromise;
      
      expect(devices).toHaveLength(0);
    });

    it('should handle command failure', async () => {
      const listPromise = adbClient.listDevices();
      
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'ADB not found');
        mockProcess.emit('close', 1);
      }, 10);
      
      await expect(listPromise).rejects.toThrow('Failed to list devices: ADB not found');
    });
  });

  describe('waitForDevice', () => {
    it('should wait for device successfully', async () => {
      const waitPromise = adbClient.waitForDevice(5000);
      
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(waitPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['wait-for-device'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should timeout waiting for device', async () => {
      const waitPromise = adbClient.waitForDevice(100);
      
      // Don't emit close event to simulate timeout
      
      await expect(waitPromise).rejects.toThrow('ADB command timed out after 100ms');
    });
  });

  describe('isDeviceReady', () => {
    it('should return true when device is ready', async () => {
      const readyPromise = adbClient.isDeviceReady();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', '1');
        mockProcess.emit('close', 0);
      }, 10);
      
      const isReady = await readyPromise;
      
      expect(isReady).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['shell', 'getprop', 'sys.boot_completed'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should return false when device is not ready', async () => {
      const readyPromise = adbClient.isDeviceReady();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', '0');
        mockProcess.emit('close', 0);
      }, 10);
      
      const isReady = await readyPromise;
      
      expect(isReady).toBe(false);
    });

    it('should return false on command failure', async () => {
      const readyPromise = adbClient.isDeviceReady();
      
      setTimeout(() => {
        mockProcess.emit('close', 1);
      }, 10);
      
      const isReady = await readyPromise;
      
      expect(isReady).toBe(false);
    });

    it('should return false on timeout', async () => {
      const readyPromise = adbClient.isDeviceReady();
      
      // Don't emit any events to simulate timeout
      
      const isReady = await readyPromise;
      
      expect(isReady).toBe(false);
    });
  });

  describe('getDeviceProperties', () => {
    it('should get device properties', async () => {
      const propertiesOutput = `[ro.build.version.release]: [13]
[ro.product.model]: [sdk_gphone64_x86_64]
[ro.product.manufacturer]: [Google]
[sys.boot_completed]: [1]
`;
      
      const propertiesPromise = adbClient.getDeviceProperties();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', propertiesOutput);
        mockProcess.emit('close', 0);
      }, 10);
      
      const properties = await propertiesPromise;
      
      expect(properties).toEqual({
        'ro.build.version.release': '13',
        'ro.product.model': 'sdk_gphone64_x86_64',
        'ro.product.manufacturer': 'Google',
        'sys.boot_completed': '1'
      });
    });

    it('should handle command failure', async () => {
      const propertiesPromise = adbClient.getDeviceProperties();
      
      setTimeout(() => {
        mockProcess.stderr.emit('data', 'Failed to get properties');
        mockProcess.emit('close', 1);
      }, 10);
      
      await expect(propertiesPromise).rejects.toThrow('Failed to get device properties: Failed to get properties');
    });
  });

  describe('installPackage', () => {
    it('should install package successfully', async () => {
      const installPromise = adbClient.installPackage('/path/to/app.apk');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Success');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(installPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['install', '/path/to/app.apk'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should install package with options', async () => {
      const options = {
        replace: true,
        allowDowngrade: true,
        grantPermissions: true
      };
      
      const installPromise = adbClient.installPackage('/path/to/app.apk', options);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Success');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(installPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', [
        'install', '-r', '-d', '-g', '/path/to/app.apk'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should handle installation failure', async () => {
      const installPromise = adbClient.installPackage('/path/to/app.apk');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(installPromise).rejects.toThrow('Failed to install package: Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]');
    });
  });

  describe('uninstallPackage', () => {
    it('should uninstall package successfully', async () => {
      const uninstallPromise = adbClient.uninstallPackage('com.example.app');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Success');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(uninstallPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['uninstall', 'com.example.app'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should uninstall package keeping data', async () => {
      const uninstallPromise = adbClient.uninstallPackage('com.example.app', true);
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Success');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(uninstallPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['uninstall', '-k', 'com.example.app'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });
  });

  describe('listPackages', () => {
    it('should list all packages', async () => {
      const packagesOutput = `package:com.android.settings
package:com.example.app
package:com.google.android.gms
`;
      
      const listPromise = adbClient.listPackages();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', packagesOutput);
        mockProcess.emit('close', 0);
      }, 10);
      
      const packages = await listPromise;
      
      expect(packages).toEqual([
        'com.android.settings',
        'com.example.app',
        'com.google.android.gms'
      ]);
    });

    it('should list packages with options', async () => {
      const listPromise = adbClient.listPackages({
        systemApps: true,
        userApps: true,
        enabledOnly: true
      });
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'package:com.example.app');
        mockProcess.emit('close', 0);
      }, 10);
      
      await listPromise;
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', [
        'shell', 'pm', 'list', 'packages', '-s', '-3', '-e'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });
  });

  describe('startActivity', () => {
    it('should start activity successfully', async () => {
      const startPromise = adbClient.startActivity('com.example.app');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Starting: Intent');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(startPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', [
        'shell', 'am', 'start', '-n', 'com.example.app/.MainActivity'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should start activity with custom activity name', async () => {
      const startPromise = adbClient.startActivity('com.example.app', '.CustomActivity');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'Starting: Intent');
        mockProcess.emit('close', 0);
      }, 10);
      
      await expect(startPromise).resolves.toBeUndefined();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', [
        'shell', 'am', 'start', '-n', 'com.example.app/.CustomActivity'
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });
  });

  describe('shell', () => {
    it('should execute shell command', async () => {
      const shellPromise = adbClient.shell('ls /data/app');
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'com.example.app-1\ncom.other.app-2');
        mockProcess.stderr.emit('data', '');
        mockProcess.emit('close', 0);
      }, 10);
      
      const result = await shellPromise;
      
      expect(result).toEqual({
        stdout: 'com.example.app-1\ncom.other.app-2',
        stderr: '',
        exitCode: 0
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['shell', 'ls /data/app'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });
  });

  describe('device targeting', () => {
    it('should use device ID when set', async () => {
      adbClient.setDeviceId('emulator-5554');
      
      const listPromise = adbClient.listDevices();
      
      setTimeout(() => {
        mockProcess.stdout.emit('data', 'List of devices attached\n');
        mockProcess.emit('close', 0);
      }, 10);
      
      await listPromise;
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['-s', 'emulator-5554', 'devices', '-l'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should clear device ID', () => {
      adbClient.setDeviceId('emulator-5554');
      expect(adbClient.getDeviceId()).toBe('emulator-5554');
      
      adbClient.clearDeviceId();
      expect(adbClient.getDeviceId()).toBeUndefined();
    });
  });

  describe('logcat', () => {
    it('should start logcat monitoring', () => {
      const logEntries: any[] = [];
      adbClient.on('logcat', (entry) => logEntries.push(entry));
      
      adbClient.startLogcat();
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['logcat'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      // Simulate logcat output
      const logLine = '12-25 10:30:45.123  1234  5678 I TestTag : Test message';
      mockProcess.stdout.emit('data', logLine + '\n');
      
      expect(logEntries).toHaveLength(1);
      expect(logEntries[0]).toMatchObject({
        pid: 1234,
        tid: 5678,
        level: 'I',
        tag: 'TestTag',
        message: 'Test message'
      });
    });

    it('should start logcat with options', () => {
      adbClient.startLogcat({
        tag: 'TestTag',
        level: 'E',
        clear: true
      });
      
      expect(mockSpawn).toHaveBeenCalledWith('/path/to/adb', ['logcat', '-c', '-s', 'TestTag:E'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    });

    it('should stop logcat monitoring', () => {
      adbClient.startLogcat();
      adbClient.stopLogcat();
      
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });
  });
});