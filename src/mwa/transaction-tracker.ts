import { Transaction } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { TransactionMetadata } from './transaction-validator';

/**
 * Transaction status types
 */
export type TransactionStatus = 
  | 'pending'           // Transaction created, waiting for approval
  | 'approved'          // Transaction approved by user
  | 'rejected'          // Transaction rejected by user
  | 'signing'           // Transaction being signed
  | 'signed'            // Transaction successfully signed
  | 'signing_failed'    // Transaction signing failed
  | 'submitted'         // Transaction submitted to network (future use)
  | 'confirmed'         // Transaction confirmed on network (future use)
  | 'failed'            // Transaction failed on network (future use)
  | 'expired';          // Transaction expired

/**
 * Transaction log entry
 */
export interface TransactionLogEntry {
  id: string;
  walletId: string;
  dAppIdentifier: string;
  transaction: Transaction;
  metadata: TransactionMetadata;
  status: TransactionStatus;
  signature?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  signedAt?: Date;
  submittedAt?: Date;
  confirmedAt?: Date;
  events: TransactionEvent[];
}

/**
 * Transaction event
 */
export interface TransactionEvent {
  type: 'status_change' | 'approval_requested' | 'approval_result' | 'signing_started' | 'signing_completed' | 'error';
  timestamp: Date;
  data: Record<string, unknown>;
  message?: string;
}

/**
 * Transaction statistics
 */
export interface TransactionStats {
  total: number;
  byStatus: Record<TransactionStatus, number>;
  byType: Record<string, number>;
  byDApp: Record<string, number>;
  averageApprovalTime: number;
  averageSigningTime: number;
  successRate: number;
}

/**
 * Transaction query options
 */
export interface TransactionQueryOptions {
  walletId?: string | undefined;
  dAppIdentifier?: string | undefined;
  status?: TransactionStatus | undefined;
  fromDate?: Date | undefined;
  toDate?: Date | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Transaction tracker for monitoring and logging transaction lifecycle
 */
export class TransactionTracker extends EventEmitter {
  private transactions: Map<string, TransactionLogEntry> = new Map();
  private maxEntries: number;
  private retentionPeriod: number; // in milliseconds

  constructor(maxEntries: number = 10000, retentionPeriod: number = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    super();
    this.maxEntries = maxEntries;
    this.retentionPeriod = retentionPeriod;

    // Set up periodic cleanup
    setInterval(() => this.cleanup(), 60 * 60 * 1000); // Cleanup every hour
  }

  /**
   * Create a new transaction log entry
   */
  createTransaction(
    id: string,
    walletId: string,
    dAppIdentifier: string,
    transaction: Transaction,
    metadata: TransactionMetadata
  ): TransactionLogEntry {
    const now = new Date();
    
    const entry: TransactionLogEntry = {
      id,
      walletId,
      dAppIdentifier,
      transaction,
      metadata,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      events: [{
        type: 'status_change',
        timestamp: now,
        data: { status: 'pending' },
        message: 'Transaction created'
      }]
    };

    this.transactions.set(id, entry);
    this.emit('transactionCreated', entry);
    
    return entry;
  }

  /**
   * Update transaction status
   */
  updateStatus(transactionId: string, status: TransactionStatus, data?: Record<string, unknown>): void {
    const entry = this.transactions.get(transactionId);
    if (!entry) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const now = new Date();
    const previousStatus = entry.status;
    
    entry.status = status;
    entry.updatedAt = now;

    // Update specific timestamps based on status
    switch (status) {
      case 'approved':
        entry.approvedAt = now;
        break;
      case 'signed':
        entry.signedAt = now;
        break;
      case 'submitted':
        entry.submittedAt = now;
        break;
      case 'confirmed':
        entry.confirmedAt = now;
        break;
    }

    // Add event
    entry.events.push({
      type: 'status_change',
      timestamp: now,
      data: { 
        previousStatus, 
        newStatus: status,
        ...data 
      },
      message: `Status changed from ${previousStatus} to ${status}`
    });

    this.emit('statusUpdated', { entry, previousStatus, newStatus: status });
  }

  /**
   * Add transaction signature
   */
  addSignature(transactionId: string, signature: string): void {
    const entry = this.transactions.get(transactionId);
    if (!entry) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    entry.signature = signature;
    entry.updatedAt = new Date();

    entry.events.push({
      type: 'signing_completed',
      timestamp: new Date(),
      data: { signature },
      message: 'Transaction signed successfully'
    });

    this.emit('signatureAdded', { entry, signature });
  }

  /**
   * Add error to transaction
   */
  addError(transactionId: string, error: string): void {
    const entry = this.transactions.get(transactionId);
    if (!entry) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    entry.error = error;
    entry.updatedAt = new Date();

    entry.events.push({
      type: 'error',
      timestamp: new Date(),
      data: { error },
      message: error
    });

    this.emit('errorAdded', { entry, error });
  }

  /**
   * Add custom event to transaction
   */
  addEvent(transactionId: string, event: Omit<TransactionEvent, 'timestamp'>): void {
    const entry = this.transactions.get(transactionId);
    if (!entry) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    const fullEvent: TransactionEvent = {
      ...event,
      timestamp: new Date()
    };

    entry.events.push(fullEvent);
    entry.updatedAt = new Date();

    this.emit('eventAdded', { entry, event: fullEvent });
  }

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: string): TransactionLogEntry | null {
    return this.transactions.get(transactionId) || null;
  }

  /**
   * Query transactions with filters
   */
  queryTransactions(options: TransactionQueryOptions = {}): TransactionLogEntry[] {
    let results = Array.from(this.transactions.values());

    // Apply filters
    if (options.walletId) {
      results = results.filter(tx => tx.walletId === options.walletId);
    }

    if (options.dAppIdentifier) {
      results = results.filter(tx => tx.dAppIdentifier === options.dAppIdentifier);
    }

    if (options.status) {
      results = results.filter(tx => tx.status === options.status);
    }

    if (options.fromDate) {
      results = results.filter(tx => tx.createdAt >= options.fromDate!);
    }

    if (options.toDate) {
      results = results.filter(tx => tx.createdAt <= options.toDate!);
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    if (options.offset) {
      results = results.slice(options.offset);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get transaction statistics
   */
  getStatistics(): TransactionStats {
    const transactions = Array.from(this.transactions.values());
    
    const stats: TransactionStats = {
      total: transactions.length,
      byStatus: {} as Record<TransactionStatus, number>,
      byType: {},
      byDApp: {},
      averageApprovalTime: 0,
      averageSigningTime: 0,
      successRate: 0
    };

    // Initialize status counts
    const statuses: TransactionStatus[] = [
      'pending', 'approved', 'rejected', 'signing', 'signed', 
      'signing_failed', 'submitted', 'confirmed', 'failed', 'expired'
    ];
    
    statuses.forEach(status => {
      stats.byStatus[status] = 0;
    });

    let totalApprovalTime = 0;
    let totalSigningTime = 0;
    let approvalCount = 0;
    let signingCount = 0;
    let successCount = 0;

    // Calculate statistics
    transactions.forEach(tx => {
      // Status counts
      stats.byStatus[tx.status]++;

      // Type counts
      const type = tx.metadata.type;
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // dApp counts
      stats.byDApp[tx.dAppIdentifier] = (stats.byDApp[tx.dAppIdentifier] || 0) + 1;

      // Timing calculations
      if (tx.approvedAt) {
        totalApprovalTime += tx.approvedAt.getTime() - tx.createdAt.getTime();
        approvalCount++;
      }

      if (tx.signedAt && tx.approvedAt) {
        totalSigningTime += tx.signedAt.getTime() - tx.approvedAt.getTime();
        signingCount++;
      }

      // Success rate (signed or confirmed transactions)
      if (tx.status === 'signed' || tx.status === 'confirmed') {
        successCount++;
      }
    });

    // Calculate averages
    stats.averageApprovalTime = approvalCount > 0 ? totalApprovalTime / approvalCount : 0;
    stats.averageSigningTime = signingCount > 0 ? totalSigningTime / signingCount : 0;
    stats.successRate = transactions.length > 0 ? successCount / transactions.length : 0;

    return stats;
  }

  /**
   * Get recent transactions
   */
  getRecentTransactions(limit: number = 50): TransactionLogEntry[] {
    return this.queryTransactions({ limit });
  }

  /**
   * Get transactions for a specific wallet
   */
  getWalletTransactions(walletId: string, limit?: number | undefined): TransactionLogEntry[] {
    return this.queryTransactions({ walletId, limit });
  }

  /**
   * Get transactions for a specific dApp
   */
  getDAppTransactions(dAppIdentifier: string, limit?: number | undefined): TransactionLogEntry[] {
    return this.queryTransactions({ dAppIdentifier, limit });
  }

  /**
   * Get pending transactions
   */
  getPendingTransactions(): TransactionLogEntry[] {
    return this.queryTransactions({ status: 'pending' });
  }

  /**
   * Clear all transaction logs
   */
  clear(): void {
    this.transactions.clear();
    this.emit('cleared');
  }

  /**
   * Clean up old transactions based on retention policy
   */
  private cleanup(): void {
    const cutoffDate = new Date(Date.now() - this.retentionPeriod);
    const toDelete: string[] = [];

    // Find transactions to delete
    for (const [id, entry] of this.transactions) {
      if (entry.createdAt < cutoffDate) {
        toDelete.push(id);
      }
    }

    // Delete old transactions
    toDelete.forEach(id => {
      this.transactions.delete(id);
    });

    // If still over limit, delete oldest transactions
    if (this.transactions.size > this.maxEntries) {
      const sorted = Array.from(this.transactions.entries())
        .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime());

      const excess = this.transactions.size - this.maxEntries;
      for (let i = 0; i < excess; i++) {
        this.transactions.delete(sorted[i][0]);
      }
    }

    if (toDelete.length > 0) {
      this.emit('cleanup', { deletedCount: toDelete.length });
    }
  }

  /**
   * Export transaction logs (for debugging/analysis)
   */
  exportLogs(): TransactionLogEntry[] {
    return Array.from(this.transactions.values());
  }

  /**
   * Import transaction logs (for testing/restoration)
   */
  importLogs(logs: TransactionLogEntry[]): void {
    this.transactions.clear();
    
    logs.forEach(log => {
      this.transactions.set(log.id, log);
    });

    this.emit('imported', { count: logs.length });
  }
}