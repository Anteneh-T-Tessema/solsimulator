/**
 * Basic tests to verify interface definitions are properly exported
 */

import {
  WalletProfile,
  NetworkType
} from '../index';

describe('Interface Exports', () => {
  test('should export and use common types', () => {
    // Test that we can create objects with the expected types
    const networkType: NetworkType = 'devnet';
    expect(networkType).toBe('devnet');

    const walletProfile: WalletProfile = {
      name: 'test-wallet',
      derivationPath: "m/44'/501'/0'/0'",
      network: 'devnet'
    };
    expect(walletProfile.name).toBe('test-wallet');
    expect(walletProfile.network).toBe('devnet');
    expect(walletProfile.derivationPath).toBe("m/44'/501'/0'/0'");
  });

  test('should support all network types', () => {
    const networks: NetworkType[] = ['mainnet', 'devnet', 'testnet', 'localhost'];
    
    networks.forEach(network => {
      const profile: WalletProfile = {
        name: `test-${network}`,
        derivationPath: "m/44'/501'/0'/0'",
        network
      };
      expect(profile.network).toBe(network);
    });
  });
});