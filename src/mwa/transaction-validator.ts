import { Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';

/**
 * Transaction validation result
 */
export interface TransactionValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: TransactionMetadata;
}

/**
 * Transaction metadata extracted during validation
 */
export interface TransactionMetadata {
  instructionCount: number;
  accountCount: number;
  estimatedFee: number;
  programIds: string[];
  hasSystemProgram: boolean;
  hasTokenProgram: boolean;
  transferAmount?: number | undefined;
  recipient?: string | undefined;
  type: TransactionType;
}

/**
 * Transaction type classification
 */
export type TransactionType = 
  | 'transfer'
  | 'token_transfer'
  | 'program_interaction'
  | 'account_creation'
  | 'unknown';

/**
 * Transaction validation and parsing utilities
 */
export class TransactionValidator {
  private static readonly SYSTEM_PROGRAM_ID = SystemProgram.programId.toBase58();
  private static readonly TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  private static readonly ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

  /**
   * Validate a Solana transaction
   */
  static validateTransaction(transaction: Transaction): TransactionValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Basic structure validation
    if (!transaction) {
      errors.push('Transaction is null or undefined');
      return {
        isValid: false,
        errors,
        warnings,
        metadata: this.createEmptyMetadata()
      };
    }

    // Check if transaction has instructions
    if (!transaction.instructions || transaction.instructions.length === 0) {
      errors.push('Transaction has no instructions');
    }

    // Check fee payer
    if (!transaction.feePayer) {
      errors.push('Transaction has no fee payer');
    }

    // Check recent blockhash
    if (!transaction.recentBlockhash) {
      warnings.push('Transaction has no recent blockhash (may be set later)');
    }

    // Validate instructions
    const instructionErrors = this.validateInstructions(transaction.instructions);
    errors.push(...instructionErrors);

    // Extract metadata
    const metadata = this.extractTransactionMetadata(transaction);

    // Additional validation based on transaction type
    const typeSpecificErrors = this.validateByType(transaction, metadata);
    errors.push(...typeSpecificErrors);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata
    };
  }

  /**
   * Validate transaction instructions
   */
  private static validateInstructions(instructions: TransactionInstruction[]): string[] {
    const errors: string[] = [];

    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];
      
      if (!instruction.programId) {
        errors.push(`Instruction ${i} has no program ID`);
        continue;
      }

      if (!instruction.keys) {
        errors.push(`Instruction ${i} has no account keys`);
        continue;
      }

      // Validate account keys
      for (let j = 0; j < instruction.keys.length; j++) {
        const key = instruction.keys[j];
        
        if (!key.pubkey) {
          errors.push(`Instruction ${i}, key ${j} has no public key`);
        }

        if (typeof key.isSigner !== 'boolean') {
          errors.push(`Instruction ${i}, key ${j} has invalid isSigner flag`);
        }

        if (typeof key.isWritable !== 'boolean') {
          errors.push(`Instruction ${i}, key ${j} has invalid isWritable flag`);
        }
      }

      // Validate instruction data
      if (!instruction.data) {
        // Some instructions may have empty data, this is just a warning
        // warnings.push(`Instruction ${i} has no data`);
      }
    }

    return errors;
  }

  /**
   * Extract metadata from transaction
   */
  private static extractTransactionMetadata(transaction: Transaction): TransactionMetadata {
    const programIds = new Set<string>();
    let accountCount = 0;
    let hasSystemProgram = false;
    let hasTokenProgram = false;
    let transferAmount: number | undefined;
    let recipient: string | undefined;

    // Analyze instructions
    for (const instruction of transaction.instructions) {
      if (!instruction.programId) {
        continue; // Skip invalid instructions
      }
      const programId = instruction.programId.toBase58();
      programIds.add(programId);

      if (programId === this.SYSTEM_PROGRAM_ID) {
        hasSystemProgram = true;
        
        // Try to extract transfer information for system program
        const transferInfo = this.extractSystemTransferInfo(instruction);
        if (transferInfo) {
          transferAmount = transferInfo.amount;
          recipient = transferInfo.recipient;
        }
      }

      if (programId === this.TOKEN_PROGRAM_ID || programId === this.ASSOCIATED_TOKEN_PROGRAM_ID) {
        hasTokenProgram = true;
      }

      accountCount += instruction.keys.length;
    }

    // Determine transaction type
    const type = this.classifyTransactionType(
      Array.from(programIds),
      hasSystemProgram,
      hasTokenProgram,
      transferAmount !== undefined
    );

    return {
      instructionCount: transaction.instructions.length,
      accountCount,
      estimatedFee: this.estimateTransactionFee(transaction),
      programIds: Array.from(programIds),
      hasSystemProgram,
      hasTokenProgram,
      transferAmount,
      recipient,
      type
    };
  }

  /**
   * Extract transfer information from system program instruction
   */
  private static extractSystemTransferInfo(instruction: TransactionInstruction): { amount: number; recipient: string } | null {
    try {
      // System program transfer instruction has a specific format
      // This is a simplified extraction - in a real implementation,
      // you would properly decode the instruction data
      if (instruction.keys.length >= 2 && instruction.data.length >= 4) {
        // For simulation purposes, we'll extract basic info
        const recipient = instruction.keys[1]?.pubkey?.toBase58();
        
        // Try to decode amount from instruction data (simplified)
        let amount = 0;
        if (instruction.data.length >= 12) {
          // Read 8 bytes as little-endian uint64 (lamports)
          const dataView = new DataView(instruction.data.buffer, instruction.data.byteOffset + 4, 8);
          amount = Number(dataView.getBigUint64(0, true)); // true for little-endian
        }

        if (recipient && amount > 0) {
          return { amount, recipient };
        }
      }
    } catch (error) {
      // Ignore parsing errors for now
    }

    return null;
  }

  /**
   * Classify transaction type based on programs and content
   */
  private static classifyTransactionType(
    programIds: string[],
    hasSystemProgram: boolean,
    hasTokenProgram: boolean,
    hasTransferAmount: boolean
  ): TransactionType {
    if (hasTokenProgram) {
      return 'token_transfer';
    }

    if (hasSystemProgram && hasTransferAmount && programIds.length === 1) {
      return 'transfer';
    }

    if (hasSystemProgram && !hasTransferAmount && programIds.length === 1) {
      return 'account_creation';
    }

    if (programIds.length > 1 || (!hasSystemProgram && !hasTokenProgram)) {
      return 'program_interaction';
    }

    return 'unknown';
  }

  /**
   * Estimate transaction fee (simplified)
   */
  private static estimateTransactionFee(transaction: Transaction): number {
    // Base fee per signature (5000 lamports)
    const baseFee = 5000;
    
    // Additional fee per instruction (simplified calculation)
    const instructionFee = transaction.instructions.length * 1000;
    
    return baseFee + instructionFee;
  }

  /**
   * Validate transaction based on its type
   */
  private static validateByType(_transaction: Transaction, metadata: TransactionMetadata): string[] {
    const errors: string[] = [];

    switch (metadata.type) {
      case 'transfer':
        if (!metadata.transferAmount || metadata.transferAmount <= 0) {
          errors.push('Transfer transaction has invalid amount');
        }
        if (!metadata.recipient) {
          errors.push('Transfer transaction has no recipient');
        }
        break;

      case 'token_transfer':
        if (!metadata.hasTokenProgram) {
          errors.push('Token transfer transaction missing token program');
        }
        break;

      case 'account_creation':
        if (metadata.instructionCount === 0) {
          errors.push('Account creation transaction has no instructions');
        }
        break;

      case 'program_interaction':
        if (metadata.programIds.length === 0) {
          errors.push('Program interaction transaction has no program IDs');
        }
        break;
    }

    return errors;
  }

  /**
   * Create empty metadata for error cases
   */
  private static createEmptyMetadata(): TransactionMetadata {
    return {
      instructionCount: 0,
      accountCount: 0,
      estimatedFee: 0,
      programIds: [],
      hasSystemProgram: false,
      hasTokenProgram: false,
      type: 'unknown'
    };
  }

  /**
   * Format transaction for display in user interface
   */
  static formatTransactionForDisplay(_transaction: Transaction, metadata: TransactionMetadata): string {
    const lines: string[] = [];
    
    lines.push(`Transaction Type: ${metadata.type.replace('_', ' ').toUpperCase()}`);
    lines.push(`Instructions: ${metadata.instructionCount}`);
    lines.push(`Estimated Fee: ${metadata.estimatedFee} lamports`);
    
    if (metadata.transferAmount) {
      lines.push(`Amount: ${metadata.transferAmount} lamports`);
    }
    
    if (metadata.recipient) {
      lines.push(`Recipient: ${metadata.recipient}`);
    }
    
    lines.push(`Programs: ${metadata.programIds.join(', ')}`);
    
    return lines.join('\n');
  }

  /**
   * Check if transaction requires user approval based on risk assessment
   */
  static requiresUserApproval(_transaction: Transaction, metadata: TransactionMetadata): boolean {
    // Always require approval for high-value transfers
    if (metadata.transferAmount && metadata.transferAmount > 1000000000) { // > 1 SOL
      return true;
    }

    // Always require approval for unknown program interactions
    if (metadata.type === 'program_interaction' || metadata.type === 'unknown') {
      return true;
    }

    // Require approval for token transfers
    if (metadata.type === 'token_transfer') {
      return true;
    }

    // Simple transfers and account creation can be auto-approved in dev mode
    return false;
  }
}