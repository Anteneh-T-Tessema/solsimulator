/**
 * Output Formatter - Handles consistent formatting and display of CLI output
 */

import { EmulatorInstance, EmulatorStatus } from '../interfaces/common';
import { CLIConfig } from './config-manager';

/**
 * ANSI color codes for terminal output
 */
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

/**
 * Status color mapping
 */
const STATUS_COLORS: Record<EmulatorStatus, string> = {
  running: COLORS.green,
  starting: COLORS.yellow,
  stopping: COLORS.yellow,
  stopped: COLORS.gray,
  error: COLORS.red
};

/**
 * Handles formatting and display of CLI output
 */
export class OutputFormatter {
  private colorEnabled: boolean = true;

  constructor(colorEnabled: boolean = true) {
    this.colorEnabled = colorEnabled && process.stdout.isTTY;
  }

  /**
   * Enable or disable color output
   */
  setColorEnabled(enabled: boolean): void {
    this.colorEnabled = enabled && process.stdout.isTTY;
  }

  /**
   * Apply color to text if colors are enabled
   */
  private colorize(text: string, color: string): string {
    return this.colorEnabled ? `${color}${text}${COLORS.reset}` : text;
  }

  /**
   * Display success message
   */
  success(message: string): void {
    console.log(this.colorize('✓ ', COLORS.green) + message);
  }

  /**
   * Display error message
   */
  error(message: string): void {
    console.error(this.colorize('✗ ', COLORS.red) + this.colorize(message, COLORS.red));
  }

  /**
   * Display warning message
   */
  warn(message: string): void {
    console.warn(this.colorize('⚠ ', COLORS.yellow) + this.colorize(message, COLORS.yellow));
  }

  /**
   * Display info message
   */
  info(message: string): void {
    console.log(this.colorize('ℹ ', COLORS.blue) + message);
  }

  /**
   * Display debug message
   */
  debug(message: string): void {
    console.log(this.colorize('🐛 ', COLORS.gray) + this.colorize(message, COLORS.gray));
  }

  /**
   * Display a single instance status
   */
  displayInstanceStatus(instance: EmulatorInstance): void {
    const statusColor = STATUS_COLORS[instance.status];
    const status = this.colorize(instance.status.toUpperCase(), statusColor);
    
    console.log(`\n${this.colorize('Instance Details:', COLORS.bright)}`);
    console.log(`  ID:           ${this.colorize(instance.id, COLORS.cyan)}`);
    console.log(`  Status:       ${status}`);
    console.log(`  Port:         ${instance.port}`);
    console.log(`  ADB Port:     ${instance.adbPort}`);
    console.log(`  Created:      ${this.formatDate(instance.createdAt)}`);
    console.log(`  Last Active:  ${this.formatDate(instance.lastActivity)}`);
    console.log(`  Network:      ${instance.config.networkEndpoint}`);
    console.log(`  Android:      ${instance.config.emulator.androidVersion}`);
    console.log(`  Memory:       ${instance.config.emulator.memorySize}MB`);
    console.log(`  Disk:         ${instance.config.emulator.diskSize}MB`);
    console.log(`  Debug Mode:   ${instance.config.debugMode ? 'Enabled' : 'Disabled'}`);
    
    if (instance.config.walletProfiles.length > 0) {
      console.log(`  Wallets:      ${instance.config.walletProfiles.length} profile(s)`);
      instance.config.walletProfiles.forEach((wallet, index) => {
        console.log(`    ${index + 1}. ${wallet.name} (${wallet.network})`);
      });
    }
  }

  /**
   * Display list of instances
   */
  displayInstancesList(instances: EmulatorInstance[]): void {
    if (instances.length === 0) {
      this.info('No simulator instances found');
      return;
    }

    console.log(`\n${this.colorize('Simulator Instances:', COLORS.bright)}`);
    console.log(this.colorize('─'.repeat(80), COLORS.gray));
    
    // Header
    const header = `${'ID'.padEnd(20)} ${'STATUS'.padEnd(10)} ${'PORT'.padEnd(6)} ${'NETWORK'.padEnd(25)} ${'CREATED'.padEnd(12)}`;
    console.log(this.colorize(header, COLORS.bright));
    console.log(this.colorize('─'.repeat(80), COLORS.gray));

    // Instance rows
    instances.forEach(instance => {
      const statusColor = STATUS_COLORS[instance.status];
      const id = this.colorize(instance.id.substring(0, 18) + (instance.id.length > 18 ? '..' : ''), COLORS.cyan);
      const status = this.colorize(instance.status.toUpperCase().padEnd(10), statusColor);
      const port = instance.port.toString().padEnd(6);
      const network = this.truncateString(instance.config.networkEndpoint, 25).padEnd(25);
      const created = this.formatRelativeTime(instance.createdAt).padEnd(12);
      
      console.log(`${id.padEnd(20)} ${status} ${port} ${network} ${created}`);
    });

    console.log(this.colorize('─'.repeat(80), COLORS.gray));
    console.log(`Total: ${instances.length} instance(s)`);
  }

  /**
   * Display configuration
   */
  displayConfig(config: CLIConfig): void {
    console.log(`\n${this.colorize('Current Configuration:', COLORS.bright)}`);
    console.log(this.colorize('─'.repeat(50), COLORS.gray));

    // Network configuration
    if (config.network) {
      console.log(`\n${this.colorize('Network:', COLORS.yellow)}`);
      console.log(`  Endpoint:    ${config.network.endpoint}`);
      console.log(`  Commitment:  ${config.network.commitment || 'confirmed'}`);
      console.log(`  Timeout:     ${config.network.timeout || 30000}ms`);
    }

    // Emulator configuration
    if (config.emulator) {
      console.log(`\n${this.colorize('Emulator:', COLORS.yellow)}`);
      console.log(`  Android:     ${config.emulator.androidVersion}`);
      console.log(`  Device:      ${config.emulator.deviceProfile}`);
      console.log(`  Memory:      ${config.emulator.memorySize}MB`);
      console.log(`  Disk:        ${config.emulator.diskSize}MB`);
    }

    // Developer configuration
    if (config.developer) {
      console.log(`\n${this.colorize('Developer:', COLORS.yellow)}`);
      console.log(`  Debug Mode:       ${config.developer.debugMode ? 'Enabled' : 'Disabled'}`);
      console.log(`  Log Level:        ${config.developer.logLevel}`);
      console.log(`  Auto Approve:     ${config.developer.autoApproveTransactions ? 'Yes' : 'No'}`);
      console.log(`  Network Delay:    ${config.developer.simulateNetworkDelay ? 'Yes' : 'No'}`);
      console.log(`  Performance Mode: ${config.developer.performanceMode}`);
    }

    // Wallet profiles
    if (config.wallets && config.wallets.length > 0) {
      console.log(`\n${this.colorize('Wallet Profiles:', COLORS.yellow)}`);
      config.wallets.forEach((wallet, index) => {
        console.log(`  ${index + 1}. ${this.colorize(wallet.name, COLORS.cyan)} (${wallet.network})`);
        console.log(`     Path: ${wallet.derivationPath}`);
      });
    }

    // CLI configuration
    if (config.cli) {
      console.log(`\n${this.colorize('CLI Settings:', COLORS.yellow)}`);
      console.log(`  Output Format:  ${config.cli.outputFormat || 'text'}`);
      console.log(`  Color Output:   ${config.cli.colorOutput !== false ? 'Enabled' : 'Disabled'}`);
    }
  }

  /**
   * Display a table of data
   */
  displayTable(headers: string[], rows: string[][]): void {
    if (rows.length === 0) {
      return;
    }

    // Calculate column widths
    const columnWidths = headers.map((header, index) => {
      const maxRowWidth = Math.max(...rows.map(row => (row[index] || '').length));
      return Math.max(header.length, maxRowWidth);
    });

    // Display header
    const headerRow = headers.map((header, index) => 
      this.colorize(header.padEnd(columnWidths[index]), COLORS.bright)
    ).join(' | ');
    console.log(headerRow);
    
    // Display separator
    const separator = columnWidths.map(width => '─'.repeat(width)).join('─┼─');
    console.log(this.colorize(separator, COLORS.gray));

    // Display rows
    rows.forEach(row => {
      const formattedRow = row.map((cell, index) => 
        (cell || '').padEnd(columnWidths[index])
      ).join(' | ');
      console.log(formattedRow);
    });
  }

  /**
   * Display a progress indicator
   */
  displayProgress(message: string, current: number, total: number): void {
    const percentage = Math.round((current / total) * 100);
    const progressBar = this.createProgressBar(percentage, 20);
    const progressText = `${current}/${total} (${percentage}%)`;
    
    process.stdout.write(`\r${message} ${progressBar} ${progressText}`);
    
    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Create a progress bar
   */
  private createProgressBar(percentage: number, width: number): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return this.colorize(`[${bar}]`, COLORS.cyan);
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleString();
  }

  /**
   * Format relative time (e.g., "2m ago")
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) {
      return 'now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  }

  /**
   * Truncate string to specified length
   */
  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
      return str;
    }
    return str.substring(0, maxLength - 2) + '..';
  }

  /**
   * Clear the current line
   */
  clearLine(): void {
    if (process.stdout.isTTY) {
      process.stdout.write('\r\x1b[K');
    }
  }

  /**
   * Move cursor up n lines
   */
  moveCursorUp(lines: number): void {
    if (process.stdout.isTTY) {
      process.stdout.write(`\x1b[${lines}A`);
    }
  }
}