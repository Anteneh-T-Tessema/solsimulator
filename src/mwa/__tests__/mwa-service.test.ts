import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { MWAServiceImpl } from '../mwa-service';
import { SeedVaultMock } from '../../seed-vault/seed-vault-mock';
import { WalletProfile } from '../../interfaces/common';
import { AuthorizeRequest } from '../../interfaces/mwa-service';

describe('MWAServiceImpl', () => {
  let mwaService: MWAServiceImpl;
  let seedVault: SeedVaultMock;
  let testWalletProfile: WalletProfile;

  beforeEach(async () => {
    // Create seed vault with memory storage for testing
    seedVault = new SeedVaultMock(undefined, true);
    await seedVault.initialize();
    await seedVault.unlock('test-password');

    // Create MWA service with short timeout for testing
    mwaService = new MWAServiceImpl(seedVault, 1000);

    // Create test wallet profile
    testWalletProfile = {
      name: 'Test Wallet',
      derivationPath: "m/44'/501'/0'/0'",
      network: 'devnet'
    };
  });

  afterEach(async () => {
    // Clean up MWA service resources
    mwaService.cleanup();
    
    // Clean up seed vault
    await seedVault.reset();
  });

  describe('Connection Management', () => {
    it('should establish a connection with a dApp', async () => {
      const dAppIdentifier = 'com.example.testapp';
      
      const session = await mwaService.connect(dAppIdentifier);
      
      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.dAppIdentifier).toBe(dAppIdentifier);
      expect(session.connectionState).toBe('connected');
      expect(session.permissions).toEqual([]);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(session.authorizedPublicKey).toBeUndefined();
    });

    it('should reject connection with invalid dApp identifier', async () => {
      await expect(mwaService.connect('')).rejects.toThrow('Invalid dApp identifier provided');
      await expect(mwaService.connect('   ')).rejects.toThrow('Invalid dApp identifier provided');
    });

    it('should generate unique session IDs for multiple connections', async () => {
      const session1 = await mwaService.connect('com.example.app1');
      const session2 = await mwaService.connect('com.example.app2');
      
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('should track active sessions', async () => {
      const session1 = await mwaService.connect('com.example.app1');
      const session2 = await mwaService.connect('com.example.app2');
      
      const activeSessions = await mwaService.getActiveSessions();
      
      expect(activeSessions).toHaveLength(2);
      expect(activeSessions.map(s => s.sessionId)).toContain(session1.sessionId);
      expect(activeSessions.map(s => s.sessionId)).toContain(session2.sessionId);
    });

    it('should retrieve specific session by ID', async () => {
      const session = await mwaService.connect('com.example.testapp');
      
      const retrievedSession = await mwaService.getSession(session.sessionId);
      
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession!.sessionId).toBe(session.sessionId);
      expect(retrievedSession!.dAppIdentifier).toBe('com.example.testapp');
    });

    it('should return null for non-existent session', async () => {
      const retrievedSession = await mwaService.getSession('non-existent-session');
      
      expect(retrievedSession).toBeNull();
    });

    it('should disconnect a session', async () => {
      const session = await mwaService.connect('com.example.testapp');
      
      await mwaService.disconnect(session);
      
      const activeSessions = await mwaService.getActiveSessions();
      expect(activeSessions).toHaveLength(0);
      
      const retrievedSession = await mwaService.getSession(session.sessionId);
      expect(retrievedSession).toBeNull();
    });

    it('should handle disconnecting non-existent session gracefully', async () => {
      const fakeSession = {
        sessionId: 'fake-session',
        dAppIdentifier: 'com.example.fake',
        connectionState: 'connected' as const,
        permissions: [],
        lastActivity: new Date()
      };
      
      await expect(mwaService.disconnect(fakeSession)).resolves.not.toThrow();
    });
  });

  describe('Authorization Flow', () => {
    let session: any;

    beforeEach(async () => {
      session = await mwaService.connect('com.example.testapp');
      
      // Create a test wallet
      await seedVault.generateWallet(testWalletProfile);
    });

    it('should authorize a session with valid request', async () => {
      const authorizeRequest: AuthorizeRequest = {
        cluster: 'devnet',
        identity: {
          name: 'Test dApp',
          uri: 'https://example.com',
          icon: 'https://example.com/icon.png'
        },
        features: ['solana:signTransaction', 'solana:signMessage']
      };

      const result = await mwaService.authorize(session, authorizeRequest);
      
      expect(result).toBeDefined();
      expect(result.publicKey).toBeInstanceOf(PublicKey);
      expect(result.accountLabel).toBe('Test Wallet');
      expect(result.walletUriBase).toBe('solana-phone-simulator://');
      
      // Check that session was updated
      const updatedSession = await mwaService.getSession(session.sessionId);
      expect(updatedSession!.authorizedPublicKey).toEqual(result.publicKey);
      expect(updatedSession!.authorizedAt).toBeInstanceOf(Date);
      expect(updatedSession!.permissions).toEqual(authorizeRequest.features);
    });

    it('should authorize with minimal request', async () => {
      const authorizeRequest: AuthorizeRequest = {};

      const result = await mwaService.authorize(session, authorizeRequest);
      
      expect(result).toBeDefined();
      expect(result.publicKey).toBeInstanceOf(PublicKey);
    });

    it('should reject authorization for invalid session', async () => {
      const fakeSession = {
        sessionId: 'fake-session',
        dAppIdentifier: 'com.example.fake',
        connectionState: 'connected' as const,
        permissions: [],
        lastActivity: new Date()
      };

      const authorizeRequest: AuthorizeRequest = {};

      await expect(mwaService.authorize(fakeSession, authorizeRequest))
        .rejects.toThrow('Invalid session: session not found');
    });

    it('should reject authorization for disconnected session', async () => {
      await mwaService.disconnect(session);
      session.connectionState = 'disconnected';

      const authorizeRequest: AuthorizeRequest = {};

      await expect(mwaService.authorize(session, authorizeRequest))
        .rejects.toThrow('Invalid session: session not found');
    });

    it('should reject authorization when no wallets available', async () => {
      // Reset seed vault to remove wallets
      await seedVault.reset();
      await seedVault.initialize();
      await seedVault.unlock('test-password');

      const authorizeRequest: AuthorizeRequest = {};

      await expect(mwaService.authorize(session, authorizeRequest))
        .rejects.toThrow('No wallets available for authorization');
    });
  });

  describe('Transaction Signing', () => {
    let session: any;
    let wallet: any;

    beforeEach(async () => {
      session = await mwaService.connect('com.example.testapp');
      
      // Create and authorize a wallet
      wallet = await seedVault.generateWallet(testWalletProfile);
      
      const authorizeRequest: AuthorizeRequest = {
        features: ['solana:signTransaction']
      };
      
      await mwaService.authorize(session, authorizeRequest);
    });

    it('should sign a single transaction', async () => {
      // Get the authorized session to use the correct public key
      const updatedSession = await mwaService.getSession(session.sessionId);
      const authorizedPublicKey = updatedSession!.authorizedPublicKey!;
      
      // Create a test transaction using the authorized public key
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authorizedPublicKey,
          toPubkey: new PublicKey('11111111111111111111111111111112'),
          lamports: LAMPORTS_PER_SOL
        })
      );

      // Set required transaction properties for signing
      transaction.feePayer = authorizedPublicKey;
      transaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

      const results = await mwaService.signTransactions(session, [transaction]);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toBeDefined();
      
      if (results[0].error) {
        throw new Error(`Transaction signing failed: ${results[0].error}`);
      }
      
      expect(results[0].signedTransaction).toBeDefined();
      expect(results[0].signature).toBeDefined();
      expect(results[0].error).toBeUndefined();
    });

    it('should sign multiple transactions', async () => {
      // Get the authorized session to use the correct public key
      const updatedSession = await mwaService.getSession(session.sessionId);
      const authorizedPublicKey = updatedSession!.authorizedPublicKey!;
      
      // Create test transactions
      const transaction1 = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authorizedPublicKey,
          toPubkey: new PublicKey('11111111111111111111111111111112'),
          lamports: LAMPORTS_PER_SOL
        })
      );
      transaction1.feePayer = authorizedPublicKey;
      transaction1.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

      const transaction2 = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: authorizedPublicKey,
          toPubkey: new PublicKey('11111111111111111111111111111113'),
          lamports: LAMPORTS_PER_SOL / 2
        })
      );
      transaction2.feePayer = authorizedPublicKey;
      transaction2.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

      const results = await mwaService.signTransactions(session, [transaction1, transaction2]);
      
      expect(results).toHaveLength(2);
      
      if (results[0].error) {
        throw new Error(`Transaction 1 signing failed: ${results[0].error}`);
      }
      if (results[1].error) {
        throw new Error(`Transaction 2 signing failed: ${results[1].error}`);
      }
      
      expect(results[0].signedTransaction).toBeDefined();
      expect(results[0].signature).toBeDefined();
      expect(results[1].signedTransaction).toBeDefined();
      expect(results[1].signature).toBeDefined();
    });

    it('should reject signing for unauthorized session', async () => {
      const unauthorizedSession = await mwaService.connect('com.example.unauthorized');
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey('11111111111111111111111111111112'),
          lamports: LAMPORTS_PER_SOL
        })
      );
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

      await expect(mwaService.signTransactions(unauthorizedSession, [transaction]))
        .rejects.toThrow('Session not authorized');
    });

    it('should reject signing for invalid session', async () => {
      const fakeSession = {
        sessionId: 'fake-session',
        dAppIdentifier: 'com.example.fake',
        connectionState: 'connected' as const,
        permissions: [],
        lastActivity: new Date(),
        authorizedPublicKey: wallet.publicKey
      };

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey('11111111111111111111111111111112'),
          lamports: LAMPORTS_PER_SOL
        })
      );
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = 'EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N';

      await expect(mwaService.signTransactions(fakeSession, [transaction]))
        .rejects.toThrow('Invalid session: session not found');
    });

    it('should reject signing with empty transaction array', async () => {
      await expect(mwaService.signTransactions(session, []))
        .rejects.toThrow('No transactions provided');
    });

    it('should handle signing errors gracefully', async () => {
      // Create an invalid transaction that will cause signing to fail
      const invalidTransaction = new Transaction();
      // Don't add any instructions or required properties

      const results = await mwaService.signTransactions(session, [invalidTransaction]);
      
      expect(results).toHaveLength(1);
      expect(results[0].error).toBeDefined();
      expect(results[0].signedTransaction).toBeUndefined();
    });
  });

  describe('Message Signing', () => {
    let session: any;

    beforeEach(async () => {
      session = await mwaService.connect('com.example.testapp');
      
      // Create and authorize a wallet
      await seedVault.generateWallet(testWalletProfile);
      
      const authorizeRequest: AuthorizeRequest = {
        features: ['solana:signMessage']
      };
      
      await mwaService.authorize(session, authorizeRequest);
    });

    it('should sign a single message', async () => {
      const message = new TextEncoder().encode('Hello, Solana!');

      const results = await mwaService.signMessages(session, [message]);
      
      expect(results).toHaveLength(1);
      
      if (results[0].error) {
        throw new Error(`Message signing failed: ${results[0].error}`);
      }
      
      expect(results[0].signature).toBeDefined();
      expect(results[0].error).toBeUndefined();
    });

    it('should sign multiple messages', async () => {
      const message1 = new TextEncoder().encode('Hello, Solana!');
      const message2 = new TextEncoder().encode('Goodbye, Solana!');

      const results = await mwaService.signMessages(session, [message1, message2]);
      
      expect(results).toHaveLength(2);
      
      if (results[0].error) {
        throw new Error(`Message 1 signing failed: ${results[0].error}`);
      }
      if (results[1].error) {
        throw new Error(`Message 2 signing failed: ${results[1].error}`);
      }
      
      expect(results[0].signature).toBeDefined();
      expect(results[1].signature).toBeDefined();
    });

    it('should reject signing for unauthorized session', async () => {
      const unauthorizedSession = await mwaService.connect('com.example.unauthorized');
      const message = new TextEncoder().encode('Hello, Solana!');

      await expect(mwaService.signMessages(unauthorizedSession, [message]))
        .rejects.toThrow('Session not authorized');
    });

    it('should reject signing with empty message array', async () => {
      await expect(mwaService.signMessages(session, []))
        .rejects.toThrow('No messages provided');
    });
  });

  describe('Event Emission', () => {
    it('should emit sessionConnected event on connection', async () => {
      const eventPromise = new Promise((resolve) => {
        mwaService.once('sessionConnected', resolve);
      });

      const session = await mwaService.connect('com.example.testapp');
      
      const event = await eventPromise;
      expect(event).toEqual({
        sessionId: session.sessionId,
        dAppIdentifier: 'com.example.testapp'
      });
    });

    it('should emit sessionDisconnected event on disconnection', async () => {
      const session = await mwaService.connect('com.example.testapp');
      
      const eventPromise = new Promise((resolve) => {
        mwaService.once('sessionDisconnected', resolve);
      });

      await mwaService.disconnect(session);
      
      const event = await eventPromise;
      expect(event).toEqual({
        sessionId: session.sessionId,
        dAppIdentifier: 'com.example.testapp'
      });
    });

    it('should emit sessionAuthorized event on authorization', async () => {
      const session = await mwaService.connect('com.example.testapp');
      await seedVault.generateWallet(testWalletProfile);
      
      const eventPromise = new Promise((resolve) => {
        mwaService.once('sessionAuthorized', resolve);
      });

      const result = await mwaService.authorize(session, {});
      
      const event = await eventPromise;
      expect(event).toMatchObject({
        sessionId: session.sessionId,
        dAppIdentifier: 'com.example.testapp',
        publicKey: result.publicKey.toBase58()
      });
    });


  });

  describe('Session Management', () => {
    it('should update session activity on operations', async () => {
      const session = await mwaService.connect('com.example.testapp');
      const initialActivity = session.lastActivity;
      
      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await seedVault.generateWallet(testWalletProfile);
      await mwaService.authorize(session, {});
      
      const updatedSession = await mwaService.getSession(session.sessionId);
      expect(updatedSession!.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });

    it('should handle multiple concurrent sessions', async () => {
      const session1 = await mwaService.connect('com.example.app1');
      const session2 = await mwaService.connect('com.example.app2');
      const session3 = await mwaService.connect('com.example.app3');
      
      const activeSessions = await mwaService.getActiveSessions();
      expect(activeSessions).toHaveLength(3);
      
      // Disconnect one session
      await mwaService.disconnect(session2);
      
      const remainingSessions = await mwaService.getActiveSessions();
      expect(remainingSessions).toHaveLength(2);
      expect(remainingSessions.map(s => s.sessionId)).toContain(session1.sessionId);
      expect(remainingSessions.map(s => s.sessionId)).toContain(session3.sessionId);
      expect(remainingSessions.map(s => s.sessionId)).not.toContain(session2.sessionId);
    });
  });
});