import { Transaction } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { TransactionMetadata, TransactionValidator } from './transaction-validator';

/**
 * Transaction approval request
 */
export interface TransactionApprovalRequest {
  id: string;
  walletId: string;
  dAppIdentifier: string;
  transaction: Transaction;
  metadata: TransactionMetadata;
  timestamp: Date;
  autoApprove?: boolean | undefined;
}

/**
 * Transaction approval result
 */
export interface TransactionApprovalResult {
  approved: boolean;
  reason?: string;
  timestamp: Date;
}

/**
 * UI configuration for transaction approval
 */
export interface TransactionUIConfig {
  autoApproveTransfers: boolean;
  autoApproveLimit: number; // in lamports
  showDetailedInfo: boolean;
  confirmationDelay: number; // in milliseconds
}

/**
 * Mock user interface for transaction approval
 * Simulates the user confirmation flow that would appear on a real Saga phone
 */
export class TransactionUIMock extends EventEmitter {
  private config: TransactionUIConfig;
  private pendingRequests: Map<string, TransactionApprovalRequest> = new Map();

  constructor(config?: Partial<TransactionUIConfig>) {
    super();
    
    this.config = {
      autoApproveTransfers: false,
      autoApproveLimit: 100000000, // 0.1 SOL default
      showDetailedInfo: true,
      confirmationDelay: 1000, // 1 second default
      ...config
    };
  }

  /**
   * Request user approval for a transaction
   */
  async requestApproval(request: TransactionApprovalRequest): Promise<TransactionApprovalResult> {
    // Store the request
    this.pendingRequests.set(request.id, request);

    // Emit event for external listeners (e.g., web UI, CLI)
    this.emit('approvalRequested', request);

    try {
      // Check if auto-approval is enabled and applicable
      if (this.shouldAutoApprove(request)) {
        const result = await this.autoApprove(request);
        this.pendingRequests.delete(request.id);
        return result;
      }

      // Simulate user interaction
      const result = await this.simulateUserInteraction(request);
      this.pendingRequests.delete(request.id);
      
      // Emit result event
      this.emit('approvalResult', { request, result });
      
      return result;
    } catch (error) {
      this.pendingRequests.delete(request.id);
      throw error;
    }
  }

  /**
   * Get all pending approval requests
   */
  getPendingRequests(): TransactionApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Manually approve a pending request (for testing/CLI)
   */
  async approveRequest(requestId: string): Promise<TransactionApprovalResult> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    const result: TransactionApprovalResult = {
      approved: true,
      reason: 'Manually approved',
      timestamp: new Date()
    };

    // Clear timeout and resolve the promise if it exists
    if ((request as any)._timeout) {
      clearTimeout((request as any)._timeout);
    }
    if ((request as any)._resolver) {
      (request as any)._resolver(result);
    }

    this.pendingRequests.delete(requestId);
    this.emit('approvalResult', { request, result });
    
    return result;
  }

  /**
   * Manually reject a pending request (for testing/CLI)
   */
  async rejectRequest(requestId: string, reason?: string): Promise<TransactionApprovalResult> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    const result: TransactionApprovalResult = {
      approved: false,
      reason: reason || 'Manually rejected',
      timestamp: new Date()
    };

    // Clear timeout and resolve the promise if it exists
    if ((request as any)._timeout) {
      clearTimeout((request as any)._timeout);
    }
    if ((request as any)._resolver) {
      (request as any)._resolver(result);
    }

    this.pendingRequests.delete(requestId);
    this.emit('approvalResult', { request, result });
    
    return result;
  }

  /**
   * Update UI configuration
   */
  updateConfig(config: Partial<TransactionUIConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current UI configuration
   */
  getConfig(): TransactionUIConfig {
    return { ...this.config };
  }

  /**
   * Check if a transaction should be auto-approved
   */
  private shouldAutoApprove(request: TransactionApprovalRequest): boolean {
    // Always auto-approve if explicitly requested
    if (request.autoApprove) {
      return true;
    }

    // Check if auto-approval is enabled for transfers
    if (this.config.autoApproveTransfers && request.metadata.type === 'transfer') {
      // Check amount limit
      if (request.metadata.transferAmount && request.metadata.transferAmount <= this.config.autoApproveLimit) {
        return true;
      }
    }

    // Never auto-approve high-risk transactions
    if (TransactionValidator.requiresUserApproval(request.transaction, request.metadata)) {
      return false;
    }

    return false;
  }

  /**
   * Auto-approve a transaction
   */
  private async autoApprove(request: TransactionApprovalRequest): Promise<TransactionApprovalResult> {
    // Add a small delay to simulate processing
    await new Promise(resolve => setTimeout(resolve, 100));

    const result: TransactionApprovalResult = {
      approved: true,
      reason: 'Auto-approved',
      timestamp: new Date()
    };

    this.emit('transactionAutoApproved', { request, result });
    this.emit('approvalResult', { request, result });
    
    return result;
  }

  /**
   * Simulate user interaction for transaction approval
   */
  private async simulateUserInteraction(request: TransactionApprovalRequest): Promise<TransactionApprovalResult> {
    // Display transaction information (simulated)
    const displayInfo = this.formatTransactionDisplay(request);
    this.emit('transactionDisplayed', { request, displayInfo });

    // Return a promise that can be resolved by manual approval/rejection
    return new Promise((resolve) => {
      // Set up a timeout for automatic decision if no manual intervention
      const timeout = setTimeout(() => {
        // For simulation purposes, we'll use a simple approval logic
        const approved = this.simulateUserDecision(request);

        const result: TransactionApprovalResult = {
          approved,
          reason: approved ? 'User approved' : 'User rejected',
          timestamp: new Date()
        };

        if (approved) {
          this.emit('transactionApproved', { request, result });
        } else {
          this.emit('transactionRejected', { request, result });
        }

        resolve(result);
      }, this.config.confirmationDelay);

      // Store the resolver so manual approval/rejection can use it
      (request as any)._resolver = resolve;
      (request as any)._timeout = timeout;
    });
  }

  /**
   * Format transaction information for display
   */
  private formatTransactionDisplay(request: TransactionApprovalRequest): string {
    const lines: string[] = [];
    
    lines.push('=== TRANSACTION APPROVAL REQUEST ===');
    lines.push(`dApp: ${request.dAppIdentifier}`);
    lines.push(`Wallet: ${request.walletId}`);
    lines.push('');
    
    // Add transaction details
    lines.push(TransactionValidator.formatTransactionForDisplay(request.transaction, request.metadata));
    
    if (this.config.showDetailedInfo) {
      lines.push('');
      lines.push('=== DETAILED INFORMATION ===');
      lines.push(`Transaction ID: ${request.id}`);
      lines.push(`Timestamp: ${request.timestamp.toISOString()}`);
      lines.push(`Instructions: ${request.metadata.instructionCount}`);
      lines.push(`Accounts: ${request.metadata.accountCount}`);
      
      if (request.metadata.programIds.length > 0) {
        lines.push('Programs:');
        request.metadata.programIds.forEach(programId => {
          lines.push(`  - ${programId}`);
        });
      }
    }
    
    lines.push('');
    lines.push('Do you approve this transaction? (y/N)');
    
    return lines.join('\n');
  }

  /**
   * Simulate user decision (for testing purposes)
   */
  private simulateUserDecision(request: TransactionApprovalRequest): boolean {
    // For simulation, we'll approve most transactions but reject some based on risk
    
    // Always reject if it's a high-risk transaction and not explicitly auto-approved
    if (TransactionValidator.requiresUserApproval(request.transaction, request.metadata)) {
      // Simulate 80% approval rate for high-risk transactions
      return Math.random() < 0.8;
    }

    // For low-risk transactions, simulate 95% approval rate
    return Math.random() < 0.95;
  }

  /**
   * Generate a unique request ID
   */
  static generateRequestId(): string {
    return `tx_approval_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a transaction approval request
   */
  static createApprovalRequest(
    walletId: string,
    dAppIdentifier: string,
    transaction: Transaction,
    autoApprove?: boolean
  ): TransactionApprovalRequest {
    const validation = TransactionValidator.validateTransaction(transaction);
    
    if (!validation.isValid) {
      throw new Error(`Invalid transaction: ${validation.errors.join(', ')}`);
    }

    return {
      id: this.generateRequestId(),
      walletId,
      dAppIdentifier,
      transaction,
      metadata: validation.metadata,
      timestamp: new Date(),
      autoApprove
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.pendingRequests.clear();
    this.removeAllListeners();
  }
}