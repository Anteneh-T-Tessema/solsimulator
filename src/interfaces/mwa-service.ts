import { PublicKey, Transaction } from '@solana/web3.js';
import { ConnectionState } from './common';

/**
 * Mobile Wallet Adapter Service Interface
 * Implements the MWA protocol for dApp communication
 */

export interface MWASession {
  sessionId: string;
  dAppIdentifier: string;
  authorizedPublicKey?: PublicKey;
  connectionState: ConnectionState;
  permissions: string[];
  authorizedAt?: Date;
  lastActivity: Date;
}

export interface AuthorizeRequest {
  cluster?: string;
  identity?: {
    name?: string;
    uri?: string;
    icon?: string;
  };
  features?: string[];
}

export interface AuthorizeResult {
  publicKey: PublicKey;
  accountLabel?: string;
  walletUriBase?: string;
}

export interface SignResult {
  signedTransaction?: Transaction;
  signature?: Uint8Array;
  error?: string;
}

export interface MWAService {
  /**
   * Establish a connection with a dApp
   */
  connect(dAppIdentifier: string): Promise<MWASession>;

  /**
   * Handle authorization request from a dApp
   */
  authorize(session: MWASession, request: AuthorizeRequest): Promise<AuthorizeResult>;

  /**
   * Sign one or more transactions
   */
  signTransactions(session: MWASession, transactions: Transaction[]): Promise<SignResult[]>;

  /**
   * Sign arbitrary messages
   */
  signMessages(session: MWASession, messages: Uint8Array[]): Promise<SignResult[]>;

  /**
   * Disconnect a dApp session
   */
  disconnect(session: MWASession): Promise<void>;

  /**
   * Get all active sessions
   */
  getActiveSessions(): Promise<MWASession[]>;

  /**
   * Get a specific session by ID
   */
  getSession(sessionId: string): Promise<MWASession | null>;
}