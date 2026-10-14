import { execSync, spawn } from "node:child_process";
import path from "node:path";

import fs from "fs-extra";

import {
  cratesPath,
  getExeSuffix,
  getTarget,
  RESOURCE_DIR,
  resourcePath,
  SERVICE_CACHE_FILE,
  snapshotFilesHashOnDir,
} from "./utils";

/** 根据当前 Node 进程的平台/架构推导宿主 Rust target 三元组 */
function detectHostTriple(): string | null {
  const { arch, platform } = process;
  if (platform === "win32") {
    if (arch === "x64") return "x86_64-pc-windows-msvc";
    if (arch === "ia32") return "i686-pc-windows-msvc";
    if (arch === "arm64") return "aarch64-pc-windows-msvc";
    return null;
  }
  if (platform === "darwin") {
    return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  if (platform === "linux") {
    if (arch === "x64") return "x86_64-unknown-linux-gnu";
    if (arch === "arm64") return "aarch64-unknown-linux-gnu";
    if (arch === "arm") return "armv7-unknown-linux-gnueabihf";
    if (arch === "ia32") return "i686-unknown-linux-gnu";
    return null;
  }
  return null;
}

export async function buildService(logger?: (message: string) => void) {
  const argv = process.argv;
  const packageName = "clash-verge-self-service";

  const target = getTarget(argv);

  // Linux 交叉目标（如 ubuntu x86_64 runner 上构建 aarch64）必须走 cross
  // （Docker 工具链）；宿主本机目标仍直接用 cargo。
  const hostTriple = detectHostTriple();
  const crossTargets = [
    "i686-unknown-linux-gnu",
    "aarch64-unknown-linux-gnu",
    "armv7-unknown-linux-gnueabihf",
  ];
  const useCrossBuild =
    !!target && target !== hostTriple && crossTargets.includes(target);
  const command = useCrossBuild ? "cross" : "cargo";
  const args = [
    "build",
    "--release",
    "--package",
    packageName,
    "--color",
    "always",
  ];
  if (target) {
    args.push("--target", target);
  }
  if (logger) {
    logger(`command: ${command} ${args}`);
  } else {
    console.log(`command:`, command, args);
  }
  // note(`use [${command}] to build service`);

  const buildTask = new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), shell: false });
    child.stdout.on("data", (data: Buffer) => {
      if (logger) {
        logger(data.toString().trimEnd());
      } else {
        console.log(data.toString().trimEnd());
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      if (logger) {
        logger(data.toString().trimEnd());
      } else {
        console.error(data.toString().trimEnd());
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(null);
      } else {
        reject(new Error(`子进程退出，退出码 ${code}`));
      }
    });
  });

  await buildTask;

  if (!fs.pathExistsSync(RESOURCE_DIR)) {
    await fs.mkdirp(RESOURCE_DIR);
  }
  const exeSuffix = getExeSuffix(argv);
  let bundleFilePath = `target/release/${packageName}${exeSuffix}`;
  if (target) {
    bundleFilePath = `target/${target}/release/${packageName}${exeSuffix}`;
  }
  const serviceResPath = resourcePath(`clashmorden-service${exeSuffix}`);
  await fs.copyFile(bundleFilePath, serviceResPath);
  if (exeSuffix !== ".exe") {
    execSync(`chmod 755 ${serviceResPath}`);
  }
}

if (import.meta.main) {
  buildService().then(() => {
    const serviceDir = cratesPath("clash-verge-self-service");
    const snapshot = snapshotFilesHashOnDir(serviceDir);
    try {
      fs.mkdirpSync(path.dirname(SERVICE_CACHE_FILE));
      fs.writeJsonSync(SERVICE_CACHE_FILE, snapshot, { spaces: 2 });
    } catch (err) {
      console.error(err);
      // cache write failure should not hide successful build, but notify user
      process.exit(1);
    }
  });
}
