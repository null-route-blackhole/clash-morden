import { Channel, invoke } from "@tauri-apps/api/core";
import { Update } from "@tauri-apps/plugin-updater";
import type { RuleBehavior, RuleFormat } from "tauri-plugin-mihomo-api";

import type { LogMessage } from "@/components/profile/profile-more";
import { OS } from "@/utils/get-system";

export const writeAppDiagnostic = (message: string) =>
  invoke<void>("write_app_diagnostic", { message });

export interface MergeResult {
  config: string;
  logs: Record<string, LogMessage[]>;
}

export interface IUpdateMetadata {
  rid: number;
  currentVersion: string;
  version: string;
  date?: string;
  body?: string;
  rawJson: Record<string, unknown>;
}

export async function checkUpdate() {
  const metadata = await invoke<IUpdateMetadata | null>("check_update");
  return metadata ? new Update(metadata) : null;
}

export type UpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export type UpdateDownloadResult =
  | { status: "done" }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

export async function downloadUpdate(
  rid: number,
  onEvent: (event: UpdateDownloadEvent) => void,
) {
  const channel = new Channel<UpdateDownloadEvent>();
  channel.onmessage = onEvent;
  return invoke<UpdateDownloadResult>("download_update", {
    rid,
    onEvent: channel,
  });
}

export async function cancelUpdateDownload() {
  return invoke<void>("cancel_update_download");
}

export async function getDefaultUpdateChannel() {
  return invoke<string>("get_default_update_channel");
}

export async function getProfiles() {
  return invoke<IProfilesConfig>("get_profiles");
}

export async function getProfile(uid: string) {
  return invoke<IProfileItem>("get_profile", { uid });
}

export async function getChains(profileUid: string | null) {
  return invoke<IProfileItem[]>("get_chains", { profileUid });
}

export async function getTemplate(scope: string, language: string) {
  return invoke<string>("get_template", { scope, language });
}

export async function getDefaultBypass() {
  return invoke<string>("get_default_bypass");
}

export async function enhanceProfiles() {
  return invoke<void>("enhance_profiles");
}

export async function patchProfilesConfig(profiles: IProfilesConfig) {
  return invoke<void>("patch_profiles_config", { profiles });
}

export async function createProfile(
  item: Partial<IProfileItem>,
  fileData?: string | null,
) {
  return invoke<void>("create_profile", { item, fileData });
}

export async function viewProfile(index: string) {
  return invoke<void>("view_profile", { index });
}

export async function readProfileFile(index: string) {
  return invoke<string>("read_profile_file", { index });
}

export async function getRuleProviderPayload(
  providerName: string,
  behavior: RuleBehavior,
  format: RuleFormat,
) {
  return invoke<RulePayload>("get_rule_provider_payload", {
    providerName,
    behavior,
    format,
  });
}

export async function saveProfileFile(uid: string, fileData: string) {
  return invoke<void>("save_profile_file", { uid, fileData });
}

export async function importProfile(url: string) {
  return invoke<void>("import_profile", {
    url,
    option: { with_proxy: true },
  });
}

export async function reorderProfile(activeId: string, overId: string) {
  return invoke<void>("reorder_profile", {
    activeId,
    overId,
  });
}

export async function updateProfile(uid: string, option?: IProfileOption) {
  return invoke<void>("update_profile", { uid, option });
}

export async function deleteProfile(uid: string) {
  return invoke<void>("delete_profile", { uid });
}

export async function batchDeleteProfiles(uids: string[]) {
  return invoke<void>("batch_delete_profiles", { uids });
}

export async function batchToggleChainsEnable(uids: string[], enable: boolean) {
  return invoke<void>("batch_toggle_chains_enable", { uids, enable });
}

export async function patchProfile(
  uid: string,
  profile: Partial<IProfileItem>,
) {
  return invoke<void>("patch_profile", { uid, profile });
}

export async function getClashInfo() {
  return invoke<IClashInfo | null>("get_clash_info");
}

export async function getDnsSettings() {
  return invoke<{
    saved: Record<string, unknown>;
    effective: Record<string, unknown>;
    hosts: Record<string, string | string[]> | null;
  }>("get_dns_settings");
}

export async function saveDnsSettings(
  patch: {
    "use-hosts": boolean | null;
    "use-system-hosts": boolean | null;
    enable: boolean | null;
    ipv6: boolean | null;
    listen: string | null;
    "enhanced-mode": "fake-ip" | "redir-host" | null;
    "respect-rules": boolean | null;
    "prefer-h3": boolean | null;
    "direct-nameserver-follow-policy": boolean | null;
    "nameserver-policy": Record<string, string | string[]> | null;
    "fallback-filter": {
      geoip?: boolean;
      "geoip-code"?: string;
      ipcidr?: string[];
      domain?: string[];
      geosite?: string[];
    } | null;
    "fake-ip-range": string | null;
    "fake-ip-range6": string | null;
    "fake-ip-filter-mode": "blacklist" | "whitelist" | null;
    "fake-ip-filter": string[] | null;
    "default-nameserver": string[] | null;
    nameserver: string[] | null;
    fallback: string[] | null;
    "proxy-server-nameserver": string[] | null;
    "direct-nameserver": string[] | null;
  },
  hosts: Record<string, string | string[]> | null,
) {
  return invoke<void>("save_dns_settings", { patch, hosts });
}

// Get runtime config which controlled by verge
export async function getRuntimeConfig() {
  return invoke<IConfigData | null>("get_runtime_config");
}

export async function getRuntimeYaml() {
  return invoke<string | null>("get_runtime_yaml");
}

export async function getRuntimeExists() {
  return invoke<string[]>("get_runtime_exists");
}

export async function getRuntimeLogs() {
  return await invoke<Record<string, LogMessage[]>>("get_runtime_logs");
}

export async function getPreMergeResult(
  profileUid: string | null,
  modifiedUid: string,
) {
  return await invoke<MergeResult>("get_pre_merge_result", {
    profileUid,
    modifiedUid,
  });
}

export async function testMergeChain(
  profileUid: string | null,
  modifiedUid: string,
  content: string,
) {
  return await invoke<MergeResult>("test_merge_chain", {
    profileUid,
    modifiedUid,
    content,
  });
}

export async function patchClashConfig(payload: Partial<IConfigData>) {
  return invoke<void>("patch_clash_config", { payload });
}

export async function checkPortAvailable(port: number) {
  return invoke<boolean>("check_port_available", { port });
}

export async function getVergeConfig() {
  const verge = await invoke<IVergeConfig>("get_verge_config");
  if (OS === "windows") {
    verge.bypass = verge.windows_bypass;
  } else if (OS === "macos") {
    verge.bypass = verge.macos_bypass;
  } else if (OS === "linux") {
    verge.bypass = verge.linux_bypass;
  }
  return verge;
}

export async function patchVergeConfig(payload: Partial<IVergeConfig>) {
  return invoke<void>("patch_verge_config", { payload });
}

export async function dispatchHotkeyAction(func: string) {
  return invoke<void>("dispatch_hotkey_action", { func });
}

export async function getSystemProxy() {
  return invoke<SysProxy>("get_sys_proxy");
}

export async function getAutotemProxy() {
  return invoke<AutoProxy>("get_auto_proxy");
}

export async function changeClashCore(clashCore: string) {
  return invoke<void>("change_clash_core", { clashCore });
}

export async function restartSidecar() {
  return invoke<void>("restart_sidecar");
}

export async function setCoreRunning(enabled: boolean) {
  return invoke<void>("set_core_running", { enabled });
}

export async function grantPermissions(core: string) {
  return invoke<void>("grant_permissions", { core });
}

export async function checkPermissionsGranted(core: string) {
  return invoke<boolean>("check_permissions_granted", { core });
}

export async function refreshPermissionsGranted() {
  return invoke<void>("refresh_permissions_granted");
}

export async function getAppDir() {
  return invoke<string>("get_app_dir");
}

export async function getDefaultBackupDir() {
  return invoke<string>("get_default_backup_dir");
}

export async function openAppDir() {
  return invoke<void>("open_app_dir");
}

export async function openCoreDir() {
  return invoke<void>("open_core_dir");
}

export async function openLogsDir() {
  return invoke<void>("open_logs_dir");
}

export async function openWebUrl(url: string) {
  return invoke<void>("open_web_url", { url });
}

export async function cmdTestDelay(url: string) {
  return invoke<number>("test_delay", { url });
}

/// service mode
export async function checkService() {
  try {
    const result = await invoke<Record<string, unknown>>("check_service");
    if (result?.code === 0) return "active";
    if (result?.code === 400) return "installed";
    return "unknown";
  } catch (err: unknown) {
    console.error(err);
    return "uninstall";
  }
}

export async function installService() {
  return invoke<void>("install_service");
}

export async function uninstallService() {
  return invoke<void>("uninstall_service");
}

export async function invoke_uwp_tool() {
  return invoke<void>("invoke_uwp_tool");
}

export async function isPortableVersion() {
  return invoke<boolean>("is_portable_version");
}

export async function openDevTools() {
  return invoke("open_devtools");
}

export async function getCountryMmdbBytes() {
  return invoke<number[]>("read_country_mmdb");
}

export async function getSystemInfo() {
  return invoke<ISystemInfo>("get_system_info");
}

export async function getNetInfo() {
  return invoke<NetInfo[]>("get_net_info");
}

export async function restartApp() {
  return invoke("restart_app");
}

export async function exitApp() {
  return invoke("exit_app");
}

export async function copyIconFile(
  path: string,
  name: "common" | "sysproxy" | "tun",
) {
  return invoke<void>("copy_icon_file", { path, name });
}

export async function copyClashEnv() {
  return invoke("copy_clash_env");
}

export async function downloadIconCache(url: string, name: string) {
  return invoke<string>("download_icon_cache", { url, name });
}

// web dav
export async function updateWebDavInfo(
  url: string,
  username: string,
  password: string,
) {
  return invoke<void>("update_webdav_info", { url, username, password });
}

export type BackupType = "local" | "webdav";

export async function createBackup(
  backupType: BackupType,
  onlyBackupProfiles = false,
) {
  return invoke<string[]>("create_backup", { backupType, onlyBackupProfiles });
}

export async function listBackup(backupType: BackupType) {
  return invoke<IBackupFile[]>("list_backup", { backupType });
}

export async function applyBackupAndReload(
  backupType: BackupType,
  fileName: string,
) {
  return invoke<void>("apply_backup_and_reload", { backupType, fileName });
}

export async function deleteBackup(backupType: BackupType, fileName: string) {
  return invoke<void>("delete_backup", { backupType, fileName });
}

export async function isWayland() {
  if (OS !== "linux") return false;
  return invoke<boolean>("is_wayland");
}

// mihomo version 库对应类型
export type MihomoVersion = {
  semver?: string;
  tag: string;
  prerelease: boolean;
  channel: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  assets: MihomoAsset[];
};

export type MihomoAsset = {
  name: string;
  platform: string;
  format: string;
  size?: number;
  sha256?: string;
  created_at?: string;
  updated_at?: string;
  url: string;
};

export type InstalledMihomoCore = {
  core: "self-mihomo" | "self-mihomo-alpha" | "self-mihomo-smart";
  output: string;
};

export async function getMihomoCoreVersions() {
  return invoke<InstalledMihomoCore[]>("get_mihomo_core_versions");
}

export async function getMihomoVersions() {
  return invoke<MihomoVersion[]>("get_mihomo_versions");
}

export async function installMihomoVersion(tag: string, asset: string) {
  return invoke<void>("install_mihomo_version", { tag, asset });
}

export async function installMihomoDownload(asset: string, slot: string) {
  return invoke<void>("install_mihomo_download", { asset, slot });
}

export async function cancelMihomoDownload(asset: string) {
  return invoke<void>("cancel_mihomo_download", { asset });
}

export async function listMihomoDownloads() {
  return invoke<string[]>("list_mihomo_downloads");
}

export async function deleteMihomoDownload(asset: string) {
  return invoke<void>("delete_mihomo_download", { asset });
}

export async function deleteMihomoIndexCache() {
  return invoke<void>("delete_mihomo_index_cache");
}

export interface KernelSettings {
  saved: Record<string, unknown>;
  effective: Record<string, unknown>;
}
export const getKernelSettings = () =>
  invoke<KernelSettings>("get_kernel_settings");
export const saveKernelSettings = (patch: Record<string, unknown>) =>
  invoke<void>("save_kernel_settings", { patch });
export const syncSmartModel = (url: string) =>
  invoke<void>("sync_smart_model", { url });

export const downloadPluginScript = (url: string, option?: IProfileOption) =>
  invoke<string>("download_plugin_script", { url, option });
