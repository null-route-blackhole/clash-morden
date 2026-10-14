import { execSync } from "node:child_process";
import path from "node:path";

import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  select,
  spinner,
} from "@clack/prompts";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from "node-fetch";
import pc from "picocolors";

import { buildService } from "./build-service";
import {
  getClashVergeSelfServiceVersion,
  getExeSuffix,
  getPlatform,
  getRustHost,
  getTarget,
  RESOURCE_DIR,
  resourcePath,
  TEMP_DIR,
} from "./utils";

type Channel = "stable" | "alpha";
type TaskReporter = (message: string, progress?: number) => void;
type FetchOptions = Record<string, unknown> & { timeout?: number };
type ResourceInfo = {
  file: string;
  downloadURL?: string;
  localPath?: string;
};
type Task = {
  name: string;
  func: (report: TaskReporter) => Promise<void>;
  retry: number;
  targetPath?: string;
  winOnly?: boolean;
  macOnly?: boolean;
};
type DownloadRecord = {
  file: string;
  url: string;
  path: string;
  size: number;
  elapsed: number;
  speed: number;
};
type ExtractRecord = {
  archive: string;
  target: string;
};
type ResourceTaskConfig = ResourceInfo & {
  name: string;
  label: string;
  winOnly?: boolean;
  macOnly?: boolean;
};

const cwd = process.cwd();
const rawArgvs = process.argv;
const NO_CONFIRM = rawArgvs.includes("--no-confirm");
let force = rawArgvs.includes("--force");
const IS_ALPHA_VERSION = rawArgvs.includes("--alpha");
const RUN_ON_GITHUB_ACTIONS = !!process.env.GITHUB_TOKEN;

const platform = getPlatform(rawArgvs);
const sidecarHost = getTarget(rawArgvs) ?? getRustHost();
const exeSuffix = getExeSuffix(rawArgvs);

function handleCancel<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value)) {
    cancel("Operation cancelled");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

function formatResourcePath(filePath: string) {
  return path.relative(cwd, filePath) || filePath;
}

function getFetchOptions(): FetchOptions {
  const httpProxy =
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy;
  const options: FetchOptions = httpProxy
    ? { agent: new HttpsProxyAgent(httpProxy) }
    : {};
  // 私有仓库的 release 资源必须带认证下载（未认证访问返回 404）
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    options.headers = { authorization: `token ${token}` };
  }
  return options;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function isFullWidth(codePoint: number) {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0x303e) ||
    (codePoint >= 0x3041 && codePoint <= 0x33ff) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa000 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  );
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI OSC escape sequence
const ANSI_OSC_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI CSI escape sequence
const ANSI_CSI_PATTERN = /\x1b\[[0-9;?]*[A-Za-z]/g;

function fitOneLine(text: string, width: number) {
  let used = 0;
  let fitted = "";
  const plain = text
    .replace(ANSI_OSC_PATTERN, "")
    .replace(ANSI_CSI_PATTERN, "");
  for (const char of plain) {
    const charWidth = isFullWidth(char.codePointAt(0) ?? 0) ? 2 : 1;
    if (used + charWidth > width) {
      return used + 1 <= width ? `${fitted}…` : fitted;
    }
    fitted += char;
    used += charWidth;
  }
  return fitted;
}

function renderBar(percent: number, width: number) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return `${pc.cyan("█".repeat(filled))}${pc.dim("░".repeat(empty))} ${clamped.toFixed(0).padStart(3)}%`;
}

const downloadedFiles: DownloadRecord[] = [];
const extractedArchives: ExtractRecord[] = [];

function printTaskRecords(
  downloads: DownloadRecord[],
  extracts: ExtractRecord[],
) {
  if (downloads.length === 0 && extracts.length === 0) return;

  const lines: string[] = [];
  downloads.forEach((record, index) => {
    if (index > 0) lines.push("");
    lines.push(pc.bold(pc.green(record.file)));
    lines.push(
      pc.dim(
        `${formatBytes(record.size)} · ${record.elapsed.toFixed(1)}s · ${formatBytes(record.speed)}/s`,
      ),
    );
    if (!extracts.some((extract) => extract.archive === record.file)) {
      lines.push(pc.dim(record.path));
    }
    lines.push(pc.dim(record.url));
  });
  extracts.forEach((record) => {
    if (!downloads.some((download) => download.file === record.archive)) {
      lines.push(pc.bold(pc.green(record.archive)));
    }
    lines.push(pc.cyan(`  → ${record.target}`));
  });

  let title = "Downloaded files";
  if (downloads.length > 0 && extracts.length > 0) {
    title = "Downloaded & extracted";
  } else if (extracts.length > 0) {
    title = "Extracted files";
  }
  note(lines.join("\n"), title);
}


/**
 * fetch with timeout (default timeout: 8000ms)
 */
async function fetchWithTimeout(resource: string, options: FetchOptions = {}) {
  const { timeout = 8000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`fetch error! status: ${response.status}`);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`fetch timeout: ${timeout}ms`, { cause: error });
    } else {
      throw error;
    }
  } finally {
    clearTimeout(id);
  }
}

/**
 * download the file to the resources dir
 */
async function resolveResource(binInfo: ResourceInfo, report: TaskReporter) {
  const { file, downloadURL, localPath } = binInfo;

  try {
    const targetPath = resourcePath(file);
    report(`target path: ${formatResourcePath(targetPath)}`);

    if (!force && (await fs.pathExists(targetPath))) {
      report(`result: skipped existing resource ${file}`);
      return;
    }

    await fs.mkdirp(RESOURCE_DIR);
    if (downloadURL) {
      await downloadFile(downloadURL, targetPath, report);
    }
    if (localPath) {
      report("copying...");
      report(`local path: ${formatResourcePath(localPath)}`);
      report(`copy ${file} to ${formatResourcePath(targetPath)}`);
      await fs.copyFile(localPath, targetPath);
      report(
        `result: copied ${formatResourcePath(localPath)} to ${formatResourcePath(targetPath)}`,
      );
    }
    report(`result: resolved ${file} at ${formatResourcePath(targetPath)}`);
  } catch (err) {
    report(`resolve failed: ${file}`);
    throw err;
  }
}

/**
 * download file and save to `targetPath`
 */
async function downloadFile(
  url: string,
  targetPath: string,
  report: TaskReporter,
) {
  const fileName = path.basename(targetPath);
  const startTime = Date.now();

  const fetchOptions = getFetchOptions();
  const response = await fetchWithTimeout(url, {
    ...fetchOptions,
    method: "GET",
    // 合并认证 headers，避免覆盖 getFetchOptions 注入的 authorization
    headers: {
      ...(fetchOptions.headers ?? {}),
      "Content-Type": "application/octet-stream",
    },
    timeout: 1000 * 60 * 2,
  });
  if (response.status === 404) {
    report(`download failed, file not found: "${url}"`);
    throw new Error(`file not found: ${url}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  const hasContentLength = Number.isFinite(contentLength) && contentLength > 0;
  const chunks: Uint8Array[] = [];
  let downloaded = 0;
  let lastReport = 0;

  const reportProgress = (flush = false) => {
    const now = Date.now();
    if (!flush && now - lastReport < 100) return;
    lastReport = now;
    const elapsed = (now - startTime) / 1000;
    const speed = elapsed > 0 ? downloaded / elapsed : 0;
    const progress = hasContentLength
      ? (downloaded / contentLength) * 100
      : undefined;
    const amount = hasContentLength
      ? `${formatBytes(downloaded)}/${formatBytes(contentLength)}`
      : formatBytes(downloaded);
    report(
      `Downloading ${fileName}  ${amount}  ${formatBytes(speed)}/s`,
      progress,
    );
  };

  reportProgress(true);

  if (response.body) {
    for await (const chunk of response.body) {
      const chunkBuffer = chunk as Uint8Array;
      chunks.push(chunkBuffer);
      downloaded += chunkBuffer.length;
      reportProgress();
    }
  } else {
    const buffer = await response.arrayBuffer();
    chunks.push(new Uint8Array(buffer));
    downloaded = buffer.byteLength;
    reportProgress(true);
  }

  await fs.writeFile(targetPath, Buffer.concat(chunks));

  const elapsed = (Date.now() - startTime) / 1000;
  const speed = elapsed > 0 ? downloaded / elapsed : downloaded;
  report(
    `Downloaded ${fileName} (${formatBytes(downloaded)}, ${formatBytes(speed)}/s)`,
  );
  downloadedFiles.push({
    file: fileName,
    url,
    path: formatResourcePath(targetPath),
    size: downloaded,
    elapsed,
    speed,
  });
}

/**
 * NSIS plugin: `SimpleSC.dll`
 *
 * only for Windows
 */
async function resolvePlugin(report: TaskReporter) {
  report("Resolve NSIS plugin (SimpleSC)");

  const url =
    "https://nsis.sourceforge.io/mediawiki/images/e/ef/NSIS_Simple_Service_Plugin_Unicode_1.30.zip";
  const tempDir = path.join(TEMP_DIR, "SimpleSC");
  const tempZip = path.join(
    tempDir,
    "NSIS_Simple_Service_Plugin_Unicode_1.30.zip",
  );
  const tempDll = path.join(tempDir, "SimpleSC.dll");
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error("APPDATA is required to resolve NSIS plugin");
  }
  const pluginDir = path.join(appData, "Local/NSIS");
  const pluginPath = path.join(pluginDir, "SimpleSC.dll");
  await fs.mkdirp(pluginDir);
  await fs.mkdirp(tempDir);
  report(`download url: ${url}`);
  report(`target path: ${pluginPath}`);
  if (!force && (await fs.pathExists(pluginPath))) {
    report("result: skipped existing NSIS plugin (SimpleSC)");
    return;
  }
  try {
    if (!(await fs.pathExists(tempZip))) {
      await downloadFile(url, tempZip, report);
    } else {
      report(`result: using cached archive ${formatResourcePath(tempZip)}`);
    }
    const zip = new AdmZip(tempZip);
    zip.extractAllTo(tempDir, true);
    report(`result: extracted "SimpleSC" to ${tempDir}`);
    await fs.copyFile(tempDll, pluginPath);
    extractedArchives.push({
      archive: path.basename(tempZip),
      target: pluginPath,
    });
    report(`result: copied "SimpleSC" to ${pluginPath}`);
  } finally {
    await fs.remove(tempDir);
  }
}

/**
 * chmod 755 for ClashMorden Service
 */
async function resolveServicePermission(report: TaskReporter) {
  const serviceExecutable = `clashmorden-service${exeSuffix}`;
  const targetPath = resourcePath(serviceExecutable);
  report("chmod...");
  if (await fs.pathExists(targetPath)) {
    execSync(`chmod 755 ${targetPath}`);
    report(`result: chmod 755 finished for ${formatResourcePath(targetPath)}`);
  } else {
    report("result: service executable not found, chmod skipped");
  }
}

async function downloadClashVergeSelfService(
  channel: Channel,
  report: TaskReporter,
) {
  const serviceVersion = getClashVergeSelfServiceVersion();
  const label = channel === "alpha" ? "Alpha" : `v${serviceVersion}`;
  if (!serviceVersion) {
    throw new Error(
      `Failed to get ClashMorden Service version for ${label}.`,
    );
  }

  const fileName = `clash-verge-self-service-${sidecarHost}${exeSuffix}`;
  const releaseTag =
    channel === "alpha" ? "service-alpha" : `service-v${serviceVersion}`;
  // 服务二进制从自家仓库的 release 拉取（由 Service Alpha Build /
  // Release Service CI 工作流发布）。必须与 App 使用同一 PSK secret
  // 构建，且 SERVICE_EXECUTABLE 名称与本仓库一致，否则服务模式不可用。
  const downloadURL = `https://github.com/ClashMorden/ClashMorden/releases/download/${releaseTag}/${fileName}`;

  report(`Download ClashMorden Service (${label})`);
  await resolveResource(
    { file: `clashmorden-service${exeSuffix}`, downloadURL },
    report,
  );
  await resolveServicePermission(report);
}

async function resolveClashVergeSelfService(
  channel: Channel | undefined,
  report: TaskReporter,
) {
  if (!RUN_ON_GITHUB_ACTIONS) {
    report("Build Service Locally");
    await buildService((message) => report(message));
    return;
  }
  try {
    report(`Download Service (channel: ${channel})`);
    await downloadClashVergeSelfService(channel!, report);
  } catch (err) {
    // release 资源缺失/下载失败时回退本地构建（与 App 同源同 PSK，
    // 仅多花一点编译时间），保证 CI 不被 release 状态阻塞
    report(`Download Service failed (${err}), fallback to local build`);
    await buildService((message) => report(message));
  }
}

const RESOURCE_TASKS: ResourceTaskConfig[] = [
  {
    name: "Copy set_dns.sh",
    label: "Resolve Macos set dns script",
    file: "set_dns.sh",
    localPath: path.join(cwd, "scripts/set_dns.sh"),
    macOnly: true,
  },
  {
    name: "Copy unset_dns.sh",
    label: "Resolve Macos unset dns script",
    file: "unset_dns.sh",
    localPath: path.join(cwd, "scripts/unset_dns.sh"),
    macOnly: true,
  },
  {
    name: "Download Country mmdb",
    label: "Resolve Country mmdb",
    file: "Country.mmdb",
    downloadURL:
      "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb",
  },
  {
    name: "Download geosite",
    label: "Resolve geosite",
    file: "geosite.dat",
    downloadURL:
      "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
  },
  {
    name: "Download geoip",
    label: "Resolve geoip",
    file: "geoip.dat",
    downloadURL:
      "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat",
  },
  {
    name: "Download ASN mmdb",
    label: "Resolve ASN mmdb",
    file: "ASN.mmdb",
    downloadURL:
      "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",
  },
  {
    name: "Download enableLoopback.exe",
    label: "Resolve enableLoopback.exe",
    file: "enableLoopback.exe",
    downloadURL:
      "https://github.com/Kuingsmile/uwp-tool/releases/download/latest/enableLoopback.exe",
    winOnly: true,
  },
];

function createResourceTask({
  name,
  label,
  file,
  downloadURL,
  localPath,
  ...filters
}: ResourceTaskConfig): Task {
  return {
    name,
    ...filters,
    retry: 5,
    targetPath: resourcePath(file),
    func: async (report: TaskReporter) => {
      report(label);
      await resolveResource({ file, downloadURL, localPath }, report);
    },
  };
}

function createTasks(channel: Channel | undefined): Task[] {
  return [
    {
      name: "Resolve ClashMorden Service",
      func: (report: TaskReporter) =>
        resolveClashVergeSelfService(channel, report),
      retry: 5,
      targetPath: resourcePath(`clashmorden-service${exeSuffix}`),
    },
    ...RESOURCE_TASKS.map(createResourceTask),
    {
      name: "Download SimpleSC plugin",
      func: resolvePlugin,
      retry: 5,
      winOnly: true,
      targetPath: process.env.APPDATA
        ? path.join(process.env.APPDATA, "Local/NSIS", "SimpleSC.dll")
        : undefined,
    },
  ];
}

function shouldRunTask(task: Task) {
  if (task.winOnly && platform !== "win32") return false;
  if (task.macOnly && platform !== "darwin") return false;
  return true;
}

async function chooseServiceChannel(): Promise<Channel> {
  if (IS_ALPHA_VERSION) {
    log.info("Use alpha resource version from --alpha");
    return "alpha";
  }

  if (NO_CONFIRM) {
    log.info("Use default stable resource version from --no-confirm");
    return "stable";
  }

  const channel = await select<Channel>({
    message: "Select ClashMorden Service Download Channel",
    options: [
      { value: "stable", label: "Stable" },
      { value: "alpha", label: "Alpha" },
    ],
    initialValue: "stable",
  });

  return handleCancel(channel);
}

async function confirmOverwriteIfNeeded(tasks: Task[]) {
  if (force) return;

  const existingResources = new Set<string>();
  for (const task of tasks) {
    if (!task.targetPath) continue;
    if (await fs.pathExists(task.targetPath)) {
      existingResources.add(formatResourcePath(task.targetPath));
    }
  }

  if (existingResources.size === 0) return;

  log.warn(
    [
      "Existing resources found:",
      ...[...existingResources].map((resource) => `  - ${resource}`),
    ].join("\n"),
  );

  if (NO_CONFIRM) {
    force = true;
    log.info("Use default overwrite confirmation from --no-confirm");
    return;
  }

  force = handleCancel(
    await confirm({
      message: "Force overwrite existing resources?",
      initialValue: true,
    }),
  );
}

async function runTaskWithSpinner(task: Task) {
  const spin = spinner();
  spin.start(task.name);

  const before = downloadedFiles.length;
  const beforeExtract = extractedArchives.length;
  const taskLogs: string[] = [];
  let lastError: unknown;

  const report: TaskReporter = (message, progress) => {
    taskLogs.push(message);
    const columns = process.stdout.columns || 80;
    if (progress === undefined) {
      spin.message(fitOneLine(message, columns - 6));
      return;
    }
    const barWidth = Math.max(8, Math.min(32, columns - message.length - 14));
    spin.message(
      `${fitOneLine(message, columns - barWidth - 13)}  ${renderBar(progress, barWidth)}`,
    );
  };

  for (let attempt = 1; attempt <= task.retry; attempt++) {
    try {
      await task.func(report);
      spin.stop(task.name);

      printTaskRecords(
        downloadedFiles.slice(before),
        extractedArchives.slice(beforeExtract),
      );
      return;
    } catch (err) {
      lastError = err;
      const retryLog = `${task.name}  (attempt ${attempt}/${task.retry}: ${errorMessage(err)})`;
      taskLogs.push(retryLog);
      if (attempt < task.retry) {
        spin.message(fitOneLine(retryLog, (process.stdout.columns || 80) - 6));
        await delay(1000);
      }
    }
  }

  spin.error(task.name);
  if (taskLogs.length > 0) {
    log.message(taskLogs.join("\n"));
  }
  throw lastError;
}

/**
 * main function for run tasks
 */
async function runTask() {
  intro(pc.bgCyan(pc.white(" Check and download files ")));

  let channel: Channel | undefined;
  if (RUN_ON_GITHUB_ACTIONS) {
    channel = await chooseServiceChannel();
  }
  const tasks = createTasks(channel).filter(shouldRunTask);
  await confirmOverwriteIfNeeded(tasks);

  for (const task of tasks) {
    await runTaskWithSpinner(task);
  }

  outro(pc.bgGreen(pc.white(" all tasks has run finished ")));
}

runTask().catch((err) => {
  console.error(err);
  process.exit(1);
});
