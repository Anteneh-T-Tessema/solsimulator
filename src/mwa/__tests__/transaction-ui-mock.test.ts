import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { TransactionUIMock } from '../transaction-ui-mock';

describe('TransactionUIMock', () => {
  let transactionUI: TransactionUIMock;
  let mockPublicKey1: PublicKey;
  let mockPublicKey2: PublicKey;
  let mockTransaction: Transaction;

  beforeEach(() => {
    transactionUI = new TransactionUIMock({
      autoApproveTransfers: false,
      autoApproveLimit: 100000000, // 0.1 SOL
      showDetailedInfo: true,
      confirmationDelay: 100 // Fast for testing
    });

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

  afterEach(() => {
    transactionUI.cleanup();
  });

  describe('createApprovalRequest', () => {
    it('should create a valid approval request', () => {
      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        mockTransaction
      );

      expect(request.id).toBeDefined();
      expect(request.walletId).toBe('wallet-123');
      expect(request.dAppIdentifier).toBe('test-dapp');
      expect(request.transaction).toBe(mockTransaction);
      expect(request.metadata).toBeDefined();
      expect(request.timestamp).toBeInstanceOf(Date);
    });

    it('should throw error for invalid transaction', () => {
      const invalidTransaction = new Transaction(); // No instructions

      expect(() => {
        TransactionUIMock.createApprovalRequest(
          'wallet-123',
          'test-dapp',
          invalidTransaction
        );
      }).toThrow('Invalid transaction');
    });
  });

  describe('requestApproval', () => {
    it('should handle approval request with auto-approve disabled', async () => {
      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        mockTransaction
      );

      // Set up event listener for approval requested
      const approvalRequestedPromise = new Promise((resolve) => {
        transactionUI.once('approvalRequested', resolve);
      });

      // Start the approval process
      const approvalPromise = transactionUI.requestApproval(request);
      
      // Wait for the approval request event
      await approvalRequestedPromise;

      // Manually approve the request after a short delay
      setTimeout(async () => {
        await transactionUI.approveRequest(request.id);
      }, 10);

      // Wait for the result
      const result = await approvalPromise;

      expect(result.approved).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.reason).toBeDefined();
    });

    it('should auto-approve when explicitly requested', async () => {
      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        mockTransaction,
        true // Auto-approve
      );

      const result = await transactionUI.requestApproval(request);

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('Auto-approved');
    });

    it('should auto-approve small transfers when configured', async () => {
      transactionUI.updateConfig({
        autoApproveTransfers: true,
        autoApproveLimit: 10000000 // 0.01 SOL
      });

      const smallTransferTx = new Transaction();
      smallTransferTx.feePayer = mockPublicKey1;
      smallTransferTx.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      smallTransferTx.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 5000000 // 0.005 SOL
      }));

      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        smallTransferTx
      );

      const result = await transactionUI.requestApproval(request);

      expect(result.approved).toBe(true);
      expect(result.reason).toBe('Auto-approved');
    });

    it('should not auto-approve large transfers even when configured', async () => {
      transactionUI.updateConfig({
        autoApproveTransfers: true,
        autoApproveLimit: 100000000 // 0.1 SOL
      });

      const largeTransferTx = new Transaction();
      largeTransferTx.feePayer = mockPublicKey1;
      largeTransferTx.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      largeTransferTx.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 2000000000 // 2 SOL
      }));

      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        largeTransferTx
      );

      const result = await transactionUI.requestApproval(request);

      // Should not auto-approve due to high risk
      expect(result.approved).toBeDefined(); // Could be true or false based on simulation
      if (result.approved) {
        expect(result.reason).not.toBe('Auto-approved');
      }
    });
  });

  describe('manual approval/rejection', () => {
    it('should allow manual approval of pending requests', async () => {
      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        mockTransaction
      );

      // Start approval process but don't wait for it
      const approvalPromise = transactionUI.requestApproval(request);

      // Wait a bit for the request to be registered
      await new Promise(resolve => setTimeout(resolve, 50));

      // Manually approve
      const manualResult = await transactionUI.approveRequest(request.id);
      expect(manualResult.approved).toBe(true);
      expect(manualResult.reason).toBe('Manually approved');

      // Original promise should also resolve
      const originalResult = await approvalPromise;
      expect(originalResult.approved).toBe(true);
    });

    it('should allow manual rejection of pending requests', async () => {
      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        mockTransaction
      );

      // Start approval process but don't wait for it
      const approvalPromise = transactionUI.requestApproval(request);

      // Wait a bit for the request to be registered
      await new Promise(resolve => setTimeout(resolve, 50));

      // Manually reject
      const manualResult = await transactionUI.rejectRequest(request.id, 'Test rejection');
      expect(manualResult.approved).toBe(false);
      expect(manualResult.reason).toBe('Test rejection');

      // Original promise should also resolve
      const originalResult = await approvalPromise;
      expect(originalResult.approved).toBe(false);
    });

    it('should throw error for non-existent request', async () => {
      await expect(transactionUI.approveRequest('non-existent')).rejects.toThrow('Request non-existent not found');
      await expect(transactionUI.rejectRequest('non-existent')).rejects.toThrow('Request non-existent not found');
    });
  });

  describe('pending requests management', () => {
    it('should track pending requests', async () => {
      const request1 = TransactionUIMock.createApprovalRequest('wallet-1', 'dapp-1', mockTransaction);
      const request2 = TransactionUIMock.createApprovalRequest('wallet-2', 'dapp-2', mockTransaction);

      // Start both requests
      const promise1 = transactionUI.requestApproval(request1);
      const promise2 = transactionUI.requestApproval(request2);

      // Wait a bit for requests to be registered
      await new Promise(resolve => setTimeout(resolve, 50));

      const pending = transactionUI.getPendingRequests();
      expect(pending).toHaveLength(2);
      expect(pending.map(r => r.id)).toContain(request1.id);
      expect(pending.map(r => r.id)).toContain(request2.id);

      // Approve one request
      await transactionUI.approveRequest(request1.id);

      // Should have one less pending request
      const pendingAfter = transactionUI.getPendingRequests();
      expect(pendingAfter).toHaveLength(1);
      expect(pendingAfter[0].id).toBe(request2.id);

      // Clean up
      await transactionUI.rejectRequest(request2.id);
      await Promise.all([promise1, promise2]);
    });
  });

  describe('configuration management', () => {
    it('should update configuration', () => {
      const newConfig = {
        autoApproveTransfers: true,
        autoApproveLimit: 50000000,
        confirmationDelay: 2000
      };

      transactionUI.updateConfig(newConfig);
      const config = transactionUI.getConfig();

      expect(config.autoApproveTransfers).toBe(true);
      expect(config.autoApproveLimit).toBe(50000000);
      expect(config.confirmationDelay).toBe(2000);
      expect(config.showDetailedInfo).toBe(true); // Should preserve existing values
    });

    it('should emit configUpdated event', (done) => {
      transactionUI.once('configUpdated', (config) => {
        expect(config.autoApproveTransfers).toBe(true);
        done();
      });

      transactionUI.updateConfig({ autoApproveTransfers: true });
    });
  });

  describe('event emission', () => {
    it('should emit appropriate events during approval process', async () => {
      const events: string[] = [];

      transactionUI.on('approvalRequested', () => events.push('approvalRequested'));
      transactionUI.on('transactionDisplayed', () => events.push('transactionDisplayed'));
      transactionUI.on('transactionAutoApproved', () => events.push('transactionAutoApproved'));
      transactionUI.on('transactionApproved', () => events.push('transactionApproved'));
      transactionUI.on('transactionRejected', () => events.push('transactionRejected'));
      transactionUI.on('approvalResult', () => events.push('approvalResult'));

      const request = TransactionUIMock.createApprovalRequest(
        'wallet-123',
        'test-dapp',
        mockTransaction,
        true // Auto-approve to ensure predictable outcome
      );

      await transactionUI.requestApproval(request);

      expect(events).toContain('approvalRequested');
      expect(events).toContain('transactionAutoApproved');
      expect(events).toContain('approvalResult');
    });
  });
});