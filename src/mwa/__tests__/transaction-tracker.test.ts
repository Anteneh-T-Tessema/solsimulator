import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { TransactionTracker } from '../transaction-tracker';
import { TransactionValidator } from '../transaction-validator';

describe('TransactionTracker', () => {
  let tracker: TransactionTracker;
  let mockPublicKey1: PublicKey;
  let mockPublicKey2: PublicKey;
  let mockTransaction: Transaction;

  beforeEach(() => {
    tracker = new TransactionTracker(1000, 24 * 60 * 60 * 1000); // 1000 entries, 24 hours retention

    mockPublicKey1 = new PublicKey('11111111111111111111111111111112');
    mockPublicKey2 = new PublicKey('11111111111111111111111111111113');

    mockTransaction = new Transaction();
    mockTransaction.feePayer = mockPublicKey1;
    mockTransaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
    mockTransaction.add(SystemProgram.transfer({
      fromPubkey: mockPublicKey1,
      toPubkey: mockPublicKey2,
      lamports: 1000000
    }));
  });

  describe('createTransaction', () => {
    it('should create a new transaction log entry', () => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      const entry = tracker.createTransaction(
        'tx-123',
        'wallet-456',
        'test-dapp',
        mockTransaction,
        validation.metadata
      );

      expect(entry.id).toBe('tx-123');
      expect(entry.walletId).toBe('wallet-456');
      expect(entry.dAppIdentifier).toBe('test-dapp');
      expect(entry.transaction).toBe(mockTransaction);
      expect(entry.status).toBe('pending');
      expect(entry.createdAt).toBeInstanceOf(Date);
      expect(entry.updatedAt).toBeInstanceOf(Date);
      expect(entry.events).toHaveLength(1);
      expect(entry.events[0].type).toBe('status_change');
    });

    it('should emit transactionCreated event', (done) => {
      tracker.once('transactionCreated', (entry) => {
        expect(entry.id).toBe('tx-123');
        done();
      });

      const validation = TransactionValidator.validateTransaction(mockTransaction);
      tracker.createTransaction('tx-123', 'wallet-456', 'test-dapp', mockTransaction, validation.metadata);
    });
  });

  describe('updateStatus', () => {
    let transactionId: string;

    beforeEach(() => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      const entry = tracker.createTransaction(
        'tx-123',
        'wallet-456',
        'test-dapp',
        mockTransaction,
        validation.metadata
      );
      transactionId = entry.id;
    });

    it('should update transaction status', () => {
      tracker.updateStatus(transactionId, 'approved');

      const entry = tracker.getTransaction(transactionId);
      expect(entry?.status).toBe('approved');
      expect(entry?.approvedAt).toBeInstanceOf(Date);
      expect(entry?.events).toHaveLength(2);
      expect(entry?.events[1].type).toBe('status_change');
      expect(entry?.events[1].data.newStatus).toBe('approved');
    });

    it('should update specific timestamps based on status', () => {
      tracker.updateStatus(transactionId, 'signed');
      const entry = tracker.getTransaction(transactionId);
      expect(entry?.signedAt).toBeInstanceOf(Date);

      tracker.updateStatus(transactionId, 'submitted');
      const updatedEntry = tracker.getTransaction(transactionId);
      expect(updatedEntry?.submittedAt).toBeInstanceOf(Date);

      tracker.updateStatus(transactionId, 'confirmed');
      const finalEntry = tracker.getTransaction(transactionId);
      expect(finalEntry?.confirmedAt).toBeInstanceOf(Date);
    });

    it('should emit statusUpdated event', (done) => {
      tracker.once('statusUpdated', ({ entry, previousStatus, newStatus }) => {
        expect(entry.id).toBe(transactionId);
        expect(previousStatus).toBe('pending');
        expect(newStatus).toBe('approved');
        done();
      });

      tracker.updateStatus(transactionId, 'approved');
    });

    it('should throw error for non-existent transaction', () => {
      expect(() => {
        tracker.updateStatus('non-existent', 'approved');
      }).toThrow('Transaction non-existent not found');
    });
  });

  describe('addSignature', () => {
    let transactionId: string;

    beforeEach(() => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      const entry = tracker.createTransaction(
        'tx-123',
        'wallet-456',
        'test-dapp',
        mockTransaction,
        validation.metadata
      );
      transactionId = entry.id;
    });

    it('should add signature to transaction', () => {
      const signature = 'test-signature-123';
      tracker.addSignature(transactionId, signature);

      const entry = tracker.getTransaction(transactionId);
      expect(entry?.signature).toBe(signature);
      expect(entry?.events.some(e => e.type === 'signing_completed')).toBe(true);
    });

    it('should emit signatureAdded event', (done) => {
      tracker.once('signatureAdded', ({ entry, signature }) => {
        expect(entry.id).toBe(transactionId);
        expect(signature).toBe('test-signature-123');
        done();
      });

      tracker.addSignature(transactionId, 'test-signature-123');
    });
  });

  describe('addError', () => {
    let transactionId: string;

    beforeEach(() => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      const entry = tracker.createTransaction(
        'tx-123',
        'wallet-456',
        'test-dapp',
        mockTransaction,
        validation.metadata
      );
      transactionId = entry.id;
    });

    it('should add error to transaction', () => {
      const error = 'Test error message';
      tracker.addError(transactionId, error);

      const entry = tracker.getTransaction(transactionId);
      expect(entry?.error).toBe(error);
      expect(entry?.events.some(e => e.type === 'error')).toBe(true);
    });

    it('should emit errorAdded event', (done) => {
      tracker.once('errorAdded', ({ entry, error }) => {
        expect(entry.id).toBe(transactionId);
        expect(error).toBe('Test error message');
        done();
      });

      tracker.addError(transactionId, 'Test error message');
    });
  });

  describe('addEvent', () => {
    let transactionId: string;

    beforeEach(() => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      const entry = tracker.createTransaction(
        'tx-123',
        'wallet-456',
        'test-dapp',
        mockTransaction,
        validation.metadata
      );
      transactionId = entry.id;
    });

    it('should add custom event to transaction', () => {
      const customEvent = {
        type: 'approval_requested' as const,
        data: { requestId: 'req-123' },
        message: 'Approval requested from user'
      };

      tracker.addEvent(transactionId, customEvent);

      const entry = tracker.getTransaction(transactionId);
      const addedEvent = entry?.events.find(e => e.type === 'approval_requested');
      
      expect(addedEvent).toBeDefined();
      expect(addedEvent?.data.requestId).toBe('req-123');
      expect(addedEvent?.message).toBe('Approval requested from user');
      expect(addedEvent?.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('queryTransactions', () => {
    beforeEach(() => {
      // Create multiple test transactions
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      
      tracker.createTransaction('tx-1', 'wallet-1', 'dapp-1', mockTransaction, validation.metadata);
      tracker.createTransaction('tx-2', 'wallet-1', 'dapp-2', mockTransaction, validation.metadata);
      tracker.createTransaction('tx-3', 'wallet-2', 'dapp-1', mockTransaction, validation.metadata);
      
      tracker.updateStatus('tx-1', 'approved');
      tracker.updateStatus('tx-2', 'signed');
    });

    it('should filter by wallet ID', () => {
      const results = tracker.queryTransactions({ walletId: 'wallet-1' });
      expect(results).toHaveLength(2);
      expect(results.every(tx => tx.walletId === 'wallet-1')).toBe(true);
    });

    it('should filter by dApp identifier', () => {
      const results = tracker.queryTransactions({ dAppIdentifier: 'dapp-1' });
      expect(results).toHaveLength(2);
      expect(results.every(tx => tx.dAppIdentifier === 'dapp-1')).toBe(true);
    });

    it('should filter by status', () => {
      const results = tracker.queryTransactions({ status: 'approved' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('tx-1');
    });

    it('should apply limit and offset', () => {
      const results = tracker.queryTransactions({ limit: 2, offset: 1 });
      expect(results).toHaveLength(2);
    });

    it('should filter by date range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const results = tracker.queryTransactions({ 
        fromDate: oneHourAgo,
        toDate: now
      });
      
      expect(results).toHaveLength(3); // All transactions should be within this range
    });
  });

  describe('getStatistics', () => {
    beforeEach(() => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      
      // Create transactions with different statuses
      tracker.createTransaction('tx-1', 'wallet-1', 'dapp-1', mockTransaction, validation.metadata);
      tracker.createTransaction('tx-2', 'wallet-1', 'dapp-1', mockTransaction, validation.metadata);
      tracker.createTransaction('tx-3', 'wallet-2', 'dapp-2', mockTransaction, validation.metadata);
      
      tracker.updateStatus('tx-1', 'approved');
      tracker.updateStatus('tx-1', 'signed');
      tracker.updateStatus('tx-2', 'rejected');
    });

    it('should calculate transaction statistics', () => {
      const stats = tracker.getStatistics();
      
      expect(stats.total).toBe(3);
      expect(stats.byStatus.pending).toBe(1);
      expect(stats.byStatus.signed).toBe(1);
      expect(stats.byStatus.rejected).toBe(1);
      expect(stats.byType.transfer).toBe(3);
      expect(stats.byDApp['dapp-1']).toBe(2);
      expect(stats.byDApp['dapp-2']).toBe(1);
      expect(stats.successRate).toBeCloseTo(1/3); // 1 signed out of 3 total
    });
  });

  describe('convenience methods', () => {
    beforeEach(() => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      
      tracker.createTransaction('tx-1', 'wallet-1', 'dapp-1', mockTransaction, validation.metadata);
      tracker.createTransaction('tx-2', 'wallet-2', 'dapp-1', mockTransaction, validation.metadata);
      tracker.createTransaction('tx-3', 'wallet-1', 'dapp-2', mockTransaction, validation.metadata);
    });

    it('should get wallet transactions', () => {
      const results = tracker.getWalletTransactions('wallet-1');
      expect(results).toHaveLength(2);
      expect(results.every(tx => tx.walletId === 'wallet-1')).toBe(true);
    });

    it('should get dApp transactions', () => {
      const results = tracker.getDAppTransactions('dapp-1');
      expect(results).toHaveLength(2);
      expect(results.every(tx => tx.dAppIdentifier === 'dapp-1')).toBe(true);
    });

    it('should get pending transactions', () => {
      const results = tracker.getPendingTransactions();
      expect(results).toHaveLength(3);
      expect(results.every(tx => tx.status === 'pending')).toBe(true);
    });

    it('should get recent transactions', () => {
      const results = tracker.getRecentTransactions(2);
      expect(results).toHaveLength(2);
    });
  });

  describe('data management', () => {
    it('should clear all transactions', () => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      tracker.createTransaction('tx-1', 'wallet-1', 'dapp-1', mockTransaction, validation.metadata);
      
      expect(tracker.getRecentTransactions()).toHaveLength(1);
      
      tracker.clear();
      
      expect(tracker.getRecentTransactions()).toHaveLength(0);
    });

    it('should export and import logs', () => {
      const validation = TransactionValidator.validateTransaction(mockTransaction);
      tracker.createTransaction('tx-1', 'wallet-1', 'dapp-1', mockTransaction, validation.metadata);
      tracker.updateStatus('tx-1', 'approved');
      
      const exported = tracker.exportLogs();
      expect(exported).toHaveLength(1);
      
      tracker.clear();
      expect(tracker.getRecentTransactions()).toHaveLength(0);
      
      tracker.importLogs(exported);
      expect(tracker.getRecentTransactions()).toHaveLength(1);
      expect(tracker.getTransaction('tx-1')?.status).toBe('approved');
    });
  });
});