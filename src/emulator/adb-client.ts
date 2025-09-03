import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * ADB device information
 */
export interface AdbDevice {
  id: string;
  state: 'device' | 'offline' | 'unauthorized' | 'bootloader' | 'recovery';
  product?: string;
  model?: string;
  device?: string;
  transport_id?: string;
}

/**
 * ADB shell command result
 */
export interface AdbCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * ADB package information
 */
export interface AdbPackageInfo {
  packageName: string;
  versionCode: string;
  versionName: string;
  installerPackageName?: string;
}

/**
 * ADB logcat entry
 */
export interface AdbLogEntry {
  timestamp: Date;
  pid: number;
  tid: number;
  level: 'V' | 'D' | 'I' | 'W' | 'E' | 'F';
  tag: string;
  message: string;
}

/**
 * ADB client for Android Debug Bridge communication
 */
export class AdbClient extends EventEmitter {
  private adbPath: string;
  private deviceId: string | undefined;
  private logcatProcess: ChildProcess | undefined;

  constructor(adbPath: string, deviceId?: string) {
    super();
    this.adbPath = adbPath;
    this.deviceId = deviceId;
  }

  /**
   * Execute ADB command with optional device targeting
   */
  private async executeCommand(args: string[], options: {
    timeout?: number;
    input?: string;
  } = {}): Promise<AdbCommandResult> {
    const { timeout = 30000, input } = options;
    
    // Add device targeting if specified
    const fullArgs = this.deviceId ? ['-s', this.deviceId, ...args] : args;

    return new Promise((resolve, reject) => {
      const process = spawn(this.adbPath, fullArgs, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: ReturnType<typeof setTimeout>;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          process.kill('SIGTERM');
          reject(new Error(`ADB command timed out after ${timeout}ms`));
        }, timeout);
      }

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0
        });
      });

      process.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(new Error(`Failed to execute ADB command: ${error.message}`));
      });

      // Send input if provided
      if (input) {
        process.stdin.write(input);
        process.stdin.end();
      }
    });
  }

  /**
   * List connected devices
   */
  async listDevices(): Promise<AdbDevice[]> {
    const result = await this.executeCommand(['devices', '-l']);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list devices: ${result.stderr}`);
    }

    const devices: AdbDevice[] = [];
    const lines = result.stdout.split('\n').slice(1); // Skip header line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;

      const device: AdbDevice = {
        id: parts[0],
        state: parts[1] as AdbDevice['state']
      };

      // Parse additional properties
      for (let i = 2; i < parts.length; i++) {
        const part = parts[i];
        if (part.includes(':')) {
          const [key, value] = part.split(':', 2);
          switch (key) {
            case 'product':
              device.product = value;
              break;
            case 'model':
              device.model = value;
              break;
            case 'device':
              device.device = value;
              break;
            case 'transport_id':
              device.transport_id = value;
              break;
          }
        }
      }

      devices.push(device);
    }

    return devices;
  }

  /**
   * Wait for device to be ready
   */
  async waitForDevice(timeout: number = 60000): Promise<void> {
    const args = ['wait-for-device'];
    await this.executeCommand(args, { timeout });
  }

  /**
   * Check if device is ready and responsive
   */
  async isDeviceReady(): Promise<boolean> {
    try {
      const result = await this.executeCommand(['shell', 'getprop', 'sys.boot_completed'], { timeout: 5000 });
      return result.exitCode === 0 && result.stdout.trim() === '1';
    } catch {
      return false;
    }
  }

  /**
   * Get device properties
   */
  async getDeviceProperties(): Promise<Record<string, string>> {
    const result = await this.executeCommand(['shell', 'getprop']);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get device properties: ${result.stderr}`);
    }

    const properties: Record<string, string> = {};
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/^\[([^\]]+)\]: \[([^\]]*)\]$/);
      if (match) {
        properties[match[1]] = match[2];
      }
    }

    return properties;
  }

  /**
   * Install APK package
   */
  async installPackage(apkPath: string, options: {
    replace?: boolean;
    allowDowngrade?: boolean;
    grantPermissions?: boolean;
  } = {}): Promise<void> {
    const args = ['install'];
    
    if (options.replace) {
      args.push('-r');
    }
    
    if (options.allowDowngrade) {
      args.push('-d');
    }
    
    if (options.grantPermissions) {
      args.push('-g');
    }
    
    args.push(apkPath);

    const result = await this.executeCommand(args, { timeout: 120000 }); // 2 minute timeout for installs
    
    if (result.exitCode !== 0 || result.stdout.includes('Failure')) {
      throw new Error(`Failed to install package: ${result.stderr || result.stdout}`);
    }
  }

  /**
   * Uninstall package
   */
  async uninstallPackage(packageName: string, keepData: boolean = false): Promise<void> {
    const args = ['uninstall'];
    
    if (keepData) {
      args.push('-k');
    }
    
    args.push(packageName);

    const result = await this.executeCommand(args);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to uninstall package: ${result.stderr}`);
    }
  }

  /**
   * List installed packages
   */
  async listPackages(options: {
    systemApps?: boolean;
    userApps?: boolean;
    enabledOnly?: boolean;
  } = {}): Promise<string[]> {
    const args = ['shell', 'pm', 'list', 'packages'];
    
    if (options.systemApps) {
      args.push('-s');
    }
    
    if (options.userApps) {
      args.push('-3');
    }
    
    if (options.enabledOnly) {
      args.push('-e');
    }

    const result = await this.executeCommand(args);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list packages: ${result.stderr}`);
    }

    return result.stdout
      .split('\n')
      .map(line => line.replace('package:', '').trim())
      .filter(line => line.length > 0);
  }

  /**
   * Get package information
   */
  async getPackageInfo(packageName: string): Promise<AdbPackageInfo | null> {
    const result = await this.executeCommand(['shell', 'dumpsys', 'package', packageName]);
    
    if (result.exitCode !== 0) {
      return null;
    }

    const output = result.stdout;
    const versionCodeMatch = output.match(/versionCode=(\d+)/);
    const versionNameMatch = output.match(/versionName=([^\s]+)/);
    const installerMatch = output.match(/installerPackageName=([^\s]+)/);

    if (!versionCodeMatch || !versionNameMatch) {
      return null;
    }

    const packageInfo: AdbPackageInfo = {
      packageName,
      versionCode: versionCodeMatch[1],
      versionName: versionNameMatch[1]
    };

    if (installerMatch) {
      packageInfo.installerPackageName = installerMatch[1];
    }

    return packageInfo;
  }

  /**
   * Start activity
   */
  async startActivity(packageName: string, activityName?: string): Promise<void> {
    const activity = activityName || '.MainActivity';
    const result = await this.executeCommand([
      'shell', 'am', 'start',
      '-n', `${packageName}/${activity}`
    ]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to start activity: ${result.stderr}`);
    }
  }

  /**
   * Stop application
   */
  async stopApplication(packageName: string): Promise<void> {
    const result = await this.executeCommand(['shell', 'am', 'force-stop', packageName]);
    
    if (result.exitCode !== 0) {
      throw new Error(`Failed to stop application: ${result.stderr}`);
    }
  }

  /**
   * Execute shell command
   */
  async shell(command: string): Promise<AdbCommandResult> {
    return this.executeCommand(['shell', command]);
  }

  /**
   * Start logcat monitoring
   */
  startLogcat(options: {
    tag?: string;
    level?: 'V' | 'D' | 'I' | 'W' | 'E' | 'F';
    clear?: boolean;
  } = {}): void {
    if (this.logcatProcess) {
      this.stopLogcat();
    }

    const args = ['logcat'];
    
    if (options.clear) {
      args.push('-c');
    }
    
    if (options.tag) {
      args.push('-s', `${options.tag}:${options.level || 'V'}`);
    } else if (options.level) {
      args.push(`*:${options.level}`);
    }

    const fullArgs = this.deviceId ? ['-s', this.deviceId, ...args] : args;

    this.logcatProcess = spawn(this.adbPath, fullArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.logcatProcess.stdout?.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          const logEntry = this.parseLogcatLine(line);
          if (logEntry) {
            this.emit('logcat', logEntry);
          }
        }
      }
    });

    this.logcatProcess.stderr?.on('data', (data) => {
      this.emit('logcat-error', data.toString());
    });

    this.logcatProcess.on('close', (code) => {
      this.emit('logcat-close', code);
      this.logcatProcess = undefined;
    });
  }

  /**
   * Stop logcat monitoring
   */
  stopLogcat(): void {
    if (this.logcatProcess) {
      this.logcatProcess.kill('SIGTERM');
      this.logcatProcess = undefined;
    }
  }

  /**
   * Parse logcat line into structured log entry
   */
  private parseLogcatLine(line: string): AdbLogEntry | null {
    // Parse standard logcat format: MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE
    const match = line.match(/^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s*(.*)$/);
    
    if (!match) {
      return null;
    }

    const [, timestamp, pid, tid, level, tag, message] = match;
    
    // Parse timestamp (assuming current year)
    const currentYear = new Date().getFullYear();
    const timestampStr = `${currentYear}-${timestamp}`;
    const parsedTimestamp = new Date(timestampStr);

    return {
      timestamp: parsedTimestamp,
      pid: parseInt(pid, 10),
      tid: parseInt(tid, 10),
      level: level as AdbLogEntry['level'],
      tag: tag.trim(),
      message: message.trim()
    };
  }

  /**
   * Set target device ID
   */
  setDeviceId(deviceId: string): void {
    this.deviceId = deviceId;
  }

  /**
   * Get current target device ID
   */
  getDeviceId(): string | undefined {
    return this.deviceId;
  }

  /**
   * Clear target device ID
   */
  clearDeviceId(): void {
    this.deviceId = undefined;
  }
}