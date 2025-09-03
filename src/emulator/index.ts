/**
 * Android Emulator Integration Layer
 * 
 * This module provides comprehensive Android emulator management capabilities
 * including SDK integration, ADB communication, and emulator lifecycle management.
 */

export { AndroidSDK, AndroidSDKConfig, AVDConfig, EmulatorLaunchOptions } from './android-sdk';
export { 
  AdbClient, 
  AdbDevice, 
  AdbCommandResult, 
  AdbPackageInfo, 
  AdbLogEntry 
} from './adb-client';
export { 
  EmulatorInstance, 
  EmulatorHealthCheck, 
  EmulatorMetrics 
} from './emulator-instance';