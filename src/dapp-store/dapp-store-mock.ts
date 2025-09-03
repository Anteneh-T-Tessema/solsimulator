import { DAppStoreMock, AppMetadata, InstalledApp } from '../interfaces/dapp-store';

/**
 * Implementation of the dApp Store Mock
 * This is a placeholder that will be implemented in subsequent tasks
 */
export class DAppStoreMockImpl implements DAppStoreMock {
  async installApp(_apkPath: string, _metadata: AppMetadata): Promise<InstalledApp> {
    throw new Error('Not implemented yet');
  }

  async uninstallApp(_appId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async launchApp(_appId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async stopApp(_appId: string): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async getInstalledApps(): Promise<InstalledApp[]> {
    throw new Error('Not implemented yet');
  }

  async getApp(_appId: string): Promise<InstalledApp | null> {
    throw new Error('Not implemented yet');
  }

  async updateAppMetadata(_appId: string, _metadata: Partial<AppMetadata>): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async isAppInstalled(_packageName: string): Promise<boolean> {
    throw new Error('Not implemented yet');
  }

  async getAppByPackage(_packageName: string): Promise<InstalledApp | null> {
    throw new Error('Not implemented yet');
  }
}