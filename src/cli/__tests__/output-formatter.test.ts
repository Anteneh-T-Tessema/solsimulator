/**
 * Tests for Output Formatter
 */

import { OutputFormatter } from '../output-formatter';
import { EmulatorInstance } from '../../interfaces/common';
import { CLIConfig } from '../config-manager';

// Mock console methods
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

describe('OutputFormatter', () => {
  let outputFormatter: OutputFormatter;
  let originalConsole: Console;
  let originalStdout: any;

  beforeEach(() => {
    // Save original console and stdout
    originalConsole = global.console;
    originalStdout = process.stdout;

    // Replace console methods
    global.console = mockConsole as any;
    
    // Mock process.stdout properties
    Object.defineProperty(process, 'stdout', {
      value: {
        isTTY: true,
        write: jest.fn()
      },
      writable: true,
      configurable: true
    });

    outputFormatter = new OutputFormatter(true);
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original console and stdout
    global.console = originalConsole;
    Object.defineProperty(process, 'stdout', {
      value: originalStdout,
      writable: true,
      configurable: true
    });
  });

  describe('basic output methods', () => {
    it('should display success message with color', () => {
      outputFormatter.success('Test success message');

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('✓')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Test success message')
      );
    });

    it('should display error message with color', () => {
      outputFormatter.error('Test error message');

      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('✗')
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
    });

    it('should display warning message with color', () => {
      outputFormatter.warn('Test warning message');

      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('⚠')
      );
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('Test warning message')
      );
    });

    it('should display info message with color', () => {
      outputFormatter.info('Test info message');

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('ℹ')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Test info message')
      );
    });

    it('should display debug message with color', () => {
      outputFormatter.debug('Test debug message');

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('🐛')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );
    });
  });

  describe('color handling', () => {
    it('should display colored output when colors are enabled', () => {
      outputFormatter.setColorEnabled(true);
      outputFormatter.success('Colored message');

      const call = mockConsole.log.mock.calls[0][0];
      expect(call).toContain('\x1b['); // ANSI color codes
    });

    it('should display plain output when colors are disabled', () => {
      outputFormatter.setColorEnabled(false);
      outputFormatter.success('Plain message');

      const call = mockConsole.log.mock.calls[0][0];
      expect(call).not.toContain('\x1b['); // No ANSI color codes
      expect(call).toContain('✓ Plain message');
    });

    it('should disable colors when not in TTY', () => {
      Object.defineProperty(process, 'stdout', {
        value: { isTTY: false, write: jest.fn() },
        writable: true,
        configurable: true
      });
      
      const formatter = new OutputFormatter(true);
      formatter.success('TTY test message');

      const call = mockConsole.log.mock.calls[0][0];
      expect(call).not.toContain('\x1b['); // No ANSI color codes
    });
  });

  describe('displayInstanceStatus', () => {
    it('should display detailed instance status', () => {
      const mockInstance: EmulatorInstance = {
        id: 'test-instance-123',
        status: 'running',
        port: 5554,
        adbPort: 5555,
        createdAt: new Date('2023-01-01T10:00:00Z'),
        lastActivity: new Date('2023-01-01T11:00:00Z'),
        config: {
          networkEndpoint: 'https://api.devnet.solana.com',
          walletProfiles: [
            { name: 'test-wallet', derivationPath: "m/44'/501'/0'/0'", network: 'devnet' }
          ],
          debugMode: true,
          performanceMode: 'development',
          emulator: {
            androidVersion: '33',
            deviceProfile: 'pixel_4',
            memorySize: 2048,
            diskSize: 8192
          },
          developer: {
            logLevel: 'info',
            autoApproveTransactions: false,
            simulateNetworkDelay: false
          }
        }
      };

      outputFormatter.displayInstanceStatus(mockInstance);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Instance Details:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('test-instance-123')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('RUNNING')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('5554')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('https://api.devnet.solana.com')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('1 profile(s)')
      );
    });
  });

  describe('displayInstancesList', () => {
    it('should display list of instances', () => {
      const mockInstances: EmulatorInstance[] = [
        {
          id: 'instance-1',
          status: 'running',
          port: 5554,
          adbPort: 5555,
          createdAt: new Date('2023-01-01T10:00:00Z'),
          lastActivity: new Date('2023-01-01T11:00:00Z'),
          config: {
            networkEndpoint: 'https://api.devnet.solana.com',
            walletProfiles: [],
            debugMode: false,
            performanceMode: 'development',
            emulator: {
              androidVersion: '33',
              deviceProfile: 'pixel_4',
              memorySize: 2048,
              diskSize: 8192
            },
            developer: {
              logLevel: 'info',
              autoApproveTransactions: false,
              simulateNetworkDelay: false
            }
          }
        },
        {
          id: 'instance-2',
          status: 'stopped',
          port: 5556,
          adbPort: 5557,
          createdAt: new Date('2023-01-01T09:00:00Z'),
          lastActivity: new Date('2023-01-01T10:30:00Z'),
          config: {
            networkEndpoint: 'https://api.testnet.solana.com',
            walletProfiles: [],
            debugMode: false,
            performanceMode: 'testing',
            emulator: {
              androidVersion: '33',
              deviceProfile: 'pixel_4',
              memorySize: 2048,
              diskSize: 8192
            },
            developer: {
              logLevel: 'warn',
              autoApproveTransactions: false,
              simulateNetworkDelay: false
            }
          }
        }
      ];

      outputFormatter.displayInstancesList(mockInstances);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Simulator Instances:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('instance-1')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('instance-2')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Total: 2 instance(s)')
      );
    });

    it('should display message when no instances found', () => {
      outputFormatter.displayInstancesList([]);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('No simulator instances found')
      );
    });
  });

  describe('displayConfig', () => {
    it('should display configuration details', () => {
      const mockConfig: CLIConfig = {
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
          debugMode: true,
          logLevel: 'info',
          autoApproveTransactions: false,
          simulateNetworkDelay: false,
          performanceMode: 'development'
        },
        wallets: [
          {
            name: 'test-wallet',
            derivationPath: "m/44'/501'/0'/0'",
            network: 'devnet'
          }
        ],
        cli: {
          outputFormat: 'text',
          colorOutput: true
        }
      };

      outputFormatter.displayConfig(mockConfig);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Current Configuration:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Network:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('https://api.devnet.solana.com')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Emulator:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Developer:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Wallet Profiles:')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('test-wallet')
      );
    });
  });

  describe('displayTable', () => {
    it('should display table with headers and rows', () => {
      const headers = ['ID', 'Status', 'Port'];
      const rows = [
        ['instance-1', 'running', '5554'],
        ['instance-2', 'stopped', '5556']
      ];

      outputFormatter.displayTable(headers, rows);

      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('ID')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Status')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('Port')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('instance-1')
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringContaining('instance-2')
      );
    });

    it('should handle empty rows', () => {
      const headers = ['ID', 'Status'];
      const rows: string[][] = [];

      outputFormatter.displayTable(headers, rows);

      // Should not throw error and not display anything
      expect(mockConsole.log).not.toHaveBeenCalled();
    });
  });

  describe('displayProgress', () => {
    it('should display progress bar', () => {
      outputFormatter.displayProgress('Processing', 5, 10);

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('Processing')
      );
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('5/10')
      );
      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('50%')
      );
    });

    it('should add newline when progress is complete', () => {
      outputFormatter.displayProgress('Complete', 10, 10);

      expect(process.stdout.write).toHaveBeenCalledWith(
        expect.stringContaining('\n')
      );
    });
  });

  describe('utility methods', () => {
    it('should clear line when in TTY', () => {
      Object.defineProperty(process, 'stdout', {
        value: { isTTY: true, write: jest.fn() },
        writable: true,
        configurable: true
      });
      
      outputFormatter.clearLine();

      expect(process.stdout.write).toHaveBeenCalledWith('\r\x1b[K');
    });

    it('should not clear line when not in TTY', () => {
      Object.defineProperty(process, 'stdout', {
        value: { isTTY: false, write: jest.fn() },
        writable: true,
        configurable: true
      });
      
      outputFormatter.clearLine();

      expect(process.stdout.write).not.toHaveBeenCalled();
    });

    it('should move cursor up when in TTY', () => {
      Object.defineProperty(process, 'stdout', {
        value: { isTTY: true, write: jest.fn() },
        writable: true,
        configurable: true
      });
      
      outputFormatter.moveCursorUp(3);

      expect(process.stdout.write).toHaveBeenCalledWith('\x1b[3A');
    });

    it('should not move cursor when not in TTY', () => {
      Object.defineProperty(process, 'stdout', {
        value: { isTTY: false, write: jest.fn() },
        writable: true,
        configurable: true
      });
      
      outputFormatter.moveCursorUp(3);

      expect(process.stdout.write).not.toHaveBeenCalled();
    });
  });
});