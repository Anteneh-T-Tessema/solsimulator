import { Transaction } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { MWAService, MWASession, AuthorizeRequest, AuthorizeResult, SignResult } from '../interfaces/mwa-service';
import { SeedVaultMock } from '../seed-vault/seed-vault-mock';
import { TransactionValidator, TransactionValidationResult } from './transaction-validator';
import { TransactionUIMock } from './transaction-ui-mock';
import { TransactionTracker, TransactionLogEntry } from './transaction-tracker';

/**
 * Implementation of the Mobile Wallet Adapter Service
 * Handles dApp connections, authorization, and transaction signing
 */
export class MWAServiceImpl extends EventEmitter implements MWAService {
  private sessions: Map<string, MWASession> = new Map();
  private seedVault: SeedVaultMock;
  private sessionTimeout: number = 30 * 60 * 1000; // 30 minutes
  private sessionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private transactionUI: TransactionUIMock;
  private transactionTracker: TransactionTracker;

  constructor(
    seedVault: SeedVaultMock, 
    sessionTimeout?: number,
    transactionUI?: TransactionUIMock,
    transactionTracker?: TransactionTracker
  ) {
    super();
    this.seedVault = seedVault;
    this.transactionUI = transactionUI || new TransactionUIMock();
    this.transactionTracker = transactionTracker || new TransactionTracker();
    
    if (sessionTimeout !== undefined) {
      this.sessionTimeout = sessionTimeout;
    }

    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Establish a connection with a dApp
   */
  async connect(dAppIdentifier: string): Promise<MWASession> {
    if (!dAppIdentifier || dAppIdentifier.trim().length === 0) {
      throw new Error('Invalid dApp identifier provided');
    }

    const sessionId = this.generateSessionId();
    const session: MWASession = {
      sessionId,
      dAppIdentifier: dAppIdentifier.trim(),
      connectionState: 'connected',
      permissions: [],
      lastActivity: new Date()
    };

    this.sessions.set(sessionId, session);
    this.setupSessionTimeout(sessionId);
    this.emit('sessionConnected', { sessionId, dAppIdentifier });

    return session;
  }

  /**
   * Handle authorization request from a dApp
   */
  async authorize(session: MWASession, request: AuthorizeRequest): Promise<AuthorizeResult> {
    if (!this.sessions.has(session.sessionId)) {
      throw new Error('Invalid session: session not found');
    }

    if (session.connectionState !== 'connected') {
      throw new Error('Invalid session: not connected');
    }

    this.updateSessionActivity(session.sessionId);

    try {
      // Get available wallets from seed vault
      const wallets = await this.seedVault.listWallets();
      
      if (wallets.length === 0) {
        throw new Error('No wallets available for authorization');
      }

      // Use the first available wallet
      const selectedWallet = wallets[0];

      // Update session with authorization details
      const updatedSession = this.sessions.get(session.sessionId)!;
      updatedSession.authorizedPublicKey = selectedWallet.publicKey;
      updatedSession.authorizedAt = new Date();
      updatedSession.permissions = request.features || [];

      this.emit('sessionAuthorized', {
        sessionId: session.sessionId,
        dAppIdentifier: session.dAppIdentifier,
        publicKey: selectedWallet.publicKey.toBase58()
      });

      return {
        publicKey: selectedWallet.publicKey,
        accountLabel: selectedWallet.profile.name,
        walletUriBase: 'solana-phone-simulator://'
      };

    } catch (error) {
      this.emit('authorizationFailed', {
        sessionId: session.sessionId,
        dAppIdentifier: session.dAppIdentifier,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Sign one or more transactions
   */
  async signTransactions(session: MWASession, transactions: Transaction[]): Promise<SignResult[]> {
    if (!this.sessions.has(session.sessionId)) {
      throw new Error('Invalid session: session not found');
    }

    if (session.connectionState !== 'connected') {
      throw new Error('Invalid session: not connected');
    }

    if (!session.authorizedPublicKey) {
      throw new Error('Session not authorized');
    }

    this.updateSessionActivity(session.sessionId);

    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions provided');
    }

    const results: SignResult[] = [];

    try {
      // Find the wallet associated with the authorized public key
      const wallets = await this.seedVault.listWallets();
      const authorizedWallet = wallets.find(w => 
        w.publicKey.equals(session.authorizedPublicKey!)
      );

      if (!authorizedWallet) {
        throw new Error('Authorized wallet not found');
      }

      // Process each transaction with validation and approval
      for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        const transactionId = `tx_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 11)}`;
        let validation: TransactionValidationResult | null = null;

        try {
          // Step 1: Validate transaction
          validation = TransactionValidator.validateTransaction(transaction);
          
          if (!validation.isValid) {
            const error = `Transaction validation failed: ${validation.errors.join(', ')}`;
            results.push({ error });
            
            this.emit('transactionValidationFailed', {
              sessionId: session.sessionId,
              dAppIdentifier: session.dAppIdentifier,
              transactionIndex: i,
              errors: validation.errors
            });
            continue;
          }

          // Step 2: Create transaction log entry
          this.transactionTracker.createTransaction(
            transactionId,
            authorizedWallet.id,
            session.dAppIdentifier,
            transaction,
            validation.metadata
          );

          // Step 3: Request user approval
          const approvalRequest = TransactionUIMock.createApprovalRequest(
            authorizedWallet.id,
            session.dAppIdentifier,
            transaction,
            false // Don't auto-approve by default
          );

          this.transactionTracker.updateStatus(transactionId, 'pending');
          
          const approvalResult = await this.transactionUI.requestApproval(approvalRequest);
          
          if (!approvalResult.approved) {
            this.transactionTracker.updateStatus(transactionId, 'rejected', {
              reason: approvalResult.reason
            });
            
            results.push({
              error: `Transaction rejected: ${approvalResult.reason || 'User denied'}`
            });

            this.emit('transactionRejected', {
              sessionId: session.sessionId,
              dAppIdentifier: session.dAppIdentifier,
              transactionIndex: i,
              reason: approvalResult.reason
            });
            continue;
          }

          // Step 4: Update status to approved
          this.transactionTracker.updateStatus(transactionId, 'approved');

          this.emit('transactionApproved', {
            sessionId: session.sessionId,
            dAppIdentifier: session.dAppIdentifier,
            transactionIndex: i,
            transactionId
          });

          // Step 5: Sign transaction using seed vault
          this.transactionTracker.updateStatus(transactionId, 'signing');
          
          const signingResult = await this.seedVault.signTransaction(
            authorizedWallet.id,
            transaction,
            true // Auto-approve at seed vault level since we already got user approval
          );
          
          // Step 6: Update status to signed and add signature
          this.transactionTracker.updateStatus(transactionId, 'signed');
          this.transactionTracker.addSignature(transactionId, Buffer.from(signingResult.signature).toString('hex'));
          
          results.push({
            signedTransaction: signingResult.signedTransaction,
            signature: signingResult.signature
          });

          this.emit('transactionSigned', {
            sessionId: session.sessionId,
            dAppIdentifier: session.dAppIdentifier,
            walletId: authorizedWallet.id,
            transactionId,
            signature: Buffer.from(signingResult.signature).toString('hex'),
            metadata: validation.metadata
          });

        } catch (error) {
          // Ensure we have validation for error tracking
          if (!validation) {
            validation = TransactionValidator.validateTransaction(transaction);
          }

          // Create transaction entry if it doesn't exist and validation is valid
          if (validation.isValid) {
            try {
              // Try to update existing transaction
              this.transactionTracker.updateStatus(transactionId, 'signing_failed');
              this.transactionTracker.addError(transactionId, (error as Error).message);
            } catch (trackingError) {
              // Transaction doesn't exist, create it
              this.transactionTracker.createTransaction(
                transactionId,
                authorizedWallet.id,
                session.dAppIdentifier,
                transaction,
                validation.metadata
              );
              this.transactionTracker.updateStatus(transactionId, 'signing_failed');
              this.transactionTracker.addError(transactionId, (error as Error).message);
            }
          }
          
          results.push({
            error: `Failed to sign transaction: ${(error as Error).message}`
          });

          this.emit('transactionSigningFailed', {
            sessionId: session.sessionId,
            dAppIdentifier: session.dAppIdentifier,
            transactionIndex: i,
            transactionId,
            error: (error as Error).message
          });
        }
      }

      return results;

    } catch (error) {
      const errorMessage = `Failed to sign transactions: ${(error as Error).message}`;
      return transactions.map(() => ({ error: errorMessage }));
    }
  }

  /**
   * Sign arbitrary messages
   */
  async signMessages(session: MWASession, messages: Uint8Array[]): Promise<SignResult[]> {
    if (!this.sessions.has(session.sessionId)) {
      throw new Error('Invalid session: session not found');
    }

    if (session.connectionState !== 'connected') {
      throw new Error('Invalid session: not connected');
    }

    if (!session.authorizedPublicKey) {
      throw new Error('Session not authorized');
    }

    this.updateSessionActivity(session.sessionId);

    if (!messages || messages.length === 0) {
      throw new Error('No messages provided');
    }

    const results: SignResult[] = [];

    try {
      const wallets = await this.seedVault.listWallets();
      const authorizedWallet = wallets.find(w => 
        w.publicKey.equals(session.authorizedPublicKey!)
      );

      if (!authorizedWallet) {
        throw new Error('Authorized wallet not found');
      }

      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];

        try {
          const signingResult = await this.seedVault.signMessage(
            authorizedWallet.id,
            message,
            true // Auto-approve for testing
          );

          results.push({
            signature: signingResult.signature
          });

          this.emit('messageSigned', {
            sessionId: session.sessionId,
            dAppIdentifier: session.dAppIdentifier,
            walletId: authorizedWallet.id,
            signature: Buffer.from(signingResult.signature).toString('hex')
          });

        } catch (error) {
          results.push({
            error: `Failed to sign message: ${(error as Error).message}`
          });

          this.emit('messageSigningFailed', {
            sessionId: session.sessionId,
            dAppIdentifier: session.dAppIdentifier,
            messageIndex: i,
            error: (error as Error).message
          });
        }
      }

      return results;

    } catch (error) {
      const errorMessage = `Failed to sign messages: ${(error as Error).message}`;
      return messages.map(() => ({ error: errorMessage }));
    }
  }

  /**
   * Disconnect a dApp session
   */
  async disconnect(session: MWASession): Promise<void> {
    if (!this.sessions.has(session.sessionId)) {
      return;
    }

    this.clearSessionTimeout(session.sessionId);
    const storedSession = this.sessions.get(session.sessionId)!;
    storedSession.connectionState = 'disconnected';
    this.sessions.delete(session.sessionId);

    this.emit('sessionDisconnected', {
      sessionId: session.sessionId,
      dAppIdentifier: session.dAppIdentifier
    });
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<MWASession[]> {
    return Array.from(this.sessions.values()).filter(
      session => session.connectionState === 'connected'
    );
  }

  /**
   * Get a specific session by ID
   */
  async getSession(sessionId: string): Promise<MWASession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `mwa_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Update session activity timestamp
   */
  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.setupSessionTimeout(sessionId);
    }
  }

  /**
   * Setup session timeout
   */
  private setupSessionTimeout(sessionId: string): void {
    this.clearSessionTimeout(sessionId);

    const timer = setTimeout(async () => {
      const session = this.sessions.get(sessionId);
      if (session) {
        await this.disconnect(session);
      }
    }, this.sessionTimeout);

    this.sessionTimers.set(sessionId, timer);
  }

  /**
   * Clear session timeout
   */
  private clearSessionTimeout(sessionId: string): void {
    const timer = this.sessionTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete(sessionId);
    }
  }

  /**
   * Get transaction tracker instance
   */
  getTransactionTracker(): TransactionTracker {
    return this.transactionTracker;
  }

  /**
   * Get transaction UI mock instance
   */
  getTransactionUI(): TransactionUIMock {
    return this.transactionUI;
  }

  /**
   * Get transaction logs for a session
   */
  getSessionTransactionLogs(sessionId: string): TransactionLogEntry[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    return this.transactionTracker.getDAppTransactions(session.dAppIdentifier);
  }

  /**
   * Validate a transaction without signing
   */
  validateTransaction(transaction: Transaction): TransactionValidationResult {
    return TransactionValidator.validateTransaction(transaction);
  }

  /**
   * Set up event forwarding from sub-components
   */
  private setupEventForwarding(): void {
    // Forward transaction UI events
    this.transactionUI.on('approvalRequested', (request) => {
      this.emit('transactionApprovalRequested', request);
    });

    this.transactionUI.on('approvalResult', (data) => {
      this.emit('transactionApprovalResult', data);
    });

    this.transactionUI.on('transactionApproved', (data) => {
      this.emit('transactionApproved', data);
    });

    this.transactionUI.on('transactionRejected', (data) => {
      this.emit('transactionRejected', data);
    });

    // Forward transaction tracker events
    this.transactionTracker.on('transactionCreated', (entry) => {
      this.emit('transactionCreated', entry);
    });

    this.transactionTracker.on('statusUpdated', (data) => {
      this.emit('transactionStatusUpdated', data);
    });

    this.transactionTracker.on('signatureAdded', (data) => {
      this.emit('transactionSignatureAdded', data);
    });

    this.transactionTracker.on('errorAdded', (data) => {
      this.emit('transactionErrorAdded', data);
    });
  }

  /**
   * Cleanup all resources (for testing)
   */
  cleanup(): void {
    for (const [sessionId] of this.sessionTimers) {
      this.clearSessionTimeout(sessionId);
    }
    this.sessions.clear();
    this.transactionUI.cleanup();
    this.removeAllListeners();
  }
}