#!/usr/bin/env node

/**
 * CLI entry point for the Solana Phone Simulator
 * Provides command-line interface for managing simulator instances
 */

import { Command } from 'commander';
import { CLIManager } from './cli-manager';
import { ConfigManager } from './config-manager';
import { version } from '../../package.json';

const program = new Command();
const configManager = new ConfigManager();
const cliManager = new CLIManager(configManager);

// Configure main program
program
  .name('solana-sim')
  .description('Solana Phone Simulator - Development tool for testing Solana mobile applications')
  .version(version)
  .option('-c, --config <path>', 'path to configuration file', 'solana-sim.config.json')
  .option('-v, --verbose', 'enable verbose logging')
  .option('--debug', 'enable debug logging')
  .hook('preAction', async (thisCommand) => {
    // Load configuration before executing any command
    const options = thisCommand.opts();
    await cliManager.initialize(options);
  });

// Start command
program
  .command('start')
  .description('Start the simulator')
  .option('-p, --port <number>', 'emulator port (default: auto-assign)')
  .option('-n, --network <endpoint>', 'Solana network endpoint')
  .option('--android-version <version>', 'Android version for emulator')
  .option('--memory <size>', 'memory size in MB', '2048')
  .option('--disk <size>', 'disk size in MB', '8192')
  .option('--no-gui', 'start emulator without GUI')
  .action(async (options) => {
    await cliManager.handleStart(options);
  });

// Stop command
program
  .command('stop')
  .description('Stop the simulator')
  .argument('[instance-id]', 'specific instance ID to stop (optional)')
  .option('-a, --all', 'stop all running instances')
  .option('-f, --force', 'force stop without graceful shutdown')
  .action(async (instanceId, options) => {
    await cliManager.handleStop(instanceId, options);
  });

// Status command
program
  .command('status')
  .description('Show simulator status')
  .argument('[instance-id]', 'specific instance ID to check (optional)')
  .option('-j, --json', 'output in JSON format')
  .option('-w, --watch', 'watch for status changes')
  .action(async (instanceId, options) => {
    await cliManager.handleStatus(instanceId, options);
  });

// List command
program
  .command('list')
  .alias('ls')
  .description('List all simulator instances')
  .option('-j, --json', 'output in JSON format')
  .option('--status <status>', 'filter by status (running, stopped, starting, stopping, error)')
  .action(async (options) => {
    await cliManager.handleList(options);
  });

// Reset command
program
  .command('reset')
  .description('Reset simulator instance to initial state')
  .argument('<instance-id>', 'instance ID to reset')
  .option('-f, --force', 'force reset without confirmation')
  .action(async (instanceId, options) => {
    await cliManager.handleReset(instanceId, options);
  });

// Config command group
const configCmd = program
  .command('config')
  .description('Configuration management commands');

configCmd
  .command('show')
  .description('Show current configuration')
  .option('-j, --json', 'output in JSON format')
  .action(async (options) => {
    await cliManager.handleConfigShow(options);
  });

configCmd
  .command('init')
  .description('Initialize configuration file')
  .option('-f, --force', 'overwrite existing configuration')
  .option('-t, --template <name>', 'use configuration template', 'default')
  .action(async (options) => {
    await cliManager.handleConfigInit(options);
  });

configCmd
  .command('validate')
  .description('Validate configuration file')
  .option('-c, --config <path>', 'path to configuration file to validate')
  .action(async (options) => {
    await cliManager.handleConfigValidate(options);
  });

// Error handling
program.exitOverride();

process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  await cliManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  await cliManager.cleanup();
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Parse command line arguments
async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { program, cliManager, configManager };