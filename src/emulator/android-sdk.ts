import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir, platform } from 'os';

/**
 * Android SDK configuration and paths
 */
export interface AndroidSDKConfig {
  sdkPath?: string;
  avdPath?: string;
  emulatorPath?: string;
  adbPath?: string;
}

/**
 * Android Virtual Device (AVD) configuration
 */
export interface AVDConfig {
  name: string;
  target: string; // API level target (e.g., "android-33")
  abi: string; // System image ABI (e.g., "x86_64", "arm64-v8a")
  device: string; // Device profile (e.g., "pixel_6")
  sdcardSize?: string; // SD card size (e.g., "512M")
  ramSize?: number; // RAM size in MB
  heapSize?: number; // Heap size in MB
  dataPartitionSize?: string; // Data partition size (e.g., "2048M")
}

/**
 * Emulator launch options
 */
export interface EmulatorLaunchOptions {
  port?: number;
  noWindow?: boolean;
  noAudio?: boolean;
  noSnapshot?: boolean;
  wipeData?: boolean;
  verbose?: boolean;
  gpu?: 'auto' | 'host' | 'swiftshader_indirect' | 'angle_indirect' | 'guest';
  memory?: number;
  cores?: number;
}

/**
 * Android SDK integration for emulator management
 */
export class AndroidSDK {
  private config: AndroidSDKConfig;
  private sdkPath: string;
  private emulatorPath: string;
  private adbPath: string;
  private avdPath: string;

  constructor(config: AndroidSDKConfig = {}) {
    this.config = config;
    this.sdkPath = this.resolveSdkPath();
    this.emulatorPath = this.resolveEmulatorPath();
    this.adbPath = this.resolveAdbPath();
    this.avdPath = this.resolveAvdPath();
  }

  /**
   * Resolve Android SDK path based on platform and common locations
   */
  private resolveSdkPath(): string {
    if (this.config.sdkPath) {
      return resolve(this.config.sdkPath);
    }

    const platformType = platform();
    const home = homedir();

    // Common Android SDK locations by platform
    const commonPaths = {
      darwin: [
        join(home, 'Library/Android/sdk'),
        join(home, 'Android/sdk'),
        '/usr/local/android-sdk'
      ],
      linux: [
        join(home, 'Android/Sdk'),
        join(home, 'android-sdk'),
        '/opt/android-sdk',
        '/usr/local/android-sdk'
      ],
      win32: [
        join(home, 'AppData/Local/Android/Sdk'),
        'C:/Android/sdk',
        'C:/Program Files/Android/sdk',
        'C:/Program Files (x86)/Android/sdk'
      ]
    };

    const paths = commonPaths[platformType as keyof typeof commonPaths] || commonPaths.linux;
    
    // Return the first existing path
    for (const path of paths) {
      try {
        if (require('fs').existsSync(path)) {
          return resolve(path);
        }
      } catch {
        // Continue to next path
      }
    }

    // Default fallback
    return join(home, 'Android/Sdk');
  }

  /**
   * Resolve emulator executable path
   */
  private resolveEmulatorPath(): string {
    if (this.config.emulatorPath) {
      return resolve(this.config.emulatorPath);
    }

    const emulatorDir = join(this.sdkPath, 'emulator');
    const executable = platform() === 'win32' ? 'emulator.exe' : 'emulator';
    return join(emulatorDir, executable);
  }

  /**
   * Resolve ADB executable path
   */
  private resolveAdbPath(): string {
    if (this.config.adbPath) {
      return resolve(this.config.adbPath);
    }

    const platformToolsDir = join(this.sdkPath, 'platform-tools');
    const executable = platform() === 'win32' ? 'adb.exe' : 'adb';
    return join(platformToolsDir, executable);
  }

  /**
   * Resolve AVD path
   */
  private resolveAvdPath(): string {
    if (this.config.avdPath) {
      return resolve(this.config.avdPath);
    }

    return join(homedir(), '.android', 'avd');
  }

  /**
   * Check if Android SDK is properly installed and accessible
   */
  async validateSDK(): Promise<boolean> {
    try {
      // Check if emulator executable exists
      await fs.access(this.emulatorPath);
      
      // Check if ADB executable exists
      await fs.access(this.adbPath);
      
      // Check if AVD directory exists
      await fs.access(this.avdPath);
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List available Android Virtual Devices (AVDs)
   */
  async listAvds(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.emulatorPath, ['-list-avds'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const avds = stdout
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
          resolve(avds);
        } else {
          reject(new Error(`Failed to list AVDs: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to execute emulator command: ${error.message}`));
      });
    });
  }

  /**
   * Create a new Android Virtual Device (AVD)
   */
  async createAvd(config: AVDConfig): Promise<void> {
    const avdManagerPath = join(this.sdkPath, 'cmdline-tools', 'latest', 'bin', 
      platform() === 'win32' ? 'avdmanager.bat' : 'avdmanager');

    const args = [
      'create', 'avd',
      '--name', config.name,
      '--package', `system-images;${config.target};google_apis;${config.abi}`,
      '--device', config.device
    ];

    if (config.sdcardSize) {
      args.push('--sdcard', config.sdcardSize);
    }

    return new Promise((resolve, reject) => {
      const process = spawn(avdManagerPath, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderr = '';

      // Automatically answer "no" to custom hardware profile question
      process.stdin.write('no\n');
      process.stdin.end();

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create AVD: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to execute avdmanager command: ${error.message}`));
      });
    });
  }

  /**
   * Launch an emulator instance
   */
  async launchEmulator(avdName: string, options: EmulatorLaunchOptions = {}): Promise<ChildProcess> {
    const args = ['-avd', avdName];

    // Add port configuration
    if (options.port) {
      args.push('-port', options.port.toString());
    }

    // Add display options
    if (options.noWindow) {
      args.push('-no-window');
    }

    if (options.noAudio) {
      args.push('-no-audio');
    }

    if (options.noSnapshot) {
      args.push('-no-snapshot');
    }

    if (options.wipeData) {
      args.push('-wipe-data');
    }

    if (options.verbose) {
      args.push('-verbose');
    }

    // Add performance options
    if (options.gpu) {
      args.push('-gpu', options.gpu);
    }

    if (options.memory) {
      args.push('-memory', options.memory.toString());
    }

    if (options.cores) {
      args.push('-cores', options.cores.toString());
    }

    const emulatorProcess = spawn(this.emulatorPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    return emulatorProcess;
  }

  /**
   * Get SDK configuration
   */
  getConfig(): AndroidSDKConfig & {
    resolvedSdkPath: string;
    resolvedEmulatorPath: string;
    resolvedAdbPath: string;
    resolvedAvdPath: string;
  } {
    return {
      ...this.config,
      resolvedSdkPath: this.sdkPath,
      resolvedEmulatorPath: this.emulatorPath,
      resolvedAdbPath: this.adbPath,
      resolvedAvdPath: this.avdPath
    };
  }
}