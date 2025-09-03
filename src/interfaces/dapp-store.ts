/**
 * dApp Store Mock Interface
 * Simulates the Solana dApp Store environment for testing app installation and lifecycle
 */

export interface AppMetadata {
  name: string;
  packageName: string;
  version: string;
  description: string;
  category: string;
  permissions: string[];
  icon?: string;
  screenshots?: string[];
  developer?: string;
  website?: string;
}

export interface InstalledApp {
  id: string;
  metadata: AppMetadata;
  apkPath: string;
  installedAt: Date;
  lastLaunched?: Date;
  status: 'installed' | 'running' | 'stopped' | 'uninstalling';
}

export interface DAppStoreMock {
  /**
   * Install an app from an APK file
   */
  installApp(apkPath: string, metadata: AppMetadata): Promise<InstalledApp>;

  /**
   * Uninstall an app by its ID
   */
  uninstallApp(appId: string): Promise<void>;

  /**
   * Launch an installed app
   */
  launchApp(appId: string): Promise<void>;

  /**
   * Stop a running app
   */
  stopApp(appId: string): Promise<void>;

  /**
   * Get all installed apps
   */
  getInstalledApps(): Promise<InstalledApp[]>;

  /**
   * Get a specific app by ID
   */
  getApp(appId: string): Promise<InstalledApp | null>;

  /**
   * Update app metadata
   */
  updateAppMetadata(appId: string, metadata: Partial<AppMetadata>): Promise<void>;

  /**
   * Check if an app is installed
   */
  isAppInstalled(packageName: string): Promise<boolean>;

  /**
   * Get app by package name
   */
  getAppByPackage(packageName: string): Promise<InstalledApp | null>;
}