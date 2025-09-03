import { PublicKey, Transaction } from '@solana/web3.js';

/**
 * Common types and interfaces used across the simulator
 */

export type NetworkType = 'mainnet' | 'devnet' | 'testnet' | 'localhost';

export type EmulatorStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export type TransactionStatus = 'pending' | 'signed' | 'rejected' | 'failed';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type PerformanceMode = 'development' | 'testing' | 'performance';

export interface WalletProfile {
  name: string;
  mnemonic?: string; // Optional for deterministic testing
  derivationPath: string;
  network: NetworkType;
}

export interface EmulatorConfig {
  networkEndpoint: string;
  walletProfiles: WalletProfile[];
  debugMode: boolean;
  performanceMode: PerformanceMode;
  emulator: {
    androidVersion: string;
    deviceProfile: string;
    memorySize: number;
    diskSize: number;
  };
  developer: {
    logLevel: LogLevel;
    autoApproveTransactions: boolean;
    simulateNetworkDelay: boolean;
  };
}

export interface EmulatorInstance {
  id: string;
  status: EmulatorStatus;
  config: EmulatorConfig;
  createdAt: Date;
  lastActivity: Date;
  port: number;
  adbPort: number;
}

export interface Wallet {
  id: string;
  profile: WalletProfile;
  publicKey: PublicKey;
  encryptedPrivateKey: string;
  createdAt: Date;
  lastUsed: Date;
}

export interface TransactionLog {
  id: string;
  walletId: string;
  dAppIdentifier: string;
  transaction: Transaction;
  status: TransactionStatus;
  timestamp: Date;
  signature?: string;
}

export interface SimulatorError {
  code: string;
  message: string;
  category: 'emulator' | 'network' | 'mwa' | 'wallet' | 'developer';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: Record<string, unknown>;
  timestamp: Date;
  recoverable: boolean;
}