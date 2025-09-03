import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { TransactionValidator } from '../transaction-validator';

describe('TransactionValidator', () => {
  let mockPublicKey1: PublicKey;
  let mockPublicKey2: PublicKey;

  beforeEach(() => {
    mockPublicKey1 = new PublicKey('11111111111111111111111111111112');
    mockPublicKey2 = new PublicKey('11111111111111111111111111111113');
  });

  describe('validateTransaction', () => {
    it('should reject null/undefined transactions', () => {
      const result = TransactionValidator.validateTransaction(null as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transaction is null or undefined');
    });

    it('should reject transactions with no instructions', () => {
      const transaction = new Transaction();
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transaction has no instructions');
    });

    it('should reject transactions with no fee payer', () => {
      const transaction = new Transaction();
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Transaction has no fee payer');
    });

    it('should validate a proper transfer transaction', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      transaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.type).toBe('transfer');
      expect(result.metadata.hasSystemProgram).toBe(true);
      expect(result.metadata.instructionCount).toBe(1);
    });

    it('should warn about missing recent blockhash', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.warnings).toContain('Transaction has no recent blockhash (may be set later)');
    });

    it('should validate instruction structure', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      
      // Create an instruction with invalid structure
      const invalidInstruction = {
        programId: null as any,
        keys: [],
        data: Buffer.alloc(0)
      };
      
      transaction.instructions = [invalidInstruction];
      
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Instruction 0 has no program ID');
      // The metadata should still be created even with invalid instructions
      expect(result.metadata.instructionCount).toBe(1);
    });

    it('should validate account keys in instructions', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      
      const instruction = SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      });
      
      // Corrupt the instruction keys
      instruction.keys[0].pubkey = null as any;
      
      transaction.add(instruction);
      
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Instruction 0, key 0 has no public key');
    });
  });

  describe('extractTransactionMetadata', () => {
    it('should extract metadata from transfer transaction', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      transaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';
      
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      
      expect(result.metadata.type).toBe('transfer');
      expect(result.metadata.hasSystemProgram).toBe(true);
      expect(result.metadata.hasTokenProgram).toBe(false);
      expect(result.metadata.instructionCount).toBe(1);
      expect(result.metadata.programIds).toContain(SystemProgram.programId.toBase58());
      expect(result.metadata.estimatedFee).toBeGreaterThan(0);
    });

    it('should classify transaction types correctly', () => {
      // Test system transfer
      const transferTx = new Transaction();
      transferTx.feePayer = mockPublicKey1;
      transferTx.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      }));
      
      const transferResult = TransactionValidator.validateTransaction(transferTx);
      expect(transferResult.metadata.type).toBe('transfer');

      // Test account creation (using allocate which doesn't transfer lamports)
      const createTx = new Transaction();
      createTx.feePayer = mockPublicKey1;
      createTx.add(SystemProgram.allocate({
        accountPubkey: mockPublicKey2,
        space: 100
      }));
      
      const createResult = TransactionValidator.validateTransaction(createTx);
      expect(createResult.metadata.type).toBe('account_creation');
    });
  });

  describe('formatTransactionForDisplay', () => {
    it('should format transaction information for display', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 1000000
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      const display = TransactionValidator.formatTransactionForDisplay(transaction, result.metadata);
      
      expect(display).toContain('Transaction Type: TRANSFER');
      expect(display).toContain('Instructions: 1');
      expect(display).toContain('Estimated Fee:');
      expect(display).toContain('Amount: 1000000 lamports');
    });
  });

  describe('requiresUserApproval', () => {
    it('should require approval for high-value transfers', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 2000000000 // > 1 SOL
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      const requiresApproval = TransactionValidator.requiresUserApproval(transaction, result.metadata);
      
      expect(requiresApproval).toBe(true);
    });

    it('should require approval for unknown program interactions', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      
      // Add instruction with unknown program
      transaction.add({
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        keys: [
          { pubkey: mockPublicKey1, isSigner: true, isWritable: true },
          { pubkey: mockPublicKey2, isSigner: false, isWritable: true }
        ],
        data: Buffer.from([1, 2, 3, 4])
      });
      
      const result = TransactionValidator.validateTransaction(transaction);
      const requiresApproval = TransactionValidator.requiresUserApproval(transaction, result.metadata);
      
      expect(requiresApproval).toBe(true);
    });

    it('should not require approval for small transfers', () => {
      const transaction = new Transaction();
      transaction.feePayer = mockPublicKey1;
      transaction.add(SystemProgram.transfer({
        fromPubkey: mockPublicKey1,
        toPubkey: mockPublicKey2,
        lamports: 100000 // Small amount
      }));
      
      const result = TransactionValidator.validateTransaction(transaction);
      const requiresApproval = TransactionValidator.requiresUserApproval(transaction, result.metadata);
      
      expect(requiresApproval).toBe(false);
    });
  });
});