// Generated from official @zvec/zvec-grep@0.2.1; Apache-2.0.
// Rebuild: node plugins/dsh-designer/build-zg-runtime.mjs --offline
// Provenance: zg-provenance.json; optional heavy providers explicitly disabled.
import {createRequire as __zgNativeCreateRequire} from "node:module";
const require = __zgNativeCreateRequire(import.meta.url);
const __zgZvecDirname = require("node:url").fileURLToPath(new URL("./zg-zvec-0.7.0/src/", import.meta.url));
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../detect-libc-2.1.2/source/lib/process.js
var require_process = __commonJS({
  "../detect-libc-2.1.2/source/lib/process.js"(exports, module) {
    "use strict";
    var isLinux = () => process.platform === "linux";
    var report = null;
    var getReport = () => {
      if (!report) {
        if (isLinux() && process.report) {
          const orig = process.report.excludeNetwork;
          process.report.excludeNetwork = true;
          report = process.report.getReport();
          process.report.excludeNetwork = orig;
        } else {
          report = {};
        }
      }
      return report;
    };
    module.exports = { isLinux, getReport };
  }
});

// ../detect-libc-2.1.2/source/lib/filesystem.js
var require_filesystem = __commonJS({
  "../detect-libc-2.1.2/source/lib/filesystem.js"(exports, module) {
    "use strict";
    var fs = __require("node:fs");
    var LDD_PATH = "/usr/bin/ldd";
    var SELF_PATH = "/proc/self/exe";
    var MAX_LENGTH = 2048;
    var readFileSync6 = (path) => {
      const fd = fs.openSync(path, "r");
      const buffer = Buffer.alloc(MAX_LENGTH);
      const bytesRead = fs.readSync(fd, buffer, 0, MAX_LENGTH, 0);
      fs.close(fd, () => {
      });
      return buffer.subarray(0, bytesRead);
    };
    var readFile7 = (path) => new Promise((resolve9, reject) => {
      fs.open(path, "r", (err, fd) => {
        if (err) {
          reject(err);
        } else {
          const buffer = Buffer.alloc(MAX_LENGTH);
          fs.read(fd, buffer, 0, MAX_LENGTH, 0, (_, bytesRead) => {
            resolve9(buffer.subarray(0, bytesRead));
            fs.close(fd, () => {
            });
          });
        }
      });
    });
    module.exports = {
      LDD_PATH,
      SELF_PATH,
      readFileSync: readFileSync6,
      readFile: readFile7
    };
  }
});

// ../detect-libc-2.1.2/source/lib/elf.js
var require_elf = __commonJS({
  "../detect-libc-2.1.2/source/lib/elf.js"(exports, module) {
    "use strict";
    var interpreterPath = (elf) => {
      if (elf.length < 64) {
        return null;
      }
      if (elf.readUInt32BE(0) !== 2135247942) {
        return null;
      }
      if (elf.readUInt8(4) !== 2) {
        return null;
      }
      if (elf.readUInt8(5) !== 1) {
        return null;
      }
      const offset = elf.readUInt32LE(32);
      const size = elf.readUInt16LE(54);
      const count = elf.readUInt16LE(56);
      for (let i = 0; i < count; i++) {
        const headerOffset = offset + i * size;
        const type = elf.readUInt32LE(headerOffset);
        if (type === 3) {
          const fileOffset = elf.readUInt32LE(headerOffset + 8);
          const fileSize = elf.readUInt32LE(headerOffset + 32);
          return elf.subarray(fileOffset, fileOffset + fileSize).toString().replace(/\0.*$/g, "");
        }
      }
      return null;
    };
    module.exports = {
      interpreterPath
    };
  }
});

// ../detect-libc-2.1.2/source/lib/detect-libc.js
var require_detect_libc = __commonJS({
  "../detect-libc-2.1.2/source/lib/detect-libc.js"(exports, module) {
    "use strict";
    var childProcess = __require("node:child_process");
    var { isLinux, getReport } = require_process();
    var { LDD_PATH, SELF_PATH, readFile: readFile7, readFileSync: readFileSync6 } = require_filesystem();
    var { interpreterPath } = require_elf();
    var cachedFamilyInterpreter;
    var cachedFamilyFilesystem;
    var cachedVersionFilesystem;
    var command = "getconf GNU_LIBC_VERSION 2>&1 || true; ldd --version 2>&1 || true";
    var commandOut = "";
    var safeCommand = () => {
      if (!commandOut) {
        return new Promise((resolve9) => {
          childProcess.exec(command, (err, out) => {
            commandOut = err ? " " : out;
            resolve9(commandOut);
          });
        });
      }
      return commandOut;
    };
    var safeCommandSync = () => {
      if (!commandOut) {
        try {
          commandOut = childProcess.execSync(command, { encoding: "utf8" });
        } catch (_err) {
          commandOut = " ";
        }
      }
      return commandOut;
    };
    var GLIBC = "glibc";
    var RE_GLIBC_VERSION = /LIBC[a-z0-9 \-).]*?(\d+\.\d+)/i;
    var MUSL = "musl";
    var isFileMusl = (f) => f.includes("libc.musl-") || f.includes("ld-musl-");
    var familyFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return GLIBC;
      }
      if (Array.isArray(report.sharedObjects)) {
        if (report.sharedObjects.some(isFileMusl)) {
          return MUSL;
        }
      }
      return null;
    };
    var familyFromCommand = (out) => {
      const [getconf, ldd1] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return GLIBC;
      }
      if (ldd1 && ldd1.includes(MUSL)) {
        return MUSL;
      }
      return null;
    };
    var familyFromInterpreterPath = (path) => {
      if (path) {
        if (path.includes("/ld-musl-")) {
          return MUSL;
        } else if (path.includes("/ld-linux-")) {
          return GLIBC;
        }
      }
      return null;
    };
    var getFamilyFromLddContent = (content) => {
      content = content.toString();
      if (content.includes("musl")) {
        return MUSL;
      }
      if (content.includes("GNU C Library")) {
        return GLIBC;
      }
      return null;
    };
    var familyFromFilesystem = async () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = await readFile7(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromFilesystemSync = () => {
      if (cachedFamilyFilesystem !== void 0) {
        return cachedFamilyFilesystem;
      }
      cachedFamilyFilesystem = null;
      try {
        const lddContent = readFileSync6(LDD_PATH);
        cachedFamilyFilesystem = getFamilyFromLddContent(lddContent);
      } catch (e) {
      }
      return cachedFamilyFilesystem;
    };
    var familyFromInterpreter = async () => {
      if (cachedFamilyInterpreter !== void 0) {
        return cachedFamilyInterpreter;
      }
      cachedFamilyInterpreter = null;
      try {
        const selfContent = await readFile7(SELF_PATH);
        const path = interpreterPath(selfContent);
        cachedFamilyInterpreter = familyFromInterpreterPath(path);
      } catch (e) {
      }
      return cachedFamilyInterpreter;
    };
    var familyFromInterpreterSync = () => {
      if (cachedFamilyInterpreter !== void 0) {
        return cachedFamilyInterpreter;
      }
      cachedFamilyInterpreter = null;
      try {
        const selfContent = readFileSync6(SELF_PATH);
        const path = interpreterPath(selfContent);
        cachedFamilyInterpreter = familyFromInterpreterPath(path);
      } catch (e) {
      }
      return cachedFamilyInterpreter;
    };
    var family = async () => {
      let family2 = null;
      if (isLinux()) {
        family2 = await familyFromInterpreter();
        if (!family2) {
          family2 = await familyFromFilesystem();
          if (!family2) {
            family2 = familyFromReport();
          }
          if (!family2) {
            const out = await safeCommand();
            family2 = familyFromCommand(out);
          }
        }
      }
      return family2;
    };
    var familySync = () => {
      let family2 = null;
      if (isLinux()) {
        family2 = familyFromInterpreterSync();
        if (!family2) {
          family2 = familyFromFilesystemSync();
          if (!family2) {
            family2 = familyFromReport();
          }
          if (!family2) {
            const out = safeCommandSync();
            family2 = familyFromCommand(out);
          }
        }
      }
      return family2;
    };
    var isNonGlibcLinux = async () => isLinux() && await family() !== GLIBC;
    var isNonGlibcLinuxSync = () => isLinux() && familySync() !== GLIBC;
    var versionFromFilesystem = async () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = await readFile7(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromFilesystemSync = () => {
      if (cachedVersionFilesystem !== void 0) {
        return cachedVersionFilesystem;
      }
      cachedVersionFilesystem = null;
      try {
        const lddContent = readFileSync6(LDD_PATH);
        const versionMatch = lddContent.match(RE_GLIBC_VERSION);
        if (versionMatch) {
          cachedVersionFilesystem = versionMatch[1];
        }
      } catch (e) {
      }
      return cachedVersionFilesystem;
    };
    var versionFromReport = () => {
      const report = getReport();
      if (report.header && report.header.glibcVersionRuntime) {
        return report.header.glibcVersionRuntime;
      }
      return null;
    };
    var versionSuffix = (s) => s.trim().split(/\s+/)[1];
    var versionFromCommand = (out) => {
      const [getconf, ldd1, ldd2] = out.split(/[\r\n]+/);
      if (getconf && getconf.includes(GLIBC)) {
        return versionSuffix(getconf);
      }
      if (ldd1 && ldd2 && ldd1.includes(MUSL)) {
        return versionSuffix(ldd2);
      }
      return null;
    };
    var version = async () => {
      let version2 = null;
      if (isLinux()) {
        version2 = await versionFromFilesystem();
        if (!version2) {
          version2 = versionFromReport();
        }
        if (!version2) {
          const out = await safeCommand();
          version2 = versionFromCommand(out);
        }
      }
      return version2;
    };
    var versionSync = () => {
      let version2 = null;
      if (isLinux()) {
        version2 = versionFromFilesystemSync();
        if (!version2) {
          version2 = versionFromReport();
        }
        if (!version2) {
          const out = safeCommandSync();
          version2 = versionFromCommand(out);
        }
      }
      return version2;
    };
    module.exports = {
      GLIBC,
      MUSL,
      family,
      familySync,
      isNonGlibcLinux,
      isNonGlibcLinuxSync,
      version,
      versionSync
    };
  }
});

// ../zvec-0.7.0/source/src/prebuilt.js
var require_prebuilt = __commonJS({
  "../zvec-0.7.0/source/src/prebuilt.js"(exports, module) {
    var { familySync, GLIBC, MUSL } = require_detect_libc();
    var PREBUILT_TARGETS = Object.freeze([
      "darwin-arm64",
      "linux-arm64",
      "linux-arm64-musl",
      "linux-x64",
      "linux-x64-musl",
      "win32-x64"
    ]);
    var PREBUILT_TARGET_SET = new Set(PREBUILT_TARGETS);
    function detectLinuxLibc() {
      try {
        const family = familySync();
        return family === GLIBC || family === MUSL ? family : null;
      } catch {
        return null;
      }
    }
    function normalizeLinuxLibc(libc) {
      if (typeof libc !== "string") {
        throw new TypeError(`Linux libc must be "${GLIBC}" or "${MUSL}".`);
      }
      const normalized = libc.toLowerCase();
      if (normalized !== GLIBC && normalized !== MUSL) {
        throw new Error(`Unsupported Linux libc: ${libc}. Expected "${GLIBC}" or "${MUSL}".`);
      }
      return normalized;
    }
    function resolvePrebuiltTarget(options = {}) {
      const platform = options.platform ?? process.platform;
      const arch = options.arch ?? process.arch;
      const platformArch = `${platform}-${arch}`;
      if (platform !== "linux" && options.libc !== void 0) {
        throw new Error(`A libc target can only be specified for Linux, not ${platform}.`);
      }
      let libc = null;
      let libcSource = null;
      if (platform === "linux") {
        if (options.libc !== void 0) {
          libc = normalizeLinuxLibc(options.libc);
          libcSource = "explicit";
        } else {
          const detectedLibc = detectLinuxLibc();
          libc = detectedLibc ?? GLIBC;
          libcSource = detectedLibc === null ? "fallback" : "detected";
        }
      }
      const target = platform === "linux" && libc === MUSL ? `${platformArch}-musl` : platformArch;
      if (!PREBUILT_TARGET_SET.has(target)) {
        throw new Error(`No prebuilt binding is published for ${target}.`);
      }
      return Object.freeze({
        platform,
        arch,
        libc,
        libcSource,
        platformArch,
        target,
        packageName: `@zvec/bindings-${target}`,
        packageDirName: `bindings-${target}`
      });
    }
    function readExpectedPrebuiltTarget(argv = process.argv.slice(2)) {
      let expectedTarget = null;
      for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        let value = null;
        if (argument === "--target") {
          value = argv[index + 1];
          index += 1;
        } else if (argument.startsWith("--target=")) {
          value = argument.slice("--target=".length);
        } else {
          continue;
        }
        if (!value || value.startsWith("--")) {
          throw new Error("Expected a prebuilt target after --target.");
        }
        if (expectedTarget !== null) {
          throw new Error("Prebuilt target may only be specified once.");
        }
        if (!PREBUILT_TARGET_SET.has(value)) {
          throw new Error(`No prebuilt binding is published for ${value}.`);
        }
        expectedTarget = value;
      }
      return expectedTarget;
    }
    function resolvePrebuiltTargetForPackaging(options = {}) {
      const {
        argv = process.argv.slice(2),
        ...targetOptions
      } = options;
      const prebuiltTarget = resolvePrebuiltTarget(targetOptions);
      const expectedTarget = readExpectedPrebuiltTarget(argv);
      if (expectedTarget !== null && expectedTarget !== prebuiltTarget.target) {
        throw new Error(
          `Prebuilt target mismatch: expected ${expectedTarget}, but the current environment is ${prebuiltTarget.target}.`
        );
      }
      return prebuiltTarget;
    }
    module.exports = {
      PREBUILT_TARGETS,
      detectLinuxLibc,
      readExpectedPrebuiltTarget,
      resolvePrebuiltTarget,
      resolvePrebuiltTargetForPackaging
    };
  }
});

// ../zvec-0.7.0/source/src/index.js
var require_src = __commonJS({
  "../zvec-0.7.0/source/src/index.js"(exports, module) {
    var __dirname = __zgZvecDirname;
    var path = __require("node:path");
    var fs = __require("node:fs");
    var { resolvePrebuiltTarget } = require_prebuilt();
    var binding;
    var bindingAssetDir;
    var prebuiltTarget = null;
    try {
      const bundledBinaryPath = path.join(__dirname, "..", "zvec_node_binding.node");
      if (fs.existsSync(bundledBinaryPath)) {
        binding = __require(bundledBinaryPath);
        bindingAssetDir = path.dirname(bundledBinaryPath);
      } else {
        prebuiltTarget = resolvePrebuiltTarget();
        const platformPackagePath = __require.resolve(prebuiltTarget.packageName);
        binding = __require(platformPackagePath);
        bindingAssetDir = path.dirname(platformPackagePath);
      }
    } catch (err) {
      const target = prebuiltTarget?.target ?? `${process.platform}-${process.arch}`;
      throw new Error(
        `Zvec Error: Failed to load prebuilt binary for ${target}. This platform may not be supported. Original error: ${err.message}`
      );
    }
    var bundledJiebaDictDir = path.join(bindingAssetDir, "jieba_dict");
    if (typeof binding.setDefaultJiebaDictDir === "function" && fs.existsSync(path.join(bundledJiebaDictDir, "jieba.dict.utf8")) && fs.existsSync(path.join(bundledJiebaDictDir, "hmm_model.utf8"))) {
      binding.setDefaultJiebaDictDir(bundledJiebaDictDir);
    }
    function isZVecError(error) {
      return typeof error === "object" && error !== null && typeof error.name === "string" && typeof error.code === "string" && error.code.startsWith("ZVEC_");
    }
    module.exports = {
      ZVecDataType: binding.DataType,
      ZVecIndexType: binding.IndexType,
      ZVecMetricType: binding.MetricType,
      ZVecQuantizeType: binding.QuantizeType,
      ZVecLogType: binding.LogType,
      ZVecLogLevel: binding.LogLevel,
      ZVecIOBackendType: binding.IOBackendType,
      ZVecCollectionSchema: binding.CollectionSchema,
      ZVecInitialize: binding.initialize,
      ZVecSetDefaultJiebaDictDir: binding.setDefaultJiebaDictDir,
      ZVecGetDefaultJiebaDictDir: binding.getDefaultJiebaDictDir,
      ZVecGetIOBackendType: binding.getIOBackendType,
      ZVecGetIOBackendDescription: binding.getIOBackendDescription,
      ZVecCreateAndOpen: binding.createAndOpen,
      ZVecOpen: binding.open,
      isZVecError
    };
  }
});

// dist/engine/service/zvec-grep.js
import { readFileSync as readFileSync5, statSync as statSync6 } from "node:fs";
import { createHash as createHash2, createHmac as createHmac2, randomBytes as randomBytes2, randomUUID as randomUUID5 } from "node:crypto";
import { basename as basename4, dirname as dirname12, join as join13, relative as relative5, resolve as resolve8 } from "node:path";

// dist/engine/config.js
import { homedir } from "node:os";
import { dirname as dirname3, join as join2, resolve } from "node:path";

// dist/engine/errors.js
var EngineError = class extends Error {
  code;
  context;
  constructor(message, options) {
    super(message, { cause: options.cause });
    this.name = "EngineError";
    this.code = options.code;
    this.context = options.context;
  }
};
function isEngineError(error) {
  return error instanceof EngineError;
}
function errorDetails(entries) {
  const lines = entries.map(formatDetailEntry).filter((line) => line !== null && line.length > 0);
  return lines.length > 0 ? lines.join("\n") : void 0;
}
function detail(key, value) {
  return value === null || value === void 0 ? null : [key, value];
}
function workspaceIndexDetail(name) {
  return detail("workspaceIndex", name);
}
function formatDetailEntry(entry) {
  if (entry === null || entry === void 0) {
    return null;
  }
  if (typeof entry === "string") {
    return entry.trim().length > 0 ? entry.trim() : null;
  }
  const [key, value] = entry;
  if (value === null || value === void 0) {
    return null;
  }
  return `${key}=${String(value)}`;
}

// dist/engine/utils/json.js
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
async function readJsonFile(path, fallback) {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}
function readJsonFileSync(path, fallback) {
  try {
    const text = readFileSync(path, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}
async function writeJsonFile(path, value, options = {}) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: options.directoryMode });
  if (options.directoryMode !== void 0) {
    await chmod(directory, options.directoryMode);
  }
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}
`;
  try {
    await writeFile(tmpPath, text, {
      encoding: "utf8",
      mode: options.fileMode
    });
    if (options.fileMode !== void 0) {
      await chmod(tmpPath, options.fileMode);
    }
    await rename(tmpPath, path);
  } catch (error) {
    await unlink(tmpPath).catch(() => void 0);
    throw error;
  }
}
function writeJsonFileSync(path, value, options = {}) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: options.directoryMode });
  if (options.directoryMode !== void 0) {
    chmodSync(directory, options.directoryMode);
  }
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const text = `${JSON.stringify(value, null, 2)}
`;
  try {
    writeFileSync(tmpPath, text, {
      encoding: "utf8",
      mode: options.fileMode
    });
    if (options.fileMode !== void 0) {
      chmodSync(tmpPath, options.fileMode);
    }
    renameSync(tmpPath, path);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
    }
    throw error;
  }
}
function isNodeError(error) {
  return typeof error === "object" && error !== null && "code" in error;
}

// dist/engine/utils/lock.js
import { randomUUID as randomUUID2 } from "node:crypto";
import { existsSync, mkdirSync as mkdirSync2, readdirSync, readFileSync as readFileSync2, rmSync, statSync, writeFileSync as writeFileSync2 } from "node:fs";
import { hostname } from "node:os";
import { dirname as dirname2, join } from "node:path";
var LOCK_INFO_FILE = "lock.json";
var DEFAULT_STALE_LOCK_MS = 6 * 60 * 60 * 1e3;
function acquireExclusiveDirectoryLock(lockPath, options) {
  mkdirSync2(dirname2(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync2(lockPath);
      const info = currentLockInfo(options.operation);
      writeFileSync2(lockInfoPath(lockPath), `${JSON.stringify(info, null, 2)}
`, "utf8");
      return {
        path: lockPath,
        info,
        release: () => releaseFileLock(lockPath, info)
      };
    } catch (error) {
      if (!isNodeError2(error) || error.code !== "EEXIST") {
        throw error;
      }
      if (cleanupStaleLock(lockPath, options.staleMs ?? DEFAULT_STALE_LOCK_MS)) {
        continue;
      }
      throw lockBusyError(lockPath, options.operation);
    }
  }
  throw lockBusyError(lockPath, options.operation);
}
function assertExclusiveDirectoryUnlocked(lockPath, operation) {
  if (!existsSync(lockPath)) {
    return;
  }
  if (cleanupStaleLock(lockPath, DEFAULT_STALE_LOCK_MS)) {
    return;
  }
  throw lockBusyError(lockPath, operation);
}
function acquireReadWriteLock(lockPath, mode, options) {
  return mode === "read" ? acquireReadLock(lockPath, options) : acquireWriteLock(lockPath, options);
}
function assertNoWriteLock(lockPath, operation) {
  assertExclusiveDirectoryUnlocked(writeLockPath(lockPath), operation);
}
function currentLockInfo(operation) {
  return {
    token: randomUUID2(),
    pid: process.pid,
    hostname: hostname(),
    startedAt: Date.now(),
    operation
  };
}
function acquireReadLock(lockPath, options) {
  mkdirSync2(dirname2(lockPath), { recursive: true });
  const staleMs = options.staleMs ?? DEFAULT_STALE_LOCK_MS;
  const writePath = writeLockPath(lockPath);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (existsSync(writePath)) {
      if (cleanupStaleLock(writePath, staleMs)) {
        continue;
      }
      throw lockBusyError(writePath, options.operation);
    }
    const info = currentLockInfo(options.operation);
    const readerPath = join(readersLockPath(lockPath), `${info.pid}-${info.token}`);
    try {
      mkdirSync2(readerPath, { recursive: true });
      writeFileSync2(lockInfoPath(readerPath), `${JSON.stringify(info, null, 2)}
`, "utf8");
      if (existsSync(writePath)) {
        releaseFileLock(readerPath, info);
        if (cleanupStaleLock(writePath, staleMs)) {
          continue;
        }
        throw lockBusyError(writePath, options.operation);
      }
      return {
        path: readerPath,
        info,
        release: () => releaseFileLock(readerPath, info)
      };
    } catch (error) {
      releaseFileLock(readerPath, info);
      if (!isNodeError2(error) || error.code !== "EEXIST") {
        throw error;
      }
    }
  }
  throw lockBusyError(writePath, options.operation);
}
function acquireWriteLock(lockPath, options) {
  const staleMs = options.staleMs ?? DEFAULT_STALE_LOCK_MS;
  const writePath = writeLockPath(lockPath);
  for (let attempt = 0; attempt < 2; attempt++) {
    const lock = acquireExclusiveDirectoryLock(writePath, options);
    if (!hasActiveReaders(lockPath, staleMs)) {
      return lock;
    }
    lock.release();
    throw readLockBusyError(lockPath, options.operation);
  }
  throw readLockBusyError(lockPath, options.operation);
}
function releaseFileLock(lockPath, owner) {
  const current = readLockInfo(lockPath);
  if (current?.token !== owner.token) {
    return;
  }
  rmSync(lockPath, { recursive: true, force: true });
}
function cleanupStaleLock(lockPath, staleMs) {
  if (!existsSync(lockPath)) {
    return false;
  }
  const info = readLockInfo(lockPath);
  if (!isStaleLock(lockPath, info, staleMs)) {
    return false;
  }
  rmSync(lockPath, { recursive: true, force: true });
  return true;
}
function hasActiveReaders(lockPath, staleMs) {
  const readersPath = readersLockPath(lockPath);
  if (!existsSync(readersPath)) {
    return false;
  }
  let entries;
  try {
    entries = readdirSync(readersPath);
  } catch {
    return false;
  }
  let active = false;
  for (const entry of entries) {
    const readerPath = join(readersPath, entry);
    if (cleanupStaleLock(readerPath, staleMs)) {
      continue;
    }
    active = true;
  }
  return active;
}
function isStaleLock(lockPath, info, staleMs) {
  const now = Date.now();
  const startedAt = info?.startedAt ?? lockDirectoryMtime(lockPath);
  const expired = now - startedAt > staleMs;
  if (!info) {
    return expired;
  }
  if (info.hostname === hostname() && !processIsAlive(info.pid)) {
    return true;
  }
  return expired;
}
function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError2(error) && error.code === "EPERM";
  }
}
function readLockInfo(lockPath) {
  try {
    const parsed = JSON.parse(readFileSync2(lockInfoPath(lockPath), "utf8"));
    if (typeof parsed.token === "string" && typeof parsed.pid === "number" && typeof parsed.hostname === "string" && typeof parsed.startedAt === "number" && typeof parsed.operation === "string") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}
function lockDirectoryMtime(lockPath) {
  try {
    return statSync(lockPath).mtimeMs;
  } catch {
    return Date.now();
  }
}
function lockBusyError(lockPath, requestedOperation) {
  const owner = readLockInfo(lockPath);
  return new EngineError("Index unavailable", {
    code: "ZVEC_GREP.ENGINE.LOCK.BUSY",
    context: errorDetails([
      detail("lock", lockPath),
      detail("operation", requestedOperation),
      detail("ownerOperation", owner?.operation),
      detail("ownerPid", owner?.pid),
      detail("ownerHost", owner?.hostname)
    ])
  });
}
function readLockBusyError(lockPath, requestedOperation) {
  const owner = firstActiveReaderInfo(lockPath);
  return new EngineError("Index unavailable", {
    code: "ZVEC_GREP.ENGINE.LOCK.BUSY",
    context: errorDetails([
      detail("lock", readersLockPath(lockPath)),
      detail("operation", requestedOperation),
      detail("ownerOperation", owner?.operation),
      detail("ownerPid", owner?.pid),
      detail("ownerHost", owner?.hostname)
    ])
  });
}
function firstActiveReaderInfo(lockPath) {
  const readersPath = readersLockPath(lockPath);
  if (!existsSync(readersPath)) {
    return null;
  }
  try {
    for (const entry of readdirSync(readersPath)) {
      const info = readLockInfo(join(readersPath, entry));
      if (info) {
        return info;
      }
    }
  } catch {
    return null;
  }
  return null;
}
function lockInfoPath(lockPath) {
  return join(lockPath, LOCK_INFO_FILE);
}
function writeLockPath(lockPath) {
  return `${lockPath}.write`;
}
function readersLockPath(lockPath) {
  return `${lockPath}.readers`;
}
function isNodeError2(error) {
  return typeof error === "object" && error !== null && "code" in error;
}

// dist/engine/config.js
function resolveEmbeddingRuntimeOptions(reference, explicit, workspace, config, environment = process.env) {
  const provider = providerFromEmbedding(reference);
  const local = provider === "local";
  if (local && explicit.endpoint !== void 0) {
    throw invalidRuntime(reference, "endpoint is only supported for remote embedding models");
  }
  if (!local && explicit.device !== void 0) {
    throw invalidRuntime(reference, "device is only supported for local embedding models");
  }
  const model = config.models?.[reference];
  const providerConfig = provider ? config.providers?.[provider] : void 0;
  const endpoint = !local ? explicit.endpoint ?? workspace.endpoint ?? model?.endpoint ?? nonEmptyEnvironmentValue(environment.ZVEC_GREP_ENDPOINT) : void 0;
  if (endpoint !== void 0 && !isHttpEndpoint(endpoint)) {
    throw invalidRuntime(reference, "endpoint must be a valid HTTP(S) URL");
  }
  const device = local ? explicit.device ?? workspace.device ?? model?.device ?? environmentDevice(environment) : void 0;
  return {
    apiKey: explicit.apiKey ?? workspace.apiKey ?? providerConfig?.apiKey ?? environmentApiKey(provider, environment) ?? "",
    ...endpoint !== void 0 ? { endpoint } : {},
    ...device !== void 0 ? { device } : {}
  };
}
var GLOBAL_CONFIG_VERSION = 1;
function globalConfigPath() {
  return resolve(homedir(), ".zvec-grep", "config.json");
}
function readGlobalConfig(path = globalConfigPath()) {
  const value = readJsonFileSync(path, null);
  if (value === null) {
    return emptyGlobalConfig();
  }
  return parseGlobalConfig(value, path);
}
function emptyGlobalConfig() {
  return { version: GLOBAL_CONFIG_VERSION };
}
function providerFromEmbedding(embedding) {
  if (!embedding) {
    return void 0;
  }
  const separator = embedding.indexOf("/");
  return separator > 0 ? embedding.slice(0, separator) : void 0;
}
function parseGlobalConfig(value, path) {
  if (!isRecord(value) || value.version !== GLOBAL_CONFIG_VERSION) {
    throw invalidConfig(path, "version must be 1");
  }
  assertKnownFields(value, ["version", "defaults", "providers", "models", "client", "server"], path, "config");
  const defaults = parseDefaults(value.defaults, path);
  const providers = parseProviders(value.providers, path);
  const models = parseModels(value.models, path);
  const client = parseClient(value.client, path);
  const server = parseServer(value.server, path);
  return {
    version: GLOBAL_CONFIG_VERSION,
    ...defaults ? { defaults } : {},
    ...providers ? { providers } : {},
    ...models ? { models } : {},
    ...client ? { client } : {},
    ...server ? { server } : {}
  };
}
function parseModels(value, path) {
  if (value === void 0)
    return void 0;
  if (!isRecord(value))
    throw invalidConfig(path, "models must be an object");
  const models = {};
  for (const [reference, modelValue] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]*\/[A-Za-z0-9._-]+$/.test(reference) || !isRecord(modelValue)) {
      throw invalidConfig(path, `models.${reference} must be an object with a valid embedding reference`);
    }
    assertKnownFields(modelValue, ["endpoint", "device"], path, `models.${reference}`);
    const endpoint = optionalNonEmptyString(modelValue.endpoint, path, `models.${reference}.endpoint`);
    if (endpoint !== void 0 && !isHttpEndpoint(endpoint)) {
      throw invalidConfig(path, `models.${reference}.endpoint must be a valid HTTP(S) URL`);
    }
    const device = optionalDevice(modelValue.device, path, `models.${reference}.device`);
    if (reference.startsWith("local/") && endpoint !== void 0) {
      throw invalidConfig(path, `models.${reference}.endpoint is only supported for remote models`);
    }
    if (!reference.startsWith("local/") && device !== void 0) {
      throw invalidConfig(path, `models.${reference}.device is only supported for local models`);
    }
    const config = {
      ...endpoint !== void 0 ? { endpoint } : {},
      ...device !== void 0 ? { device } : {}
    };
    if (Object.keys(config).length > 0)
      models[reference] = config;
  }
  return Object.keys(models).length > 0 ? models : void 0;
}
function parseClient(value, path) {
  if (value === void 0)
    return void 0;
  if (!isRecord(value))
    throw invalidConfig(path, "client must be an object");
  assertKnownFields(value, ["mode", "serverUrl"], path, "client");
  const mode = value.mode;
  if (mode !== void 0 && mode !== "direct" && mode !== "server" && mode !== "auto") {
    throw invalidConfig(path, "client.mode must be direct, server, or auto");
  }
  const serverUrl = optionalNonEmptyString(value.serverUrl, path, "client.serverUrl");
  return mode || serverUrl ? { ...mode ? { mode } : {}, ...serverUrl ? { serverUrl } : {} } : void 0;
}
function parseServer(value, path) {
  if (value === void 0)
    return void 0;
  if (!isRecord(value))
    throw invalidConfig(path, "server must be an object");
  assertKnownFields(value, ["host", "port"], path, "server");
  const host = optionalNonEmptyString(value.host, path, "server.host");
  const port = value.port === void 0 ? void 0 : optionalPositiveInteger(value.port, path, "server.port");
  if (port !== void 0 && port > 65535)
    throw invalidConfig(path, "server.port must not exceed 65535");
  return host || port ? { ...host ? { host } : {}, ...port ? { port } : {} } : void 0;
}
function parseDefaults(value, path) {
  if (value === void 0) {
    return void 0;
  }
  if (!isRecord(value)) {
    throw invalidConfig(path, "defaults must be an object");
  }
  assertKnownFields(value, ["embedding", "modelCacheDir"], path, "defaults");
  const embedding = optionalNonEmptyString(value.embedding, path, "defaults.embedding");
  const modelCacheDir = optionalNonEmptyString(value.modelCacheDir, path, "defaults.modelCacheDir");
  const defaults = {
    ...embedding ? { embedding } : {},
    ...modelCacheDir ? { modelCacheDir } : {}
  };
  return Object.keys(defaults).length > 0 ? defaults : void 0;
}
function parseProviders(value, path) {
  if (value === void 0) {
    return void 0;
  }
  if (!isRecord(value)) {
    throw invalidConfig(path, "providers must be an object");
  }
  const providers = {};
  for (const [provider, providerValue] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_-]*$/.test(provider) || !isRecord(providerValue)) {
      throw invalidConfig(path, `providers.${provider} must be an object with a valid provider name`);
    }
    assertKnownFields(providerValue, ["apiKey"], path, `providers.${provider}`);
    const apiKey = optionalNonEmptyString(providerValue.apiKey, path, `providers.${provider}.apiKey`);
    const config = {
      ...apiKey ? { apiKey } : {}
    };
    if (Object.keys(config).length > 0) {
      providers[provider] = config;
    }
  }
  return Object.keys(providers).length > 0 ? providers : void 0;
}
function optionalNonEmptyString(value, path, field) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw invalidConfig(path, `${field} must be a non-empty string`);
  }
  return value.trim();
}
function optionalPositiveInteger(value, path, field) {
  if (value === void 0) {
    return void 0;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw invalidConfig(path, `${field} must be a positive integer`);
  }
  return value;
}
function optionalDevice(value, path, field) {
  if (value === void 0) {
    return void 0;
  }
  if (value === "auto" || value === "cpu" || value === "metal" || value === "vulkan" || value === "cuda") {
    return value;
  }
  throw invalidConfig(path, `${field} must be auto, cpu, metal, vulkan, or cuda`);
}
function environmentApiKey(provider, environment) {
  const values = provider === "qwen" ? [
    environment.ZVEC_GREP_API_KEY,
    environment.DASHSCOPE_API_KEY,
    environment.QWEN_API_KEY
  ] : [environment.ZVEC_GREP_API_KEY];
  return values.map(nonEmptyEnvironmentValue).find(Boolean);
}
function nonEmptyEnvironmentValue(value) {
  const normalized = value?.trim();
  return normalized ? normalized : void 0;
}
function environmentDevice(environment) {
  const normalized = environment.ZVEC_GREP_DEVICE?.trim().toLowerCase() ?? "";
  if (["auto", "cpu", "metal", "vulkan", "cuda"].includes(normalized))
    return normalized;
  return "auto";
}
function assertKnownFields(value, allowed, path, field) {
  const allowedFields = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      throw invalidConfig(path, `${field}.${key} is not supported`);
    }
  }
}
function invalidConfig(path, detail2) {
  return new EngineError("zvec-grep global config is invalid", {
    code: "ZVEC_GREP.ENGINE.CONFIG.INVALID",
    context: `path=${path}
detail=${detail2}`
  });
}
function invalidRuntime(reference, message) {
  return new EngineError("Embedding runtime configuration is invalid", {
    code: "ZVEC_GREP.ENGINE.CONFIG.INVALID_EMBEDDING_RUNTIME",
    context: `reference=${reference}
detail=${message}`
  });
}
function isHttpEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// dist/engine/pipeline/indexing/index.js
import { lstat as lstat2, readFile as readFile3 } from "node:fs/promises";

// dist/engine/utils/hash.js
import { createHash } from "node:crypto";
function sha256Text(text) {
  return createHash("sha256").update(text).digest("hex");
}
function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// dist/engine/utils/path.js
import { homedir as homedir2 } from "node:os";
import { resolve as resolve2, sep } from "node:path";
function defaultHome() {
  return process.env.ZVEC_GREP_HOME ?? resolve2(homedir2(), ".zvec-grep");
}
function normalizePath(path) {
  return resolve2(path);
}
function toDisplayPath(path) {
  return path.split(sep).join("/");
}
function isPathInside(parent, child) {
  const normalizedParent = normalizePath(parent);
  const normalizedChild = normalizePath(child);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`);
}

// dist/engine/utils/timing.js
import { performance } from "node:perf_hooks";
var TimingCollector = class {
  entriesByName = /* @__PURE__ */ new Map();
  async time(name, task) {
    const start = performance.now();
    try {
      return await task();
    } finally {
      this.add(name, performance.now() - start);
    }
  }
  timeSync(name, task) {
    const start = performance.now();
    try {
      return task();
    } finally {
      this.add(name, performance.now() - start);
    }
  }
  add(name, durationMs, count = 1) {
    const normalizedName = name.trim();
    if (!normalizedName || !Number.isFinite(durationMs)) {
      return;
    }
    const existing = this.entriesByName.get(normalizedName);
    if (existing) {
      existing.durationMs += Math.max(0, durationMs);
      existing.count += Math.max(1, count);
      return;
    }
    this.entriesByName.set(normalizedName, {
      name: normalizedName,
      durationMs: Math.max(0, durationMs),
      count: Math.max(1, count)
    });
  }
  addEntries(entries, prefix = "") {
    for (const entry of entries ?? []) {
      this.add(`${prefix}${entry.name}`, entry.durationMs, entry.count ?? 1);
    }
  }
  entries() {
    return [...this.entriesByName.values()].map((entry) => ({
      name: entry.name,
      durationMs: Math.round(entry.durationMs),
      ...entry.count > 1 ? { count: entry.count } : {}
    }));
  }
};
var ConcurrentTiming = class {
  collector;
  name;
  active = 0;
  startedAt = 0;
  constructor(collector, name) {
    this.collector = collector;
    this.name = name;
  }
  async time(task) {
    this.start();
    try {
      return await task();
    } finally {
      this.stop();
    }
  }
  start() {
    if (this.active === 0) {
      this.startedAt = performance.now();
    }
    this.active++;
  }
  stop() {
    if (this.active <= 0) {
      return;
    }
    this.active--;
    if (this.active === 0) {
      this.collector.add(this.name, performance.now() - this.startedAt);
      this.startedAt = 0;
    }
  }
};

// dist/engine/code-formats.js
var COMPONENT_CODE_FORMATS = ["vue", "svelte"];

// dist/engine/extraction/ids.js
function makeEntityId(fileId, index) {
  return sha256Text(`${fileId}\0${index}`);
}

// dist/engine/extraction/source.js
function validateSourceFile(source) {
  if (source.file.id.trim().length === 0) {
    throw new EngineError("Extractor source requires a non-empty file id", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.EMPTY_FILE_ID",
      context: `sourceKind=${source.kind}`
    });
  }
  if (source.file.absolutePath.trim().length === 0) {
    throw new EngineError("Extractor source requires a non-empty absolute file path", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.EMPTY_ABSOLUTE_FILE_PATH",
      context: `fileId=${source.file.id} sourceKind=${source.kind}`
    });
  }
  if (source.file.relativePath.trim().length === 0) {
    throw new EngineError("Extractor source requires a non-empty relative file path", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.EMPTY_RELATIVE_FILE_PATH",
      context: `fileId=${source.file.id} sourceKind=${source.kind}`
    });
  }
}

// dist/engine/extraction/code/tree-sitter/grammar.js
import { createRequire } from "node:module";
import { join as join3 } from "node:path";
import Parser from "web-tree-sitter";
var require2 = createRequire(import.meta.url);
var LANGUAGE_WASM_MAP = {
  c: "c",
  cpp: "cpp",
  go: "go",
  java: "java",
  javascript: "javascript",
  jsx: "javascript",
  python: "python",
  rust: "rust",
  tsx: "tsx",
  typescript: "typescript"
};
var parserReady = false;
var grammarCache = /* @__PURE__ */ new Map();
async function ensureParser() {
  if (!parserReady) {
    await Parser.init();
    parserReady = true;
  }
}
async function loadGrammar(format) {
  const cached = grammarCache.get(format);
  if (cached) {
    return cached;
  }
  const wasmName = LANGUAGE_WASM_MAP[format];
  if (!wasmName) {
    return null;
  }
  await ensureParser();
  try {
    const wasmsDir = join3(require2.resolve("tree-sitter-wasms/package.json"), "..", "out");
    const wasmPath = join3(wasmsDir, `tree-sitter-${wasmName}.wasm`);
    const grammar = await Parser.Language.load(wasmPath);
    grammarCache.set(format, grammar);
    return grammar;
  } catch {
    return null;
  }
}
function hasGrammar(format) {
  return format in LANGUAGE_WASM_MAP;
}

// dist/engine/extraction/code/tree-sitter/parser.js
import Parser2 from "web-tree-sitter";
async function withParser(source, format, fn) {
  await ensureParser();
  const grammar = await loadGrammar(format);
  if (!grammar) {
    return null;
  }
  const parser = new Parser2();
  parser.setLanguage(grammar);
  let tree;
  try {
    tree = parser.parse(source);
  } catch {
    parser.delete();
    return null;
  }
  if (!tree) {
    parser.delete();
    return null;
  }
  try {
    return await fn(tree);
  } finally {
    tree.delete();
    parser.delete();
  }
}

// dist/engine/extraction/text/extractor.js
var DEFAULT_TEXT_CHUNK_CHARS = 3600;
var DEFAULT_TEXT_CHUNK_OVERLAP_CHARS = 540;
var TextExtractor = class {
  async extract(source, options = {}) {
    if (source.kind !== "text") {
      throw new EngineError("Text extractor received a non-text source", {
        code: "ZVEC_GREP.ENGINE.EXTRACTORS.TEXT_UNSUPPORTED_SOURCE",
        context: `fileId=${source.file.id} sourceKind=${source.kind}`
      });
    }
    validateSourceFile(source);
    const { maxChunkChars, chunkOverlapChars } = resolveTextChunkOptions(options);
    return extractPlainTextFragments(source, maxChunkChars, chunkOverlapChars);
  }
};
function resolveTextChunkOptions(options) {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_TEXT_CHUNK_CHARS;
  const chunkOverlapChars = options.chunkOverlapChars ?? DEFAULT_TEXT_CHUNK_OVERLAP_CHARS;
  if (!Number.isInteger(maxChunkChars) || maxChunkChars <= 0) {
    throw new EngineError("Text extractor requires a positive integer chunk size", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.TEXT_INVALID_CHUNK_SIZE",
      context: `maxChunkChars=${maxChunkChars}`
    });
  }
  if (!Number.isInteger(chunkOverlapChars) || chunkOverlapChars < 0 || chunkOverlapChars >= maxChunkChars) {
    throw new EngineError("Text extractor requires overlap to be smaller than chunk size", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.TEXT_INVALID_CHUNK_OVERLAP",
      context: `maxChunkChars=${maxChunkChars} chunkOverlapChars=${chunkOverlapChars}`
    });
  }
  return { maxChunkChars, chunkOverlapChars };
}
function extractPlainTextFragments(source, maxChunkChars, chunkOverlapChars) {
  return chunkText(source.text, maxChunkChars, chunkOverlapChars).map((chunk, index) => ({
    id: makeEntityId(source.file.id, index),
    fileId: source.file.id,
    range: chunk.range,
    content: {
      kind: "text",
      text: chunk.text
    }
  }));
}
function chunkText(text, maxChars, overlapChars) {
  if (text.trim().length === 0) {
    return [];
  }
  const lines = text.split("\n");
  const lineOffsets = computeLineOffsets(lines);
  const chunks = [];
  let startIndex = 0;
  while (startIndex < lines.length) {
    if (lines[startIndex].length + 1 > maxChars) {
      const line = lines[startIndex];
      const lineNumber = startIndex + 1;
      let offset = 0;
      while (offset < line.length) {
        const remaining = line.length - offset;
        const sliceLength = remaining <= maxChars ? remaining : findLineCut(line.slice(offset), maxChars);
        const slice = line.slice(offset, offset + sliceLength);
        if (slice.trim().length > 0) {
          chunks.push({
            text: slice,
            range: {
              kind: "text",
              startLine: lineNumber,
              endLine: lineNumber,
              startOffset: lineOffsets[startIndex] + offset,
              endOffset: lineOffsets[startIndex] + offset + slice.length
            }
          });
        }
        offset += sliceLength;
      }
      startIndex++;
      continue;
    }
    let usedChars = 0;
    let endIndex = startIndex;
    while (endIndex < lines.length) {
      const lineLength = lines[endIndex].length + 1;
      if (usedChars + lineLength > maxChars && endIndex > startIndex) {
        break;
      }
      usedChars += lineLength;
      endIndex++;
    }
    const chunkLines = lines.slice(startIndex, endIndex);
    const chunk = chunkLines.join("\n");
    if (chunk.trim().length > 0) {
      const endLineIndex = endIndex - 1;
      chunks.push({
        text: chunk,
        range: {
          kind: "text",
          startLine: startIndex + 1,
          endLine: endIndex,
          startOffset: lineOffsets[startIndex],
          endOffset: lineOffsets[endLineIndex] + lines[endLineIndex].length
        }
      });
    }
    if (endIndex >= lines.length) {
      break;
    }
    startIndex = computeNextStartLine(lines, startIndex, endIndex, overlapChars);
  }
  return chunks;
}
function computeLineOffsets(lines) {
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}
function computeNextStartLine(lines, startIndex, endIndex, overlapChars) {
  if (overlapChars === 0) {
    return endIndex;
  }
  let overlapLines = 0;
  let overlapCount = 0;
  for (let index = endIndex - 1; index >= startIndex && overlapCount < overlapChars; index--) {
    overlapCount += lines[index].length + 1;
    overlapLines++;
  }
  const nextStart = endIndex - overlapLines;
  return nextStart > startIndex ? nextStart : endIndex;
}
function findLineCut(line, maxChars) {
  if (line.length <= maxChars) {
    return line.length;
  }
  const minPosition = Math.floor(maxChars * 0.7);
  let bestPosition = -1;
  let bestScore = 0;
  for (let index = minPosition; index < maxChars; index++) {
    const character = line[index];
    let score = 0;
    if (character === "." || character === "!" || character === "?") {
      score = 4;
    } else if (character === "," || character === ";" || character === ":") {
      score = 3;
    } else if (character === " " || character === "	") {
      score = 2;
    } else if (character === "-" || character === "/" || character === "\\") {
      score = 1;
    }
    if (score > 0 && score >= bestScore) {
      bestScore = score;
      bestPosition = index + 1;
    }
  }
  return bestPosition > 0 ? bestPosition : maxChars;
}

// dist/engine/extraction/vector-content.js
var MAX_METADATA_BUDGET_RATIO = 0.25;
function vectorContentForFragment(fragment, embeddingContent = fragment.content, maxChars) {
  if (embeddingContent.kind !== "text") {
    return embeddingContent;
  }
  const metadata = vectorMetadataText(fragment.metadata, metadataBudget(maxChars));
  if (metadata.length === 0) {
    return embeddingContent;
  }
  return {
    kind: "text",
    text: `${metadata}
${embeddingContent.text}`
  };
}
function chunkOptionsForMetadata(options, metadata) {
  const metadataText = vectorMetadataText(metadata, metadataBudget(options.maxChunkChars));
  const separatorChars = metadataText.length > 0 ? 1 : 0;
  const maxChunkChars = Math.max(1, options.maxChunkChars - metadataText.length - separatorChars);
  const chunkOverlapChars = Math.min(options.chunkOverlapChars, Math.max(0, maxChunkChars - 1));
  return { maxChunkChars, chunkOverlapChars };
}
function fitTextToChars(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 3) {
    return ".".repeat(Math.max(0, maxChars));
  }
  const rawEnd = maxChars - 3;
  const end = rawEnd > 0 && rawEnd < value.length && isHighSurrogate(value.charCodeAt(rawEnd - 1)) && isLowSurrogate(value.charCodeAt(rawEnd)) ? rawEnd - 1 : rawEnd;
  return `${value.slice(0, end).trimEnd()}...`;
}
function vectorMetadataText(metadata, maxChars) {
  if (!metadata) {
    return "";
  }
  if (metadata.kind === "code") {
    return compactMetadataLines([
      metadata.symbolName ? `symbol: ${metadata.symbolType} ${metadata.symbolName}` : `symbol: ${metadata.symbolType}`,
      metadata.scope ? `scope: ${metadata.scope}` : null,
      metadata.signature ? `signature: ${oneLine(metadata.signature)}` : null,
      metadata.modifiers.length > 0 ? `modifiers: ${metadata.modifiers.join(" ")}` : null,
      metadata.doc ? `doc: ${oneLine(metadata.doc)}` : null
    ], maxChars);
  }
  return compactMetadataLines([
    metadata.heading ? `heading: ${metadata.heading}` : null,
    typeof metadata.level === "number" ? `heading_level: ${metadata.level}` : null,
    metadata.scope ? `scope: ${metadata.scope}` : null
  ], maxChars);
}
function metadataBudget(maxChars) {
  return maxChars === void 0 ? void 0 : Math.max(0, Math.floor(maxChars * MAX_METADATA_BUDGET_RATIO));
}
function compactMetadataLines(lines, maxChars) {
  const text = lines.filter((line) => line !== null && line.trim().length > 0).join("\n");
  return maxChars === void 0 ? text : fitTextToChars(text, maxChars);
}
function oneLine(value) {
  return value.replace(/\s+/g, " ").trim();
}
function isHighSurrogate(value) {
  return value >= 55296 && value <= 56319;
}
function isLowSurrogate(value) {
  return value >= 56320 && value <= 57343;
}

// dist/engine/extraction/code/tree-sitter/nodes.js
function findIdentifierLeaf(node) {
  const wrappers = /* @__PURE__ */ new Set([
    "array_declarator",
    "function_declarator",
    "init_declarator",
    "parenthesized_declarator",
    "pointer_declarator",
    "reference_declarator"
  ]);
  let current = node;
  for (let depth = 0; current && depth < 16; depth++) {
    if (current.type === "identifier" || current.type.endsWith("_identifier")) {
      return current;
    }
    if (current.type === "destructor_name" || current.type === "operator_name") {
      return current;
    }
    if (wrappers.has(current.type)) {
      current = current.childForFieldName("declarator");
      continue;
    }
    return null;
  }
  return null;
}

// dist/engine/extraction/code/families/metadata.js
var COMMENT_TYPES = /* @__PURE__ */ new Set([
  "comment",
  "line_comment",
  "block_comment",
  "documentation_comment"
]);
function extractGenericSignature(node) {
  const body = node.childForFieldName("body") ?? node.namedChildren.find((child) => child.type === "statement_block" || child.type === "compound_statement" || child.type === "block" || child.type === "class_body" || child.type === "declaration_list" || child.type === "field_declaration_list");
  const text = body && body.startIndex > node.startIndex ? node.text.slice(0, body.startIndex - node.startIndex).trimEnd() : firstNonEmptyLine(node.text);
  const normalized = text.replace(/\s+/g, " ").replace(/\s*[{;]\s*$/, "").trim();
  return normalized.length > 0 ? normalized : void 0;
}
function extractPrecedingDoc(node) {
  const comments = [];
  let sibling = node.previousNamedSibling;
  while (sibling && COMMENT_TYPES.has(sibling.type)) {
    comments.unshift(cleanCommentText(sibling.text));
    sibling = sibling.previousNamedSibling;
  }
  const doc = comments.join("\n").trim();
  return doc.length > 0 ? doc : void 0;
}
function extractCommonModifiers(node) {
  const modifiers = /* @__PURE__ */ new Set();
  const signature = extractGenericSignature(node) ?? firstNonEmptyLine(node.text);
  if (hasAncestor(node, "export_statement")) {
    modifiers.add("exported");
  }
  for (const token of signature.matchAll(/\b(public|private|protected|internal|static|async|pub)\b/g)) {
    modifiers.add(normalizeModifier(token[1]));
  }
  return [...modifiers];
}
function closestAncestor(node, type) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === type) {
      return parent;
    }
    parent = parent.parent;
  }
  return void 0;
}
function firstNonEmptyLine(text) {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}
function hasAncestor(node, type) {
  return closestAncestor(node, type) !== void 0;
}
function normalizeModifier(value) {
  return value === "pub" ? "public" : value;
}
function cleanCommentText(text) {
  return text.replace(/^\/\*\*?/, "").replace(/\*\/$/, "").replace(/^\/\/\/?\s?/gm, "").replace(/^#\s?/gm, "").replace(/^\s*\*\s?/gm, "").trim();
}

// dist/engine/extraction/code/families/c-family.js
var C_FAMILY_FUNCTION_TYPES = /* @__PURE__ */ new Set([
  "declaration",
  "field_declaration",
  "function_definition",
  "macro_type_specifier"
]);
var C_FAMILY_FUNCTION_DECLARATION_TYPES = /* @__PURE__ */ new Set([
  "declaration",
  "field_declaration"
]);
function createCFamilyAdapter(format, entityTypes, scopeTypes = []) {
  return {
    format,
    entityTypes: new Set(entityTypes),
    scopeTypes: new Set(scopeTypes),
    shouldIndexEntity(node) {
      if (!C_FAMILY_FUNCTION_DECLARATION_TYPES.has(node.type)) {
        if (node.type === "macro_type_specifier") {
          return extractCFunctionName(node.text) !== void 0;
        }
        return true;
      }
      return findDescendantByType(node, "function_declarator") !== null;
    },
    extractName(node) {
      if (C_FAMILY_FUNCTION_TYPES.has(node.type)) {
        const name2 = extractRawCFunctionName(node);
        return name2 ? lastQualifiedPart(name2) : void 0;
      }
      const name = node.childForFieldName("name");
      if (name) {
        return findIdentifierLeaf(name)?.text ?? name.text;
      }
      if (node.type === "type_definition") {
        const declarator = node.childForFieldName("declarator");
        return declarator ? findIdentifierLeaf(declarator)?.text : void 0;
      }
      return void 0;
    },
    classifyNode: classifyCFamilyNode,
    scopeBreadcrumb: cFamilyScopeBreadcrumb,
    extractSignature: extractGenericSignature,
    extractDoc: extractPrecedingDoc,
    extractModifiers: extractCommonModifiers
  };
}
function cFamilyScopeBreadcrumb(node, breadcrumb) {
  if (!C_FAMILY_FUNCTION_TYPES.has(node.type)) {
    return breadcrumb;
  }
  const name = extractRawCFunctionName(node);
  const qualifier = name ? qualifierParts(name) : [];
  if (qualifier.length === 0) {
    return breadcrumb;
  }
  const parts = breadcrumb.length > 0 && breadcrumb[breadcrumb.length - 1] === qualifier[0] ? qualifier.slice(1) : qualifier;
  return [...breadcrumb, ...parts];
}
function classifyCFamilyNode(node) {
  if (node.type === "type_definition") {
    return typedefWrapsClassLikeBody(node) ? "class" : "alias";
  }
  if (node.type === "alias_declaration") {
    return "alias";
  }
  if (node.type === "field_declaration" && findDescendantByType(node, "function_declarator")) {
    return "function";
  }
  return void 0;
}
function extractRawCFunctionName(node) {
  const declarator = node.childForFieldName("declarator") ?? findDescendantByType(node, "function_declarator");
  const name = declarator ? findIdentifierLeaf(declarator)?.text : void 0;
  return isSimpleCIdentifier(name) ? name : extractCFunctionName(declarator?.text ?? node.text);
}
function qualifierParts(name) {
  const parts = name.split("::").filter((part) => part.length > 0);
  return parts.length > 1 ? parts.slice(0, -1) : [];
}
function lastQualifiedPart(name) {
  return name.split("::").filter((part) => part.length > 0).at(-1) ?? name;
}
function typedefWrapsClassLikeBody(node) {
  return ["struct_specifier", "union_specifier", "enum_specifier"].some((type) => {
    const child = findDescendantByType(node, type);
    return child?.childForFieldName("body") !== null && child?.childForFieldName("body") !== void 0;
  });
}
function isSimpleCIdentifier(value) {
  return value !== void 0 && /^~?[A-Za-z_][A-Za-z0-9_]*(?:::[~A-Za-z_][A-Za-z0-9_]*)*$/.test(value);
}
function extractCFunctionName(text) {
  const matches = [...text.matchAll(/([~A-Za-z_][~A-Za-z0-9_:]*)\s*\(/g)];
  const [last] = matches.slice(-1);
  return last?.[1];
}
function findDescendantByType(node, type) {
  if (node.type === type) {
    return node;
  }
  for (const child of node.namedChildren) {
    const found = findDescendantByType(child, type);
    if (found) {
      return found;
    }
  }
  return null;
}

// dist/engine/extraction/code/languages/c.js
var C_ADAPTER = createCFamilyAdapter("c", [
  "declaration",
  "field_declaration",
  "function_definition",
  "macro_type_specifier",
  "struct_specifier",
  "union_specifier",
  "enum_specifier",
  "type_definition"
], ["struct_specifier", "union_specifier"]);

// dist/engine/extraction/code/languages/cpp.js
var CPP_ADAPTER = createCFamilyAdapter("cpp", [
  "alias_declaration",
  "declaration",
  "field_declaration",
  "function_definition",
  "macro_type_specifier",
  "class_specifier",
  "struct_specifier",
  "union_specifier",
  "enum_specifier"
], [
  "namespace_definition",
  "class_specifier",
  "struct_specifier",
  "union_specifier"
]);

// dist/engine/extraction/code/languages/go.js
var GO_ADAPTER = {
  format: "go",
  entityTypes: /* @__PURE__ */ new Set([
    "function_declaration",
    "method_spec",
    "method_declaration",
    "type_alias",
    "type_spec"
  ]),
  scopeTypes: /* @__PURE__ */ new Set(["type_spec"]),
  extractName(node) {
    return node.childForFieldName("name")?.text;
  },
  shouldEnterScope(node) {
    if (node.type !== "type_spec") {
      return true;
    }
    const type = node.childForFieldName("type");
    return type?.type === "interface_type" || type?.type === "struct_type";
  },
  enterScopeNode(node) {
    return node.childForFieldName("type") ?? node;
  },
  scopeBreadcrumb(node, breadcrumb) {
    if (node.type !== "method_declaration") {
      return breadcrumb;
    }
    const receiverType = extractGoReceiverType(node);
    return receiverType ? [...breadcrumb, receiverType] : breadcrumb;
  },
  classifyNode(node) {
    if (node.type === "type_alias") {
      return "alias";
    }
    if (node.type === "type_spec") {
      const type = node.childForFieldName("type");
      if (type?.type === "interface_type") {
        return "interface";
      }
      if (type?.type === "struct_type") {
        return "class";
      }
      return "alias";
    }
    if (node.type === "method_spec") {
      return "function";
    }
    return void 0;
  },
  extractSignature: extractGenericSignature,
  extractDoc: extractPrecedingDoc,
  extractModifiers(node) {
    const name = node.childForFieldName("name")?.text;
    const modifiers = [];
    if (name && /^[A-Z]/.test(name)) {
      modifiers.push("exported");
    }
    return modifiers;
  }
};
function extractGoReceiverType(node) {
  const receiver = node.childForFieldName("receiver");
  if (!receiver) {
    return void 0;
  }
  const match = receiver.text.match(/\*?\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/);
  return match?.[1];
}

// dist/engine/extraction/code/families/name-field.js
function createNameFieldAdapter(format, entityTypes, scopeTypes = [], options = {}) {
  return {
    format,
    entityTypes: new Set(entityTypes),
    scopeTypes: new Set(scopeTypes),
    ...options,
    extractName(node) {
      return node.childForFieldName("name")?.text ?? findNamedIdentifierChild(node)?.text;
    },
    extractSignature: extractGenericSignature,
    extractDoc: extractPrecedingDoc,
    extractModifiers: extractCommonModifiers
  };
}
function findNamedIdentifierChild(node) {
  return node.namedChildren.find((child) => child.type === "identifier" || child.type === "property_identifier" || child.type === "type_identifier");
}

// dist/engine/extraction/code/languages/java.js
var JAVA_ADAPTER = createNameFieldAdapter("java", [
  "annotation_type_declaration",
  "class_declaration",
  "constructor_declaration",
  "enum_declaration",
  "interface_declaration",
  "method_declaration",
  "record_declaration"
], [
  "annotation_type_declaration",
  "class_declaration",
  "enum_declaration",
  "interface_declaration",
  "record_declaration"
]);

// dist/engine/extraction/code/families/js-ts.js
var JS_TS_FUNCTION_VALUE_DECLARATION_TYPES = /* @__PURE__ */ new Set([
  "field_definition",
  "public_field_definition",
  "variable_declarator"
]);
var JS_TS_FUNCTION_VALUE_TYPES = /* @__PURE__ */ new Set([
  "arrow_function",
  "function_expression"
]);
function shouldIndexJavascriptTypescriptEntity(node) {
  if (node.type === "method_definition" && isObjectMember(node)) {
    return false;
  }
  if (node.type === "pair") {
    return hasFunctionValue(node) && exportedObjectVariableName(node) !== void 0;
  }
  if (!JS_TS_FUNCTION_VALUE_DECLARATION_TYPES.has(node.type)) {
    return true;
  }
  if (node.type === "variable_declarator" && exportedObjectFunctionEntities(node).length > 0) {
    return true;
  }
  return hasFunctionValue(node);
}
function hasJavascriptTypescriptFunctionValue(node) {
  return hasFunctionValue(node);
}
function resolveJavascriptTypescriptEntities(node) {
  if (node.type !== "variable_declarator") {
    return [node];
  }
  const objectEntities = exportedObjectFunctionEntities(node);
  return objectEntities.length > 0 ? objectEntities : [node];
}
function extractJavascriptTypescriptName(node) {
  if (node.type === "pair") {
    return node.childForFieldName("key")?.text.replace(/^['"`]|['"`]$/g, "");
  }
  return node.childForFieldName("name")?.text ?? findNamedIdentifierChild2(node)?.text;
}
function javascriptTypescriptScopeBreadcrumb(node, breadcrumb) {
  const objectName = exportedObjectVariableName(node);
  return objectName ? [...breadcrumb, objectName] : breadcrumb;
}
function extractJavascriptTypescriptSignature(node) {
  if (node.type === "pair") {
    const key = extractJavascriptTypescriptName(node);
    const value = node.childForFieldName("value");
    const valueSignature = value ? extractGenericSignature(value) : void 0;
    return key && valueSignature ? `${key}: ${valueSignature}` : extractGenericSignature(node);
  }
  return extractGenericSignature(node);
}
function classifyJavascriptTypescriptNode(node) {
  if (node.type === "pair" || JS_TS_FUNCTION_VALUE_DECLARATION_TYPES.has(node.type)) {
    return hasFunctionValue(node) ? "function" : void 0;
  }
  return void 0;
}
var extractJavascriptTypescriptDoc = extractPrecedingDoc;
var extractJavascriptTypescriptModifiers = extractCommonModifiers;
function hasFunctionValue(node) {
  const value = node.childForFieldName("value") ?? node.namedChildren.find((child) => JS_TS_FUNCTION_VALUE_TYPES.has(child.type));
  return value !== void 0 && containsFunctionValue(value);
}
function containsFunctionValue(node) {
  if (JS_TS_FUNCTION_VALUE_TYPES.has(node.type)) {
    return true;
  }
  if (node.type !== "call_expression" && node.type !== "arguments") {
    return false;
  }
  return node.namedChildren.some((child) => containsFunctionValue(child));
}
function exportedObjectFunctionEntities(node) {
  if (!isExportedVariableDeclarator(node)) {
    return [];
  }
  const value = node.childForFieldName("value");
  if (!value || value.type !== "object" && value.type !== "object_expression") {
    return [];
  }
  return value.namedChildren.filter((child) => child.type === "pair" && hasFunctionValue(child) || child.type === "method_definition");
}
function exportedObjectVariableName(node) {
  const object = closestAncestor(node, "object") ?? closestAncestor(node, "object_expression");
  const variable = object?.parent;
  if (!variable || variable.type !== "variable_declarator" || !isExportedVariableDeclarator(variable)) {
    return void 0;
  }
  return extractJavascriptTypescriptName(variable);
}
function isExportedVariableDeclarator(node) {
  if (node.type !== "variable_declarator") {
    return false;
  }
  return closestAncestor(node, "export_statement") !== void 0;
}
function isObjectMember(node) {
  return node.parent?.type === "object" || node.parent?.type === "object_expression";
}
function findNamedIdentifierChild2(node) {
  return node.namedChildren.find((child) => child.type === "identifier" || child.type === "property_identifier" || child.type === "type_identifier");
}

// dist/engine/extraction/code/languages/javascript.js
var JAVASCRIPT_ADAPTER = {
  format: "javascript",
  entityTypes: /* @__PURE__ */ new Set([
    "class_declaration",
    "field_definition",
    "function_declaration",
    "generator_function_declaration",
    "method_definition",
    "pair",
    "variable_declarator"
  ]),
  scopeTypes: /* @__PURE__ */ new Set(["class_declaration"]),
  extractName: extractJavascriptTypescriptName,
  shouldIndexEntity: shouldIndexJavascriptTypescriptEntity,
  resolveEntities: resolveJavascriptTypescriptEntities,
  scopeBreadcrumb: javascriptTypescriptScopeBreadcrumb,
  classifyNode: classifyJavascriptTypescriptNode,
  extractSignature: extractJavascriptTypescriptSignature,
  extractDoc: extractJavascriptTypescriptDoc,
  extractModifiers: extractJavascriptTypescriptModifiers
};

// dist/engine/extraction/code/languages/python.js
var PYTHON_ADAPTER = {
  format: "python",
  entityTypes: /* @__PURE__ */ new Set([
    "class_definition",
    "decorated_definition",
    "function_definition"
  ]),
  scopeTypes: /* @__PURE__ */ new Set(["class_definition", "decorated_definition"]),
  extractName(node) {
    if (node.type === "decorated_definition") {
      const inner = node.namedChildren.find((child) => child.type === "function_definition" || child.type === "class_definition");
      return inner ? this.extractName(inner) : void 0;
    }
    return node.childForFieldName("name")?.text;
  },
  shouldEnterScope(node) {
    if (node.type !== "decorated_definition") {
      return true;
    }
    return node.namedChildren.some((child) => child.type === "class_definition");
  },
  enterScopeNode(node) {
    if (node.type !== "decorated_definition") {
      return node;
    }
    return node.namedChildren.find((child) => child.type === "class_definition") ?? node;
  },
  extractSignature(node) {
    return extractGenericSignature(innerPythonDefinition(node) ?? node);
  },
  extractDoc: extractPrecedingDoc,
  extractModifiers(node) {
    const modifiers = new Set(extractCommonModifiers(node));
    if (/^\s*async\s+def\b/m.test(node.text)) {
      modifiers.add("async");
    }
    if (/^\s*@staticmethod\b/m.test(node.text)) {
      modifiers.add("static");
    }
    return [...modifiers];
  }
};
function innerPythonDefinition(node) {
  if (node.type !== "decorated_definition") {
    return void 0;
  }
  return node.namedChildren.find((child) => child.type === "function_definition" || child.type === "class_definition");
}

// dist/engine/extraction/code/languages/rust.js
var RUST_ADAPTER = {
  format: "rust",
  entityTypes: /* @__PURE__ */ new Set([
    "enum_item",
    "function_item",
    "function_signature_item",
    "impl_item",
    "struct_item",
    "trait_item",
    "type_item",
    "union_item"
  ]),
  scopeTypes: /* @__PURE__ */ new Set(["impl_item", "mod_item", "trait_item"]),
  extractName(node) {
    if (node.type === "impl_item") {
      return node.childForFieldName("type")?.text;
    }
    return node.childForFieldName("name")?.text;
  },
  extractSignature: extractGenericSignature,
  extractDoc: extractPrecedingDoc,
  extractModifiers: extractCommonModifiers
};

// dist/engine/extraction/code/languages/typescript.js
var TYPESCRIPT_ADAPTER = {
  format: "typescript",
  entityTypes: /* @__PURE__ */ new Set([
    "abstract_class_declaration",
    "abstract_method_signature",
    "class_declaration",
    "enum_declaration",
    "field_definition",
    "function_declaration",
    "generator_function_declaration",
    "interface_declaration",
    "method_signature",
    "method_definition",
    "pair",
    "public_field_definition",
    "type_alias_declaration",
    "variable_declarator"
  ]),
  scopeTypes: /* @__PURE__ */ new Set([
    "abstract_class_declaration",
    "class_declaration",
    "internal_module",
    "interface_declaration",
    "module_declaration",
    "namespace_declaration"
  ]),
  extractName: extractJavascriptTypescriptName,
  shouldIndexEntity: shouldIndexJavascriptTypescriptEntity,
  resolveEntities: resolveJavascriptTypescriptEntities,
  scopeBreadcrumb: javascriptTypescriptScopeBreadcrumb,
  classifyNode: classifyJavascriptTypescriptNode,
  extractSignature: extractJavascriptTypescriptSignature,
  extractDoc: extractJavascriptTypescriptDoc,
  extractModifiers: extractJavascriptTypescriptModifiers
};

// dist/engine/extraction/code/adapter.js
var ADAPTERS = {
  c: C_ADAPTER,
  cpp: CPP_ADAPTER,
  go: GO_ADAPTER,
  java: JAVA_ADAPTER,
  javascript: JAVASCRIPT_ADAPTER,
  jsx: JAVASCRIPT_ADAPTER,
  python: PYTHON_ADAPTER,
  rust: RUST_ADAPTER,
  tsx: TYPESCRIPT_ADAPTER,
  typescript: TYPESCRIPT_ADAPTER
};
function resolveAdapter(format) {
  return format in ADAPTERS ? ADAPTERS[format] : null;
}

// dist/engine/extraction/code/extractor.js
var DEFAULT_CODE_CHUNK_CHARS = 3600;
var DEFAULT_CODE_CHUNK_OVERLAP_CHARS = 540;
var COMPONENT_CODE_FORMAT_SET = new Set(COMPONENT_CODE_FORMATS);
var CodeExtractor = class {
  async extract(source, options = {}) {
    return (await this.extractForIndexing(source, options)).map((item) => item.fragment);
  }
  async extractForIndexing(source, options = {}) {
    if (source.kind !== "text" || source.file.kind !== "code") {
      return [];
    }
    validateSourceFile(source);
    const chunkOptions = resolveCodeChunkOptions(options);
    if (isScriptBlockFormat(source.file.format)) {
      const fragments = await this.extractScriptBlocks(source, chunkOptions);
      return fragments.length > 0 ? fragments : this.fallback(source, chunkOptions);
    }
    const adapter = resolveAdapter(source.file.format);
    if (!hasGrammar(source.file.format) || !adapter) {
      return this.fallback(source, chunkOptions);
    }
    const extracted = await withParser(source.text, source.file.format, (tree) => {
      const collected = [];
      walkCodeNode(tree.rootNode, adapter, [], collected);
      const output = [];
      let entityIdIndex = 0;
      const appendEntity = (entity) => {
        const fragments = codeEntityToSearchFragments(source, adapter, entity, chunkOptions.maxChunkChars, chunkOptions.chunkOverlapChars);
        const majorId = fragments[0]?.group === "" ? makeEntityId(source.file.id, entityIdIndex) : null;
        for (const item of fragments) {
          const id = makeEntityId(source.file.id, entityIdIndex);
          const { embeddingText, ...fragment } = item;
          output.push({
            fragment: {
              id,
              ...fragment,
              group: fragment.group === "" ? id : majorId ?? fragment.group
            },
            embeddingText
          });
          entityIdIndex++;
        }
      };
      for (const entity of collected) {
        appendEntity(entity);
      }
      return output;
    });
    if (!extracted || extracted.length === 0) {
      return this.fallback(source, chunkOptions);
    }
    return extracted;
  }
  fallback(source, options) {
    return extractPlainTextFragments(source, options.maxChunkChars, options.chunkOverlapChars).map((fragment) => ({ fragment }));
  }
  async extractScriptBlocks(source, options) {
    const fragments = [];
    for (const block of findScriptBlocks(source.text)) {
      const blockFile = {
        ...source.file,
        format: block.format
      };
      const blockFragments = await this.extractForIndexing({
        kind: "text",
        file: blockFile,
        text: block.text
      }, options);
      fragments.push(...remapScriptBlockFragments(source.file.id, blockFragments, fragments.length, block.startLine, block.startOffset));
    }
    return fragments;
  }
};
function resolveCodeChunkOptions(options) {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_CODE_CHUNK_CHARS;
  const chunkOverlapChars = options.chunkOverlapChars ?? DEFAULT_CODE_CHUNK_OVERLAP_CHARS;
  if (!Number.isInteger(maxChunkChars) || maxChunkChars <= 0) {
    throw new EngineError("Code extractor requires a positive integer chunk size", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.CODE_INVALID_CHUNK_SIZE",
      context: `maxChunkChars=${maxChunkChars}`
    });
  }
  if (!Number.isInteger(chunkOverlapChars) || chunkOverlapChars < 0 || chunkOverlapChars >= maxChunkChars) {
    throw new EngineError("Code extractor requires overlap to be smaller than chunk size", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.CODE_INVALID_CHUNK_OVERLAP",
      context: `maxChunkChars=${maxChunkChars} chunkOverlapChars=${chunkOverlapChars}`
    });
  }
  return { maxChunkChars, chunkOverlapChars };
}
function walkCodeNode(node, adapter, breadcrumb, out) {
  for (const child of node.children) {
    const isScope = adapter.scopeTypes.has(child.type) && adapter.shouldEnterScope?.(child) !== false;
    const isEntity = adapter.entityTypes.has(child.type) && adapter.shouldIndexEntity?.(child) !== false;
    if (isEntity) {
      const entities = adapter.resolveEntities?.(child) ?? [
        adapter.resolveEntity ? adapter.resolveEntity(child) : child
      ];
      for (const entity of entities) {
        const name = adapter.extractName(entity);
        const entityBreadcrumb = adapter.scopeBreadcrumb?.(entity, breadcrumb) ?? breadcrumb;
        const symbolType = adapter.classifyNode?.(entity, entityBreadcrumb) ?? classifyCodeNode(entity, entityBreadcrumb);
        out.push({
          node: entity,
          name,
          symbolType,
          breadcrumb: entityBreadcrumb,
          signature: adapter.extractSignature?.(entity),
          doc: adapter.extractDoc?.(entity),
          modifiers: adapter.extractModifiers?.(entity) ?? []
        });
      }
    }
    if (isScope) {
      const name = adapter.extractName(child);
      const scopeNode = adapter.enterScopeNode?.(child) ?? child;
      walkCodeNode(scopeNode, adapter, name ? [...breadcrumb, name] : breadcrumb, out);
      continue;
    }
    if (!isEntity) {
      walkCodeNode(child, adapter, breadcrumb, out);
    }
  }
}
function codeEntityToSearchFragments(source, adapter, entity, maxChars, overlapChars) {
  const metadata = codeEntityMetadata(entity);
  const contentChunkOptions = chunkOptionsForMetadata({ maxChunkChars: maxChars, chunkOverlapChars: overlapChars }, metadata);
  const contentMaxChars = contentChunkOptions.maxChunkChars;
  if (entity.node.text.length <= contentMaxChars) {
    return [
      codeEntityWindowToFragment(source, entity, nodeToWindow(entity.node))
    ];
  }
  const major = {
    group: "",
    fileId: source.file.id,
    range: nodeToWindow(entity.node).range,
    content: {
      kind: "text",
      text: codeEntityOutline(entity, adapter, contentMaxChars)
    },
    metadata
  };
  return [
    major,
    ...[
      ...splitLargeNode(entity.node, contentMaxChars, contentChunkOptions.chunkOverlapChars)
    ].map((window) => codeEntityWindowToFragment(source, entity, window))
  ];
}
function codeEntityWindowToFragment(source, entity, window) {
  return {
    fileId: source.file.id,
    range: window.range,
    content: {
      kind: "text",
      text: window.text
    },
    metadata: codeEntityMetadata(entity),
    embeddingText: window.embeddingText
  };
}
function nodeToWindow(node) {
  return {
    text: node.text,
    range: {
      kind: "text",
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startOffset: node.startIndex,
      endOffset: node.endIndex
    }
  };
}
function* splitLargeNode(node, maxChars, overlapChars) {
  const body = node.childForFieldName("body") ?? node;
  const statements = body.namedChildren;
  if (statements.length <= 1) {
    yield* splitTextByLines(node.text, maxChars, node.startPosition.row + 1, node.startIndex, overlapChars);
    return;
  }
  const baseStart = node.startIndex;
  const source = node.text;
  let groupStart = 0;
  let groupChars = 0;
  for (let index = 0; index < statements.length; index++) {
    const statement = statements[index];
    const statementChars = statement.text.length;
    if (statementChars > maxChars) {
      if (index > groupStart) {
        yield sliceStatements(source, baseStart, statements, groupStart, index - 1);
      }
      yield* splitTextByLines(statement.text, maxChars, statement.startPosition.row + 1, statement.startIndex, overlapChars);
      groupStart = index + 1;
      groupChars = 0;
      continue;
    }
    const separatorChars = index > groupStart ? 1 : 0;
    if (groupChars + separatorChars + statementChars > maxChars && index > groupStart) {
      yield sliceStatements(source, baseStart, statements, groupStart, index - 1);
      const overlapStart = computeOverlapStart(statements, groupStart, index - 1, overlapChars);
      let candidateStart = overlapStart < index ? overlapStart : index;
      let candidateChars = statementChars;
      for (let previous = index - 1; previous >= candidateStart; previous--) {
        const addedChars = statements[previous].text.length + 1;
        if (candidateChars + addedChars > maxChars) {
          candidateStart = previous + 1;
          break;
        }
        candidateChars += addedChars;
      }
      groupStart = candidateStart;
      groupChars = candidateChars;
      continue;
    }
    groupChars += separatorChars + statementChars;
  }
  if (groupStart < statements.length) {
    yield sliceStatements(source, baseStart, statements, groupStart, statements.length - 1);
  }
}
function sliceStatements(source, baseStart, statements, startIndex, endIndex) {
  const start = statements[startIndex].startIndex;
  const end = statements[endIndex].endIndex;
  return {
    text: source.slice(start - baseStart, end - baseStart),
    embeddingText: statements.slice(startIndex, endIndex + 1).map((statement) => statement.text).join("\n"),
    range: {
      kind: "text",
      startLine: statements[startIndex].startPosition.row + 1,
      endLine: statements[endIndex].endPosition.row + 1,
      startOffset: start,
      endOffset: end
    }
  };
}
function* splitTextByLines(text, maxChars, startLine, startOffset, overlapChars) {
  const lines = text.split("\n");
  let lineIndex = 0;
  let offset = startOffset;
  while (lineIndex < lines.length) {
    if (lines[lineIndex].length > maxChars) {
      yield* splitLongLineByChars(lines[lineIndex], maxChars, startLine + lineIndex, offset, overlapChars);
      offset += lines[lineIndex].length + 1;
      lineIndex++;
      continue;
    }
    let endIndex = lineIndex;
    let usedChars = 0;
    while (endIndex < lines.length) {
      const lineLength = lines[endIndex].length + 1;
      if (usedChars + lineLength > maxChars && endIndex > lineIndex) {
        break;
      }
      usedChars += lineLength;
      endIndex++;
    }
    const chunk = lines.slice(lineIndex, endIndex).join("\n");
    yield {
      text: chunk,
      range: {
        kind: "text",
        startLine: startLine + lineIndex,
        endLine: startLine + endIndex - 1,
        startOffset: offset,
        endOffset: offset + chunk.length
      }
    };
    if (endIndex >= lines.length) {
      break;
    }
    const overlapLines = computeLineOverlap(lines, lineIndex, endIndex, overlapChars);
    const nextIndex = endIndex - overlapLines;
    offset += lines.slice(lineIndex, nextIndex).join("\n").length;
    if (nextIndex > lineIndex) {
      offset += 1;
    }
    lineIndex = nextIndex;
  }
}
function* splitLongLineByChars(text, maxChars, line, startOffset, overlapChars) {
  let relativeStart = 0;
  while (relativeStart < text.length) {
    const rawEnd = Math.min(text.length, relativeStart + maxChars);
    const relativeEnd = safeCharacterEnd(text, relativeStart, rawEnd);
    yield {
      text: text.slice(relativeStart, relativeEnd),
      range: {
        kind: "text",
        startLine: line,
        endLine: line,
        startOffset: startOffset + relativeStart,
        endOffset: startOffset + relativeEnd
      }
    };
    if (relativeEnd >= text.length) {
      break;
    }
    const rawStart = Math.max(relativeStart + 1, relativeEnd - overlapChars);
    relativeStart = safeCharacterStart(text, rawStart);
  }
}
function safeCharacterEnd(text, start, end) {
  if (end > start && end < text.length && isHighSurrogate2(text.charCodeAt(end - 1)) && isLowSurrogate2(text.charCodeAt(end))) {
    return end - 1 > start ? end - 1 : end + 1;
  }
  return end;
}
function safeCharacterStart(text, start) {
  if (start > 0 && start < text.length && isHighSurrogate2(text.charCodeAt(start - 1)) && isLowSurrogate2(text.charCodeAt(start))) {
    return start + 1;
  }
  return start;
}
function isHighSurrogate2(value) {
  return value >= 55296 && value <= 56319;
}
function isLowSurrogate2(value) {
  return value >= 56320 && value <= 57343;
}
function computeOverlapStart(statements, groupStart, groupEnd, overlapChars) {
  if (overlapChars <= 0) {
    return groupEnd + 1;
  }
  let chars = 0;
  let index = groupEnd;
  while (index >= groupStart && chars < overlapChars) {
    chars += statements[index].text.length;
    if (index < groupEnd) {
      chars++;
    }
    index--;
  }
  return index + 1;
}
function computeLineOverlap(lines, startIndex, endIndex, overlapChars) {
  if (overlapChars <= 0) {
    return 0;
  }
  let chars = 0;
  let count = 0;
  for (let index = endIndex - 1; index >= startIndex; index--) {
    chars += lines[index].length + 1;
    if (chars > overlapChars) {
      break;
    }
    count++;
  }
  return Math.min(count, Math.floor((endIndex - startIndex) / 2));
}
var STRUCTURAL_SYMBOL_TYPES = /* @__PURE__ */ new Set([
  "class",
  "interface",
  "module"
]);
var OUTLINE_MAX_MEMBERS = 32;
var OUTLINE_MAX_CALLS = 24;
var OUTLINE_MAX_LINE_CHARS = 180;
function codeEntityOutline(entity, adapter, maxChars) {
  const header = extractCodeHeader(entity.node.text);
  const lines = [
    header.length > 0 ? header : entity.name ?? entity.symbolType
  ];
  if (STRUCTURAL_SYMBOL_TYPES.has(entity.symbolType)) {
    const members = collectStructureOutlineMembers(entity, adapter);
    if (members.length > 0) {
      lines.push("", "members:", ...members.map((member) => `- ${formatOutlineMember(member)}`));
    }
  } else if (entity.symbolType === "function") {
    const calls = collectFunctionCallNames(entity.node);
    if (calls.length > 0) {
      lines.push("", `calls: ${calls.join(", ")}`);
    }
  }
  return truncateOutline(lines.join("\n").trim(), maxChars);
}
function truncateOutline(outline, maxChars) {
  if (outline.length <= maxChars) {
    return outline;
  }
  if (maxChars <= 3) {
    return ".".repeat(maxChars);
  }
  return `${outline.slice(0, maxChars - 3).trimEnd()}...`;
}
function extractCodeHeader(text) {
  const maxChars = 1200;
  const maxLines = 24;
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    lines.push(line);
    if (line.includes("{") || lines.length >= maxLines) {
      break;
    }
  }
  const header = lines.join("\n").trim();
  return header.length > maxChars ? `${header.slice(0, maxChars).trimEnd()}
...` : header;
}
function collectStructureOutlineMembers(entity, adapter) {
  const members = [];
  const seen = /* @__PURE__ */ new Set();
  const visit = (node, depth) => {
    if (members.length >= OUTLINE_MAX_MEMBERS || depth > 12) {
      return;
    }
    if (!sameNode(node, entity.node) && adapter.entityTypes.has(node.type)) {
      if (adapter.shouldIndexEntity?.(node) !== false) {
        const resolved = adapter.resolveEntities?.(node) ?? [
          adapter.resolveEntity ? adapter.resolveEntity(node) : node
        ];
        for (const resolvedNode of resolved) {
          if (members.length >= OUTLINE_MAX_MEMBERS || sameNode(resolvedNode, entity.node)) {
            break;
          }
          const name = adapter.extractName(resolvedNode);
          const symbolType = adapter.classifyNode?.(resolvedNode, entity.breadcrumb) ?? classifyCodeNode(resolvedNode, entity.breadcrumb);
          const signature = adapter.extractSignature?.(resolvedNode);
          const key = `${symbolType}:${name ?? ""}:${signature ?? ""}:${resolvedNode.startIndex}`;
          if (!seen.has(key)) {
            seen.add(key);
            members.push({ symbolType, name, signature });
          }
        }
      }
      return;
    }
    for (const child of node.namedChildren) {
      visit(child, depth + 1);
    }
  };
  visit(entity.node, 0);
  return members;
}
function formatOutlineMember(member) {
  const name = member.name ?? "";
  const signature = member.signature ? truncateOutlineLine(oneLine2(member.signature)) : "";
  if (signature.length > 0) {
    return name.length > 0 && !signature.includes(name) ? `${member.symbolType} ${name}: ${signature}` : `${member.symbolType} ${signature}`;
  }
  return name.length > 0 ? `${member.symbolType} ${name}` : member.symbolType;
}
function collectFunctionCallNames(node) {
  const calls = [];
  const seen = /* @__PURE__ */ new Set();
  const visit = (current) => {
    if (calls.length >= OUTLINE_MAX_CALLS) {
      return;
    }
    if (isCallNode(current)) {
      const name = extractCallName(current);
      if (name && !seen.has(name)) {
        seen.add(name);
        calls.push(name);
      }
    }
    for (const child of current.namedChildren) {
      visit(child);
    }
  };
  visit(node);
  return calls;
}
function isCallNode(node) {
  return node.type === "call" || node.type === "call_expression" || node.type === "function_call_expression" || node.type === "method_invocation" || node.type === "object_creation_expression" || node.type === "new_expression";
}
function extractCallName(node) {
  const target = node.childForFieldName("function") ?? node.childForFieldName("name") ?? node.childForFieldName("constructor") ?? node.childForFieldName("type") ?? node.namedChildren[0];
  if (!target) {
    return void 0;
  }
  return normalizeCallName(target.text);
}
function normalizeCallName(value) {
  const cleaned = value.replace(/\s+/g, " ").replace(/^new\s+/, "").trim();
  if (cleaned.length === 0 || cleaned.length > OUTLINE_MAX_LINE_CHARS || /[\n\r]/.test(cleaned) || !/[A-Za-z_$][A-Za-z0-9_$]*/.test(cleaned)) {
    return void 0;
  }
  return cleaned;
}
function sameNode(left, right) {
  return left.startIndex === right.startIndex && left.endIndex === right.endIndex && left.type === right.type;
}
function oneLine2(value) {
  return value.replace(/\s+/g, " ").trim();
}
function truncateOutlineLine(value) {
  return value.length > OUTLINE_MAX_LINE_CHARS ? `${value.slice(0, OUTLINE_MAX_LINE_CHARS - 3).trimEnd()}...` : value;
}
function codeEntityMetadata(entity) {
  return {
    kind: "code",
    symbolType: entity.symbolType,
    symbolName: entity.name ?? null,
    scope: entity.breadcrumb.length > 0 ? entity.breadcrumb.join("::") : null,
    nodeType: entity.node.type,
    signature: entity.signature ?? null,
    doc: entity.doc ?? null,
    modifiers: entity.modifiers
  };
}
function classifyCodeNode(node, breadcrumb) {
  const nodeType = node.type;
  if (nodeType === "decorated_definition") {
    const inner = node.namedChildren.find((child) => child.type === "function_definition" || child.type === "class_definition");
    return inner ? classifyCodeNode(inner, breadcrumb) : "value";
  }
  if ((nodeType === "field_definition" || nodeType === "public_field_definition" || nodeType === "variable_declarator") && hasJavascriptTypescriptFunctionValue(node)) {
    return "function";
  }
  if (nodeType.includes("method") || nodeType.includes("constructor")) {
    return "function";
  }
  if (breadcrumb.length > 0 && (nodeType.includes("function") || nodeType === "declaration" || nodeType === "function_item")) {
    return "function";
  }
  if (nodeType.includes("function")) {
    return "function";
  }
  if (nodeType === "declaration" || nodeType === "macro_type_specifier") {
    return "function";
  }
  if (nodeType.includes("class") || nodeType.includes("struct") || nodeType.includes("impl") || nodeType.includes("enum") || nodeType.includes("union") || nodeType.includes("record")) {
    return "class";
  }
  if (nodeType.includes("interface") || nodeType.includes("protocol") || nodeType.includes("trait")) {
    return "interface";
  }
  if (nodeType.includes("module") || nodeType.includes("namespace") || nodeType === "mod_item") {
    return "module";
  }
  if (nodeType.includes("alias") || nodeType.includes("typedef") || nodeType === "type_definition" || nodeType === "type_item") {
    return "alias";
  }
  return "value";
}
function isScriptBlockFormat(format) {
  return COMPONENT_CODE_FORMAT_SET.has(format);
}
function findScriptBlocks(text) {
  const blocks = [];
  const scriptPattern = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  for (const match of text.matchAll(scriptPattern)) {
    const fullMatch = match[0];
    const attrs = match[1] ?? "";
    const blockText = match[2] ?? "";
    const tagEndOffset = fullMatch.indexOf(">");
    if (tagEndOffset < 0) {
      continue;
    }
    const startOffset = match.index + tagEndOffset + 1;
    blocks.push({
      text: blockText,
      format: scriptBlockFormat(attrs),
      startLine: lineAtOffset(text, startOffset),
      startOffset
    });
  }
  return blocks;
}
function scriptBlockFormat(attrs) {
  const lang = attrs.match(/\blang\s*=\s*["']?([A-Za-z0-9_-]+)/i)?.[1]?.toLowerCase();
  if (lang === "ts" || lang === "typescript") {
    return "typescript";
  }
  if (lang === "tsx") {
    return "tsx";
  }
  if (lang === "jsx") {
    return "jsx";
  }
  return "javascript";
}
function lineAtOffset(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index++) {
    if (text.charCodeAt(index) === 10) {
      line++;
    }
  }
  return line;
}
function remapScriptBlockFragments(fileId, fragments, startIndex, startLine, startOffset) {
  const idMap = /* @__PURE__ */ new Map();
  for (const [index, item] of fragments.entries()) {
    idMap.set(item.fragment.id, makeEntityId(fileId, startIndex + index));
  }
  return fragments.map((item) => ({
    ...item,
    fragment: {
      ...item.fragment,
      id: idMap.get(item.fragment.id) ?? item.fragment.id,
      group: item.fragment.group ? idMap.get(item.fragment.group) ?? item.fragment.group : void 0,
      fileId,
      range: remapScriptBlockRange(item.fragment.range, startLine, startOffset)
    }
  }));
}
function remapScriptBlockRange(range, startLine, startOffset) {
  if (range.kind !== "text") {
    return range;
  }
  return {
    ...range,
    startLine: startLine + range.startLine - 1,
    endLine: startLine + range.endLine - 1,
    startOffset: startOffset + range.startOffset,
    endOffset: startOffset + range.endOffset
  };
}

// dist/engine/extraction/image/extractor.js
var ImageExtractor = class {
  async extract(source) {
    if (source.kind !== "image") {
      throw new EngineError("Image extractor received a non-image source", {
        code: "ZVEC_GREP.ENGINE.EXTRACTORS.IMAGE_UNSUPPORTED_SOURCE",
        context: `fileId=${source.file.id} sourceKind=${source.kind}`
      });
    }
    validateSourceFile(source);
    if (source.data.byteLength === 0) {
      throw new EngineError("Image extractor requires non-empty image data", {
        code: "ZVEC_GREP.ENGINE.EXTRACTORS.IMAGE_EMPTY_DATA",
        context: `fileId=${source.file.id} format=${source.format}`
      });
    }
    return [
      {
        id: makeEntityId(source.file.id, 0),
        fileId: source.file.id,
        range: {
          kind: "file"
        },
        content: {
          kind: "image",
          data: source.data,
          format: source.format
        }
      }
    ];
  }
};

// dist/engine/extraction/markdown/extractor.js
var DEFAULT_MARKDOWN_CHUNK_CHARS = 3600;
var DEFAULT_MARKDOWN_CHUNK_OVERLAP_CHARS = 540;
var MarkdownExtractor = class {
  async extract(source, options = {}) {
    if (source.kind !== "text" || source.file.format !== "markdown") {
      return [];
    }
    validateSourceFile(source);
    const chunkOptions = resolveMarkdownChunkOptions(options);
    const lines = source.text.split("\n");
    const headings = scanHeadings(lines);
    if (headings.length === 0) {
      return this.fallback(source, chunkOptions);
    }
    const lineOffsets = computeLineOffsets2(lines);
    const fenceLines = computeFenceLines(lines);
    const sections = buildSections(headings, lines);
    const fragments = [];
    for (const section of sections) {
      const metadata = markdownMetadata(section);
      const contentChunkOptions = chunkOptionsForMetadata(chunkOptions, metadata);
      const windows = splitMarkdownSection({
        lines,
        lineOffsets,
        fenceLines,
        section,
        maxChars: contentChunkOptions.maxChunkChars,
        overlapChars: contentChunkOptions.chunkOverlapChars
      });
      if (windows.length > 1) {
        const id = makeEntityId(source.file.id, fragments.length);
        fragments.push({
          id,
          group: id,
          fileId: source.file.id,
          range: linesToWindow(lines, lineOffsets, section.startIndex, section.endIndex).range,
          content: {
            kind: "text",
            text: fitTextToChars(markdownOutline(metadata), contentChunkOptions.maxChunkChars)
          },
          metadata
        });
        for (const window of windows) {
          fragments.push(markdownWindowToFragment(source, metadata, window, fragments.length, id));
        }
        continue;
      }
      for (const window of windows) {
        fragments.push({
          id: makeEntityId(source.file.id, fragments.length),
          fileId: source.file.id,
          range: window.range,
          content: {
            kind: "text",
            text: window.text
          },
          metadata
        });
      }
    }
    return fragments.length > 0 ? fragments : this.fallback(source, chunkOptions);
  }
  fallback(source, options) {
    return extractPlainTextFragments(source, options.maxChunkChars, options.chunkOverlapChars);
  }
};
function resolveMarkdownChunkOptions(options) {
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MARKDOWN_CHUNK_CHARS;
  const chunkOverlapChars = options.chunkOverlapChars ?? DEFAULT_MARKDOWN_CHUNK_OVERLAP_CHARS;
  if (!Number.isInteger(maxChunkChars) || maxChunkChars <= 0) {
    throw new EngineError("Markdown extractor requires a positive integer chunk size", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.MARKDOWN_INVALID_CHUNK_SIZE",
      context: `maxChunkChars=${maxChunkChars}`
    });
  }
  if (!Number.isInteger(chunkOverlapChars) || chunkOverlapChars < 0 || chunkOverlapChars >= maxChunkChars) {
    throw new EngineError("Markdown extractor requires overlap to be smaller than chunk size", {
      code: "ZVEC_GREP.ENGINE.EXTRACTORS.MARKDOWN_INVALID_CHUNK_OVERLAP",
      context: `maxChunkChars=${maxChunkChars} chunkOverlapChars=${chunkOverlapChars}`
    });
  }
  return { maxChunkChars, chunkOverlapChars };
}
function markdownWindowToFragment(source, metadata, window, index, group) {
  return {
    id: makeEntityId(source.file.id, index),
    group,
    fileId: source.file.id,
    range: window.range,
    content: {
      kind: "text",
      text: window.text
    },
    metadata
  };
}
function markdownOutline(metadata) {
  return metadata.heading ?? "markdown section";
}
function scanHeadings(lines) {
  const headings = [];
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trimStart();
    if (fence) {
      if (trimmed.startsWith(fence)) {
        fence = null;
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      fence = "```";
      continue;
    }
    if (trimmed.startsWith("~~~")) {
      fence = "~~~";
      continue;
    }
    const atx = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atx) {
      headings.push({
        level: atx[1].length,
        text: atx[2].trim(),
        lineIndex: index
      });
      continue;
    }
    const next = lines[index + 1]?.trim();
    if (line.trim().length > 0 && next && /^(=+|-+)\s*$/.test(next)) {
      headings.push({
        level: next.startsWith("=") ? 1 : 2,
        text: line.trim(),
        lineIndex: index
      });
      index++;
    }
  }
  return headings;
}
function buildSections(headings, lines) {
  const stack = [];
  const sections = [];
  const firstHeading = headings[0];
  if (firstHeading.lineIndex > 0 && lines.slice(0, firstHeading.lineIndex).join("\n").trim().length > 0) {
    sections.push({
      heading: null,
      startIndex: 0,
      endIndex: firstHeading.lineIndex - 1,
      breadcrumb: []
    });
  }
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }
    sections.push({
      heading,
      startIndex: heading.lineIndex,
      endIndex: index + 1 < headings.length ? headings[index + 1].lineIndex - 1 : lines.length - 1,
      breadcrumb: stack.map((item) => item.text)
    });
    stack.push(heading);
  }
  return sections;
}
function splitMarkdownSection(input) {
  const windows = [];
  let startIndex = input.section.startIndex;
  while (startIndex <= input.section.endIndex) {
    if (input.lines[startIndex].length + 1 > input.maxChars) {
      windows.push(...splitLongLine(input.lines[startIndex], startIndex, input.lineOffsets[startIndex], input.maxChars));
      startIndex++;
      continue;
    }
    let endIndex = startIndex;
    let usedChars = 0;
    while (endIndex <= input.section.endIndex) {
      const lineLength = input.lines[endIndex].length + 1;
      if (usedChars + lineLength > input.maxChars && endIndex > startIndex) {
        break;
      }
      usedChars += lineLength;
      endIndex++;
    }
    if (endIndex <= input.section.endIndex && endIndex - startIndex > 1) {
      endIndex = chooseMarkdownBreak(input.lines, input.fenceLines, startIndex, endIndex);
    }
    windows.push(linesToWindow(input.lines, input.lineOffsets, startIndex, endIndex - 1));
    if (endIndex > input.section.endIndex) {
      break;
    }
    const overlapLines = computeMarkdownOverlapLines(input.lines, startIndex, endIndex, input.overlapChars);
    const nextStart = endIndex - overlapLines;
    startIndex = nextStart > startIndex ? nextStart : endIndex;
  }
  return windows.filter((window) => window.text.trim().length > 0);
}
function chooseMarkdownBreak(lines, fenceLines, startIndex, endIndex) {
  const minBreak = startIndex + Math.max(1, Math.floor((endIndex - startIndex) * 0.7));
  let bestBreak = endIndex;
  let bestScore = markdownBreakScore(lines, fenceLines, endIndex);
  for (let index = minBreak; index <= endIndex; index++) {
    const score = markdownBreakScore(lines, fenceLines, index);
    if (score > bestScore) {
      bestBreak = index;
      bestScore = score;
    }
  }
  return bestBreak;
}
function markdownBreakScore(lines, fenceLines, breakIndex) {
  if (breakIndex <= 0 || breakIndex >= lines.length || fenceLines[breakIndex]) {
    return 0;
  }
  const current = lines[breakIndex].trim();
  const previous = lines[breakIndex - 1].trim();
  if (/^#{1,6}\s+/.test(current)) {
    return 100;
  }
  if (previous === "" && current === "") {
    return 70;
  }
  if (previous === "") {
    return 60;
  }
  if (/^([-*+]|\d+\.)\s+/.test(current)) {
    return 35;
  }
  if (/^>\s+/.test(current)) {
    return 25;
  }
  return 10;
}
function splitLongLine(line, lineIndex, lineOffset, maxChars) {
  const windows = [];
  let offset = 0;
  while (offset < line.length) {
    const remaining = line.length - offset;
    const sliceLength = remaining <= maxChars ? remaining : findLineCut2(line.slice(offset), maxChars);
    const text = line.slice(offset, offset + sliceLength);
    windows.push({
      text,
      range: {
        kind: "text",
        startLine: lineIndex + 1,
        endLine: lineIndex + 1,
        startOffset: lineOffset + offset,
        endOffset: lineOffset + offset + text.length
      }
    });
    offset += sliceLength;
  }
  return windows;
}
function linesToWindow(lines, lineOffsets, startIndex, endIndex) {
  return {
    text: lines.slice(startIndex, endIndex + 1).join("\n"),
    range: {
      kind: "text",
      startLine: startIndex + 1,
      endLine: endIndex + 1,
      startOffset: lineOffsets[startIndex],
      endOffset: lineOffsets[endIndex] + lines[endIndex].length
    }
  };
}
function computeLineOffsets2(lines) {
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  return offsets;
}
function computeFenceLines(lines) {
  const inFence = new Array(lines.length).fill(false);
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trimStart();
    if (fence) {
      inFence[index] = true;
      if (trimmed.startsWith(fence)) {
        fence = null;
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      fence = "```";
    } else if (trimmed.startsWith("~~~")) {
      fence = "~~~";
    }
  }
  return inFence;
}
function computeMarkdownOverlapLines(lines, startIndex, endIndex, overlapChars) {
  if (overlapChars <= 0) {
    return 0;
  }
  let chars = 0;
  let count = 0;
  for (let index = endIndex - 1; index > startIndex; index--) {
    chars += lines[index].length + 1;
    if (chars > overlapChars) {
      break;
    }
    count++;
  }
  return Math.min(count, Math.floor((endIndex - startIndex) / 2));
}
function findLineCut2(line, maxChars) {
  const minPosition = Math.floor(maxChars * 0.7);
  let bestPosition = -1;
  let bestScore = 0;
  for (let index = minPosition; index < maxChars; index++) {
    const character = line[index];
    let score = 0;
    if (character === "." || character === "!" || character === "?") {
      score = 4;
    } else if (character === "," || character === ";" || character === ":") {
      score = 3;
    } else if (character === " " || character === "	") {
      score = 2;
    } else if (character === "-" || character === "/" || character === "\\") {
      score = 1;
    }
    if (score >= bestScore && score > 0) {
      bestScore = score;
      bestPosition = index + 1;
    }
  }
  return bestPosition > 0 ? bestPosition : maxChars;
}
function markdownMetadata(section) {
  return {
    kind: "markdown",
    heading: section.heading?.text ?? null,
    level: section.heading?.level ?? null,
    scope: section.breadcrumb.length > 0 ? section.breadcrumb.join("::") : null
  };
}

// dist/engine/extraction/runtime.js
var extractors = {
  code: new CodeExtractor(),
  image: new ImageExtractor(),
  markdown: new MarkdownExtractor(),
  text: new TextExtractor()
};
function extract(source, options = {}) {
  return extractors[routeSource(source)].extract(source, options);
}
async function extractForIndexing(source, options = {}) {
  if (routeSource(source) === "code") {
    return (await extractors.code.extractForIndexing(source, options)).map(({ fragment, embeddingText }) => ({
      fragment,
      ...embeddingText === void 0 ? {} : { embeddingSource: { kind: "text", text: embeddingText } }
    }));
  }
  return (await extractors[routeSource(source)].extract(source, options)).map((fragment) => ({ fragment }));
}
function routeSource(source) {
  if (source.kind === "image") {
    return "image";
  }
  if (source.file.kind === "code") {
    return "code";
  }
  if (source.file.format === "markdown") {
    return "markdown";
  }
  return "text";
}

// dist/engine/pipeline/indexing/scanner/index.js
import { lstat, open, readFile as readFile2, readdir, realpath, stat } from "node:fs/promises";
import { basename as basename2, dirname as dirname5, isAbsolute, join as join4, relative as relative2, resolve as resolve3, sep as sep2 } from "node:path";

// dist/engine/file-type.js
import { basename, extname } from "node:path";
var CODE_FORMATS = {
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".h": "cpp",
  ".hpp": "cpp",
  ".go": "go",
  ".java": "java",
  ".js": "javascript",
  ".jsx": "jsx",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".cs": "csharp",
  ".scala": "scala",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".sql": "sql",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".vue": "vue",
  ".svelte": "svelte"
};
var DATA_FORMATS = {
  ".csv": "csv",
  ".json": "json",
  ".jsonc": "json",
  ".toml": "toml",
  ".yaml": "yaml",
  ".yml": "yaml"
};
var TEXT_FORMATS = {
  ".md": "markdown",
  ".mdx": "markdown",
  ".rst": "rst",
  ".txt": "text",
  ".html": "html",
  ".htm": "html",
  ".xml": "xml"
};
var IMAGE_FORMATS = {
  ".gif": "gif",
  ".jpeg": "jpeg",
  ".jpg": "jpeg",
  ".png": "png",
  ".webp": "webp"
};
var NAMED_FILE_FORMATS = {
  Dockerfile: { kind: "code", format: "dockerfile" },
  Makefile: { kind: "code", format: "makefile" }
};
var BINARY_EXTENSION_GROUPS = [
  {
    label: "Archives",
    extensions: [".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar"]
  },
  {
    label: "Compiled",
    extensions: [
      ".exe",
      ".dll",
      ".dylib",
      ".so",
      ".a",
      ".o",
      ".obj",
      ".wasm",
      ".class",
      ".jar"
    ]
  },
  {
    label: "Documents",
    extensions: [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx"]
  },
  {
    label: "Media",
    extensions: [".mp3", ".mp4", ".mov", ".avi", ".mkv"]
  },
  { label: "Databases", extensions: [".db", ".sqlite"] }
];
var BINARY_EXTENSIONS = new Set(BINARY_EXTENSION_GROUPS.flatMap((group) => group.extensions));
function detectFileType(path) {
  const name = basename(path);
  const namedType = NAMED_FILE_FORMATS[name];
  if (namedType) {
    return { ...namedType };
  }
  const extension = extname(name).toLowerCase();
  if (extension in CODE_FORMATS) {
    return { kind: "code", format: CODE_FORMATS[extension] };
  }
  if (extension in DATA_FORMATS) {
    return { kind: "data", format: DATA_FORMATS[extension] };
  }
  if (extension in TEXT_FORMATS) {
    return { kind: "text", format: TEXT_FORMATS[extension] };
  }
  if (extension in IMAGE_FORMATS) {
    return { kind: "image", format: IMAGE_FORMATS[extension] };
  }
  if (BINARY_EXTENSIONS.has(extension)) {
    return null;
  }
  return { kind: "text", format: extension ? extension.slice(1) : "text" };
}

// dist/engine/file-size-policy.js
var DEFAULT_MAX_CODE_FILE_SIZE_BYTES = 1 * 1024 * 1024;
var DEFAULT_MAX_TEXT_FILE_SIZE_BYTES = 256 * 1024 * 1024;
var DEFAULT_MAX_DATA_FILE_SIZE_BYTES = 16 * 1024 * 1024;
var DEFAULT_MAX_IMAGE_FILE_SIZE_BYTES = 10 * 1024 * 1024;
function resolveMaxFileSizeBytes(kind, explicitMaxFileSizeBytes) {
  if (explicitMaxFileSizeBytes !== void 0) {
    return explicitMaxFileSizeBytes;
  }
  switch (kind) {
    case "code":
      return DEFAULT_MAX_CODE_FILE_SIZE_BYTES;
    case "text":
      return DEFAULT_MAX_TEXT_FILE_SIZE_BYTES;
    case "data":
      return DEFAULT_MAX_DATA_FILE_SIZE_BYTES;
    case "image":
      return DEFAULT_MAX_IMAGE_FILE_SIZE_BYTES;
  }
}

// dist/engine/utils/file-selection.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// dist/engine/utils/glob.js
function normalizePathPattern(pattern) {
  let normalized = pattern.trim().replaceAll("\\", "/").replace(/\/+/g, "/");
  if (isAbsolutePathPattern(normalized)) {
    return normalized;
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  return normalized;
}
function normalizePathForMatch(path) {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/");
}
function isAbsolutePathPattern(pattern) {
  return pattern.startsWith("/") || /^[A-Za-z]:\//.test(pattern);
}
function hasPathGlob(pattern) {
  return pattern.includes("*") || pattern.includes("?") || pattern.includes("[");
}
function pathPatternMatches(pattern, path) {
  return pathPatternMatchesWithCase(pattern, path, false);
}
function ripgrepGlobMatches(pattern, path) {
  return ripgrepGlobMatchesWithCase(pattern, path, false);
}
function ripgrepGlobMatchesCaseInsensitive(pattern, path) {
  return ripgrepGlobMatchesWithCase(pattern, path, true);
}
function ripgrepGlobMatchesWithCase(pattern, path, caseInsensitive) {
  const normalizedPattern = normalizePathPattern(pattern);
  if (normalizedPattern.length === 0) {
    return false;
  }
  return globPatternMatches(normalizedPattern, normalizePathForMatch(path), caseInsensitive);
}
function pathPatternMatchesWithCase(pattern, path, caseInsensitive) {
  const normalizedPattern = normalizePathPattern(pattern);
  const normalizedPath = normalizePathForMatch(path);
  if (normalizedPattern.length === 0) {
    return false;
  }
  if (hasPathGlob(normalizedPattern)) {
    return globPatternMatches(normalizedPattern, normalizedPath, caseInsensitive);
  }
  const candidate = caseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
  const expected = caseInsensitive ? normalizedPattern.toLowerCase() : normalizedPattern;
  const expectedPrefix = expected.endsWith("/") ? expected : `${expected}/`;
  return candidate === expected || candidate.startsWith(expectedPrefix);
}
function pathPatternMightMatchDescendant(pattern, directoryPath) {
  const normalizedPattern = normalizePathPattern(pattern);
  const normalizedDirectory = normalizePathForMatch(directoryPath).replace(/\/+$/, "");
  if (normalizedDirectory.length === 0) {
    return true;
  }
  return pathPatternMatches(pattern, normalizedDirectory) || pathPatternMatches(pattern, `${normalizedDirectory}/__zvec_grep_descendant__`) || patternPrefixMightMatchDescendant(normalizedPattern, normalizedDirectory);
}
function globPatternMatches(pattern, path, caseInsensitive) {
  if (pattern.endsWith("/**")) {
    const directoryPattern = pattern.slice(0, -3);
    if (globToRegExp(directoryPattern, caseInsensitive).test(path)) {
      return true;
    }
  }
  return globToRegExp(pattern, caseInsensitive).test(path);
}
function globToRegExp(pattern, caseInsensitive = false) {
  let expression = pattern.includes("/") ? "^" : "^(?:.*/)?";
  expression += globFragmentToRegExp(pattern);
  return new RegExp(`${expression}$`, caseInsensitive ? "i" : void 0);
}
function globFragmentToRegExp(pattern) {
  let expression = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];
    if (char === "*" && next === "*" && afterNext === "/") {
      expression += "(?:.*/)?";
      index += 2;
    } else if (char === "*" && next === "*") {
      expression += ".*";
      index++;
    } else if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else if (char === "[") {
      const characterClass = readGlobCharacterClass(pattern, index);
      if (characterClass) {
        expression += characterClass.expression;
        index = characterClass.endIndex;
      } else {
        expression += "\\[";
      }
    } else if (char === "{") {
      const alternation = readGlobAlternation(pattern, index);
      if (alternation) {
        expression += `(?:${alternation.alternatives.map(globFragmentToRegExp).join("|")})`;
        index = alternation.endIndex;
      } else {
        expression += "\\{";
      }
    } else {
      expression += escapeRegExp(char);
    }
  }
  return expression;
}
function readGlobAlternation(pattern, startIndex) {
  const alternatives = [];
  let depth = 0;
  let alternativeStart = startIndex + 1;
  for (let index = startIndex + 1; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "{") {
      depth++;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth--;
      continue;
    }
    if (char === "," && depth === 0) {
      alternatives.push(pattern.slice(alternativeStart, index));
      alternativeStart = index + 1;
      continue;
    }
    if (char === "}" && depth === 0) {
      if (alternatives.length === 0) {
        return void 0;
      }
      alternatives.push(pattern.slice(alternativeStart, index));
      return { alternatives, endIndex: index };
    }
  }
  return void 0;
}
function readGlobCharacterClass(pattern, startIndex) {
  const endIndex = pattern.indexOf("]", startIndex + 1);
  if (endIndex < 0) {
    return void 0;
  }
  let content = pattern.slice(startIndex + 1, endIndex);
  if (!content || content === "!" || content === "^") {
    return void 0;
  }
  const negated = content.startsWith("!") || content.startsWith("^");
  if (negated) {
    content = content.slice(1);
  }
  content = content.replaceAll("\\", "\\\\").replaceAll("/", "\\/");
  return {
    expression: `[${negated ? "^" : ""}${content}]`,
    endIndex
  };
}
function patternPrefixMightMatchDescendant(pattern, directoryPath) {
  const directoryPrefix = `${directoryPath}/`;
  const variants = pattern.startsWith("**/") ? [pattern, pattern.slice(3)] : [pattern];
  for (const variant of variants) {
    if (!hasPathGlob(variant)) {
      if (variant.startsWith(directoryPrefix)) {
        return true;
      }
      continue;
    }
    const literalPrefix = literalPrefixBeforeFirstGlob(variant);
    if (literalPrefix.length > 0 && (literalPrefix.startsWith(directoryPrefix) || directoryPrefix.startsWith(literalPrefix))) {
      return true;
    }
  }
  return false;
}
function literalPrefixBeforeFirstGlob(pattern) {
  const indexes = [pattern.indexOf("*"), pattern.indexOf("?")].filter((index) => index >= 0);
  if (indexes.length === 0) {
    return pattern;
  }
  return pattern.slice(0, Math.min(...indexes));
}
function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}

// dist/engine/utils/file-selection.js
var execFileAsync = promisify(execFile);
var ripgrepTypeMapPromise;
var RIPGREP_FILE_TYPE_ALIASES = {
  bash: "sh",
  cjs: "js",
  cp: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "h",
  hxx: "h",
  hh: "h",
  h: "h",
  js: "js",
  jsx: "js",
  mjs: "js",
  markdown: "md",
  mdx: "md",
  pyi: "py",
  py: "py",
  rb: "ruby",
  rs: "rust",
  ts: "ts",
  tsx: "ts",
  yml: "yaml",
  zsh: "sh"
};
async function resolveFileTypePatterns(includedTypes, excludedTypes) {
  if (!includedTypes?.length && !excludedTypes?.length) {
    return { include: [], exclude: [] };
  }
  const types = await ripgrepTypeMap();
  return {
    include: resolveTypeNames(includedTypes, types),
    exclude: resolveTypeNames(excludedTypes, types)
  };
}
function matchesFileSelection(path, selection, types) {
  const includedByGlob = matchesOrderedGlobs(path, selection);
  const includedByType = types.include.length === 0 || types.include.some((glob) => ripgrepGlobMatches(glob, path));
  const excludedByType = types.exclude.some((glob) => ripgrepGlobMatches(glob, path));
  return includedByGlob && includedByType && !excludedByType;
}
function matchesOrderedGlobs(path, selection) {
  const rules = [
    ...(selection.globs ?? []).map((pattern) => ({
      pattern,
      caseInsensitive: false
    })),
    ...(selection.insensitiveGlobs ?? []).map((pattern) => ({
      pattern,
      caseInsensitive: true
    }))
  ].map((rule) => ({ ...rule, pattern: rule.pattern.trim() })).filter((rule) => rule.pattern.length > 0);
  const hasPositiveRule = rules.some((rule) => !rule.pattern.startsWith("!"));
  let included = !hasPositiveRule;
  for (const rule of rules) {
    const negated = rule.pattern.startsWith("!");
    const pattern = negated ? rule.pattern.slice(1).trim() : rule.pattern;
    if (!pattern) {
      continue;
    }
    const matches = rule.caseInsensitive ? ripgrepGlobMatchesCaseInsensitive(pattern, path) : ripgrepGlobMatches(pattern, path);
    if (matches) {
      included = !negated;
    }
  }
  return included;
}
function resolveTypeNames(names, types) {
  const patterns = [];
  for (const rawName of names ?? []) {
    const name = rawName.trim().toLowerCase();
    if (!name) {
      continue;
    }
    if (name === "all") {
      patterns.push("**");
      continue;
    }
    const typeName = resolveRipgrepTypeName(name, types);
    const typePatterns = types.get(typeName);
    if (!typePatterns) {
      throw new Error(`Unknown ripgrep file type: ${rawName}`);
    }
    patterns.push(...typePatterns);
  }
  return [...new Set(patterns)];
}
function resolveRipgrepTypeName(name, types) {
  if (types.has(name)) {
    return name;
  }
  const extensionName = name.startsWith(".") ? name.slice(1) : name;
  const alias = RIPGREP_FILE_TYPE_ALIASES[extensionName];
  if (alias && types.has(alias)) {
    return alias;
  }
  return name;
}
async function ripgrepTypeMap() {
  ripgrepTypeMapPromise ??= loadRipgrepTypeMap();
  return ripgrepTypeMapPromise;
}
async function loadRipgrepTypeMap() {
  const commands = [];
  try {
    const { rgPath } = await import("@vscode/ripgrep");
    commands.push(rgPath);
  } catch {
  }
  commands.push("rg");
  let lastError;
  for (const command of [...new Set(commands)]) {
    try {
      const { stdout } = await execFileAsync(command, ["--type-list"], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024
      });
      return parseRipgrepTypeList(stdout);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Unable to load ripgrep file types", { cause: lastError });
}
function parseRipgrepTypeList(output) {
  const types = /* @__PURE__ */ new Map();
  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      continue;
    }
    const name = line.slice(0, separator).trim().toLowerCase();
    const patterns = line.slice(separator + 1).split(",").map((pattern) => pattern.trim()).filter(Boolean);
    if (name && patterns.length > 0) {
      types.set(name, patterns);
    }
  }
  return types;
}

// dist/engine/pipeline/indexing/root-paths.js
import { realpathSync, statSync as statSync2 } from "node:fs";
import { dirname as dirname4, relative } from "node:path";
function validateRootPaths(paths) {
  const roots = paths.map(normalizeRootPath);
  const domains = roots.map(rootPathToScanDomain);
  for (let leftIndex = 0; leftIndex < domains.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < domains.length; rightIndex++) {
      const left = domains[leftIndex];
      const right = domains[rightIndex];
      if (scanDomainsOverlap(left, right)) {
        throw new EngineError("Workspace index root paths overlap", {
          code: "ZVEC_GREP.ENGINE.SCANNER.OVERLAPPING_ROOT_PATHS",
          context: `left=${left.root.absolutePath} right=${right.root.absolutePath}`
        });
      }
    }
  }
  return roots;
}
function normalizeRootPath(path) {
  if (typeof path === "string") {
    return {
      absolutePath: normalizePath(path),
      recursive: true
    };
  }
  return {
    ...path,
    absolutePath: normalizePath(path.absolutePath),
    recursive: path.recursive
  };
}
function matchesRootPatterns(relativePath, rootPath) {
  if (matchesAny(relativePath, rootPath.exclude)) {
    return false;
  }
  if (!rootPath.include || rootPath.include.length === 0) {
    return true;
  }
  return matchesAny(relativePath, rootPath.include);
}
function matchesRootExcludePatterns(relativePath, rootPath) {
  return matchesAny(relativePath, rootPath.exclude);
}
function rootPathToScanDomain(root) {
  let info;
  try {
    info = statSync2(root.absolutePath, { throwIfNoEntry: false });
  } catch (cause) {
    throw new EngineError("Workspace index root path could not be inspected", {
      code: "ZVEC_GREP.ENGINE.SCANNER.ROOT_PATH_STAT_FAILED",
      context: `rootPath=${root.absolutePath}`,
      cause
    });
  }
  if (!info) {
    throw new EngineError("Workspace index root path does not exist", {
      code: "ZVEC_GREP.ENGINE.SCANNER.ROOT_PATH_MISSING",
      context: `rootPath=${root.absolutePath}`
    });
  }
  const kind = info.isFile() ? "file" : info.isDirectory() ? "directory" : null;
  if (!kind) {
    throw new EngineError("Workspace index root path must be a file or directory", {
      code: "ZVEC_GREP.ENGINE.SCANNER.UNSUPPORTED_ROOT_PATH",
      context: `rootPath=${root.absolutePath}`
    });
  }
  let realPath;
  try {
    realPath = normalizePath(realpathSync(root.absolutePath));
  } catch (cause) {
    throw new EngineError("Workspace index root path could not be resolved", {
      code: "ZVEC_GREP.ENGINE.SCANNER.ROOT_PATH_REALPATH_FAILED",
      context: `rootPath=${root.absolutePath}`,
      cause
    });
  }
  return {
    root,
    realPath,
    kind,
    stat: info
  };
}
function scanDomainsOverlap(left, right) {
  if (sameFileIdentity(left, right)) {
    return true;
  }
  if (left.kind === "file" && right.kind === "file") {
    return false;
  }
  if (left.kind === "directory" && right.kind === "directory") {
    return directoryDomainsOverlap(left, right);
  }
  const directory = left.kind === "directory" ? left : right;
  const file = left.kind === "file" ? left : right;
  return directoryCoversFile(directory, file.realPath);
}
function sameFileIdentity(left, right) {
  return left.realPath === right.realPath || left.stat.dev === right.stat.dev && left.stat.ino !== 0 && left.stat.ino === right.stat.ino;
}
function directoryDomainsOverlap(left, right) {
  if (left.realPath === right.realPath) {
    return true;
  }
  return directoryCoversDirectory(left, right.realPath) || directoryCoversDirectory(right, left.realPath);
}
function directoryCoversDirectory(directory, childDirectoryPath) {
  return directory.root.recursive && isPathInside(directory.realPath, childDirectoryPath);
}
function directoryCoversFile(directory, filePath) {
  if (!isPathInside(directory.realPath, filePath)) {
    return false;
  }
  return directory.root.recursive || dirname4(filePath) === directory.realPath;
}
function matchesAny(relativePath, patterns) {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => patternMatches(pattern, relativePath));
}
function patternMatches(pattern, relativePath) {
  return pathPatternMatches(pattern, relativePath);
}

// dist/engine/pipeline/indexing/scanner/index.js
var BINARY_SNIFF_BYTES = 8192;
var BINARY_CONTROL_CHAR_RATIO = 0.3;
var MAX_GITIGNORE_CACHE_ENTRIES = 4096;
var DEFAULT_IGNORED_DIRECTORY_NAMES = [
  "node_modules",
  "vendor",
  "thirdparty",
  "third_party",
  "external",
  "deps",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  "generated",
  "__pycache__",
  "venv",
  ".venv",
  "env",
  ".tox",
  ".eggs",
  "Pods",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vite",
  ".parcel-cache",
  ".cache",
  ".gradle",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "tmp",
  "temp",
  "logs",
  "locale",
  "locales",
  "translations"
];
var DEFAULT_IGNORED_FILE_PATTERNS = [
  // Cross-ecosystem dependency resolution output. These files remain
  // available to exact rg search and can be restored with an explicit include.
  "*.lock",
  "*.lockb",
  "*-lock.json",
  "*-lock.yaml",
  "npm-shrinkwrap.json",
  "go.sum",
  "*.resolved",
  // Generated localization, browser, and compiler artifacts.
  "*.po",
  "*.pot",
  "*.map",
  "*.min.*",
  "*.bundle.*",
  // General generated-source naming conventions outside generated directories.
  "*.generated.*",
  "*.gen.*",
  "*.designer.*",
  "*.pb.*",
  "*_pb2.*",
  "*.g.*",
  // Raster assets require an explicitly selected path to enter the semantic
  // index. Exact search behavior is unaffected.
  "*.gif",
  "*.jpeg",
  "*.jpg",
  "*.png",
  "*.webp"
];
var HARD_SKIP_HIDDEN_NAMES = /* @__PURE__ */ new Set([".git", ".zvec-grep"]);
var DEFAULT_IGNORE_RULES = [
  ...DEFAULT_IGNORED_DIRECTORY_NAMES.map((pattern) => ({
    basePath: "",
    pattern,
    negated: false,
    directoryOnly: true,
    anchored: false,
    hasSlash: false
  })),
  ...DEFAULT_IGNORED_FILE_PATTERNS.map((pattern) => ({
    basePath: "",
    pattern,
    negated: false,
    directoryOnly: false,
    anchored: false,
    hasSlash: false
  }))
];
var gitIgnoreRuleCache = /* @__PURE__ */ new Map();
function knownFilesByPath(files) {
  return new Map((files ?? []).map((file) => [normalizePath(file.absolutePath), file]));
}
async function scanRootPaths(workspaceIndexId, rootPaths, options = {}) {
  const validatedRootPaths = validateRootPaths(rootPaths);
  const files = [];
  const diagnostics = createScanDiagnostics();
  const knownFiles = knownFilesByPath(options.knownFiles);
  for (const rootPath of validatedRootPaths) {
    throwIfAborted(options.signal);
    await scanRootPath(workspaceIndexId, rootPath, files, diagnostics, options.signal, knownFiles);
  }
  return { files, diagnostics };
}
async function scanFilePath(workspaceIndexId, rootPaths, absolutePath, options = {}) {
  const files = [];
  const diagnostics = createScanDiagnostics();
  const knownFiles = knownFilesByPath(options.knownFiles);
  for (const rootPath of matchingRootPaths(rootPaths, absolutePath)) {
    throwIfAborted(options.signal);
    const root = normalizeRootPath(rootPath);
    const targetInfo = await lstat(absolutePath).catch(() => null);
    const followedInfo = targetInfo?.isSymbolicLink() && root.follow ? await stat(absolutePath).catch(() => null) : targetInfo;
    if (!followedInfo?.isFile()) {
      continue;
    }
    if (!root.recursive && dirname5(absolutePath) !== root.absolutePath) {
      continue;
    }
    const relativePath = toDisplayPath(relative2(root.absolutePath, absolutePath));
    const rules = await ignoreRulesForDirectory(root, dirname5(absolutePath));
    const fileTypes = await resolveFileTypePatterns(root.fileTypes, root.excludedFileTypes);
    if (!pathCanBeScanned(root, relativePath, basename2(absolutePath), false, rules) || !matchesFileSelection(relativePath, root, fileTypes) || await hasExcludedNestedGitAncestor(root, absolutePath, false)) {
      continue;
    }
    const file = await readFileInfo(workspaceIndexId, root, absolutePath, diagnostics, knownFiles);
    if (file) {
      files.push(file);
    }
  }
  return { files: dedupeFiles(files), diagnostics };
}
async function scanDirectoryPath(workspaceIndexId, rootPaths, absolutePath, options = {}) {
  const files = [];
  const diagnostics = createScanDiagnostics();
  const knownFiles = knownFilesByPath(options.knownFiles);
  for (const rootPath of matchingRootPaths(rootPaths, absolutePath)) {
    throwIfAborted(options.signal);
    const root = normalizeRootPath(rootPath);
    if (!root.recursive && absolutePath !== root.absolutePath) {
      continue;
    }
    const info = await lstat(absolutePath).catch(() => null);
    const followedInfo = info?.isSymbolicLink() && root.follow ? await stat(absolutePath).catch(() => null) : info;
    if (!followedInfo?.isDirectory()) {
      continue;
    }
    const relativePath = toDisplayPath(relative2(root.absolutePath, absolutePath));
    const parentRules = await ignoreRulesForDirectory(root, dirname5(absolutePath));
    const fileTypes = await resolveFileTypePatterns(root.fileTypes, root.excludedFileTypes);
    if (relativePath && (!pathCanBeScanned(root, relativePath, basename2(absolutePath), true, parentRules) || await hasExcludedNestedGitAncestor(root, absolutePath, true))) {
      continue;
    }
    const rootRealPath = await realpath(root.absolutePath).catch(() => root.absolutePath);
    const directoryRealPath = await realpath(absolutePath).catch(() => absolutePath);
    const depth = relativePath.split("/").filter(Boolean).length;
    await walk(workspaceIndexId, root, absolutePath, files, diagnostics, parentRules, fileTypes, /* @__PURE__ */ new Set([rootRealPath, directoryRealPath]), depth, options.signal, knownFiles);
  }
  return { files: dedupeFiles(files), diagnostics };
}
async function hasExcludedNestedGitAncestor(rootPath, absolutePath, includeTarget) {
  const pathFromRoot = relative2(rootPath.absolutePath, absolutePath);
  const segments = pathFromRoot.split(sep2).filter(Boolean);
  const directorySegments = includeTarget ? segments : segments.slice(0, -1);
  let current = rootPath.absolutePath;
  for (const segment of directorySegments) {
    current = join4(current, segment);
    const relativeDirectory = toDisplayPath(relative2(rootPath.absolutePath, current));
    if (await isNestedGitRepositoryDirectory(current) && !nestedGitRepositoryExplicitlyIncluded(relativeDirectory, rootPath)) {
      return true;
    }
  }
  return false;
}
function matchingRootPaths(rootPaths, absolutePath) {
  return validateRootPaths(rootPaths).filter((rootPath) => {
    const root = normalizeRootPath(rootPath);
    const pathFromRoot = relative2(root.absolutePath, absolutePath);
    return !isAbsolute(pathFromRoot) && pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep2}`);
  });
}
async function ignoreRulesForDirectory(rootPath, directory) {
  const pathFromRoot = relative2(rootPath.absolutePath, directory);
  if (isAbsolute(pathFromRoot) || pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep2}`)) {
    return [...DEFAULT_IGNORE_RULES];
  }
  const rules = [
    ...rootPath.noIgnore ? [] : DEFAULT_IGNORE_RULES,
    ...await readConfiguredIgnoreRules(rootPath)
  ];
  let current = rootPath.absolutePath;
  if (!rootPath.noIgnore) {
    rules.push(...await readGitIgnoreRules(rootPath, current));
  }
  if (!pathFromRoot) {
    return rules;
  }
  for (const segment of pathFromRoot.split(sep2).filter(Boolean)) {
    current = join4(current, segment);
    if (!rootPath.noIgnore) {
      rules.push(...await readGitIgnoreRules(rootPath, current));
    }
  }
  return rules;
}
function pathCanBeScanned(rootPath, relativePath, name, isDirectory, ignoreRules) {
  if (relativePath.split("/").some((segment) => HARD_SKIP_HIDDEN_NAMES.has(segment))) {
    return false;
  }
  const ignoreMatch = matchIgnoreRules(relativePath, isDirectory, ignoreRules);
  if (ignoreMatch.ignored && !ignoredPathExplicitlyIncluded(relativePath, rootPath, ignoreMatch)) {
    return false;
  }
  if (matchesRootExcludePatterns(relativePath, rootPath)) {
    return false;
  }
  if (isDirectory) {
    return !shouldSkipHiddenDirectory(name, relativePath, rootPath);
  }
  return !shouldSkipHiddenFile(name, relativePath, rootPath) && matchesRootPatterns(relativePath, rootPath);
}
function dedupeFiles(files) {
  return [...new Map(files.map((file) => [file.id, file])).values()];
}
async function scanRootPath(workspaceIndexId, rootPath, files, diagnostics, signal, knownFiles = /* @__PURE__ */ new Map()) {
  throwIfAborted(signal);
  const root = normalizeRootPath(rootPath);
  const fileTypes = await resolveFileTypePatterns(root.fileTypes, root.excludedFileTypes);
  const info = await stat(root.absolutePath).catch(() => null);
  if (!info) {
    return;
  }
  if (info.isFile()) {
    const relativePath = basename2(root.absolutePath);
    const file = matchesFileSelection(relativePath, root, fileTypes) ? await readFileInfo(workspaceIndexId, root, root.absolutePath, diagnostics, knownFiles) : null;
    if (file) {
      files.push(file);
    }
    return;
  }
  if (!info.isDirectory()) {
    return;
  }
  if (HARD_SKIP_HIDDEN_NAMES.has(basename2(root.absolutePath))) {
    return;
  }
  const rootRealPath = await realpath(root.absolutePath).catch(() => root.absolutePath);
  await walk(workspaceIndexId, root, root.absolutePath, files, diagnostics, [
    ...root.noIgnore ? [] : DEFAULT_IGNORE_RULES,
    ...await readConfiguredIgnoreRules(root)
  ], fileTypes, /* @__PURE__ */ new Set([rootRealPath]), 0, signal, knownFiles);
}
async function walk(workspaceIndexId, rootPath, currentPath, files, diagnostics, parentIgnoreRules, fileTypes, visitedDirectories, depth, signal, knownFiles = /* @__PURE__ */ new Map()) {
  throwIfAborted(signal);
  let entries;
  const ignoreRules = [
    ...parentIgnoreRules,
    ...rootPath.noIgnore ? [] : await readGitIgnoreRules(rootPath, currentPath)
  ];
  try {
    entries = await readdir(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    throwIfAborted(signal);
    const absolutePath = join4(currentPath, entry.name);
    const relativePath = toDisplayPath(relative2(rootPath.absolutePath, absolutePath));
    let isDirectory = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink() && rootPath.follow) {
      const target = await stat(absolutePath).catch(() => null);
      isDirectory = target?.isDirectory() === true;
      isFile = target?.isFile() === true;
    }
    if (isDirectory) {
      if (!rootPath.recursive) {
        continue;
      }
      if (rootPath.maxDepth !== void 0 && depth + 1 >= rootPath.maxDepth) {
        continue;
      }
      const ignoreMatch2 = matchIgnoreRules(relativePath, true, ignoreRules);
      if (HARD_SKIP_HIDDEN_NAMES.has(entry.name) || matchesRootExcludePatterns(relativePath, rootPath) || ignoreMatch2.ignored && !ignoredPathExplicitlyIncluded(relativePath, rootPath, ignoreMatch2) || shouldSkipHiddenDirectory(entry.name, relativePath, rootPath)) {
        continue;
      }
      if (await isNestedGitRepositoryDirectory(absolutePath) && !nestedGitRepositoryExplicitlyIncluded(relativePath, rootPath)) {
        continue;
      }
      const realDirectory = await realpath(absolutePath).catch(() => null);
      if (!realDirectory || visitedDirectories.has(realDirectory)) {
        continue;
      }
      visitedDirectories.add(realDirectory);
      await walk(workspaceIndexId, rootPath, absolutePath, files, diagnostics, ignoreRules, fileTypes, visitedDirectories, depth + 1, signal, knownFiles);
      continue;
    }
    if (!isFile) {
      continue;
    }
    if (rootPath.maxDepth !== void 0 && depth + 1 > rootPath.maxDepth) {
      continue;
    }
    if (HARD_SKIP_HIDDEN_NAMES.has(entry.name)) {
      continue;
    }
    const ignoreMatch = matchIgnoreRules(relativePath, false, ignoreRules);
    if (ignoreMatch.ignored && !ignoredPathExplicitlyIncluded(relativePath, rootPath, ignoreMatch)) {
      continue;
    }
    if (shouldSkipHiddenFile(entry.name, relativePath, rootPath)) {
      continue;
    }
    if (!matchesRootPatterns(relativePath, rootPath)) {
      continue;
    }
    if (!matchesFileSelection(relativePath, rootPath, fileTypes)) {
      continue;
    }
    const file = await readFileInfo(workspaceIndexId, rootPath, absolutePath, diagnostics, knownFiles);
    throwIfAborted(signal);
    if (file) {
      files.push(file);
    }
  }
}
function throwIfAborted(signal) {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason instanceof Error ? signal.reason : new Error("Indexing was cancelled.");
}
function isHiddenName(name) {
  return name.startsWith(".") && name !== "." && name !== "..";
}
async function readGitIgnoreRules(rootPath, currentPath) {
  const ignorePath = join4(currentPath, ".gitignore");
  const content = await readFile2(ignorePath, "utf8").catch(() => null);
  const basePath = toDisplayPath(relative2(rootPath.absolutePath, currentPath));
  const cacheKey = `${ignorePath}\0${basePath}`;
  if (content === null) {
    gitIgnoreRuleCache.delete(cacheKey);
    return [];
  }
  const cached = gitIgnoreRuleCache.get(cacheKey);
  if (cached?.content === content) {
    return cached.rules;
  }
  const rules = parseGitIgnoreRules(content, basePath);
  gitIgnoreRuleCache.set(cacheKey, { content, rules });
  if (gitIgnoreRuleCache.size > MAX_GITIGNORE_CACHE_ENTRIES) {
    gitIgnoreRuleCache.delete(gitIgnoreRuleCache.keys().next().value);
  }
  return rules;
}
async function readConfiguredIgnoreRules(rootPath) {
  const rules = [];
  for (const path of rootPath.ignoreFiles ?? []) {
    const absolutePath = isAbsolute(path) ? path : resolve3(rootPath.absolutePath, path);
    const content = await readFile2(absolutePath, "utf8");
    rules.push(...parseGitIgnoreRules(content, ""));
  }
  return rules;
}
function parseGitIgnoreRules(content, basePath) {
  const rules = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const rule = parseGitIgnoreRule(rawLine, basePath);
    if (rule) {
      rules.push(rule);
    }
  }
  return rules;
}
function parseGitIgnoreRule(line, basePath) {
  let pattern = line.trim();
  if (pattern.length === 0 || pattern.startsWith("#")) {
    return null;
  }
  let negated = false;
  if (pattern.startsWith("\\#") || pattern.startsWith("\\!")) {
    pattern = pattern.slice(1);
  } else if (pattern.startsWith("!")) {
    negated = true;
    pattern = pattern.slice(1).trim();
  }
  if (pattern.length === 0) {
    return null;
  }
  const directoryOnly = pattern.endsWith("/");
  pattern = directoryOnly ? pattern.replace(/\/+$/, "") : pattern;
  const anchored = pattern.startsWith("/");
  pattern = anchored ? pattern.replace(/^\/+/, "") : pattern;
  pattern = normalizePathPattern(pattern);
  if (pattern.length === 0) {
    return null;
  }
  return {
    basePath,
    pattern,
    negated,
    directoryOnly,
    anchored,
    hasSlash: pattern.includes("/")
  };
}
function matchIgnoreRules(relativePath, isDirectory, rules) {
  let ignored = false;
  let matchedNegation = false;
  let matchedRule;
  for (const rule of rules) {
    if (!ignoreRuleMatches(rule, relativePath, isDirectory)) {
      continue;
    }
    ignored = !rule.negated;
    matchedNegation = rule.negated;
    matchedRule = rule;
  }
  return {
    ignored,
    matchedNegation,
    matchedRule
  };
}
function ignoredPathExplicitlyIncluded(relativePath, rootPath, ignoreMatch) {
  if (!ignoreMatch.ignored || !ignoreMatch.matchedRule || !rootPath.include) {
    return false;
  }
  return rootPath.include.some((pattern) => includePatternNamesIgnoredPath(pattern, relativePath, ignoreMatch.matchedRule.pattern));
}
function includePatternNamesIgnoredPath(includePattern, relativePath, ignoredPattern) {
  const normalizedInclude = normalizePathPattern(includePattern);
  const normalizedRelativePath = normalizePathPattern(relativePath);
  const ignoredSegments = ignoredPattern.split("/");
  if (!pathPatternMightMatchDescendant(normalizedInclude, normalizedRelativePath) && !pathPatternMatches(normalizedInclude, normalizedRelativePath)) {
    return false;
  }
  return normalizedInclude.split("/").some((segment) => ignoredSegments.some((ignoredSegment) => includeSegmentNamesIgnoredPath(segment, ignoredSegment)));
}
function includeSegmentNamesIgnoredPath(segment, ignoredSegment) {
  if (segment === "*" || segment === "**" || segment === "?") {
    return false;
  }
  return segmentMatches(segment, ignoredSegment) || segmentMatches(ignoredSegment, segment);
}
function ignoreRuleMatches(rule, relativePath, isDirectory) {
  const path = relativeToIgnoreRuleBase(relativePath, rule.basePath);
  if (path === null || path.length === 0) {
    return false;
  }
  if (rule.directoryOnly) {
    if (rule.anchored || rule.hasSlash) {
      return pathPatternMatches(rule.pattern, path);
    }
    return pathContainsMatchingSegment(path, rule.pattern);
  }
  if (rule.anchored || rule.hasSlash) {
    return pathPatternMatches(rule.pattern, path);
  }
  if (isDirectory && pathContainsMatchingSegment(path, rule.pattern)) {
    return true;
  }
  return segmentMatches(rule.pattern, basename2(path));
}
function relativeToIgnoreRuleBase(relativePath, basePath) {
  if (basePath.length === 0) {
    return relativePath;
  }
  if (relativePath === basePath) {
    return "";
  }
  const prefix = `${basePath}/`;
  return relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : null;
}
function pathContainsMatchingSegment(path, pattern) {
  return path.split("/").some((segment) => segmentMatches(pattern, segment));
}
function segmentMatches(pattern, segment) {
  return pathPatternMatches(pattern, segment);
}
function shouldSkipHiddenDirectory(name, relativePath, rootPath) {
  if (!isHiddenName(name) || rootPath.hidden) {
    return false;
  }
  return !hasIncludeDescendant(relativePath, rootPath.include);
}
function shouldSkipHiddenFile(name, relativePath, rootPath) {
  return isHiddenName(name) && !rootPath.hidden && !hasExplicitHiddenFileInclude(relativePath, rootPath.include);
}
async function isNestedGitRepositoryDirectory(absolutePath) {
  const marker = await stat(join4(absolutePath, ".git")).catch(() => null);
  return marker !== null && (marker.isFile() || marker.isDirectory());
}
function nestedGitRepositoryExplicitlyIncluded(relativePath, rootPath) {
  if (!rootPath.include || rootPath.include.length === 0) {
    return false;
  }
  const normalizedRelativePath = normalizePathPattern(relativePath);
  return rootPath.include.some((pattern) => {
    const normalizedPattern = normalizePathPattern(pattern);
    return pathPatternMatches(normalizedPattern, normalizedRelativePath) || normalizedPattern.startsWith(`${normalizedRelativePath}/`);
  });
}
function hasIncludeDescendant(relativePath, includePatterns) {
  if (!includePatterns || includePatterns.length === 0) {
    return false;
  }
  return includePatterns.some((pattern) => includePatternDeclaresHiddenDirectory(pattern, relativePath) && pathPatternMightMatchDescendant(pattern, relativePath));
}
function hasExplicitHiddenFileInclude(relativePath, includePatterns) {
  if (!includePatterns || includePatterns.length === 0) {
    return false;
  }
  return includePatterns.some((pattern) => includePatternDeclaresHiddenDirectory(pattern, relativePath) && pathPatternMatches(pattern, relativePath));
}
function includePatternDeclaresHiddenDirectory(pattern, relativePath) {
  const name = basename2(relativePath);
  if (!isHiddenName(name)) {
    return true;
  }
  return normalizePathPattern(pattern).split("/").some((segment) => hiddenPatternSegmentMatches(segment, name));
}
function hiddenPatternSegmentMatches(patternSegment, name) {
  if (!patternSegment.startsWith(".")) {
    return false;
  }
  if (!patternSegment.includes("*") && !patternSegment.includes("?")) {
    return patternSegment === name;
  }
  return segmentGlobToRegExp(patternSegment).test(name);
}
function segmentGlobToRegExp(pattern) {
  let expression = "^";
  for (const char of pattern) {
    if (char === "*") {
      expression += "[^/]*";
    } else if (char === "?") {
      expression += "[^/]";
    } else {
      expression += escapeRegExp2(char);
    }
  }
  return new RegExp(`${expression}$`);
}
function escapeRegExp2(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
async function readFileInfo(workspaceIndexId, rootPath, absolutePath, diagnostics, knownFiles = /* @__PURE__ */ new Map()) {
  const info = await stat(absolutePath).catch(() => null);
  if (!info || !info.isFile()) {
    return null;
  }
  const relativePath = toDisplayPath(relative2(rootPath.absolutePath, absolutePath)) || basename2(absolutePath);
  if (info.size === 0) {
    recordSkippedFile(diagnostics, {
      absolutePath,
      relativePath,
      reason: "empty",
      sizeBytes: 0
    });
    return null;
  }
  const detected = detectFileType(absolutePath);
  if (!detected) {
    recordSkippedFile(diagnostics, {
      absolutePath,
      relativePath,
      reason: "unsupported",
      sizeBytes: info.size
    });
    return null;
  }
  const maxFileSize = resolveMaxFileSizeBytes(detected.kind, rootPath.maxFileSizeBytes);
  if (info.size > maxFileSize) {
    recordSkippedFile(diagnostics, {
      absolutePath,
      relativePath,
      reason: "too_large",
      sizeBytes: info.size,
      limitBytes: maxFileSize
    });
    return null;
  }
  const lastModifiedTime = Math.trunc(info.mtimeMs);
  const known = knownFiles.get(normalizePath(absolutePath));
  if (known?.contentHash && known.sizeBytes === info.size && known.lastModifiedTime === lastModifiedTime) {
    return {
      id: makeFileId(workspaceIndexId, absolutePath),
      absolutePath,
      relativePath,
      rootPath: rootPath.absolutePath,
      sizeBytes: info.size,
      lastModifiedTime,
      kind: detected.kind,
      format: detected.format
    };
  }
  if (detected.kind !== "image" && await isLikelyBinaryFile(absolutePath)) {
    recordSkippedFile(diagnostics, {
      absolutePath,
      relativePath,
      reason: "binary",
      sizeBytes: info.size
    });
    return null;
  }
  return {
    id: makeFileId(workspaceIndexId, absolutePath),
    absolutePath,
    relativePath,
    rootPath: rootPath.absolutePath,
    sizeBytes: info.size,
    lastModifiedTime,
    kind: detected.kind,
    format: detected.format
  };
}
var MAX_SKIPPED_FILE_SAMPLES = 20;
function createScanDiagnostics() {
  return {
    skippedFiles: 0,
    skippedByReason: {
      empty: 0,
      too_large: 0,
      unsupported: 0,
      binary: 0
    },
    skippedSamples: []
  };
}
function recordSkippedFile(diagnostics, skipped) {
  diagnostics.skippedFiles++;
  diagnostics.skippedByReason[skipped.reason]++;
  if (diagnostics.skippedSamples.length < MAX_SKIPPED_FILE_SAMPLES) {
    diagnostics.skippedSamples.push(skipped);
  }
}
async function isLikelyBinaryFile(path) {
  let handle;
  try {
    handle = await open(path, "r");
    const buffer = Buffer.alloc(BINARY_SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead === 0) {
      return false;
    }
    let suspicious = 0;
    for (let index = 0; index < bytesRead; index++) {
      const value = buffer[index];
      if (value === 0) {
        return true;
      }
      if (isSuspiciousControlByte(value)) {
        suspicious++;
      }
    }
    return suspicious / bytesRead > BINARY_CONTROL_CHAR_RATIO;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => void 0);
  }
}
function isSuspiciousControlByte(value) {
  return value < 32 && value !== 7 && value !== 8 && value !== 9 && value !== 10 && value !== 12 && value !== 13 && value !== 27;
}
function makeFileId(workspaceIndexId, absolutePath) {
  return sha256Text(`${workspaceIndexId}\0${normalizePath(absolutePath)}`);
}

// dist/engine/pipeline/indexing/input-budget.js
var DEFAULT_CHARS_PER_100_TOKENS = 185;
var TOKEN_DENSE_CHARS_PER_100_TOKENS = 100;
var TOKEN_DENSE_WINDOW_CHARS = 16 * 1024;
var TOKEN_DENSE_WINDOW_STEP_CHARS = 8 * 1024;
var TOKEN_DENSE_PERCENT = 30;
var CHUNK_OVERLAP_PERCENT = 15;
function indexChunkOptions(maxInputTokens, text) {
  if (maxInputTokens === void 0) {
    return {};
  }
  const charsPer100Tokens = isTokenDenseText(text, maxInputTokens) ? TOKEN_DENSE_CHARS_PER_100_TOKENS : DEFAULT_CHARS_PER_100_TOKENS;
  const maxChunkChars = Math.floor(maxInputTokens * charsPer100Tokens / 100);
  const chunkOverlapChars = Math.floor(maxChunkChars * CHUNK_OVERLAP_PERCENT / 100);
  return { maxChunkChars, chunkOverlapChars };
}
function isTokenDenseText(text, maxInputTokens) {
  if (text === void 0 || text.length <= maxInputTokens * TOKEN_DENSE_CHARS_PER_100_TOKENS / 100) {
    return false;
  }
  if (text.length <= TOKEN_DENSE_WINDOW_CHARS) {
    return isTokenDenseWindow(text, 0, text.length);
  }
  const lastWindowStart = text.length - TOKEN_DENSE_WINDOW_CHARS;
  for (let start = 0; start <= lastWindowStart; start += TOKEN_DENSE_WINDOW_STEP_CHARS) {
    if (isTokenDenseWindow(text, start, TOKEN_DENSE_WINDOW_CHARS)) {
      return true;
    }
  }
  return lastWindowStart % TOKEN_DENSE_WINDOW_STEP_CHARS !== 0 && isTokenDenseWindow(text, lastWindowStart, TOKEN_DENSE_WINDOW_CHARS);
}
function isTokenDenseWindow(text, start, length) {
  let denseChars = 0;
  const end = start + length;
  const requiredDenseChars = Math.ceil(length * TOKEN_DENSE_PERCENT / 100);
  for (let index = start; index < end; index++) {
    const code = text.charCodeAt(index);
    const asciiLetter = code >= 65 && code <= 90 || code >= 97 && code <= 122;
    if (!asciiLetter && code !== 32 && code !== 9) {
      denseChars++;
      if (denseChars >= requiredDenseChars) {
        return true;
      }
    }
  }
  return false;
}

// dist/engine/pipeline/indexing/index.js
var EMBEDDING_TRANSIENT_MAX_RETRIES = 3;
var EMBEDDING_RATE_LIMIT_MAX_RETRIES = 6;
var EMBEDDING_TRANSIENT_RETRY_BASE_DELAY_MS = 500;
var EMBEDDING_RATE_LIMIT_RETRY_BASE_DELAY_MS = 2e3;
var EMBEDDING_TRANSIENT_RETRY_MAX_DELAY_MS = 8e3;
var EMBEDDING_RATE_LIMIT_RETRY_MAX_DELAY_MS = 3e4;
var EMBEDDING_RETRY_JITTER_MS = 500;
var EMBEDDING_SUCCESS_STREAK_MIN = 4;
async function indexWorkspace(ctx) {
  try {
    return await indexWorkspaceUnchecked(ctx);
  } catch (error) {
    throw toEngineError(error, "Indexing workspace failed", {
      code: "ZVEC_GREP.ENGINE.INDEXING.WORKSPACE_FAILED",
      context: workspaceIndexContext(ctx.workspaceIndex)
    });
  }
}
async function indexWorkspacePaths(ctx, changedPaths) {
  try {
    return await indexWorkspacePathsUnchecked(ctx, changedPaths);
  } catch (error) {
    throw toEngineError(error, "Indexing changed paths failed", {
      code: "ZVEC_GREP.ENGINE.INDEXING.WORKSPACE_FAILED",
      context: workspaceIndexContext(ctx.workspaceIndex)
    });
  }
}
async function getWorkspaceIndexStatus(workspaceIndex, storedFiles) {
  try {
    const scan = await scanRootPaths(workspaceIndex.id, workspaceIndex.rootPaths, { knownFiles: storedFiles });
    const diff = await computeDiffFromFiles(scan.files, storedFiles);
    const pendingFiles = storedFiles.filter((file) => file.indexStatus?.indexedTime === null);
    const failedFiles = pendingFiles.filter((file) => file.indexStatus?.error !== void 0);
    const indexedFiles = storedFiles.filter((file) => file.indexStatus?.indexedTime !== void 0 && file.indexStatus.indexedTime !== null);
    const entitiesIndexed = indexedFiles.reduce((count, file) => count + (file.indexStatus?.entityCount ?? 0), 0);
    const fragmentsTruncated = indexedFiles.reduce((count, file) => count + (file.indexStatus?.truncatedFragmentCount ?? 0), 0);
    return {
      filesScanned: scan.files.length,
      filesStored: storedFiles.length,
      filesIndexed: indexedFiles.length,
      entitiesIndexed,
      fragmentsTruncated,
      filesPending: pendingFiles.length,
      filesFailed: failedFiles.length,
      filesAdded: diff.added.length,
      filesModified: diff.modified.length,
      filesDeleted: diff.deleted.length,
      filesUnchanged: diff.unchanged.length,
      pendingFiles,
      failedFiles,
      addedFiles: diff.added,
      modifiedFiles: diff.modified,
      deletedFiles: diff.deleted
    };
  } catch (error) {
    throw toEngineError(error, "Inspecting workspace index status failed", {
      code: "ZVEC_GREP.ENGINE.INDEXING.STATUS_FAILED",
      context: workspaceIndexContext(workspaceIndex)
    });
  }
}
async function indexWorkspaceUnchecked(ctx) {
  const start = Date.now();
  const report = ctx.onProgress ?? (() => void 0);
  const timings = new TimingCollector();
  throwIfIndexCancelled(ctx);
  const firstPass = await runIndexPass(ctx, report, "Scanning files...", timings);
  const passes = [firstPass];
  let progressBase;
  if (firstPass.stats.filesFailed > 0) {
    const failed = firstPass.stats.filesFailed;
    progressBase = retryProgressBase(firstPass);
    report({
      phase: "scanning",
      filesTotal: progressBase.filesTotal,
      filesIndexed: progressBase.filesSucceeded,
      detail: `Retrying ${failed} failed ${failed === 1 ? "file" : "files"}...`
    });
    passes.push(await runIndexPass(ctx, report, "Scanning retry candidates...", timings, progressBase));
  }
  const finalPass = passes[passes.length - 1];
  throwIfIndexCancelled(ctx);
  reportIndexFinalizing(ctx, report, finalPass, progressBase);
  await timings.time("index_optimize", () => optimizeStorage(ctx));
  const result = buildIndexResult(ctx, passes, Date.now() - start, timings);
  if (result.filesFailed > 0) {
    report({ phase: "done", detail: "Indexing completed with failed files" });
    throw new EngineError(`Indexing completed with ${result.filesFailed} failed ${result.filesFailed === 1 ? "file" : "files"}`, {
      code: "ZVEC_GREP.ENGINE.INDEXING.FILES_FAILED",
      context: errorDetails([
        workspaceIndexDetail(ctx.workspaceIndex.name),
        detail("filesFailed", result.filesFailed),
        detail("filesScanned", result.filesScanned),
        detail("failedFiles", summarizeFailedFiles(finalPass.stats.failedFiles)),
        detail("failedReasons", summarizeFailedFiles(finalPass.stats.failedFileReasons)),
        detail("hint", passes.length > 1 ? "Retried failed files once automatically; if failures persist, fix the failed files or embedding configuration." : "If the failure was transient, rerun the same indexing command; if it persists, fix the failed files or embedding configuration.")
      ])
    });
  }
  report({ phase: "done", detail: "Indexing complete" });
  return result;
}
async function indexWorkspacePathsUnchecked(ctx, changedPaths) {
  const start = Date.now();
  const report = ctx.onProgress ?? (() => void 0);
  const timings = new TimingCollector();
  const normalizedPaths = [...new Set(changedPaths.map(normalizePath))];
  throwIfIndexCancelled(ctx);
  const firstPass = await runPathIndexPass(ctx, report, normalizedPaths, timings);
  const passes = [firstPass];
  let progressBase;
  if (firstPass.stats.filesFailed > 0) {
    progressBase = retryProgressBase(firstPass);
    passes.push(await runPathIndexPass(ctx, report, normalizedPaths, timings, progressBase));
  }
  const finalPass = passes[passes.length - 1];
  throwIfIndexCancelled(ctx);
  reportIndexFinalizing(ctx, report, finalPass, progressBase);
  await timings.time("index_optimize", () => optimizeStorage(ctx));
  const result = buildIndexResult(ctx, passes, Date.now() - start, timings);
  if (result.filesFailed > 0) {
    throw new EngineError(`Indexing completed with ${result.filesFailed} failed files`, {
      code: "ZVEC_GREP.ENGINE.INDEXING.FILES_FAILED",
      context: workspaceIndexContext(ctx.workspaceIndex)
    });
  }
  report({ phase: "done", detail: "Indexing complete" });
  return result;
}
async function runPathIndexPass(ctx, report, changedPaths, timings, progressBase) {
  reportScanning(report, "Scanning changed paths...", progressBase);
  const scanned = await timings.time("index_scan_paths", async () => {
    const files = [];
    const diagnostics = emptyScanDiagnostics();
    for (const path of changedPaths) {
      throwIfIndexCancelled(ctx);
      const info = await lstat2(path).catch(() => null);
      const scan = info?.isDirectory() ? await scanDirectoryPath(ctx.workspaceIndex.id, ctx.workspaceIndex.rootPaths, path, { signal: ctx.signal }) : await scanFilePath(ctx.workspaceIndex.id, ctx.workspaceIndex.rootPaths, path, {
        signal: ctx.signal
      });
      files.push(...scan.files);
      mergeScanDiagnostics(diagnostics, scan.diagnostics);
    }
    return {
      files: [...new Map(files.map((file) => [file.id, file])).values()],
      diagnostics
    };
  });
  throwIfIndexCancelled(ctx);
  const exactExisting = [];
  const prefixPaths = [];
  for (const path of changedPaths) {
    const exact = ctx.storage.getFileByPath(path);
    if (exact) {
      exactExisting.push(exact);
    } else {
      prefixPaths.push(path);
    }
  }
  const existing = [
    ...new Map([
      ...exactExisting,
      ...ctx.storage.listFilesByPathPrefixes(prefixPaths)
    ].map((file) => [file.id, file])).values()
  ];
  return runDiffPass(ctx, report, scanned.files, existing, timings, progressBase, scanned.diagnostics);
}
async function runIndexPass(ctx, report, scanningDetail, timings, progressBase) {
  reportScanning(report, scanningDetail, progressBase);
  const existing = ctx.storage.listFiles();
  const scan = await timings.time("index_scan", () => scanRootPaths(ctx.workspaceIndex.id, ctx.workspaceIndex.rootPaths, {
    signal: ctx.signal,
    knownFiles: existing
  }));
  throwIfIndexCancelled(ctx);
  return runDiffPass(ctx, report, scan.files, existing, timings, progressBase, scan.diagnostics);
}
async function runDiffPass(ctx, report, scannedFiles, existingFiles, timings, progressBase, scanDiagnostics = emptyScanDiagnostics()) {
  const diff = await timings.time("index_diff", () => computeDiffFromFiles(scannedFiles, existingFiles));
  throwIfIndexCancelled(ctx);
  const pending = [...diff.added, ...diff.modified, ...diff.pending];
  report({
    phase: "scanning",
    filesTotal: progressBase?.filesTotal ?? scannedFiles.length,
    filesIndexed: progressBase?.filesSucceeded ?? 0,
    detail: `${diff.added.length} added, ${diff.modified.length} modified, ${diff.pending.length} pending, ${diff.deleted.length} deleted, ${diff.unchanged.length} unchanged`
  });
  timings.timeSync("index_delete_stale", () => {
    for (const file of diff.deleted) {
      throwIfIndexCancelled(ctx);
      try {
        ctx.storage.deleteFile(file.id);
      } catch (error) {
        throw toEngineError(error, "Indexing failed to delete stale file records", {
          code: "ZVEC_GREP.ENGINE.INDEXING.DELETE_FILE_FAILED",
          context: fileContext(file)
        });
      }
    }
  });
  const reportIndexing = (currentStats, detail2, embedding) => {
    report({
      phase: "indexing",
      filesTotal: progressBase?.filesTotal ?? pending.length,
      filesIndexed: (progressBase?.filesSucceeded ?? 0) + currentStats.filesIndexed + currentStats.filesFailed,
      filesFailed: currentStats.filesFailed,
      detail: detail2,
      embedding
    });
  };
  reportIndexing({
    filesIndexed: 0,
    filesFailed: 0,
    failedFiles: [],
    failedFileReasons: [],
    entitiesCreated: 0
  });
  const stats = await indexFiles(pending, ctx, reportIndexing, timings);
  throwIfIndexCancelled(ctx);
  return {
    filesScanned: scannedFiles.length,
    scanDiagnostics,
    diff,
    stats
  };
}
function reportIndexFinalizing(ctx, report, pass, progressBase) {
  report({
    phase: "indexing",
    filesTotal: progressBase?.filesTotal ?? pass.diff.added.length + pass.diff.modified.length + pass.diff.pending.length,
    filesIndexed: (progressBase?.filesSucceeded ?? 0) + pass.stats.filesIndexed + pass.stats.filesFailed,
    filesFailed: pass.stats.filesFailed,
    detail: "finalizing index"
  });
}
function retryProgressBase(pass) {
  return {
    filesSucceeded: pass.stats.filesIndexed,
    filesTotal: pass.diff.added.length + pass.diff.modified.length + pass.diff.pending.length
  };
}
function reportScanning(report, detail2, progressBase) {
  report({
    phase: "scanning",
    ...progressBase ? {
      filesTotal: progressBase.filesTotal,
      filesIndexed: progressBase.filesSucceeded
    } : {},
    detail: detail2
  });
}
function buildIndexResult(ctx, passes, durationMs, timings) {
  const firstPass = passes[0];
  const retryPasses = passes.slice(1);
  const finalPass = passes[passes.length - 1];
  return {
    filesScanned: finalPass.filesScanned,
    filesAdded: firstPass.diff.added.length + retryPasses.reduce((count, pass) => count + pass.diff.added.length, 0),
    filesModified: firstPass.diff.modified.length + retryPasses.reduce((count, pass) => count + pass.diff.modified.length, 0),
    filesPending: firstPass.diff.pending.length + retryPasses.reduce((count, pass) => count + pass.diff.pending.length, 0),
    filesDeleted: firstPass.diff.deleted.length + retryPasses.reduce((count, pass) => count + pass.diff.deleted.length, 0),
    filesUnchanged: firstPass.diff.unchanged.length,
    filesFailed: finalPass.stats.filesFailed,
    entitiesCreated: passes.reduce((count, pass) => count + pass.stats.entitiesCreated, 0),
    durationMs,
    timings: timings.entries(),
    ...finalPass.scanDiagnostics.skippedFiles > 0 ? { scanDiagnostics: finalPass.scanDiagnostics } : {}
  };
}
var MAX_SKIPPED_FILE_SAMPLES2 = 20;
function emptyScanDiagnostics() {
  return {
    skippedFiles: 0,
    skippedByReason: {
      empty: 0,
      too_large: 0,
      unsupported: 0,
      binary: 0
    },
    skippedSamples: []
  };
}
function mergeScanDiagnostics(target, source) {
  target.skippedFiles += source.skippedFiles;
  for (const reason of [
    "empty",
    "too_large",
    "unsupported",
    "binary"
  ]) {
    target.skippedByReason[reason] += source.skippedByReason[reason];
  }
  const remaining = MAX_SKIPPED_FILE_SAMPLES2 - target.skippedSamples.length;
  if (remaining > 0) {
    target.skippedSamples.push(...source.skippedSamples.slice(0, remaining));
  }
}
async function optimizeStorage(ctx) {
  try {
    await ctx.storage.finalizeWrites();
  } catch (error) {
    throw toEngineError(error, "Indexing failed to finalize storage", {
      code: "ZVEC_GREP.ENGINE.INDEXING.OPTIMIZE_FAILED",
      context: workspaceIndexContext(ctx.workspaceIndex)
    });
  }
}
async function computeDiffFromFiles(scannedFiles, existingFiles) {
  const existingById = new Map(existingFiles.map((file) => [file.id, file]));
  const seen = /* @__PURE__ */ new Set();
  const added = [];
  const modified = [];
  const pending = [];
  const unchanged = [];
  for (const file of scannedFiles) {
    seen.add(file.id);
    const existing = existingById.get(file.id);
    if (!existing) {
      added.push(await withContentHash(file));
      continue;
    }
    if (existing.indexStatus?.indexedTime === null) {
      pending.push(await withContentHash(file));
      continue;
    }
    if (existing.sizeBytes === file.sizeBytes && existing.lastModifiedTime === file.lastModifiedTime && existing.contentHash) {
      unchanged.push(existing);
      continue;
    }
    const hashed = await withContentHash(file);
    if (existing.sizeBytes === hashed.sizeBytes && existing.contentHash === hashed.contentHash) {
      unchanged.push(existing);
      continue;
    }
    modified.push(hashed);
  }
  const deleted = [...existingById.values()].filter((file) => !seen.has(file.id));
  return { added, modified, pending, deleted, unchanged };
}
async function indexFiles(files, ctx, onProgress, timings) {
  const stats = {
    filesIndexed: 0,
    filesFailed: 0,
    failedFiles: [],
    failedFileReasons: [],
    entitiesCreated: 0
  };
  const batchFiles = [];
  let batchFragmentCount = 0;
  const embeddingScheduler = createEmbeddingScheduler(ctx.embeddingConcurrency, ctx.embeddingModel);
  const embeddingTiming = new ConcurrentTiming(timings, "index_embedding");
  const runningEmbeddings = /* @__PURE__ */ new Set();
  const reportEmbeddingProgress = (currentStats, detail2) => {
    onProgress(currentStats, detail2, embeddingScheduler.snapshot());
  };
  const flushBatch = async () => {
    throwIfIndexCancelled(ctx);
    if (batchFiles.length === 0) {
      return;
    }
    const filesToEmbed = batchFiles.splice(0);
    batchFragmentCount = 0;
    await scheduleEmbeddingTask(() => embedAndCommitBatch(filesToEmbed, ctx, stats, onProgress, embeddingScheduler, timings, embeddingTiming));
  };
  const scheduleEmbeddingTask = async (task) => {
    throwIfIndexCancelled(ctx);
    const promise = task().finally(() => {
      runningEmbeddings.delete(promise);
    });
    runningEmbeddings.add(promise);
    if (runningEmbeddings.size >= embeddingScheduler.taskConcurrency) {
      await Promise.race(runningEmbeddings);
    }
  };
  try {
    for (const file of files) {
      throwIfIndexCancelled(ctx);
      onProgress(stats, `reading ${file.relativePath}`);
      const prepared = await timings.time("index_prepare", () => prepareFile(file, ctx));
      throwIfIndexCancelled(ctx);
      if ("failedReason" in prepared) {
        recordFileFailed(stats, file, prepared.failedReason);
        onProgress(stats, `failed ${file.relativePath}`);
        continue;
      }
      if (prepared.fragments.length === 0) {
        const committed = commitFile(prepared, [], ctx, stats);
        onProgress(stats, finishedFileDetail(committed, file.relativePath));
        continue;
      }
      if (prepared.fragments.length > ctx.embeddingModel.info.limits.maxBatchSize) {
        await flushBatch();
        await scheduleEmbeddingTask(async () => {
          throwIfIndexCancelled(ctx);
          reportEmbeddingProgress(stats, `embedding ${file.relativePath}`);
          await embedAndCommitFile(prepared, ctx, stats, onProgress, embeddingScheduler, timings, embeddingTiming);
        });
        continue;
      }
      if (batchFragmentCount > 0 && batchFragmentCount + prepared.fragments.length > ctx.embeddingModel.info.limits.maxBatchSize) {
        await flushBatch();
      }
      batchFiles.push(prepared);
      batchFragmentCount += prepared.fragments.length;
      if (batchFragmentCount === ctx.embeddingModel.info.limits.maxBatchSize) {
        await flushBatch();
      }
    }
    await flushBatch();
    await Promise.all(runningEmbeddings);
  } catch (error) {
    await Promise.allSettled(runningEmbeddings);
    throw error;
  }
  throwIfIndexCancelled(ctx);
  return stats;
}
async function prepareFile(file, ctx) {
  try {
    throwIfIndexCancelled(ctx);
    const source = await readSource(file);
    const chunkOptions = indexChunkOptions(ctx.embeddingModel.info.limits.maxInputTokens, source.kind === "text" ? source.text : void 0);
    const extracted = await extractForIndexing(source, chunkOptions);
    throwIfIndexCancelled(ctx);
    const fragments = extracted.filter(({ fragment }) => ctx.embeddingModel.info.inputKinds.includes(fragment.content.kind)).map(({ fragment, embeddingSource }) => ({
      fragment,
      embeddingContent: vectorContentForFragment(fragment, embeddingSource, chunkOptions.maxChunkChars)
    }));
    return { file, fragments };
  } catch (error) {
    if (indexIsCancelled(ctx)) {
      throw indexCancellationError(ctx);
    }
    return {
      file,
      failedReason: markFileFailed(ctx, file, error, "prepare")
    };
  }
}
async function embedAndCommitBatch(files, ctx, stats, onProgress, embeddingScheduler, timings, embeddingTiming) {
  try {
    throwIfIndexCancelled(ctx);
    const contents = files.flatMap((file) => file.fragments.map((fragment) => fragment.embeddingContent));
    onProgress(stats, `embedding ${describePreparedFiles(files)}`, embeddingScheduler.snapshot());
    const embedding = await embeddingTiming.time(() => embedContentsWithRetry(contents, ctx.embeddingModel, embeddingScheduler, ctx.signal, (progress) => reportModelDownloadProgress(stats, progress, onProgress, embeddingScheduler)));
    const truncatedInputIndexes = new Set(embedding.truncated);
    throwIfIndexCancelled(ctx);
    let offset = 0;
    for (const file of files) {
      throwIfIndexCancelled(ctx);
      const end = offset + file.fragments.length;
      const fileVectors = embedding.vectors.slice(offset, end);
      let truncatedFragmentCount = 0;
      for (let index = offset; index < end; index++) {
        if (truncatedInputIndexes.has(index)) {
          truncatedFragmentCount++;
        }
      }
      offset += file.fragments.length;
      const committed = timings.timeSync("index_commit", () => commitFile(file, fileVectors, ctx, stats, truncatedFragmentCount));
      onProgress(stats, finishedFileDetail(committed, file.file.relativePath));
    }
  } catch (error) {
    if (indexIsCancelled(ctx)) {
      throw indexCancellationError(ctx);
    }
    if (isRetryableEmbeddingError(error)) {
      for (const file of files) {
        const reason = markFileFailed(ctx, file.file, error, "embed");
        recordFileFailed(stats, file.file, reason);
        onProgress(stats, finishedFileDetail(false, file.file.relativePath));
      }
      return;
    }
    for (const file of files) {
      onProgress(stats, `embedding ${file.file.relativePath}`, embeddingScheduler.snapshot());
      await embedAndCommitFile(file, ctx, stats, onProgress, embeddingScheduler, timings, embeddingTiming);
    }
  }
}
async function embedAndCommitFile(file, ctx, stats, onProgress, embeddingScheduler, timings, embeddingTiming) {
  try {
    throwIfIndexCancelled(ctx);
    const embedding = await embeddingTiming.time(() => embedFragments(file.fragments, ctx.embeddingModel, embeddingScheduler, ctx.signal, (progress) => reportModelDownloadProgress(stats, progress, onProgress, embeddingScheduler)));
    throwIfIndexCancelled(ctx);
    const committed = timings.timeSync("index_commit", () => commitFile(file, embedding.vectors, ctx, stats, embedding.truncated.length));
    onProgress(stats, finishedFileDetail(committed, file.file.relativePath));
  } catch (error) {
    if (indexIsCancelled(ctx)) {
      throw indexCancellationError(ctx);
    }
    const reason = markFileFailed(ctx, file.file, error, "embed");
    recordFileFailed(stats, file.file, reason);
    onProgress(stats, finishedFileDetail(false, file.file.relativePath));
  }
}
function commitFile(file, vectors, ctx, stats, truncatedFragmentCount = 0) {
  try {
    throwIfIndexCancelled(ctx);
    if (file.fragments.length !== vectors.length) {
      throw new EngineError("Embedding returned mismatched entity/vector counts", {
        code: "ZVEC_GREP.ENGINE.STORAGE.ENTITY_VECTOR_COUNT_MISMATCH",
        context: `fileId=${file.file.id} fragmentCount=${file.fragments.length} vectorCount=${vectors.length}`
      });
    }
    ctx.storage.replaceFile(file.file, file.fragments.map(({ fragment }, index) => ({
      fragment,
      vector: vectors[index]
    })), {
      truncatedFragmentCount
    });
    stats.filesIndexed++;
    stats.entitiesCreated += countPublicEntities(file.fragments.map(({ fragment }) => fragment));
    return true;
  } catch (error) {
    if (indexIsCancelled(ctx)) {
      throw indexCancellationError(ctx);
    }
    const reason = markFileFailed(ctx, file.file, error, "commit");
    recordFileFailed(stats, file.file, reason);
    return false;
  }
}
function throwIfIndexCancelled(ctx) {
  if (!indexIsCancelled(ctx)) {
    return;
  }
  throw indexCancellationError(ctx);
}
function indexIsCancelled(ctx) {
  return ctx.signal?.aborted === true;
}
function indexCancellationError(ctx) {
  return ctx.signal?.reason instanceof Error ? ctx.signal.reason : new EngineError("Indexing was cancelled.", {
    code: "ZVEC_GREP.ENGINE.INDEXING.CANCELLED",
    context: workspaceIndexContext(ctx.workspaceIndex)
  });
}
function recordFileFailed(stats, file, reason) {
  stats.filesFailed++;
  stats.failedFiles.push(file.relativePath);
  if (reason) {
    stats.failedFileReasons.push(`${file.relativePath}: ${reason}`);
  }
}
function summarizeFailedFiles(files) {
  const shown = files.slice(0, 5);
  const remaining = files.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} and ${remaining} more` : shown.join(", ");
}
function describePreparedFiles(files) {
  if (files.length === 0) {
    return "0 files";
  }
  if (files.length === 1) {
    return files[0].file.relativePath;
  }
  return `${files.length} files, starting with ${files[0].file.relativePath}`;
}
function finishedFileDetail(succeeded, relativePath) {
  return succeeded ? `indexed ${relativePath}` : `failed ${relativePath}`;
}
async function readSource(file) {
  let bytes;
  try {
    bytes = await readFile3(file.absolutePath);
  } catch (error) {
    throw toEngineError(error, "Indexing failed to read source file", {
      code: "ZVEC_GREP.ENGINE.INDEXING.READ_SOURCE_FAILED",
      context: fileContext(file)
    });
  }
  if (file.kind === "image") {
    return {
      kind: "image",
      file,
      data: bytes,
      format: file.format
    };
  }
  return {
    kind: "text",
    file,
    text: bytes.toString("utf8")
  };
}
async function embedFragments(fragments, model, embeddingScheduler, signal, onModelProgress) {
  const batches = [];
  for (let start = 0; start < fragments.length; start += model.info.limits.maxBatchSize) {
    const batch = fragments.slice(start, start + model.info.limits.maxBatchSize);
    batches.push({ start, fragments: batch });
  }
  const vectors = new Array(fragments.length);
  const truncatedInputIndexes = [];
  const results = await Promise.allSettled(batches.map((batch) => embedFragmentBatch(batch.fragments, model, batch.start, embeddingScheduler, signal, onModelProgress)));
  let firstError;
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      firstError ??= result.reason;
      continue;
    }
    const start = batches[index].start;
    for (const [offset, vector] of result.value.vectors.entries()) {
      vectors[start + offset] = vector;
    }
    truncatedInputIndexes.push(...result.value.truncated.map((inputIndex) => start + inputIndex));
  }
  if (firstError) {
    throw firstError;
  }
  return {
    vectors,
    truncated: truncatedInputIndexes
  };
}
async function embedFragmentBatch(fragments, model, startIndex, embeddingScheduler, signal, onModelProgress) {
  const contents = fragments.map((fragment) => fragment.embeddingContent);
  try {
    return await embedContentsWithRetry(contents, model, embeddingScheduler, signal, onModelProgress);
  } catch (error) {
    if (fragments.length === 1 || isRetryableEmbeddingError(error)) {
      throw error;
    }
    return await embedFragmentBatchOneByOne(fragments, model, startIndex, embeddingScheduler, signal, onModelProgress);
  }
}
async function embedFragmentBatchOneByOne(fragments, model, startIndex, embeddingScheduler, signal, onModelProgress) {
  const vectors = [];
  const truncatedInputIndexes = [];
  for (const [index, fragment] of fragments.entries()) {
    try {
      const result = await embedContentsWithRetry([fragment.embeddingContent], model, embeddingScheduler, signal, onModelProgress);
      vectors.push(result.vectors[0]);
      if (result.truncated.length > 0) {
        truncatedInputIndexes.push(index);
      }
    } catch (error) {
      throw new EngineError("Embedding entity fragment failed after one-by-one fallback", {
        code: "ZVEC_GREP.ENGINE.INDEXING.EMBEDDING_FRAGMENT_FAILED",
        context: errorDetails([
          detail("model", model.info.reference),
          detail("fragmentId", fragment.fragment.id),
          detail("fragmentIndex", startIndex + index),
          isEngineError(error) ? detail("causeCode", error.code) : null,
          error instanceof Error ? detail("cause", error.message) : null,
          isEngineError(error) ? error.context : null
        ]),
        cause: error
      });
    }
  }
  return {
    vectors,
    truncated: truncatedInputIndexes
  };
}
async function embedContentsWithRetry(contents, model, embeddingScheduler, signal, onModelProgress) {
  let attempt = 0;
  while (true) {
    let retry = nonRetryableEmbeddingError();
    let delayMs = 0;
    try {
      throwIfAborted2(signal);
      const result = await embeddingScheduler.run(() => model.embed(contents, {
        purpose: "document",
        signal,
        onProgress: onModelProgress
      }), signal, (error) => {
        retry = classifyEmbeddingRetry(error);
        delayMs = retryDelayMs(attempt, retry);
        if (retry.retryable) {
          embeddingScheduler.recordRetryableFailure({
            rateLimited: retry.rateLimited,
            delayMs
          });
        }
      });
      embeddingScheduler.recordSuccess();
      return result;
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason instanceof Error ? signal.reason : new Error("Embedding was cancelled.");
      }
      if (!retry.retryable) {
        retry = classifyEmbeddingRetry(error);
        delayMs = retryDelayMs(attempt, retry);
      }
      if (attempt >= maxRetryAttempts(retry) || !retry.retryable) {
        throw error;
      }
      await abortableDelay(delayMs, signal);
      attempt++;
    }
  }
}
function reportModelDownloadProgress(stats, progress, onProgress, embeddingScheduler) {
  onProgress(stats, `downloading ${progress.model}`, {
    ...embeddingScheduler.snapshot(),
    ...progress
  });
}
function createEmbeddingScheduler(requestedConcurrency, model) {
  return new AdaptiveEmbeddingScheduler(resolveEmbeddingConcurrencyPolicy(requestedConcurrency, model));
}
function resolveEmbeddingConcurrencyPolicy(requestedConcurrency, model) {
  if (requestedConcurrency !== void 0 && Number.isInteger(requestedConcurrency) && requestedConcurrency > 0) {
    return {
      initial: requestedConcurrency,
      min: 1,
      max: requestedConcurrency,
      adaptive: requestedConcurrency > 1
    };
  }
  const remote = model.info.provider === "qwen";
  const multimodal = model.info.inputKinds.includes("image");
  const configuredLocalDefault = model.info.defaultConcurrency;
  const localDefault = configuredLocalDefault !== void 0 && Number.isInteger(configuredLocalDefault) && configuredLocalDefault > 0 ? configuredLocalDefault : 1;
  const initial = remote ? multimodal ? 4 : 8 : localDefault;
  const max = remote ? multimodal ? 8 : 12 : localDefault;
  const min = Math.min(initial, 4);
  return {
    initial,
    min,
    max: Math.max(initial, max),
    adaptive: max > 1
  };
}
var AdaptiveEmbeddingScheduler = class {
  policy;
  active = 0;
  cooldownUntil = 0;
  currentConcurrency;
  retryableFailures = 0;
  successStreak = 0;
  queue = [];
  constructor(policy) {
    this.policy = policy;
    this.currentConcurrency = policy.initial;
  }
  get taskConcurrency() {
    return this.policy.max;
  }
  async run(task, signal, onError) {
    throwIfAborted2(signal);
    await this.waitForCooldown(signal);
    await this.acquire(signal);
    try {
      await this.waitForCooldown(signal);
      throwIfAborted2(signal);
      return await task();
    } catch (error) {
      onError?.(error);
      throw error;
    } finally {
      this.release();
    }
  }
  recordSuccess() {
    if (!this.policy.adaptive || this.currentConcurrency >= this.policy.max) {
      return;
    }
    this.successStreak++;
    if (this.successStreak < Math.max(EMBEDDING_SUCCESS_STREAK_MIN, this.currentConcurrency * 2)) {
      return;
    }
    this.currentConcurrency++;
    this.successStreak = 0;
    this.drainQueue();
  }
  recordRetryableFailure(retry) {
    this.retryableFailures++;
    if (retry.rateLimited && retry.delayMs > 0) {
      this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + retry.delayMs);
    }
    if (!this.policy.adaptive) {
      return;
    }
    this.currentConcurrency = Math.max(this.policy.min, Math.floor(this.currentConcurrency / 2));
    this.successStreak = 0;
  }
  snapshot() {
    return {
      concurrency: this.currentConcurrency,
      maxConcurrency: this.policy.max,
      retryableFailures: this.retryableFailures
    };
  }
  async waitForCooldown(signal) {
    const remaining = this.cooldownUntil - Date.now();
    if (remaining > 0) {
      await abortableDelay(remaining, signal);
    }
  }
  async acquire(signal) {
    throwIfAborted2(signal);
    if (this.active < this.currentConcurrency) {
      this.active++;
      return;
    }
    await new Promise((resolve9, reject) => {
      const queued = () => {
        signal?.removeEventListener("abort", abort);
        resolve9();
      };
      const abort = () => {
        const index = this.queue.indexOf(queued);
        if (index >= 0) {
          this.queue.splice(index, 1);
        }
        reject(abortError(signal));
      };
      if (signal?.aborted) {
        reject(abortError(signal));
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      this.queue.push(queued);
    });
  }
  release() {
    this.active--;
    this.drainQueue();
  }
  drainQueue() {
    while (this.active < this.currentConcurrency) {
      const resolve9 = this.queue.shift();
      if (!resolve9) {
        return;
      }
      this.active++;
      resolve9();
    }
  }
};
function oneLine3(value) {
  return value.replace(/\s+/g, " ").trim();
}
function isRetryableEmbeddingError(error) {
  return classifyEmbeddingRetry(error).retryable;
}
function classifyEmbeddingRetry(error) {
  const message = errorToMessage(error);
  const context = isEngineError(error) && error.context ? ` ${error.context}` : "";
  const text = `${message}${context}`;
  const status = httpStatusFromText(text);
  const rateLimited = status === 429 || /rate limit|quota exceeded|too many requests|request rate increased too quickly/i.test(text);
  const serverError = typeof status === "number" && status >= 500 && status <= 599;
  return {
    retryable: rateLimited || serverError,
    rateLimited,
    retryAfterMs: retryAfterMsFromText(text)
  };
}
function nonRetryableEmbeddingError() {
  return {
    retryable: false,
    rateLimited: false
  };
}
function maxRetryAttempts(retry) {
  return retry.rateLimited ? EMBEDDING_RATE_LIMIT_MAX_RETRIES : EMBEDDING_TRANSIENT_MAX_RETRIES;
}
function retryDelayMs(attempt, retry) {
  if (typeof retry.retryAfterMs === "number") {
    return retry.retryAfterMs;
  }
  const base = retry.rateLimited ? EMBEDDING_RATE_LIMIT_RETRY_BASE_DELAY_MS : EMBEDDING_TRANSIENT_RETRY_BASE_DELAY_MS;
  const max = retry.rateLimited ? EMBEDDING_RATE_LIMIT_RETRY_MAX_DELAY_MS : EMBEDDING_TRANSIENT_RETRY_MAX_DELAY_MS;
  const exponential = base * 2 ** attempt;
  const jitter = Math.floor(Math.random() * EMBEDDING_RETRY_JITTER_MS);
  return Math.min(exponential + jitter, max);
}
function httpStatusFromText(text) {
  const match = /\bstatus=(\d{3})\b/i.exec(text);
  if (!match) {
    return void 0;
  }
  return Number(match[1]);
}
function retryAfterMsFromText(text) {
  const milliseconds = /\bretryAfterMs=(\d+)\b/i.exec(text);
  if (milliseconds) {
    return Number(milliseconds[1]);
  }
  const seconds = /\bretryAfter=(\d+(?:\.\d+)?)\b/i.exec(text);
  if (seconds) {
    return Math.round(Number(seconds[1]) * 1e3);
  }
  return void 0;
}
function abortableDelay(ms, signal) {
  if (ms <= 0) {
    return Promise.resolve();
  }
  throwIfAborted2(signal);
  return new Promise((resolve9, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve9();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function throwIfAborted2(signal) {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}
function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("Embedding was cancelled.");
}
function countPublicEntities(fragments) {
  let count = 0;
  for (const fragment of fragments) {
    if (!fragment.group || fragment.group === fragment.id) {
      count++;
    }
  }
  return count;
}
async function withContentHash(file) {
  let bytes;
  try {
    bytes = await readFile3(file.absolutePath);
  } catch (error) {
    throw toEngineError(error, "Indexing failed to compute file content hash", {
      code: "ZVEC_GREP.ENGINE.INDEXING.CONTENT_HASH_FAILED",
      context: fileContext(file)
    });
  }
  return {
    ...file,
    contentHash: sha256Bytes(bytes)
  };
}
function markFileFailed(ctx, file, error, stage) {
  const reason = fileFailureReason(stage, error);
  try {
    ctx.storage.markFileFailed(file, reason);
    return reason;
  } catch (markError) {
    throw toEngineError(markError, "Indexing failed to record file failure", {
      code: "ZVEC_GREP.ENGINE.INDEXING.MARK_FILE_FAILED",
      context: `${fileContext(file)} stage=${stage} original=${reason}`
    });
  }
}
function fileFailureReason(stage, error) {
  return oneLine3(`${stage}: ${errorToMessage(error)}`);
}
function toEngineError(error, message, options) {
  if (isEngineError(error)) {
    return error;
  }
  return new EngineError(message, {
    ...options,
    cause: error
  });
}
function workspaceIndexContext(workspaceIndex) {
  return errorDetails([
    detail("workspace_index_id", workspaceIndex.id),
    workspaceIndexDetail(workspaceIndex.name)
  ]) ?? "";
}
function fileContext(file) {
  return `fileId=${file.id} path=${file.relativePath}`;
}
function errorToMessage(error) {
  if (isEngineError(error) && error.context) {
    return `${error.code}: ${error.message} (${error.context})`;
  }
  if (isEngineError(error)) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

// dist/engine/pipeline/search/index.js
var DEFAULT_LIMIT = 7;
var RRF_K = 60;
var RECALL_INITIAL_DEPTH = 200;
var RECALL_MAX_DEPTH = 2e3;
var RECALL_GROWTH_FACTOR = 2;
var RECALL_TARGET_FACTOR = 5;
var RECALL_MIN_TARGET_CANDIDATES = 50;
async function searchWorkspaceIndex(plan, ctx) {
  const timings = new TimingCollector();
  const result = await timings.time("search_total", async () => {
    const normalized = timings.timeSync("search_plan", () => validateSearchPlan(plan));
    const limit = normalized.limit ?? DEFAULT_LIMIT;
    const trace = normalized.trace === true || normalized.trackEntityId !== void 0;
    const fileTypePatterns = await timings.time("search_file_types", () => resolveFileTypePatterns(normalized.fileTypes, normalized.excludedFileTypes));
    const filter = timings.timeSync("search_filter", () => searchPlanToStorageFilter(normalized, ctx.storage, fileTypePatterns));
    const hasSearchableFiles = !filterMatchesNoFiles(filter);
    const candidates = /* @__PURE__ */ new Map();
    const vectorByRoute = hasSearchableFiles && planUsesVector(normalized) ? await timings.time("query_embedding", () => embedVectorRoutes(normalized.routes, requireEmbeddingModel(ctx, "searchPlan"))) : /* @__PURE__ */ new Map();
    let recallDepth = RECALL_INITIAL_DEPTH;
    if (hasSearchableFiles) {
      recallDepth = timings.timeSync("recall", () => collectAdaptiveRecall({
        routes: normalized.routes,
        filter,
        preferSymbol: normalized.preferSymbol === true,
        vectorByRoute,
        limit,
        storage: ctx.storage,
        candidates
      }));
    }
    if (normalized.trackEntityId) {
      timings.timeSync("force_track", () => forceTrackEntity({
        entityId: normalized.trackEntityId,
        routes: normalized.routes,
        vectorByRoute,
        recallDepth,
        filter,
        storage: ctx.storage,
        candidates
      }));
    }
    const fused = timings.timeSync("fusion", () => fuseCandidates(candidates));
    const visible = fused.slice(0, limit);
    const tracked = normalized.trackEntityId ? fused.find((candidate) => candidate.id === normalized.trackEntityId) : void 0;
    if (tracked && !visible.some((candidate) => candidate.id === tracked.id)) {
      visible.push(tracked);
    }
    const hits = timings.timeSync("materialize", () => visible.map((candidate) => candidateToHit(candidate, limit, trace)));
    const trackedHit = normalized.trackEntityId ? hits.find((hit) => hit.entity.id === normalized.trackEntityId) : void 0;
    return {
      plan: normalized,
      hits,
      trackedHit
    };
  });
  return {
    ...result,
    timings: timings.entries()
  };
}
function validateSearchPlan(plan) {
  if (!Array.isArray(plan.routes) || plan.routes.length === 0) {
    throw new EngineError("Search plan requires at least one route", {
      code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.EMPTY_ROUTES"
    });
  }
  const routeIds = /* @__PURE__ */ new Set();
  const routeCounts = /* @__PURE__ */ new Map();
  const routes = plan.routes.map((route, index) => {
    const query = typeof route.query === "string" ? route.query.trim() : "";
    if (route.mode !== "fts" && route.mode !== "vector") {
      throw new EngineError("Search plan route has an unsupported mode", {
        code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.UNSUPPORTED_ROUTE_MODE",
        context: `routeIndex=${index} mode=${String(route.mode)}`
      });
    }
    const id = makeDefaultRouteId(route.mode, routeCounts, routeIds);
    if (query.length === 0) {
      throw new EngineError("Search plan route requires a non-empty query", {
        code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.EMPTY_ROUTE_QUERY",
        context: `routeId=${id}`
      });
    }
    routeIds.add(id);
    return {
      id,
      mode: route.mode,
      query
    };
  });
  const modifiedAfter = normalizeModifiedTime(plan.modifiedAfter, "modifiedAfter");
  const modifiedBefore = normalizeModifiedTime(plan.modifiedBefore, "modifiedBefore");
  if (modifiedAfter !== void 0 && modifiedBefore !== void 0 && modifiedAfter > modifiedBefore) {
    throw new EngineError("Search plan modified-after filter must not be later than modified-before", {
      code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.INVALID_MODIFIED_TIME_RANGE",
      context: `modifiedAfter=${modifiedAfter} modifiedBefore=${modifiedBefore}`
    });
  }
  return {
    ...plan,
    routes,
    includePaths: normalizePathFilters(plan.includePaths, "includePaths"),
    excludePaths: normalizePathFilters(plan.excludePaths, "excludePaths"),
    globs: normalizeStringFilters(plan.globs, "globs"),
    insensitiveGlobs: normalizeStringFilters(plan.insensitiveGlobs, "insensitiveGlobs"),
    fileTypes: normalizeStringFilters(plan.fileTypes, "fileTypes"),
    excludedFileTypes: normalizeStringFilters(plan.excludedFileTypes, "excludedFileTypes"),
    modifiedAfter,
    modifiedBefore
  };
}
function makeDefaultRouteId(mode, routeCounts, usedRouteIds) {
  let count = routeCounts.get(mode) ?? 0;
  while (true) {
    count++;
    const id = count === 1 ? mode : `${mode}-${count}`;
    if (!usedRouteIds.has(id)) {
      routeCounts.set(mode, count);
      return id;
    }
  }
}
function planUsesVector(plan) {
  return plan.routes.some((route) => route.mode === "vector");
}
function requireEmbeddingModel(ctx, operation) {
  if (!ctx.embeddingModel) {
    throw new EngineError("Search operation requires an embedding model", {
      code: "ZVEC_GREP.ENGINE.SEARCH.EMBEDDING_MODEL_REQUIRED",
      context: errorDetails([
        workspaceIndexDetail(ctx.workspaceIndex.name),
        detail("operation", operation)
      ])
    });
  }
  return ctx.embeddingModel;
}
function normalizePathFilters(value, field) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    throw new EngineError("Search plan path filters must be arrays", {
      code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.INVALID_PATH_FILTERS",
      context: `field=${field}`
    });
  }
  const patterns = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw new EngineError("Search plan path filters must contain strings", {
        code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.INVALID_PATH_FILTER",
        context: `field=${field} index=${index}`
      });
    }
    const pattern = normalizePathFilterPattern(item);
    if (pattern.length > 0) {
      patterns.push(pattern);
    }
  }
  return patterns.length > 0 ? patterns : void 0;
}
function normalizeStringFilters(value, field) {
  if (value === void 0) {
    return void 0;
  }
  if (!Array.isArray(value)) {
    throw new EngineError("Search plan filters must be arrays", {
      code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.INVALID_FILTERS",
      context: `field=${field}`
    });
  }
  const values = value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new EngineError("Search plan filters must contain strings", {
        code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.INVALID_FILTER",
        context: `field=${field} index=${index}`
      });
    }
    return item.trim();
  });
  return values.length > 0 ? values : void 0;
}
function normalizeModifiedTime(value, field) {
  if (value === void 0) {
    return void 0;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new EngineError("Search plan modified time filters must be non-negative epoch milliseconds", {
      code: "ZVEC_GREP.ENGINE.SEARCH_PLAN.INVALID_MODIFIED_TIME_FILTER",
      context: `field=${field} value=${String(value)}`
    });
  }
  return value;
}
async function embedVectorRoutes(routes, model) {
  const vectorRoutes = routes.filter((route) => route.mode === "vector");
  const vectorsByRoute = /* @__PURE__ */ new Map();
  for (let start = 0; start < vectorRoutes.length; start += model.info.limits.maxBatchSize) {
    const batch = vectorRoutes.slice(start, start + model.info.limits.maxBatchSize);
    const { vectors } = await model.embed(batch.map((route) => ({
      kind: "text",
      text: route.query
    })), { purpose: "query" });
    for (const [index, route] of batch.entries()) {
      vectorsByRoute.set(route.id, vectors[index]);
    }
  }
  return vectorsByRoute;
}
function addRecallHits(candidates, hits, route, storage2, options = {}) {
  const startIndex = Math.max(0, options.startIndex ?? 0);
  for (let index = startIndex; index < hits.length; index++) {
    const hit = hits[index];
    if (!hit) {
      continue;
    }
    const rank = index + 1;
    const entityId = publicEntityId(hit.fragment);
    const resolved = candidates.get(entityId) ?? resolveHitEntity(hit, storage2);
    if (!resolved) {
      continue;
    }
    const candidate = candidates.get(entityId) ?? {
      id: entityId,
      entity: resolved.entity,
      file: resolved.file,
      sources: /* @__PURE__ */ new Set(),
      recall: [],
      evidence: [],
      score: 0,
      rank: Number.POSITIVE_INFINITY,
      forced: false
    };
    candidate.sources.add(route.mode);
    candidate.evidence.push({
      fragment: hit.fragment,
      path: route.mode,
      routeId: route.id,
      query: route.query,
      rank,
      score: hit.score
    });
    addOrUpdateRecall(candidate, {
      path: route.mode,
      routeId: route.id,
      query: route.query,
      found: true,
      rank,
      score: hit.score
    });
    candidates.set(candidate.id, candidate);
  }
}
function collectAdaptiveRecall(input) {
  const routes = buildRecallRoutes(input.routes, input.filter, input.preferSymbol);
  const targetCandidates = recallTargetCandidateCount(input.limit);
  let previousDepth = 0;
  let depth = RECALL_INITIAL_DEPTH;
  while (true) {
    const saturated = collectRecallPass({
      routes,
      vectorByRoute: input.vectorByRoute,
      depth,
      previousDepth,
      storage: input.storage,
      candidates: input.candidates
    });
    if (input.candidates.size >= targetCandidates || !saturated || depth >= RECALL_MAX_DEPTH) {
      return depth;
    }
    previousDepth = depth;
    depth = Math.min(depth * RECALL_GROWTH_FACTOR, RECALL_MAX_DEPTH);
  }
}
function buildRecallRoutes(routes, filter, preferSymbol) {
  const output = routes.map((route) => ({
    ...route,
    filter,
    vectorRouteId: route.mode === "vector" ? route.id : void 0
  }));
  if (!preferSymbol) {
    return output;
  }
  const seen = /* @__PURE__ */ new Set();
  for (const route of routes) {
    const symbolNames = extractSymbolNames(route.query);
    if (symbolNames.length === 0) {
      continue;
    }
    const key = `${route.id}\0${symbolNames.join("\0")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push({
      id: `${route.id}.prefer-symbol`,
      mode: "fts",
      query: route.query,
      filter: {
        ...filter,
        symbolNames
      }
    });
  }
  return output;
}
function collectRecallPass(input) {
  let saturated = false;
  for (const route of input.routes) {
    const hits = recallRouteHits(route, input);
    saturated = saturated || hits.length >= input.depth;
    addRecallHits(input.candidates, hits, route, input.storage, {
      startIndex: input.previousDepth
    });
  }
  return saturated;
}
function recallRouteHits(route, input) {
  if (route.mode === "fts") {
    return input.storage.searchFts(route.query, input.depth, route.filter);
  }
  const vector = input.vectorByRoute.get(route.vectorRouteId ?? route.id);
  return vector ? input.storage.searchVector(vector, input.depth, route.filter) : [];
}
function recallTargetCandidateCount(limit) {
  return Math.max(limit * RECALL_TARGET_FACTOR, RECALL_MIN_TARGET_CANDIDATES);
}
function resolveHitEntity(hit, storage2) {
  if (!hit.fragment.group || hit.fragment.group === hit.fragment.id) {
    return {
      entity: fragmentToEntity(hit.fragment),
      file: hit.file
    };
  }
  return storage2.getEntity(hit.fragment.group);
}
function fragmentToEntity(fragment) {
  return {
    id: publicEntityId(fragment),
    fileId: fragment.fileId,
    range: fragment.range,
    content: fragment.content,
    metadata: fragment.metadata
  };
}
function publicEntityId(fragment) {
  return fragment.group ?? fragment.id;
}
function addOrUpdateRecall(candidate, recall) {
  const existing = candidate.recall.find((item) => item.path === recall.path && item.routeId === recall.routeId);
  if (!existing) {
    candidate.recall.push(recall);
    return;
  }
  if (!recall.found) {
    return;
  }
  if (!existing.found || existing.rank === void 0 || recall.rank !== void 0 && recall.rank < existing.rank) {
    Object.assign(existing, recall, {
      forced: existing.forced || recall.forced || void 0
    });
    return;
  }
  if (recall.forced) {
    existing.forced = true;
  }
}
function extractSymbolNames(query) {
  const keywords = /* @__PURE__ */ new Set([
    "class",
    "struct",
    "enum",
    "interface",
    "function",
    "method",
    "type",
    "const",
    "let",
    "var",
    "namespace",
    "where",
    "find",
    "explain"
  ]);
  const names = /* @__PURE__ */ new Set();
  for (const match of query.matchAll(/[A-Za-z_~][A-Za-z0-9_:~]*/g)) {
    const token = match[0];
    if (keywords.has(token.toLowerCase())) {
      continue;
    }
    const name = symbolNameFromToken(token);
    if (name) {
      names.add(name);
    }
  }
  return [...names];
}
function symbolNameFromToken(token) {
  const parts = token.split("::").filter((part) => part.length > 0);
  const name = parts[parts.length - 1] ?? token;
  if (!/^[A-Za-z_~][A-Za-z0-9_~]*$/.test(name)) {
    return null;
  }
  if (parts.length < 2) {
    return name;
  }
  const owner = parts[parts.length - 2] ?? "";
  if (/^[A-Z_~]/.test(owner)) {
    return `${owner}::${name}`;
  }
  return name;
}
function forceTrackEntity(input) {
  const tracked = input.storage.getEntity(input.entityId);
  if (!tracked) {
    return;
  }
  const candidate = input.candidates.get(input.entityId) ?? {
    id: input.entityId,
    entity: tracked.entity,
    file: tracked.file,
    sources: /* @__PURE__ */ new Set(),
    recall: [],
    evidence: [],
    score: 0,
    rank: Number.POSITIVE_INFINITY,
    forced: true
  };
  const seenRoutes = new Set(candidate.recall.map((trace) => trace.routeId));
  for (const route of input.routes) {
    if (seenRoutes.has(route.id)) {
      continue;
    }
    if (filterMatchesNoFiles(input.filter)) {
      forceTrackNoMatchingFilesRoute(candidate, route);
      continue;
    }
    if (filterExcludesFile(input.filter, tracked.file.id)) {
      forceTrackPathExcludedRoute(candidate, route);
      continue;
    }
    if (route.mode === "fts") {
      forceTrackFtsRoute(candidate, {
        ...input,
        targetFileId: tracked.file.id
      }, route);
    } else {
      forceTrackVectorRoute(candidate, {
        ...input,
        targetFileId: tracked.file.id
      }, route);
    }
  }
  input.candidates.set(input.entityId, candidate);
}
function filterExcludesFile(filter, fileId) {
  return filter?.fileIds !== void 0 && !filter.fileIds.includes(fileId);
}
function forceTrackNoMatchingFilesRoute(candidate, route) {
  candidate.recall.push({
    path: route.mode,
    routeId: route.id,
    query: route.query,
    found: false,
    forced: true,
    reason: "No files matched the path filters"
  });
}
function forceTrackPathExcludedRoute(candidate, route) {
  candidate.recall.push({
    path: route.mode,
    routeId: route.id,
    query: route.query,
    found: false,
    forced: true,
    reason: "Target entity file was excluded by the path filters"
  });
}
function forceTrackFtsRoute(candidate, input, route) {
  const hit = searchTrackedEntityFts(input, route);
  if (hit) {
    candidate.sources.add("fts");
    candidate.evidence.push({
      fragment: hit.fragment,
      path: "fts",
      routeId: route.id,
      query: route.query,
      rank: input.recallDepth + 1,
      score: hit.score,
      forced: true
    });
    addOrUpdateRecall(candidate, {
      path: "fts",
      routeId: route.id,
      query: route.query,
      found: true,
      forced: true,
      rank: input.recallDepth + 1,
      score: hit.score
    });
    return;
  }
  candidate.recall.push({
    path: "fts",
    routeId: route.id,
    query: route.query,
    found: false,
    forced: true,
    reason: "Target entity did not match the FTS query"
  });
}
function forceTrackVectorRoute(candidate, input, route) {
  const vector = input.vectorByRoute.get(route.id);
  if (!vector) {
    candidate.recall.push({
      path: "vector",
      routeId: route.id,
      query: route.query,
      found: false,
      forced: true,
      reason: "Vector route was not available for this query"
    });
    return;
  }
  const hit = searchTrackedEntityVector(input, vector);
  if (hit) {
    candidate.sources.add("vector");
    candidate.evidence.push({
      fragment: hit.fragment,
      path: "vector",
      routeId: route.id,
      query: route.query,
      rank: input.recallDepth + 1,
      score: hit.score,
      forced: true
    });
    addOrUpdateRecall(candidate, {
      path: "vector",
      routeId: route.id,
      query: route.query,
      found: true,
      forced: true,
      rank: input.recallDepth + 1,
      score: hit.score
    });
    return;
  }
  candidate.recall.push({
    path: "vector",
    routeId: route.id,
    query: route.query,
    found: false,
    forced: true,
    reason: "Target entity could not be scored by vector search"
  });
}
function searchTrackedEntityFts(input, route) {
  const [groupHit] = input.storage.searchFts(route.query, 1, {
    ...input.filter,
    groupIds: [input.entityId]
  });
  if (groupHit) {
    return groupHit;
  }
  return input.storage.searchFts(route.query, input.recallDepth, restrictFilterToFile(input.filter, input.targetFileId)).find((hit) => publicEntityId(hit.fragment) === input.entityId);
}
function searchTrackedEntityVector(input, vector) {
  const [groupHit] = input.storage.searchVector(vector, 1, {
    ...input.filter,
    groupIds: [input.entityId]
  });
  if (groupHit) {
    return groupHit;
  }
  return input.storage.searchVector(vector, input.recallDepth, restrictFilterToFile(input.filter, input.targetFileId)).find((hit) => publicEntityId(hit.fragment) === input.entityId);
}
function restrictFilterToFile(filter, fileId) {
  return {
    ...filter,
    fileIds: [fileId]
  };
}
function searchPlanToStorageFilter(plan, storage2, fileTypePatterns) {
  const fileIds = resolveFilteredFileIds(plan, storage2.listFiles(), fileTypePatterns);
  const symbolTypes = plan.symbolTypes && plan.symbolTypes.length > 0 ? plan.symbolTypes : void 0;
  if (fileIds === void 0 && symbolTypes === void 0) {
    return void 0;
  }
  return {
    ...fileIds !== void 0 ? { fileIds } : {},
    ...symbolTypes !== void 0 ? { symbolTypes } : {}
  };
}
function filterMatchesNoFiles(filter) {
  return filter?.fileIds !== void 0 && filter.fileIds.length === 0;
}
function resolveFilteredFileIds(plan, files, fileTypePatterns) {
  const includeMatchers = (plan.includePaths ?? []).map(compilePathFilter);
  const excludeMatchers = (plan.excludePaths ?? []).map(compilePathFilter);
  const hasModifiedFilter = plan.modifiedAfter !== void 0 || plan.modifiedBefore !== void 0;
  const hasSharedSelection = (plan.globs?.length ?? 0) > 0 || (plan.insensitiveGlobs?.length ?? 0) > 0 || fileTypePatterns.include.length > 0 || fileTypePatterns.exclude.length > 0;
  if (includeMatchers.length === 0 && excludeMatchers.length === 0 && !hasModifiedFilter && !hasSharedSelection) {
    return void 0;
  }
  return files.filter((file) => {
    const included = includeMatchers.length === 0 || includeMatchers.some((matcher) => matcher(file));
    const excluded = excludeMatchers.some((matcher) => matcher(file));
    return included && !excluded && matchesFileSelection(file.relativePath, plan, fileTypePatterns) && matchesModifiedTimeFilter(file, plan);
  }).map((file) => file.id);
}
function matchesModifiedTimeFilter(file, plan) {
  if (plan.modifiedAfter !== void 0 && file.lastModifiedTime < plan.modifiedAfter) {
    return false;
  }
  if (plan.modifiedBefore !== void 0 && file.lastModifiedTime > plan.modifiedBefore) {
    return false;
  }
  return true;
}
function compilePathFilter(pattern) {
  const pathTarget = isAbsolutePathPattern(pattern) ? "absolutePath" : "relativePath";
  if (hasPathGlob(pattern)) {
    return (file) => pathPatternMatches(pattern, normalizePathForMatch(file[pathTarget]));
  }
  return (file) => {
    const path = normalizePathForMatch(file[pathTarget]);
    return pathPatternMatches(pattern, path);
  };
}
function normalizePathFilterPattern(pattern) {
  return normalizePathPattern(pattern);
}
function fuseCandidates(candidates) {
  for (const candidate of candidates.values()) {
    candidate.score = 0;
    candidate.forced = candidate.recall.some((trace) => trace.forced);
    for (const recall of candidate.recall) {
      if (recall.found && recall.rank !== void 0) {
        candidate.score += 1 / (RRF_K + recall.rank);
      }
    }
  }
  const fused = [...candidates.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.id.localeCompare(right.id);
  });
  for (const [index, candidate] of fused.entries()) {
    candidate.rank = index + 1;
  }
  return fused;
}
function candidateToHit(candidate, limit, trace) {
  return {
    entity: candidate.entity,
    file: candidate.file,
    evidence: sortEvidence(candidate.evidence).map(evidenceToSearchHitEvidence),
    rank: candidate.rank,
    score: candidate.score,
    matchedBy: deriveMatchedBy(candidate.sources),
    trace: trace ? candidateToTrace(candidate, limit) : void 0
  };
}
function evidenceToSearchHitEvidence(evidence) {
  return {
    range: evidence.fragment.range,
    content: evidence.fragment.content,
    metadata: evidence.fragment.metadata,
    isEntity: evidence.fragment.id === publicEntityId(evidence.fragment),
    path: evidence.path,
    routeId: evidence.routeId,
    query: evidence.query,
    rank: evidence.rank,
    score: evidence.score,
    forced: evidence.forced
  };
}
function sortEvidence(evidence) {
  return [...evidence].sort((left, right) => {
    const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
    const rightRank = right.rank ?? Number.POSITIVE_INFINITY;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }
    return left.fragment.id.localeCompare(right.fragment.id);
  });
}
function candidateToTrace(candidate, limit) {
  const final = {
    returnedByLimit: candidate.rank <= limit,
    cutoffRank: limit
  };
  return {
    recall: candidate.recall,
    fusion: {
      rank: candidate.rank,
      score: candidate.score,
      forced: candidate.forced || void 0
    },
    final
  };
}
function deriveMatchedBy(sources) {
  if (sources.has("fts") && sources.has("vector")) {
    return "fts+vector";
  }
  return sources.has("vector") ? "vector" : "fts";
}

// dist/engine/storage/zvec.js
var import_zvec = __toESM(require_src(), 1);
import { closeSync, existsSync as existsSync3, mkdirSync as mkdirSync3, openSync } from "node:fs";
import { dirname as dirname7, join as join6 } from "node:path";

// dist/engine/storage/layout.js
import { existsSync as existsSync2, rmSync as rmSync2 } from "node:fs";
import { dirname as dirname6, join as join5, resolve as resolve4 } from "node:path";
var FILES_ZVEC = "files.zvec";
var ENTITIES_ZVEC = "index.zvec";
function resolveWorkspaceIndexStoragePaths(storagePath) {
  const resolvedStoragePath = resolve4(storagePath);
  return {
    storagePath: resolvedStoragePath,
    filesPath: join5(resolvedStoragePath, FILES_ZVEC),
    indexPath: join5(resolvedStoragePath, ENTITIES_ZVEC)
  };
}
function hasWorkspaceIndexStorage(storagePath) {
  const paths = resolveWorkspaceIndexStoragePaths(storagePath);
  return existsSync2(paths.filesPath) && existsSync2(paths.indexPath);
}
function deleteWorkspaceIndexStorage(storagePath) {
  const paths = resolveWorkspaceIndexStoragePaths(storagePath);
  for (const target of [paths.filesPath, paths.indexPath]) {
    if (dirname6(target) !== paths.storagePath) {
      throw new Error("Workspace index data must be inside its storage path");
    }
    rmSync2(target, { recursive: true, force: true });
  }
}
function workspaceIndexPath(storagePath) {
  return resolveWorkspaceIndexStoragePaths(storagePath).indexPath;
}

// dist/engine/storage/zvec.js
var ENTITY_VECTOR_FIELD = "embedding";
var ENTITY_TEXT_FIELD = "text";
var ZVEC_LOCK_FILE = "LOCK";
var NO_MATCH_FILTER = "file_id = '__zvec_grep_no_match__'";
var ZVEC_UPSERT_BATCH_SIZE = 1024;
var ZVEC_MAX_QUERY_TOPK = 1e5;
var FILE_ID_HEX_ALPHABET = "0123456789abcdef";
var ZVEC_OPEN_RETRY_ATTEMPTS = 8;
var ZVEC_OPEN_RETRY_BASE_DELAY_MS = 100;
var ZVEC_OPEN_RETRY_MAX_DELAY_MS = 1e3;
var zvecInitialized = false;
function createWorkspaceIndexStorage(options) {
  return new ZvecWorkspaceIndexStorage(options);
}
var ZvecWorkspaceIndexStorage = class {
  readOnly;
  collection;
  files;
  filesById = /* @__PURE__ */ new Map();
  filesByAbsolutePath = /* @__PURE__ */ new Map();
  needsOptimize = false;
  constructor(options) {
    const paths = resolveWorkspaceIndexStoragePaths(options.storagePath);
    const { readOnly } = options;
    this.readOnly = readOnly;
    initializeZvec();
    if (!readOnly) {
      mkdirSync3(paths.storagePath, { recursive: true });
    }
    this.files = new ZvecFileMetaStore(paths.filesPath, readOnly);
    for (const file of this.files.list()) {
      this.rememberFile(file);
    }
    const zvecPath = paths.indexPath;
    if (existsSync3(zvecPath)) {
      this.collection = openZvecCollection(zvecPath, readOnly, "open", () => (0, import_zvec.ZVecOpen)(zvecPath, { readOnly }));
    } else if (readOnly) {
      throw new EngineError("zvec collection storage does not exist", {
        code: "ZVEC_GREP.ENGINE.STORAGE.ZVEC_COLLECTION_MISSING",
        context: `path=${zvecPath}`
      });
    } else {
      this.collection = openZvecCollection(zvecPath, readOnly, "create", () => (0, import_zvec.ZVecCreateAndOpen)(zvecPath, createSchema(options.embedding)));
    }
  }
  getFileByPath(absolutePath) {
    const file = this.filesByAbsolutePath.get(normalizePath(absolutePath));
    return file ? fileRecordToInfo(file) : null;
  }
  listFilesByPathPrefix(absolutePath) {
    return this.listFilesByPathPrefixes([absolutePath]);
  }
  listFilesByPathPrefixes(absolutePaths) {
    const prefixes = new Set(absolutePaths.map((path) => normalizePath(path)));
    if (prefixes.size === 0) {
      return [];
    }
    return [...this.filesByAbsolutePath.entries()].filter(([path]) => hasPathPrefix(path, prefixes)).map(([, file]) => fileRecordToInfo(file));
  }
  listFiles() {
    return [...this.filesById.values()].map(fileRecordToInfo);
  }
  listEntitiesByFile(fileId, options = {}) {
    const file = this.filesById.get(fileId);
    if (!file) {
      return [];
    }
    const offset = options.offset ?? 0;
    const limit = options.limit ?? file.entityIds.length;
    const ids = file.entityIds.slice(offset, offset + limit);
    return this.fetchStoredEntities(ids);
  }
  getEntity(entityId) {
    const fragment = this.getFragment(entityId);
    if (!fragment) {
      return null;
    }
    if (fragment.fragment.group && fragment.fragment.group !== fragment.fragment.id) {
      return this.getEntity(fragment.fragment.group);
    }
    return {
      file: fragment.file,
      entity: fragmentToEntity2(fragment.fragment)
    };
  }
  getFragment(fragmentId) {
    const docs = this.collection.fetchSync({
      ids: fragmentId,
      includeVector: false
    });
    const doc = docs[fragmentId];
    if (!doc) {
      return null;
    }
    return this.docToStoredFragment(doc);
  }
  replaceFile(file, entries, diagnostics = {}) {
    this.assertWritable("replaceFile");
    const fragments = entries.map(({ fragment }) => fragment);
    validateFragmentGroups(file.id, fragments);
    this.markFileDirty(file);
    this.deleteFileDocuments(file.id);
    const now = Date.now();
    const entityIds = publicEntityIds(fragments);
    const indexedFile = {
      ...file,
      absolutePath: normalizePath(file.absolutePath),
      indexStatus: {
        indexedTime: now,
        entityCount: entityIds.length,
        truncatedFragmentCount: diagnostics.truncatedFragmentCount ?? 0
      },
      entityIds
    };
    if (entries.length > 0) {
      const docs = entries.map(({ fragment, vector }, index) => ({
        id: fragment.id,
        vectors: {
          [ENTITY_VECTOR_FIELD]: [...vector]
        },
        fields: fragmentToFields(indexedFile, fragment, index)
      }));
      this.upsertDocs(file.id, docs);
      this.needsOptimize = true;
    }
    this.rememberFile(indexedFile);
    this.persistFile(indexedFile);
  }
  upsertDocs(fileId, docs) {
    for (let start = 0; start < docs.length; start += ZVEC_UPSERT_BATCH_SIZE) {
      const batch = docs.slice(start, start + ZVEC_UPSERT_BATCH_SIZE);
      const statuses = this.collection.upsertSync(batch);
      const failed = statuses.find((status) => !status.ok);
      if (failed) {
        throw new EngineError("zvec failed to upsert entity documents", {
          code: "ZVEC_GREP.ENGINE.STORAGE.ZVEC_UPSERT_FAILED",
          context: `fileId=${fileId} batchStart=${start} batchSize=${batch.length} code=${failed.code} message=${failed.message}`
        });
      }
    }
  }
  markFileFailed(file, error) {
    this.assertWritable("markFileFailed");
    this.deleteFileDocuments(file.id);
    this.rememberFile({
      ...file,
      absolutePath: normalizePath(file.absolutePath),
      indexStatus: {
        indexedTime: null,
        entityCount: 0,
        error
      },
      entityIds: []
    });
    this.persistFile(this.filesById.get(file.id));
  }
  deleteFile(fileId) {
    this.assertWritable("deleteFile");
    const existing = this.filesById.get(fileId);
    this.deleteFileDocuments(fileId);
    if (existing) {
      this.filesById.delete(fileId);
      this.filesByAbsolutePath.delete(normalizePath(existing.absolutePath));
    }
    this.files.deleteFile(fileId);
  }
  searchFts(query, limit, filter) {
    const zvecFilter = buildFilter(filter);
    const docs = this.collection.querySync({
      fieldName: ENTITY_TEXT_FIELD,
      fts: { matchString: query },
      ...zvecFilter ? { filter: zvecFilter } : {},
      topk: limit,
      includeVector: false
    });
    return docsToHits(docs, "fts", this);
  }
  searchVector(vector, limit, filter) {
    const zvecFilter = buildFilter(filter);
    const docs = this.collection.querySync({
      fieldName: ENTITY_VECTOR_FIELD,
      vector: [...vector],
      ...zvecFilter ? { filter: zvecFilter } : {},
      topk: limit,
      includeVector: false
    });
    return docsToHits(docs, "vector", this);
  }
  async finalizeWrites() {
    this.assertWritable("finalizeWrites");
    if (this.needsOptimize) {
      await this.collection.optimize();
      this.needsOptimize = false;
    }
  }
  close() {
    if (this.needsOptimize) {
      this.collection.optimizeSync();
      this.needsOptimize = false;
    }
    this.files.close();
    this.collection.closeSync();
  }
  fetchStoredEntities(ids) {
    if (ids.length === 0) {
      return [];
    }
    const docs = this.collection.fetchSync({
      ids: [...ids],
      includeVector: false
    });
    const entities = [];
    for (const id of ids) {
      const doc = docs[id];
      const entity = doc ? this.docToStoredEntity(doc) : null;
      if (entity) {
        entities.push(entity);
      }
    }
    return entities;
  }
  docToStoredEntity(doc) {
    const stored = this.docToStoredFragment(doc);
    if (!stored) {
      return null;
    }
    if (stored.fragment.group && stored.fragment.group !== stored.fragment.id) {
      return this.getEntity(stored.fragment.group);
    }
    return {
      file: stored.file,
      entity: fragmentToEntity2(stored.fragment)
    };
  }
  docToStoredFragment(doc) {
    const fileId = readStringField(doc, "file_id");
    const file = this.filesById.get(fileId);
    if (!file) {
      return null;
    }
    return {
      file: fileRecordToInfo(file),
      fragment: {
        id: doc.id,
        group: readNullableStringFieldFromFields(doc.fields, "group") ?? void 0,
        fileId,
        range: parseRange(readStringField(doc, "range_json")),
        content: parseContent(doc.fields),
        metadata: parseMetadata(doc.fields)
      }
    };
  }
  rememberFile(file) {
    const normalized = {
      ...file,
      absolutePath: normalizePath(file.absolutePath)
    };
    this.filesById.set(normalized.id, normalized);
    this.filesByAbsolutePath.set(normalized.absolutePath, normalized);
  }
  markFileDirty(file) {
    this.rememberFile({
      ...file,
      absolutePath: normalizePath(file.absolutePath),
      indexStatus: {
        indexedTime: null,
        entityCount: 0
      },
      entityIds: []
    });
    this.persistFile(this.filesById.get(file.id));
  }
  deleteFileDocuments(fileId) {
    this.collection.deleteByFilterSync(`file_id = ${quoteFilterString(fileId)}`);
    this.needsOptimize = true;
  }
  persistFile(file) {
    this.files.upsertFile(file);
  }
  assertWritable(operation) {
    if (this.readOnly) {
      throw new EngineError("Cannot update read-only workspace index storage", {
        code: "ZVEC_GREP.ENGINE.STORAGE.READ_ONLY",
        context: `operation=${operation}`
      });
    }
  }
};
function hasPathPrefix(path, prefixes) {
  let current = path;
  while (true) {
    if (prefixes.has(current)) {
      return true;
    }
    const parent = dirname7(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}
var ZvecFileMetaStore = class {
  path;
  readOnly;
  collection;
  needsOptimize = false;
  constructor(path, readOnly = false) {
    this.path = path;
    this.readOnly = readOnly;
    initializeZvec();
    if (!readOnly) {
      mkdirSync3(dirname7(path), { recursive: true });
    }
    if (existsSync3(path)) {
      this.collection = openZvecCollection(path, readOnly, "open", () => (0, import_zvec.ZVecOpen)(path, { readOnly }));
    } else if (readOnly) {
      throw new EngineError("zvec file metadata storage does not exist", {
        code: "ZVEC_GREP.ENGINE.STORAGE.ZVEC_FILE_META_MISSING",
        context: `path=${path}`
      });
    } else {
      this.collection = openZvecCollection(path, readOnly, "create", () => (0, import_zvec.ZVecCreateAndOpen)(path, createFilesSchema()));
    }
  }
  list() {
    const docs = queryFileMetadataDocs(this.collection, ZVEC_MAX_QUERY_TOPK);
    return docs.map((doc) => docToFileRecord(doc)).sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }
  upsertFile(file) {
    this.assertWritable("upsertFile");
    const deleteStatus = this.collection.deleteSync(file.id);
    assertZvecStatusOrNotFound(deleteStatus, "file metadata replace", file.id);
    const status = this.collection.upsertSync(fileRecordToDoc(file));
    assertZvecStatus(status, "file metadata upsert", file.id);
    this.needsOptimize = true;
  }
  deleteFile(fileId) {
    this.assertWritable("deleteFile");
    const status = this.collection.deleteByFilterSync(`file_id = ${quoteFilterString(fileId)}`);
    assertZvecStatus(status, "file metadata delete", fileId);
    this.needsOptimize = true;
  }
  close() {
    if (this.needsOptimize) {
      this.collection.optimizeSync();
      this.needsOptimize = false;
    }
    this.collection.closeSync();
  }
  assertWritable(operation) {
    if (this.readOnly) {
      throw new EngineError("Cannot update read-only file metadata storage", {
        code: "ZVEC_GREP.ENGINE.STORAGE.FILE_META_READ_ONLY",
        context: `path=${this.path} operation=${operation}`
      });
    }
  }
};
function queryFileMetadataDocs(collection, maxTopk = ZVEC_MAX_QUERY_TOPK) {
  if (!Number.isInteger(maxTopk) || maxTopk < 1) {
    throw new EngineError("zvec metadata query limit must be positive", {
      code: "ZVEC_GREP.ENGINE.STORAGE.INVALID_METADATA_QUERY_LIMIT",
      context: `maxTopk=${maxTopk}`
    });
  }
  if (collection.stats.docCount <= maxTopk) {
    return collection.querySync({
      topk: Math.max(collection.stats.docCount, 1),
      includeVector: false
    });
  }
  return FILE_ID_HEX_ALPHABET.split("").flatMap((prefix) => queryFileMetadataPartition(collection, prefix, maxTopk));
}
function queryFileMetadataPartition(collection, prefix, maxTopk) {
  const lower = quoteFilterString(prefix);
  const upper = quoteFilterString(`${prefix}g`);
  const docs = collection.querySync({
    filter: `file_id >= ${lower} AND file_id < ${upper}`,
    topk: maxTopk,
    includeVector: false
  });
  if (docs.length < maxTopk) {
    return docs;
  }
  if (prefix.length >= 64) {
    throw new EngineError("zvec metadata partition exceeds query limit", {
      code: "ZVEC_GREP.ENGINE.STORAGE.METADATA_PARTITION_TOO_LARGE",
      context: `prefix=${prefix} maxTopk=${maxTopk}`
    });
  }
  return FILE_ID_HEX_ALPHABET.split("").flatMap((suffix) => queryFileMetadataPartition(collection, `${prefix}${suffix}`, maxTopk));
}
function createFilesSchema() {
  return new import_zvec.ZVecCollectionSchema({
    name: "zvec_grep_files",
    fields: [
      indexedStringField("file_id"),
      indexedStringField("absolute_path"),
      stringField("relative_path"),
      stringField("root_path"),
      {
        name: "size_bytes",
        dataType: import_zvec.ZVecDataType.INT64,
        nullable: false
      },
      {
        name: "last_modified_time",
        dataType: import_zvec.ZVecDataType.INT64,
        nullable: false
      },
      indexedStringField("content_hash", true),
      indexedStringField("kind"),
      indexedStringField("format"),
      {
        name: "has_index_status",
        dataType: import_zvec.ZVecDataType.BOOL,
        nullable: false
      },
      {
        name: "indexed_time",
        dataType: import_zvec.ZVecDataType.INT64,
        nullable: true
      },
      {
        name: "entity_count",
        dataType: import_zvec.ZVecDataType.INT32,
        nullable: false
      },
      {
        name: "token_count",
        dataType: import_zvec.ZVecDataType.INT32,
        nullable: true
      },
      {
        name: "truncated_fragment_count",
        dataType: import_zvec.ZVecDataType.INT32,
        nullable: true
      },
      stringField("error", true),
      stringField("entity_ids_json")
    ]
  });
}
function fileRecordToDoc(file) {
  const fields = {
    file_id: file.id,
    absolute_path: normalizePath(file.absolutePath),
    relative_path: file.relativePath,
    root_path: file.rootPath,
    size_bytes: file.sizeBytes,
    last_modified_time: file.lastModifiedTime,
    kind: file.kind,
    format: file.format,
    has_index_status: file.indexStatus !== void 0,
    entity_count: file.indexStatus?.entityCount ?? 0,
    entity_ids_json: JSON.stringify(file.entityIds)
  };
  if (file.contentHash !== void 0) {
    fields.content_hash = file.contentHash;
  }
  if (file.indexStatus?.indexedTime !== null && file.indexStatus?.indexedTime !== void 0) {
    fields.indexed_time = file.indexStatus.indexedTime;
  }
  if (file.indexStatus?.tokenCount !== void 0) {
    fields.token_count = file.indexStatus.tokenCount;
  }
  if (file.indexStatus?.truncatedFragmentCount !== void 0) {
    fields.truncated_fragment_count = file.indexStatus.truncatedFragmentCount;
  }
  if (file.indexStatus?.error !== void 0) {
    fields.error = file.indexStatus.error;
  }
  return {
    id: file.id,
    fields
  };
}
function docToFileRecord(doc) {
  const fields = doc.fields;
  const hasIndexStatus = readBooleanFieldFromFields(fields, "has_index_status");
  const indexedTime = readNullableNumberFieldFromFields(fields, "indexed_time");
  const tokenCount = readNullableNumberFieldFromFields(fields, "token_count");
  const truncatedFragmentCount = readNullableNumberFieldFromFields(fields, "truncated_fragment_count");
  const error = readNullableStringFieldFromFields(fields, "error");
  return {
    id: readStringField(doc, "file_id"),
    absolutePath: normalizePath(readStringField(doc, "absolute_path")),
    relativePath: readStringField(doc, "relative_path"),
    rootPath: readStringField(doc, "root_path"),
    sizeBytes: readNumberFieldFromFields(fields, "size_bytes"),
    lastModifiedTime: readNumberFieldFromFields(fields, "last_modified_time"),
    contentHash: readNullableStringFieldFromFields(fields, "content_hash") ?? void 0,
    kind: readStringField(doc, "kind"),
    format: readStringField(doc, "format"),
    indexStatus: hasIndexStatus ? {
      indexedTime,
      entityCount: readNumberFieldFromFields(fields, "entity_count"),
      ...tokenCount === null ? {} : { tokenCount },
      ...truncatedFragmentCount === null ? {} : { truncatedFragmentCount },
      ...error === null ? {} : { error }
    } : void 0,
    entityIds: parseStringArray(readStringField(doc, "entity_ids_json"))
  };
}
function fileRecordToInfo(file) {
  const { entityIds: _entityIds, ...info } = file;
  return info;
}
function fragmentToEntity2(fragment) {
  return {
    id: publicEntityId2(fragment),
    fileId: fragment.fileId,
    range: fragment.range,
    content: fragment.content,
    metadata: fragment.metadata
  };
}
function publicEntityId2(fragment) {
  return fragment.group ?? fragment.id;
}
function publicEntityIds(fragments) {
  const ids = /* @__PURE__ */ new Set();
  for (const fragment of fragments) {
    if (!fragment.group || fragment.group === fragment.id) {
      ids.add(publicEntityId2(fragment));
    }
  }
  return [...ids];
}
function validateFragmentGroups(fileId, fragments) {
  const ids = /* @__PURE__ */ new Set();
  const groups = /* @__PURE__ */ new Map();
  for (const fragment of fragments) {
    if (fragment.fileId !== fileId) {
      throw new EngineError("Entity fragment belongs to the wrong file", {
        code: "ZVEC_GREP.ENGINE.STORAGE.FRAGMENT_FILE_MISMATCH",
        context: `fileId=${fileId} fragmentId=${fragment.id} fragmentFileId=${fragment.fileId}`
      });
    }
    if (ids.has(fragment.id)) {
      throw new EngineError("Duplicate entity fragment id", {
        code: "ZVEC_GREP.ENGINE.STORAGE.DUPLICATE_FRAGMENT_ID",
        context: `fileId=${fileId} fragmentId=${fragment.id}`
      });
    }
    ids.add(fragment.id);
    if (fragment.group) {
      const group = groups.get(fragment.group) ?? [];
      group.push(fragment);
      groups.set(fragment.group, group);
    }
  }
  for (const [groupId, group] of groups) {
    const majorCount = group.filter((fragment) => fragment.id === groupId).length;
    if (majorCount !== 1) {
      throw new EngineError("Fragment group must have exactly one major fragment", {
        code: "ZVEC_GREP.ENGINE.STORAGE.INVALID_FRAGMENT_GROUP",
        context: `fileId=${fileId} group=${groupId} majorCount=${majorCount}`
      });
    }
  }
}
function initializeZvec() {
  if (zvecInitialized) {
    return;
  }
  (0, import_zvec.ZVecInitialize)({ logLevel: import_zvec.ZVecLogLevel.WARN });
  zvecInitialized = true;
}
function openZvecCollection(zvecPath, readOnly, action, open3) {
  const lockWritable = canTouchZvecLock(zvecPath);
  let lastError;
  for (let attempt = 0; attempt < ZVEC_OPEN_RETRY_ATTEMPTS; attempt++) {
    try {
      return open3();
    } catch (error) {
      lastError = error;
      if (attempt + 1 >= ZVEC_OPEN_RETRY_ATTEMPTS || !isRetryableZvecOpenError(error, lockWritable)) {
        break;
      }
      sleepSync(zvecOpenRetryDelayMs(attempt));
    }
  }
  throw new EngineError("Failed to open zvec collection storage", {
    code: "ZVEC_GREP.ENGINE.STORAGE.ZVEC_OPEN_FAILED",
    context: `path=${zvecPath} action=${action} readOnly=${readOnly} attempts=${ZVEC_OPEN_RETRY_ATTEMPTS}`,
    cause: lastError
  });
}
function canTouchZvecLock(zvecPath) {
  const lockPath = join6(zvecPath, ZVEC_LOCK_FILE);
  if (!existsSync3(lockPath)) {
    return true;
  }
  try {
    const fd = openSync(lockPath, "a");
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
}
function isRetryableZvecOpenError(error, lockWritable) {
  if (!lockWritable) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (!/lock/i.test(message)) {
    return false;
  }
  return !/permission|access denied|eacces|eperm|read-only/i.test(message);
}
function zvecOpenRetryDelayMs(attempt) {
  const exponential = ZVEC_OPEN_RETRY_BASE_DELAY_MS * 2 ** attempt;
  return Math.min(exponential, ZVEC_OPEN_RETRY_MAX_DELAY_MS);
}
function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const values = new Int32Array(buffer);
  Atomics.wait(values, 0, 0, ms);
}
function createSchema(embedding) {
  return new import_zvec.ZVecCollectionSchema({
    name: "zvec_grep_entities",
    fields: [
      indexedStringField("group", true),
      indexedStringField("file_id"),
      stringField("content_kind"),
      stringField("content_hash", true),
      stringField("metadata_kind", true),
      indexedStringField("symbol_type", true),
      indexedStringField("symbol_name", true),
      stringField("symbol_scope", true),
      stringField("symbol_signature", true),
      stringField("symbol_doc", true),
      stringField("symbol_modifiers", true),
      stringField("node_type", true),
      stringField("heading", true),
      {
        name: "heading_level",
        dataType: import_zvec.ZVecDataType.INT32,
        nullable: true
      },
      {
        name: ENTITY_TEXT_FIELD,
        dataType: import_zvec.ZVecDataType.STRING,
        nullable: false,
        indexParams: {
          indexType: import_zvec.ZVecIndexType.FTS,
          tokenizerName: "jieba",
          filters: ["lowercase"]
        }
      },
      {
        name: "fragment_index",
        dataType: import_zvec.ZVecDataType.INT32,
        nullable: false
      },
      { name: "range_json", dataType: import_zvec.ZVecDataType.STRING, nullable: false },
      { name: "content_base64", dataType: import_zvec.ZVecDataType.STRING, nullable: true },
      { name: "image_format", dataType: import_zvec.ZVecDataType.STRING, nullable: true }
    ],
    vectors: {
      name: ENTITY_VECTOR_FIELD,
      dataType: import_zvec.ZVecDataType.VECTOR_FP32,
      dimension: embedding.dimension,
      indexParams: {
        indexType: import_zvec.ZVecIndexType.HNSW,
        metricType: metricToZvec(embedding.metric)
      }
    }
  });
}
function indexedStringField(name, nullable = false) {
  return {
    name,
    dataType: import_zvec.ZVecDataType.STRING,
    nullable,
    indexParams: { indexType: import_zvec.ZVecIndexType.INVERT }
  };
}
function stringField(name, nullable = false) {
  return {
    name,
    dataType: import_zvec.ZVecDataType.STRING,
    nullable
  };
}
function metricToZvec(metric) {
  if (metric === "cosine") {
    return import_zvec.ZVecMetricType.COSINE;
  }
  if (metric === "dot") {
    return import_zvec.ZVecMetricType.IP;
  }
  if (metric === "euclidean") {
    return import_zvec.ZVecMetricType.L2;
  }
  throw new EngineError("Unsupported vector metric for zvec storage", {
    code: "ZVEC_GREP.ENGINE.STORAGE.UNSUPPORTED_VECTOR_METRIC",
    context: `metric=${metric}`
  });
}
function fragmentToFields(file, fragment, fragmentIndex) {
  const contentFields = contentToFields(fragment.content);
  return {
    ...optionalFields({
      group: fragment.group,
      content_hash: file.contentHash
    }),
    file_id: file.id,
    content_kind: fragment.content.kind,
    ...metadataToFields(fragment.metadata),
    fragment_index: fragmentIndex,
    range_json: JSON.stringify(fragment.range),
    ...contentFields
  };
}
function contentToFields(content) {
  if (content.kind === "text") {
    return {
      text: content.text
    };
  }
  return {
    text: `[image:${content.format}]`,
    content_base64: Buffer.from(content.data).toString("base64"),
    image_format: content.format
  };
}
function metadataToFields(metadata) {
  if (!metadata) {
    return {};
  }
  if (metadata.kind === "code") {
    return {
      metadata_kind: "code",
      symbol_type: metadata.symbolType,
      ...optionalFields({
        symbol_name: metadata.symbolName,
        symbol_scope: metadata.scope,
        symbol_signature: metadata.signature,
        symbol_doc: metadata.doc,
        symbol_modifiers: metadata.modifiers.length > 0 ? metadata.modifiers.join(" ") : null,
        node_type: metadata.nodeType
      })
    };
  }
  return {
    metadata_kind: "markdown",
    ...optionalFields({
      symbol_scope: metadata.scope,
      heading: metadata.heading,
      heading_level: metadata.level
    })
  };
}
function optionalFields(fields) {
  const result = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== void 0) {
      result[key] = value;
    }
  }
  return result;
}
function parseContent(fields) {
  const kind = fields.content_kind;
  if (kind === "text") {
    return {
      kind: "text",
      text: readStringFieldFromFields(fields, "text")
    };
  }
  if (kind === "image") {
    return {
      kind: "image",
      data: Buffer.from(readStringFieldFromFields(fields, "content_base64"), "base64"),
      format: readStringFieldFromFields(fields, "image_format")
    };
  }
  throw new EngineError("Stored entity has unsupported content kind", {
    code: "ZVEC_GREP.ENGINE.STORAGE.UNSUPPORTED_STORED_CONTENT_KIND",
    context: `contentKind=${String(kind)}`
  });
}
function parseMetadata(fields) {
  const kind = fields.metadata_kind;
  if (kind === "code") {
    return {
      kind: "code",
      symbolType: readStringFieldFromFields(fields, "symbol_type"),
      symbolName: readNullableStringFieldFromFields(fields, "symbol_name"),
      scope: readNullableStringFieldFromFields(fields, "symbol_scope"),
      nodeType: readNullableStringFieldFromFields(fields, "node_type"),
      signature: readNullableStringFieldFromFields(fields, "symbol_signature"),
      doc: readNullableStringFieldFromFields(fields, "symbol_doc"),
      modifiers: readCodeModifiers(readNullableStringFieldFromFields(fields, "symbol_modifiers"))
    };
  }
  if (kind === "markdown") {
    return {
      kind: "markdown",
      heading: readNullableStringFieldFromFields(fields, "heading"),
      level: readNullableNumberFieldFromFields(fields, "heading_level"),
      scope: readNullableStringFieldFromFields(fields, "symbol_scope")
    };
  }
  return void 0;
}
function readCodeModifiers(value) {
  if (!value) {
    return [];
  }
  return value.split(/\s+/).filter((item) => item === "exported" || item === "async" || item === "static" || item === "public" || item === "private" || item === "protected" || item === "internal");
}
function parseRange(value) {
  return JSON.parse(value);
}
function docsToHits(docs, path, storage2) {
  const hits = [];
  for (const doc of docs) {
    const stored = storage2.docToStoredFragment(doc);
    if (stored) {
      hits.push({
        ...stored,
        path,
        score: doc.score
      });
    }
  }
  return hits;
}
function assertZvecStatusOrNotFound(status, operation, context) {
  if (status.ok || status.code === "ZVEC_NOT_FOUND") {
    return;
  }
  assertZvecStatus(status, operation, context);
}
function readStringField(doc, field) {
  return readStringFieldFromFields(doc.fields, field);
}
function readStringFieldFromFields(fields, field) {
  const value = fields[field];
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === void 0) {
    return "";
  }
  return String(value);
}
function readNumberFieldFromFields(fields, field) {
  const value = fields[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}
function readBooleanFieldFromFields(fields, field) {
  const value = fields[field];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true";
  }
  return Boolean(value);
}
function readNullableStringFieldFromFields(fields, field) {
  const value = fields[field];
  if (value === null || value === void 0 || value === "") {
    return null;
  }
  return String(value);
}
function readNullableNumberFieldFromFields(fields, field) {
  const value = fields[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value <= 0 ? null : value;
  }
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}
function parseStringArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}
function assertZvecStatus(status, operation, context) {
  if (status.ok) {
    return;
  }
  throw new EngineError("zvec metadata operation failed", {
    code: "ZVEC_GREP.ENGINE.STORAGE.ZVEC_META_OPERATION_FAILED",
    context: `${operation}: ${context} code=${status.code} message=${status.message}`
  });
}
function buildFilter(filter) {
  if (!filter) {
    return void 0;
  }
  const clauses = [];
  if (filter.fileIds) {
    clauses.push(buildNonEmptyInFilter("file_id", filter.fileIds));
  }
  if (filter.groupIds) {
    clauses.push(buildNonEmptyInFilter("group", filter.groupIds));
  }
  if (filter.symbolNames) {
    clauses.push(buildNonEmptyInFilter("symbol_name", filter.symbolNames));
  }
  if (filter.symbolTypes) {
    clauses.push(buildNonEmptyInFilter("symbol_type", filter.symbolTypes));
  }
  return clauses.length > 0 ? clauses.join(" AND ") : void 0;
}
function buildNonEmptyInFilter(field, values) {
  return values.length > 0 ? buildInFilter(field, values) : NO_MATCH_FILTER;
}
function buildInFilter(field, values) {
  if (values.length === 1) {
    return `${field} = ${quoteFilterString(values[0])}`;
  }
  return `(${values.map((value) => `${field} = ${quoteFilterString(value)}`).join(" OR ")})`;
}
function quoteFilterString(value) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

// dist/engine/types.js
function isTextContent(content) {
  return content.kind === "text";
}
function isImageContent(content) {
  return content.kind === "image";
}
var CURRENT_INDEX_VERSION = 1;

// dist/engine/service/workspace-index.js
var WorkspaceIndex = class {
  info;
  storage;
  embedding;
  embeddingModel;
  closed = false;
  constructor(info, options) {
    this.info = info;
    this.embeddingModel = options.embeddingModel;
    this.embedding = requireWorkspaceIndexEmbedding(info, "open");
    this.validateIndexVersion();
    if (this.embeddingModel) {
      this.validateEmbeddingSchema(this.embeddingModel);
    }
    if (options.mode === "write") {
      this.storage = createWorkspaceIndexStorage({
        storagePath: info.path,
        readOnly: false,
        embedding: this.embedding
      });
    } else {
      this.storage = createWorkspaceIndexStorage({
        storagePath: info.path,
        readOnly: true
      });
    }
  }
  get name() {
    return this.info.name;
  }
  index(options = {}) {
    if (this.storage.readOnly) {
      throw new EngineError("Cannot update a read-only workspace index", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.READ_ONLY",
        context: workspaceIndexOperationDetails(this.name, "index")
      });
    }
    const embeddingModel = this.requireEmbeddingModel("index");
    const context = {
      workspaceIndex: this.info,
      embeddingModel,
      storage: this.storage,
      embeddingConcurrency: options.embeddingConcurrency,
      onProgress: options.onProgress,
      signal: options.signal
    };
    return options.changedPaths && options.changedPaths.length > 0 ? indexWorkspacePaths(context, options.changedPaths) : indexWorkspace(context);
  }
  status() {
    return getWorkspaceIndexStatus(this.info, this.storage.listFiles());
  }
  searchPlan(plan) {
    return searchWorkspaceIndex(plan, {
      workspaceIndex: this.info,
      embeddingModel: this.embeddingModel,
      storage: this.storage
    });
  }
  close() {
    if (this.closed) {
      return;
    }
    this.storage.close();
    this.closed = true;
  }
  validateIndexVersion() {
    if (this.info.indexVersion !== CURRENT_INDEX_VERSION) {
      throw new EngineError("Workspace index version is not supported", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.VERSION_MISMATCH",
        context: errorDetails([
          workspaceIndexDetail(this.name),
          detail("expected", CURRENT_INDEX_VERSION),
          detail("actual", this.info.indexVersion),
          detail("hint", 'Recreate the index with the current zvec-grep version; run "zg index --rebuild" for a workspace index.')
        ])
      });
    }
  }
  validateEmbeddingSchema(current) {
    this.validateIndexVersion();
    const expected = this.embedding;
    if (expected.provider !== current.info.provider) {
      throw new EngineError("Workspace index embedding provider does not match current model", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.EMBEDDING_PROVIDER_MISMATCH",
        context: workspaceIndexMismatchDetails(this.name, expected.provider, current.info.provider)
      });
    }
    if (expected.model !== current.info.name) {
      throw new EngineError("Workspace index embedding model does not match current model", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.EMBEDDING_MODEL_MISMATCH",
        context: workspaceIndexMismatchDetails(this.name, expected.model, current.info.name)
      });
    }
    if (expected.dimension !== current.info.dimension) {
      throw new EngineError("Workspace index embedding dimension does not match current model", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.EMBEDDING_DIMENSION_MISMATCH",
        context: workspaceIndexMismatchDetails(this.name, expected.dimension, current.info.dimension)
      });
    }
    if (expected.metric !== current.info.metric) {
      throw new EngineError("Workspace index embedding metric does not match current model", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.EMBEDDING_METRIC_MISMATCH",
        context: workspaceIndexMismatchDetails(this.name, expected.metric, current.info.metric)
      });
    }
  }
  requireEmbeddingModel(operation) {
    if (!this.embeddingModel) {
      throw new EngineError("Workspace index operation requires an embedding model", {
        code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.EMBEDDING_MODEL_REQUIRED",
        context: workspaceIndexOperationDetails(this.name, operation)
      });
    }
    return this.embeddingModel;
  }
};
function workspaceIndexOperationDetails(name, operation) {
  return errorDetails([
    workspaceIndexDetail(name),
    detail("operation", operation)
  ]);
}
function workspaceIndexMismatchDetails(name, expected, actual) {
  return errorDetails([
    workspaceIndexDetail(name),
    detail("expected", expected),
    detail("actual", actual)
  ]);
}
function isWorkspaceIndexed(info) {
  return info?.embedding !== null && info?.embedding !== void 0 && info.indexVersion !== null && info.indexVersion !== void 0;
}
function requireWorkspaceIndexEmbedding(info, operation) {
  if (isWorkspaceIndexed(info)) {
    return info.embedding;
  }
  throw new EngineError("Workspace index has not been built", {
    code: "ZVEC_GREP.ENGINE.WORKSPACE_INDEX.MISSING",
    context: errorDetails([
      workspaceIndexDetail(info.name),
      detail("operation", operation),
      detail("hint", "Run zg index to build this index.")
    ])
  });
}

// dist/engine/models/embeddings.js
var EmbeddingPurpose = {
  Document: "document",
  Query: "query"
};
var BaseEmbeddingModel = class {
  async embed(contents, options = {}) {
    this.validateContents(contents);
    const result = await this.doEmbed(contents, {
      purpose: options.purpose ?? "document",
      signal: options.signal,
      onProgress: options.onProgress
    });
    this.validateResult(contents, result);
    return result;
  }
  async dispose() {
  }
  validateContents(contents) {
    if (contents.length === 0) {
      throw new EngineError("Embedding requires at least one content item", {
        code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_EMPTY_INPUT"
      });
    }
    if (contents.length > this.info.limits.maxBatchSize) {
      throw new EngineError("Embedding batch size exceeds model limit", {
        code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_BATCH_TOO_LARGE",
        context: `model=${this.info.reference} batchSize=${contents.length} maxBatchSize=${this.info.limits.maxBatchSize}`
      });
    }
    for (const [index, content] of contents.entries()) {
      if (!this.info.inputKinds.includes(content.kind)) {
        throw new EngineError("Embedding model does not support content kind", {
          code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_UNSUPPORTED_CONTENT",
          context: `model=${this.info.reference} index=${index} kind=${content.kind}`
        });
      }
      if (content.kind === "text" && content.text.trim().length === 0) {
        throw new EngineError("Embedding text content must not be empty", {
          code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_EMPTY_TEXT",
          context: `model=${this.info.reference} index=${index}`
        });
      }
      if (content.kind === "image") {
        if (content.data.byteLength === 0) {
          throw new EngineError("Embedding image content must not be empty", {
            code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_EMPTY_IMAGE",
            context: `model=${this.info.reference} index=${index}`
          });
        }
        if (content.format.trim().length === 0) {
          throw new EngineError("Embedding image content must include a format", {
            code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_MISSING_IMAGE_FORMAT",
            context: `model=${this.info.reference} index=${index}`
          });
        }
        const maxImageBytes = this.info.limits.maxImageBytes;
        if (maxImageBytes !== void 0 && content.data.byteLength > maxImageBytes) {
          throw new EngineError("Embedding image content exceeds model limit", {
            code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_IMAGE_TOO_LARGE",
            context: `model=${this.info.reference} index=${index} imageBytes=${content.data.byteLength} maxImageBytes=${maxImageBytes}`
          });
        }
      }
    }
  }
  validateResult(contents, result) {
    if (!result || !Array.isArray(result.vectors)) {
      throw new EngineError("Embedding model returned a non-array response", {
        code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_INVALID_RESPONSE",
        context: `model=${this.info.reference}`
      });
    }
    if (result.vectors.length !== contents.length) {
      throw new EngineError("Embedding model returned the wrong number of vectors", {
        code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_VECTOR_COUNT_MISMATCH",
        context: `model=${this.info.reference} contentCount=${contents.length} vectorCount=${result.vectors.length}`
      });
    }
    for (const [vectorIndex, vector] of result.vectors.entries()) {
      if (!Array.isArray(vector)) {
        throw new EngineError("Embedding model returned a non-array vector", {
          code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_INVALID_VECTOR",
          context: `model=${this.info.reference} vectorIndex=${vectorIndex}`
        });
      }
      if (vector.length !== this.info.dimension) {
        throw new EngineError("Embedding model returned a vector with the wrong dimension", {
          code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_DIMENSION_MISMATCH",
          context: `model=${this.info.reference} vectorIndex=${vectorIndex} expectedDimension=${this.info.dimension} actualDimension=${vector.length}`
        });
      }
      for (const [valueIndex, value] of vector.entries()) {
        if (!Number.isFinite(value)) {
          throw new EngineError("Embedding model returned a non-finite vector value", {
            code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_NON_FINITE_VECTOR_VALUE",
            context: `model=${this.info.reference} vectorIndex=${vectorIndex} valueIndex=${valueIndex}`
          });
        }
      }
    }
    if (!Array.isArray(result.truncated)) {
      throw new EngineError("Embedding model returned invalid truncation information", {
        code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_INVALID_TRUNCATION",
        context: `model=${this.info.reference}`
      });
    }
    const seen = /* @__PURE__ */ new Set();
    for (const index of result.truncated) {
      if (!Number.isInteger(index) || index < 0 || index >= contents.length || seen.has(index)) {
        throw new EngineError("Embedding model returned an invalid truncated input index", {
          code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_INVALID_TRUNCATED_INPUT_INDEX",
          context: `model=${this.info.reference} index=${index} inputCount=${contents.length}`
        });
      }
      seen.add(index);
    }
  }
};

// dist/engine/models/catalog.js
var DEFAULT_QWEN_TEXT_EMBEDDING_ENDPOINT = "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings";
var DEFAULT_QWEN3_VL_EMBEDDING_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding";
var EMBEDDING_MODEL_CATALOG = {
  "local/embeddinggemma-300m": {
    backend: "llama-cpp",
    reference: "local/embeddinggemma-300m",
    provider: "local",
    model: "embeddinggemma-300m",
    uri: "hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf",
    dimension: 768,
    metric: "cosine",
    format: "embeddinggemma",
    contextSize: 2048,
    maxBatchSize: 16
  },
  "local/qwen3-embedding-0.6b": {
    backend: "llama-cpp",
    reference: "local/qwen3-embedding-0.6b",
    provider: "local",
    model: "qwen3-embedding-0.6b",
    uri: "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf",
    dimension: 1024,
    metric: "cosine",
    format: "qwen3",
    contextSize: 8192,
    maxBatchSize: 8
  },
  "qwen/text-embedding-v4": {
    backend: "qwen",
    kind: "text",
    reference: "qwen/text-embedding-v4",
    provider: "qwen",
    model: "text-embedding-v4",
    dimension: 1024,
    metric: "cosine",
    defaultEndpoint: DEFAULT_QWEN_TEXT_EMBEDDING_ENDPOINT,
    maxBatchSize: 10,
    maxInputTokens: 8192
  },
  "qwen/qwen3.7-text-embedding": {
    backend: "qwen",
    kind: "text",
    reference: "qwen/qwen3.7-text-embedding",
    provider: "qwen",
    model: "qwen3.7-text-embedding",
    dimension: 1024,
    metric: "cosine",
    defaultEndpoint: DEFAULT_QWEN_TEXT_EMBEDDING_ENDPOINT,
    maxBatchSize: 20,
    maxInputTokens: 128e3
  },
  "qwen/qwen3-vl-embedding": {
    backend: "qwen",
    kind: "multimodal",
    reference: "qwen/qwen3-vl-embedding",
    provider: "qwen",
    model: "qwen3-vl-embedding",
    dimension: 2560,
    metric: "cosine",
    defaultEndpoint: DEFAULT_QWEN3_VL_EMBEDDING_ENDPOINT,
    maxBatchSize: 20,
    maxInputTokens: 32e3,
    maxImageBytes: 10 * 1024 * 1024
  },
  "local/bge-small-en-v1.5": {
    backend: "transformers-js",
    reference: "local/bge-small-en-v1.5",
    provider: "local",
    model: "bge-small-en-v1.5",
    repo: "onnx-community/bge-small-en-v1.5-ONNX",
    revision: "4a9a46c7b88fa408e650a571a1800243f26309bd",
    dtype: "q4",
    dimension: 384,
    metric: "cosine",
    pooling: "cls",
    normalize: true,
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    maxInputTokens: 512,
    maxBatchSize: 4
  },
  "local/all-minilm-l6-v2": {
    backend: "transformers-js",
    reference: "local/all-minilm-l6-v2",
    provider: "local",
    model: "all-minilm-l6-v2",
    repo: "onnx-community/all-MiniLM-L6-v2-ONNX",
    revision: "aff7a1dc4e8a1ea593e6ea21e95c22ef0a25966f",
    dtype: "q4",
    dimension: 384,
    metric: "cosine",
    pooling: "mean",
    normalize: true,
    maxInputTokens: 256,
    maxBatchSize: 4
  },
  "local/potion-retrieval-32m": {
    backend: "model2vec",
    reference: "local/potion-retrieval-32m",
    provider: "local",
    model: "potion-retrieval-32m",
    repo: "minishlab/potion-retrieval-32M",
    revision: "6fc8051fab2a1e0ee76689cf08c853792ac285e7",
    modelFile: "model.safetensors",
    embeddingTensor: "embeddings",
    tokenizerFile: "tokenizer.json",
    dimension: 512,
    metric: "cosine",
    normalize: true,
    maxInputTokens: 1024,
    maxBatchSize: 256,
    defaultConcurrency: 2
  },
  "local/potion-multilingual-128m": {
    backend: "model2vec",
    reference: "local/potion-multilingual-128m",
    provider: "local",
    model: "potion-multilingual-128m",
    repo: "minishlab/potion-multilingual-128M",
    revision: "73908c3438cf03b6a01bcb9611d62b23d0726f08",
    modelFile: "model.safetensors",
    embeddingTensor: "embeddings",
    tokenizerFile: "tokenizer.json",
    dimension: 256,
    metric: "cosine",
    normalize: true,
    maxInputTokens: 1024,
    maxBatchSize: 256,
    defaultConcurrency: 2
  },
  "local/potion-code-16m-v2": {
    backend: "model2vec",
    reference: "local/potion-code-16m-v2",
    provider: "local",
    model: "potion-code-16m-v2",
    repo: "minishlab/potion-code-16M-v2",
    revision: "e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b",
    modelFile: "model.safetensors",
    embeddingTensor: "embeddings",
    tokenizerFile: "tokenizer.json",
    dimension: 256,
    metric: "cosine",
    normalize: true,
    maxInputTokens: 1024,
    maxBatchSize: 256,
    defaultConcurrency: 2
  },
  "local/multilingual-e5-small": {
    backend: "transformers-js",
    reference: "local/multilingual-e5-small",
    provider: "local",
    model: "multilingual-e5-small",
    repo: "Xenova/multilingual-e5-small",
    revision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
    dtype: "q8",
    dimension: 384,
    metric: "cosine",
    pooling: "mean",
    normalize: true,
    queryPrefix: "query: ",
    documentPrefix: "passage: ",
    maxInputTokens: 512,
    maxBatchSize: 4
  },
  "local/jina-embeddings-v2-base-code": {
    backend: "transformers-js",
    reference: "local/jina-embeddings-v2-base-code",
    provider: "local",
    model: "jina-embeddings-v2-base-code",
    repo: "jinaai/jina-embeddings-v2-base-code",
    revision: "516f4baf13dec4ddddda8631e019b5737c8bc250",
    dtype: "q8",
    dimension: 768,
    metric: "cosine",
    pooling: "mean",
    normalize: true,
    maxInputTokens: 8192,
    maxBatchSize: 2
  },
  "local/gte-modernbert-base": {
    backend: "transformers-js",
    reference: "local/gte-modernbert-base",
    provider: "local",
    model: "gte-modernbert-base",
    repo: "Alibaba-NLP/gte-modernbert-base",
    revision: "e7f32e3c00f91d699e8c43b53106206bcc72bb22",
    dtype: "q4",
    dimension: 768,
    metric: "cosine",
    pooling: "cls",
    normalize: true,
    maxInputTokens: 8192,
    maxBatchSize: 2
  },
  "local/nomic-embed-text-v1.5": {
    backend: "transformers-js",
    reference: "local/nomic-embed-text-v1.5",
    provider: "local",
    model: "nomic-embed-text-v1.5",
    repo: "nomic-ai/nomic-embed-text-v1.5",
    revision: "e9b6763023c676ca8431644204f50c2b100d9aab",
    dtype: "q4",
    dimension: 768,
    metric: "cosine",
    pooling: "mean",
    normalize: true,
    queryPrefix: "search_query: ",
    documentPrefix: "search_document: ",
    maxInputTokens: 8192,
    maxBatchSize: 2
  }
};
function getEmbeddingModelCatalogEntry(reference) {
  return EMBEDDING_MODEL_CATALOG[reference];
}

// zg-disabled:zg-providers-disabled.js
function unsupportedEmbeddingBackend(backend) {
  const error = new Error(`The ${backend} embedding backend is not included in this lightweight zg runtime. Use the supported local static Potion model.`);
  error.name = "UnsupportedEmbeddingBackendError";
  error.code = "ZG_EMBEDDING_BACKEND_NOT_INCLUDED";
  error.backend = backend;
  throw error;
}
var TransformersJsEmbeddingModel = class {
  constructor() {
    unsupportedEmbeddingBackend("transformers-js");
  }
};
var LlamaCppEmbeddingModel = class {
  constructor() {
    unsupportedEmbeddingBackend("llama-cpp");
  }
};

// dist/engine/models/backends/model2vec.js
import { createWriteStream, existsSync as existsSync4, statSync as statSync3 } from "node:fs";
import { mkdir as mkdir2, open as open2, rename as rename2, rm, writeFile as writeFile2 } from "node:fs/promises";
import { basename as basename3, dirname as dirname8, join as join8 } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

// dist/engine/models/download-progress.js
function createModelDownloadProgressReporter(model, onProgress, expectedArtifacts = []) {
  const artifacts = new Map(expectedArtifacts.map((artifact) => [artifact, { downloadedBytes: 0 }]));
  return {
    start() {
      onProgress?.({ stage: "preparing", model });
    },
    register(artifact) {
      if (!artifacts.has(artifact)) {
        artifacts.set(artifact, { downloadedBytes: 0 });
      }
    },
    skip(artifact) {
      artifacts.delete(artifact);
    },
    report(progress) {
      artifacts.set(progress.artifact, {
        downloadedBytes: progress.downloadedBytes,
        totalBytes: progress.totalBytes
      });
      const values = [...artifacts.values()];
      const downloadedBytes = values.reduce((sum, artifact) => sum + artifact.downloadedBytes, 0);
      const hasCompleteTotals = values.length > 0 && values.every((artifact) => typeof artifact.totalBytes === "number" && Number.isFinite(artifact.totalBytes) && artifact.totalBytes >= 0);
      const totalBytes = hasCompleteTotals ? values.reduce((sum, artifact) => sum + (artifact.totalBytes ?? 0), 0) : void 0;
      onProgress?.({
        stage: "downloading",
        model,
        downloadedBytes,
        ...totalBytes === void 0 ? {} : { totalBytes }
      });
    },
    warning(message) {
      if (!onProgress) {
        return false;
      }
      onProgress({ stage: "warning", model, message });
      return true;
    },
    finish() {
      onProgress?.({ stage: "ready", model });
    }
  };
}

// dist/engine/models/backends/model2vec-tokenizer.js
import { Tokenizer } from "@huggingface/tokenizers";
import { readFile as readFile4 } from "node:fs/promises";
import { join as join7 } from "node:path";
async function loadModel2VecTokenizer(source) {
  const [tokenizerJson, tokenizerConfig] = await Promise.all([
    readJson(join7(source, "tokenizer.json")),
    readJson(join7(source, "tokenizer_config.json"))
  ]);
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig);
  const unknownTokenId = resolveUnknownTokenId(tokenizer, tokenizerJson);
  const tokenize = (text, options) => {
    const ids = tokenizer.encode(text, {
      add_special_tokens: options.add_special_tokens
    }).ids;
    return {
      input_ids: {
        data: ids.length > options.max_length ? ids.slice(0, options.max_length) : ids
      }
    };
  };
  return Object.assign(tokenize, { unk_token_id: unknownTokenId });
}
async function readJson(path) {
  return JSON.parse(await readFile4(path, "utf8"));
}
function resolveUnknownTokenId(tokenizer, tokenizerJson) {
  const configuredId = tokenizerJson.model?.unk_id;
  if (typeof configuredId === "number" && Number.isInteger(configuredId)) {
    return configuredId;
  }
  const configuredToken = tokenizerJson.model?.unk_token;
  if (typeof configuredToken !== "string") {
    return null;
  }
  const tokenId = tokenizer.token_to_id(configuredToken);
  return typeof tokenId === "number" && Number.isInteger(tokenId) ? tokenId : null;
}

// dist/engine/models/backends/model2vec-worker-pool.js
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
var Model2VecWorkerPool = class {
  data;
  workerUrl;
  disposed = false;
  nextJobId = 1;
  maxWorkers;
  queue = [];
  slots = [];
  constructor(data, maxWorkers = availableParallelism(), workerUrl = new URL("./zg-model2vec-worker.js", import.meta.url)) {
    this.data = data;
    this.workerUrl = workerUrl;
    this.maxWorkers = Math.max(1, Math.floor(maxWorkers));
  }
  async start() {
    this.ensureNotDisposed();
    if (this.slots.length === 0) {
      await this.spawnWorker().readyPromise;
    }
  }
  async run(texts, signal) {
    this.ensureNotDisposed();
    throwIfAborted3(signal);
    return await new Promise((resolve9, reject) => {
      const job = {
        id: this.nextJobId++,
        texts: [...texts],
        signal,
        resolve: resolve9,
        reject,
        settled: false
      };
      job.abort = () => {
        if (job.settled) {
          return;
        }
        job.settled = true;
        const queuedIndex = this.queue.indexOf(job);
        if (queuedIndex >= 0) {
          this.queue.splice(queuedIndex, 1);
        }
        reject(abortError2(signal));
      };
      signal?.addEventListener("abort", job.abort, { once: true });
      const idle = this.slots.find((slot) => slot.ready && !slot.closed && !slot.job);
      if (idle) {
        this.dispatch(idle, job);
      } else if (this.slots.length < this.maxWorkers) {
        const slot = this.spawnWorker(job);
        void slot.readyPromise.catch(() => void 0);
      } else {
        this.queue.push(job);
      }
    });
  }
  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const error = new Error("Model2Vec worker pool is disposed");
    for (const job of this.queue.splice(0)) {
      this.rejectJob(job, error);
    }
    for (const slot of this.slots) {
      if (slot.job) {
        this.rejectJob(slot.job, error);
        slot.job = void 0;
      }
      slot.closed = true;
    }
    await Promise.allSettled(this.slots.map((slot) => slot.worker.terminate()));
    this.slots.length = 0;
  }
  spawnWorker(job) {
    const worker = new Worker(this.workerUrl, { workerData: this.data });
    let resolveReady;
    let rejectReady;
    const readyPromise = new Promise((resolve9, reject) => {
      resolveReady = resolve9;
      rejectReady = reject;
    });
    const slot = {
      worker,
      ready: false,
      closed: false,
      job,
      resolveReady,
      rejectReady,
      readyPromise
    };
    this.slots.push(slot);
    worker.on("message", (response) => {
      this.handleMessage(slot, response);
    });
    worker.on("error", (error) => {
      this.failSlot(slot, error);
    });
    worker.on("exit", (code) => {
      if (!slot.closed) {
        this.failSlot(slot, new Error(`Model2Vec worker exited unexpectedly with code ${code}`));
      }
    });
    return slot;
  }
  handleMessage(slot, response) {
    if (slot.closed) {
      return;
    }
    if (response.type === "ready") {
      slot.ready = true;
      slot.resolveReady();
      if (slot.job) {
        this.postJob(slot, slot.job);
      } else {
        slot.worker.unref();
        this.drain();
      }
      return;
    }
    const job = slot.job;
    if (!job || response.id !== job.id) {
      this.failSlot(slot, new Error("Model2Vec worker response is out of order"));
      return;
    }
    slot.job = void 0;
    slot.worker.unref();
    if (response.type === "error") {
      this.rejectJob(job, workerError(response.error));
    } else {
      try {
        this.resolveJob(job, workerEmbeddingResult(response, this.data.dimension));
      } catch (error) {
        this.rejectJob(job, error);
        this.failSlot(slot, error);
        return;
      }
    }
    this.drain();
  }
  dispatch(slot, job) {
    slot.worker.ref();
    slot.job = job;
    this.postJob(slot, job);
  }
  postJob(slot, job) {
    if (job.settled) {
      slot.job = void 0;
      slot.worker.unref();
      this.drain();
      return;
    }
    slot.worker.postMessage({
      id: job.id,
      texts: job.texts
    });
  }
  drain() {
    if (this.disposed) {
      return;
    }
    for (const slot of this.slots) {
      if (!slot.ready || slot.closed || slot.job) {
        continue;
      }
      const job = this.nextQueuedJob();
      if (!job) {
        return;
      }
      this.dispatch(slot, job);
    }
    while (this.queue.length > 0 && this.slots.length < this.maxWorkers) {
      const job = this.nextQueuedJob();
      if (!job) {
        return;
      }
      const slot = this.spawnWorker(job);
      void slot.readyPromise.catch(() => void 0);
    }
  }
  nextQueuedJob() {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      if (job && !job.settled) {
        return job;
      }
    }
    return void 0;
  }
  failSlot(slot, error) {
    if (slot.closed) {
      return;
    }
    slot.closed = true;
    slot.rejectReady(error);
    if (slot.job) {
      this.rejectJob(slot.job, error);
      slot.job = void 0;
    }
    const index = this.slots.indexOf(slot);
    if (index >= 0) {
      this.slots.splice(index, 1);
    }
    void slot.worker.terminate().catch(() => void 0);
    this.drain();
  }
  resolveJob(job, result) {
    if (job.settled) {
      return;
    }
    job.settled = true;
    job.signal?.removeEventListener("abort", job.abort);
    job.resolve(result);
  }
  rejectJob(job, error) {
    if (job.settled) {
      return;
    }
    job.settled = true;
    job.signal?.removeEventListener("abort", job.abort);
    job.reject(error);
  }
  ensureNotDisposed() {
    if (this.disposed) {
      throw new Error("Model2Vec worker pool is disposed");
    }
  }
};
function workerEmbeddingResult(response, dimension) {
  const flat = new Float32Array(response.vectors);
  if (flat.length !== response.vectorCount * dimension) {
    throw new Error("Model2Vec worker returned an invalid vector buffer");
  }
  const vectors = [];
  for (let index = 0; index < response.vectorCount; index++) {
    vectors.push(Array.from(flat.subarray(index * dimension, (index + 1) * dimension)));
  }
  return { vectors, truncated: response.truncated };
}
function workerError(serialized) {
  const error = new Error(serialized.message);
  error.name = serialized.name ?? "Error";
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
  return error;
}
function throwIfAborted3(signal) {
  if (signal?.aborted) {
    throw abortError2(signal);
  }
}
function abortError2(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error("Model2Vec embedding was cancelled");
}

// dist/engine/models/backends/model2vec-runtime.js
async function embedModel2VecTexts(texts, tokenizer, table, maxInputTokens, normalize) {
  const tokenized = await tokenizeModel2VecTexts(texts, tokenizer, maxInputTokens);
  return {
    vectors: embedModel2VecTokenLists(tokenized.tokenLists, table, normalize),
    truncated: tokenized.truncated
  };
}
async function tokenizeModel2VecTexts(texts, tokenizer, maxInputTokens) {
  const truncatedInputIndexes = [];
  const tokenLists = await Promise.all(texts.map(async (text, index) => {
    const encoded = await tokenizer(text, {
      add_special_tokens: false,
      truncation: true,
      max_length: maxInputTokens + 1
    });
    const encodedTokenIds = Array.from(encoded.input_ids.data, Number);
    if (encodedTokenIds.length > maxInputTokens) {
      truncatedInputIndexes.push(index);
    }
    const unknownTokenId = tokenizer.unk_token_id;
    return encodedTokenIds.slice(0, maxInputTokens).filter((id) => unknownTokenId === void 0 || unknownTokenId === null || id !== unknownTokenId);
  }));
  return {
    tokenLists,
    truncated: truncatedInputIndexes.sort((left, right) => left - right)
  };
}
function embedModel2VecTokenLists(tokenLists, table, normalize) {
  return tokenLists.map((tokenIds) => embedStaticTokenList(tokenIds, table, normalize));
}
function sharedStaticEmbeddingTable(table) {
  if (table.data.buffer instanceof SharedArrayBuffer) {
    return table;
  }
  const sharedBuffer = new SharedArrayBuffer(table.data.byteLength);
  new Uint8Array(sharedBuffer).set(new Uint8Array(table.data.buffer, table.data.byteOffset, table.data.byteLength));
  return {
    ...table,
    data: table.dtype === "F16" ? new Uint16Array(sharedBuffer) : new Float32Array(sharedBuffer)
  };
}
function embedStaticTokenList(tokenIds, table, normalize) {
  const dimension = table.dimension;
  const halfValues = table.dtype === "F16" ? halfFloatValues() : null;
  const vector = Array.from({ length: dimension }, () => 0);
  if (tokenIds.length === 0) {
    return vector;
  }
  for (let index = 0; index < tokenIds.length; index++) {
    const tokenId = tokenIds[index];
    if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId >= table.rows) {
      throw new Error(`Tokenizer returned out-of-range token id: id=${tokenId} rows=${table.rows}`);
    }
    const start = tokenId * dimension;
    for (let column = 0; column < dimension; column++) {
      const value = table.data[start + column];
      vector[column] += halfValues ? halfValues[value] : value;
    }
  }
  let squaredNorm = 0;
  for (let column = 0; column < dimension; column++) {
    vector[column] /= tokenIds.length;
    squaredNorm += vector[column] * vector[column];
  }
  if (normalize && squaredNorm > 0) {
    const inverseNorm = 1 / Math.sqrt(squaredNorm);
    for (let column = 0; column < dimension; column++) {
      vector[column] *= inverseNorm;
    }
  }
  return vector;
}
var cachedHalfFloatValues = null;
function halfFloatValues() {
  if (cachedHalfFloatValues) {
    return cachedHalfFloatValues;
  }
  const values = new Float32Array(65536);
  for (let bits = 0; bits < values.length; bits++) {
    const sign2 = bits & 32768 ? -1 : 1;
    const exponent = bits >> 10 & 31;
    const fraction = bits & 1023;
    if (exponent === 0) {
      values[bits] = sign2 * 2 ** -14 * (fraction / 1024);
    } else if (exponent === 31) {
      values[bits] = fraction === 0 ? sign2 * Infinity : Number.NaN;
    } else {
      values[bits] = sign2 * 2 ** (exponent - 15) * (1 + fraction / 1024);
    }
  }
  cachedHalfFloatValues = values;
  return values;
}

// dist/engine/models/backends/model2vec.js
var DEFAULT_MODEL_CACHE_DIR = join8(defaultHome(), "models");
var defaultDependencies = {
  async loadTokenizer(source) {
    return await loadModel2VecTokenizer(source);
  },
  async loadSafetensors(path, tensorName, dimension) {
    return await readStaticEmbeddingTable(path, tensorName, dimension);
  },
  async download(url, destination, onProgress) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    const contentLength = response.headers.get("content-length");
    const parsedTotalBytes = contentLength ? Number.parseInt(contentLength, 10) : void 0;
    const totalBytes = parsedTotalBytes !== void 0 && Number.isFinite(parsedTotalBytes) && parsedTotalBytes >= 0 ? parsedTotalBytes : void 0;
    let downloadedBytes = 0;
    const progressStream = new Transform({
      transform(chunk, _encoding, callback) {
        downloadedBytes += Buffer.byteLength(chunk);
        onProgress?.({ downloadedBytes, totalBytes });
        callback(null, chunk);
      }
    });
    await pipeline(Readable.fromWeb(response.body), progressStream, createWriteStream(destination));
  }
};
var Model2VecEmbeddingModel = class extends BaseEmbeddingModel {
  entry;
  info;
  modelCacheDir;
  dependencies;
  tokenizer = null;
  staticTable = null;
  workerPool = null;
  loadPromise = null;
  useWorkerPool;
  disposed = false;
  constructor(entry, options, dependencies = {}) {
    super();
    this.entry = entry;
    this.info = {
      reference: entry.reference,
      provider: entry.provider,
      name: entry.model,
      dimension: entry.dimension,
      metric: entry.metric,
      defaultConcurrency: entry.defaultConcurrency,
      inputKinds: ["text"],
      limits: {
        maxBatchSize: entry.maxBatchSize,
        maxInputTokens: entry.maxInputTokens
      }
    };
    this.modelCacheDir = options.modelCacheDir ?? process.env.ZVEC_GREP_MODEL_CACHE ?? DEFAULT_MODEL_CACHE_DIR;
    this.dependencies = { ...defaultDependencies, ...dependencies };
    this.useWorkerPool = Object.keys(dependencies).length === 0;
  }
  async doEmbed(contents, options) {
    return await this.embedBatch(contents, options);
  }
  async embedBatch(contents, options) {
    this.ensureNotDisposed();
    await this.ensureLoaded(options.onProgress);
    try {
      const texts = contents.map((content) => formatText(content.text, options.purpose, this.entry));
      if (this.workerPool) {
        return await this.workerPool.run(texts, options.signal);
      }
      return await this.embedTexts(texts);
    } catch (cause) {
      throw new EngineError("Model2Vec embedding failed", {
        code: "ZVEC_GREP.ENGINE.MODELS.MODEL2VEC_EMBED_FAILED",
        context: `model=${this.entry.reference} repo=${this.entry.repo}`,
        cause
      });
    }
  }
  async dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.workerPool?.dispose();
    this.workerPool = null;
    this.staticTable = null;
    this.tokenizer = null;
    this.loadPromise = null;
  }
  async ensureLoaded(onProgress) {
    if (this.workerPool || this.tokenizer && this.staticTable) {
      return;
    }
    if (this.loadPromise) {
      return await this.loadPromise;
    }
    this.loadPromise = this.loadModel(onProgress);
    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }
  async loadModel(onProgress) {
    const downloadProgress = createModelDownloadProgressReporter(this.entry.reference, onProgress, [basename3(this.entry.modelFile), basename3(this.entry.tokenizerFile)]);
    downloadProgress.start();
    const [modelPath, tokenizerSource] = await Promise.all([
      this.resolveModelPath(downloadProgress),
      this.resolveTokenizerSource(downloadProgress)
    ]);
    const staticTable = await this.dependencies.loadSafetensors(modelPath, this.entry.embeddingTensor, this.info.dimension);
    this.ensureNotDisposed();
    if (this.useWorkerPool) {
      const sharedTable = sharedStaticEmbeddingTable(staticTable);
      const workerPool = new Model2VecWorkerPool({
        tokenizerSource,
        maxInputTokens: this.entry.maxInputTokens,
        normalize: this.entry.normalize,
        tableBuffer: sharedTable.data.buffer,
        dimension: sharedTable.dimension,
        dtype: sharedTable.dtype,
        rows: sharedTable.rows
      });
      try {
        await workerPool.start();
        this.ensureNotDisposed();
        this.workerPool = workerPool;
      } catch (error) {
        await workerPool.dispose();
        throw error;
      }
    } else {
      this.tokenizer = await this.dependencies.loadTokenizer(tokenizerSource, {
        cache_dir: this.modelCacheDir,
        revision: this.entry.revision,
        ...tokenizerSource !== this.entry.repo ? { local_files_only: true } : {}
      });
      this.ensureNotDisposed();
      this.staticTable = staticTable;
    }
    downloadProgress.finish();
  }
  async resolveModelPath(downloadProgress) {
    const modelPath = join8(this.modelCacheDir, "model2vec", this.entry.repo.replaceAll("/", "--"), this.entry.revision, basename3(this.entry.modelFile));
    return await this.resolveCachedFile(this.entry.modelFile, modelPath, downloadProgress);
  }
  async resolveTokenizerSource(downloadProgress) {
    const tokenizerDirectory = join8(this.modelCacheDir, "model2vec", this.entry.repo.replaceAll("/", "--"), this.entry.revision, "tokenizer");
    await this.resolveCachedFile(this.entry.tokenizerFile, join8(tokenizerDirectory, "tokenizer.json"), downloadProgress);
    const configPath = join8(tokenizerDirectory, "tokenizer_config.json");
    if (!isUsableModelFile(configPath)) {
      await writeFile2(configPath, `${JSON.stringify({ tokenizer_class: "PreTrainedTokenizer" })}
`);
    }
    return tokenizerDirectory;
  }
  async resolveCachedFile(remoteFile, localPath, downloadProgress) {
    if (isUsableModelFile(localPath)) {
      downloadProgress.skip(basename3(remoteFile));
      return localPath;
    }
    await mkdir2(dirname8(localPath), { recursive: true });
    const partialPath = `${localPath}.part-${process.pid}-${Date.now()}`;
    const url = `https://huggingface.co/${this.entry.repo}/resolve/${this.entry.revision}/${remoteFile}`;
    try {
      await this.dependencies.download(url, partialPath, (progress) => {
        downloadProgress.report({
          artifact: basename3(remoteFile),
          ...progress
        });
      });
      if (!isUsableModelFile(partialPath)) {
        throw new Error("Downloaded model file is empty");
      }
      await rename2(partialPath, localPath);
      return localPath;
    } catch (cause) {
      await rm(partialPath, { force: true });
      throw new EngineError("Unable to download Model2Vec model artifact", {
        code: "ZVEC_GREP.ENGINE.MODELS.MODEL2VEC_DOWNLOAD_FAILED",
        context: `model=${this.entry.reference} url=${url}`,
        cause
      });
    }
  }
  async embedTexts(texts) {
    const tokenizer = this.tokenizer;
    const staticTable = this.staticTable;
    if (!tokenizer || !staticTable) {
      throw new Error("Model2Vec model is not loaded");
    }
    return await embedModel2VecTexts(texts, tokenizer, staticTable, this.entry.maxInputTokens, this.entry.normalize);
  }
  ensureNotDisposed() {
    if (this.disposed) {
      throw new EngineError("Model2Vec embedding model is disposed", {
        code: "ZVEC_GREP.ENGINE.MODELS.MODEL2VEC_DISPOSED",
        context: `model=${this.entry.reference}`
      });
    }
  }
};
function isUsableModelFile(path) {
  return existsSync4(path) && statSync3(path).size > 0;
}
function formatText(text, purpose, entry) {
  const prefix = purpose === "query" ? "queryPrefix" in entry && typeof entry.queryPrefix === "string" ? entry.queryPrefix : void 0 : "documentPrefix" in entry && typeof entry.documentPrefix === "string" ? entry.documentPrefix : void 0;
  return prefix ? `${prefix}${text}` : text;
}
async function readStaticEmbeddingTable(path, tensorName, expectedDimension) {
  const file = await open2(path, "r");
  try {
    const stats = await file.stat();
    if (stats.size < 9) {
      throw new Error("Safetensors file is too small");
    }
    const prefix = Buffer.alloc(8);
    await readExactly(file, prefix, 0);
    const headerLength = Number(prefix.readBigUInt64LE(0));
    const dataStart = 8 + headerLength;
    if (!Number.isSafeInteger(headerLength) || dataStart > stats.size) {
      throw new Error("Safetensors header length is invalid");
    }
    const headerBytes = Buffer.alloc(headerLength);
    await readExactly(file, headerBytes, 8);
    let header;
    try {
      header = JSON.parse(headerBytes.toString("utf8"));
    } catch (cause) {
      throw new Error("Safetensors header is invalid JSON", { cause });
    }
    const tensor = header[tensorName];
    if (!tensor || tensor.shape?.length !== 2 || tensor.shape[1] !== expectedDimension || tensor.data_offsets?.length !== 2 || tensor.dtype !== "F16" && tensor.dtype !== "F32") {
      throw new Error(`Safetensors tensor '${tensorName}' is missing or incompatible`);
    }
    const [relativeStart, relativeEnd] = tensor.data_offsets;
    const rows = tensor.shape[0];
    const valueCount = rows * expectedDimension;
    const bytesPerValue = tensor.dtype === "F16" ? 2 : 4;
    const tensorByteLength = valueCount * bytesPerValue;
    if (!Number.isSafeInteger(valueCount) || !Number.isSafeInteger(tensorByteLength) || relativeStart < 0 || relativeEnd - relativeStart !== tensorByteLength || dataStart + relativeEnd > stats.size) {
      throw new Error(`Safetensors tensor '${tensorName}' has invalid offsets`);
    }
    const sharedBuffer = new SharedArrayBuffer(tensorByteLength);
    await readExactly(file, Buffer.from(sharedBuffer), dataStart + relativeStart);
    return {
      data: tensor.dtype === "F16" ? new Uint16Array(sharedBuffer) : new Float32Array(sharedBuffer),
      dimension: expectedDimension,
      dtype: tensor.dtype,
      rows
    };
  } finally {
    await file.close();
  }
}
async function readExactly(file, buffer, position) {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await file.read(buffer, offset, buffer.byteLength - offset, position + offset);
    if (bytesRead === 0) {
      throw new Error("Safetensors file ended unexpectedly");
    }
    offset += bytesRead;
  }
}

// dist/observability/trace-context.js
import { AsyncLocalStorage } from "node:async_hooks";
var storage = new AsyncLocalStorage();
function currentTraceContext() {
  return storage.getStore();
}
function traceHeaders() {
  const context = currentTraceContext();
  if (!context)
    return {};
  return {
    traceparent: context.traceparent,
    ...context.tracestate ? { tracestate: context.tracestate } : {},
    ...context.baggage ? { baggage: context.baggage } : {}
  };
}

// dist/engine/models/backends/qwen.js
var DEFAULT_REMOTE_EMBEDDING_TIMEOUT_MS = 6e4;
var defaultDependencies2 = {
  fetch: (...args) => globalThis.fetch(...args)
};
var QWEN_TEXT_EMBEDDING_V4_SPEC = {
  displayName: "Qwen text-embedding-v4",
  errorCodePrefix: "QWEN_TEXT_EMBEDDING_V4"
};
var QWEN37_TEXT_EMBEDDING_SPEC = {
  displayName: "Qwen3.7 text embedding",
  errorCodePrefix: "QWEN37_TEXT_EMBEDDING"
};
var QwenTextEmbeddingModel = class extends BaseEmbeddingModel {
  info;
  entry;
  apiKey;
  endpoint;
  displayName;
  errorCodePrefix;
  dependencies;
  constructor(entry, spec, options, dependencies) {
    super();
    this.entry = entry;
    const endpoint = options.endpoint === void 0 ? entry.defaultEndpoint : options.endpoint.trim();
    this.info = {
      reference: entry.reference,
      provider: entry.provider,
      name: entry.model,
      dimension: entry.dimension,
      metric: entry.metric,
      endpoint,
      inputKinds: ["text"],
      limits: {
        maxBatchSize: entry.maxBatchSize,
        maxInputTokens: entry.maxInputTokens
      }
    };
    this.displayName = spec.displayName;
    this.errorCodePrefix = spec.errorCodePrefix;
    this.dependencies = { ...defaultDependencies2, ...dependencies };
    const apiKey = options.apiKey?.trim() ?? "";
    if (apiKey.length === 0) {
      throw new EngineError(`${this.displayName} model requires an API key`, {
        code: this.errorCode("MISSING_API_KEY"),
        context: `model=${this.info.reference}
hint=Pass --api-key, set ZVEC_GREP_API_KEY, or configure providers.qwen.apiKey in ${globalConfigPath()}.`
      });
    }
    if (endpoint.length === 0) {
      throw new EngineError(`${this.displayName} model requires an endpoint`, {
        code: this.errorCode("MISSING_ENDPOINT"),
        context: `model=${this.info.reference}`
      });
    }
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }
  async doEmbed(contents, options) {
    const texts = contents.map((content) => content.text);
    let response;
    const signal = remoteEmbeddingSignal(options.signal);
    try {
      response = await this.dependencies.fetch(this.endpoint, {
        method: "POST",
        headers: {
          ...traceHeaders(),
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.entry.model,
          input: texts,
          dimensions: this.info.dimension,
          encoding_format: "float"
        }),
        signal
      });
    } catch (cause) {
      throwIfEmbeddingCancelled(options.signal);
      throw new EngineError(`${this.displayName} request failed`, {
        code: this.errorCode("REQUEST_FAILED"),
        context: `model=${this.info.reference} endpoint=${this.endpoint} timeoutMs=${DEFAULT_REMOTE_EMBEDDING_TIMEOUT_MS}`,
        cause
      });
    }
    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new EngineError(`${this.displayName} response was not valid JSON`, {
        code: this.errorCode("INVALID_JSON"),
        context: `model=${this.info.reference} status=${response.status}`,
        cause
      });
    }
    if (!response.ok) {
      const error = readProviderError(body);
      throw new EngineError(`${this.displayName} request returned an error`, {
        code: this.errorCode("API_ERROR"),
        context: providerErrorContext(this.entry.model, response, error)
      });
    }
    if (!isRecord2(body) || !Array.isArray(body.data)) {
      throw new EngineError(`${this.displayName} response did not include data`, {
        code: this.errorCode("MISSING_DATA"),
        context: `model=${this.info.reference}`
      });
    }
    const vectors = new Array(texts.length);
    for (const item of body.data) {
      if (!isRecord2(item) || typeof item.index !== "number" || !Number.isInteger(item.index)) {
        throw new EngineError(`${this.displayName} response included an invalid index`, {
          code: this.errorCode("INVALID_INDEX"),
          context: `model=${this.info.reference} index=${isRecord2(item) ? String(item.index) : "unknown"}`
        });
      }
      if (item.index < 0 || item.index >= texts.length) {
        throw new EngineError(`${this.displayName} response index was out of range`, {
          code: this.errorCode("INDEX_OUT_OF_RANGE"),
          context: `model=${this.info.reference} index=${item.index} inputCount=${texts.length}`
        });
      }
      if (!Array.isArray(item.embedding)) {
        throw new EngineError(`${this.displayName} response included an invalid embedding`, {
          code: this.errorCode("INVALID_VECTOR"),
          context: `model=${this.info.reference} index=${item.index}`
        });
      }
      vectors[item.index] = item.embedding;
    }
    return { vectors, truncated: [] };
  }
  errorCode(suffix) {
    return `ZVEC_GREP.ENGINE.MODELS.${this.errorCodePrefix}_${suffix}`;
  }
};
var QwenTextEmbeddingV4Model = class extends QwenTextEmbeddingModel {
  constructor(entry, options, dependencies = {}) {
    super(entry, QWEN_TEXT_EMBEDDING_V4_SPEC, options, dependencies);
  }
};
var Qwen37TextEmbeddingModel = class extends QwenTextEmbeddingModel {
  constructor(entry, options, dependencies = {}) {
    super(entry, QWEN37_TEXT_EMBEDDING_SPEC, options, dependencies);
  }
};
var QWEN3_VL_EMBEDDING_MAX_IMAGE_COUNT = 10;
var QWEN3_VL_EMBEDDING_SUPPORTED_IMAGE_FORMATS = [
  "jpeg",
  "png",
  "webp"
];
var Qwen3VlEmbeddingModel = class extends BaseEmbeddingModel {
  info;
  entry;
  apiKey;
  endpoint;
  dependencies;
  constructor(entry, options, dependencies = {}) {
    super();
    this.entry = entry;
    this.dependencies = { ...defaultDependencies2, ...dependencies };
    const endpoint = options.endpoint === void 0 ? entry.defaultEndpoint : options.endpoint.trim();
    this.info = {
      reference: entry.reference,
      provider: entry.provider,
      name: entry.model,
      dimension: entry.dimension,
      metric: entry.metric,
      endpoint,
      inputKinds: ["text", "image"],
      limits: {
        maxBatchSize: entry.maxBatchSize,
        maxInputTokens: entry.maxInputTokens,
        maxImageBytes: entry.maxImageBytes
      }
    };
    const apiKey = options.apiKey?.trim() ?? "";
    if (apiKey.length === 0) {
      throw new EngineError("Qwen3 VL embedding model requires an API key", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_MISSING_API_KEY",
        context: `model=${this.info.reference}
hint=Pass --api-key, set ZVEC_GREP_API_KEY, or configure providers.qwen.apiKey in ${globalConfigPath()}.`
      });
    }
    if (endpoint.length === 0) {
      throw new EngineError("Qwen3 VL embedding model requires an endpoint", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_MISSING_ENDPOINT",
        context: `model=${this.info.reference}`
      });
    }
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }
  async doEmbed(contents, options) {
    validateQwen3VlContents(this.entry.model, contents);
    const requestContents = contents.map((content) => {
      if (content.kind === "text") {
        return {
          text: content.text
        };
      }
      return {
        image: bytesToBase64(content.data)
      };
    });
    let response;
    const signal = remoteEmbeddingSignal(options.signal);
    try {
      response = await this.dependencies.fetch(this.endpoint, {
        method: "POST",
        headers: {
          ...traceHeaders(),
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.entry.model,
          input: {
            contents: requestContents
          },
          parameters: {
            dimension: this.info.dimension
          }
        }),
        signal
      });
    } catch (cause) {
      throwIfEmbeddingCancelled(options.signal);
      throw new EngineError("Qwen3 VL embedding request failed", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_REQUEST_FAILED",
        context: `model=${this.info.reference} endpoint=${this.endpoint} timeoutMs=${DEFAULT_REMOTE_EMBEDDING_TIMEOUT_MS}`,
        cause
      });
    }
    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new EngineError("Qwen3 VL embedding response was not valid JSON", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_INVALID_JSON",
        context: `model=${this.info.reference} status=${response.status}`,
        cause
      });
    }
    if (!response.ok) {
      const error = readProviderError(body);
      throw new EngineError("Qwen3 VL embedding request returned an error", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_API_ERROR",
        context: providerErrorContext(this.entry.model, response, error)
      });
    }
    if (!isRecord2(body) || !isRecord2(body.output) || !Array.isArray(body.output.embeddings)) {
      throw new EngineError("Qwen3 VL embedding response did not include embeddings", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_MISSING_EMBEDDINGS",
        context: `model=${this.info.reference}`
      });
    }
    const vectors = new Array(contents.length);
    for (const [fallbackIndex, item] of body.output.embeddings.entries()) {
      if (!isRecord2(item)) {
        throw new EngineError("Qwen3 VL embedding response included an invalid embedding item", {
          code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_INVALID_ITEM",
          context: `model=${this.info.reference} index=${fallbackIndex}`
        });
      }
      const index = readEmbeddingIndex(item, fallbackIndex);
      if (index < 0 || index >= contents.length) {
        throw new EngineError("Qwen3 VL embedding response index was out of range", {
          code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_INDEX_OUT_OF_RANGE",
          context: `model=${this.info.reference} index=${index} inputCount=${contents.length}`
        });
      }
      if (!Array.isArray(item.embedding)) {
        throw new EngineError("Qwen3 VL embedding response included an invalid embedding", {
          code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_INVALID_VECTOR",
          context: `model=${this.info.reference} index=${index}`
        });
      }
      vectors[index] = item.embedding;
    }
    return { vectors, truncated: [] };
  }
};
var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function providerErrorContext(model, response, error) {
  const retryAfter = retryAfterHeaderMs(response.headers.get("retry-after"));
  const retryAfterDetail = typeof retryAfter === "number" ? ` retryAfterMs=${retryAfter}` : "";
  return `model=${model} status=${response.status}${retryAfterDetail} providerCode=${error.code} providerType=${error.type} providerMessage=${error.message}`;
}
function retryAfterHeaderMs(value) {
  if (!value) {
    return void 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1e3);
  }
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return void 0;
}
function readProviderError(body) {
  if (!isRecord2(body) || !isRecord2(body.error)) {
    if (isRecord2(body)) {
      return {
        code: typeof body.code === "string" ? body.code : "unknown",
        type: "unknown",
        message: typeof body.message === "string" ? body.message : "unknown"
      };
    }
    return {
      code: "unknown",
      type: "unknown",
      message: "unknown"
    };
  }
  return {
    code: typeof body.error.code === "string" ? body.error.code : "unknown",
    type: typeof body.error.type === "string" ? body.error.type : "unknown",
    message: typeof body.error.message === "string" ? body.error.message : "unknown"
  };
}
function readEmbeddingIndex(item, fallbackIndex) {
  if (typeof item.index === "number" && Number.isInteger(item.index)) {
    return item.index;
  }
  if (typeof item.text_index === "number" && Number.isInteger(item.text_index)) {
    return item.text_index;
  }
  return fallbackIndex;
}
function validateQwen3VlContents(model, contents) {
  let imageCount = 0;
  for (const [index, content] of contents.entries()) {
    if (content.kind !== "image") {
      continue;
    }
    imageCount += 1;
    if (!QWEN3_VL_EMBEDDING_SUPPORTED_IMAGE_FORMATS.includes(content.format)) {
      throw new EngineError("Qwen3 VL embedding model does not support image format", {
        code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_UNSUPPORTED_IMAGE_FORMAT",
        context: `model=${model} index=${index} format=${content.format}`
      });
    }
  }
  if (imageCount > QWEN3_VL_EMBEDDING_MAX_IMAGE_COUNT) {
    throw new EngineError("Qwen3 VL embedding image count exceeds model limit", {
      code: "ZVEC_GREP.ENGINE.MODELS.QWEN3_VL_EMBEDDING_TOO_MANY_IMAGES",
      context: `model=${model} imageCount=${imageCount} maxImageCount=${QWEN3_VL_EMBEDDING_MAX_IMAGE_COUNT}`
    });
  }
}
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function bytesToBase64(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += BASE64_CHARS.charAt(first >> 2);
    output += BASE64_CHARS.charAt((first & 3) << 4 | (second ?? 0) >> 4);
    output += second === void 0 ? "=" : BASE64_CHARS.charAt((second & 15) << 2 | (third ?? 0) >> 6);
    output += third === void 0 ? "=" : BASE64_CHARS.charAt(third & 63);
  }
  return output;
}
function remoteEmbeddingSignal(signal) {
  const timeout = AbortSignal.timeout(DEFAULT_REMOTE_EMBEDDING_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
function throwIfEmbeddingCancelled(signal) {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason instanceof Error ? signal.reason : new Error("Embedding request was cancelled.");
}

// dist/engine/models/factory.js
function createEmbeddingModel(reference, options = {}) {
  const catalogEntry = getEmbeddingModelCatalogEntry(reference);
  if (!catalogEntry) {
    throw new EngineError("Embedding model is not in the zvec-grep catalog", {
      code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_CATALOG_MODEL_NOT_FOUND",
      context: `embedding=${reference}`
    });
  }
  switch (catalogEntry.backend) {
    case "llama-cpp":
      return new LlamaCppEmbeddingModel(catalogEntry, options);
    case "model2vec":
      return new Model2VecEmbeddingModel(catalogEntry, options);
    case "transformers-js":
      return new TransformersJsEmbeddingModel(catalogEntry, options);
    case "qwen":
      return createQwenEmbeddingModel(catalogEntry, options);
    default:
      return unsupportedCatalogEntry(catalogEntry);
  }
}
function createQwenEmbeddingModel(entry, options) {
  switch (entry.kind) {
    case "multimodal":
      return new Qwen3VlEmbeddingModel(entry, options);
    case "text":
      switch (entry.model) {
        case "text-embedding-v4":
          return new QwenTextEmbeddingV4Model(entry, options);
        case "qwen3.7-text-embedding":
          return new Qwen37TextEmbeddingModel(entry, options);
        default:
          return unsupportedCatalogEntry(entry);
      }
    default:
      return unsupportedCatalogEntry(entry);
  }
}
function unsupportedCatalogEntry(entry) {
  throw new EngineError("Embedding catalog entry is not implemented", {
    code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_MODEL_NOT_IMPLEMENTED",
    context: JSON.stringify(entry)
  });
}

// dist/engine/models/resolution.js
function resolveEmbeddingReference(options) {
  if (options.explicit !== void 0)
    return options.explicit;
  if (options.existing !== void 0)
    return options.existing;
  const environmentReference = nonEmptyEnvironmentValue2((options.environment ?? process.env).ZVEC_GREP_EMBEDDING);
  if (environmentReference !== void 0 && !getEmbeddingModelCatalogEntry(environmentReference)) {
    throw new EngineError(`Invalid ZVEC_GREP_EMBEDDING: unsupported model ${environmentReference}. Run \`zg help models\` to list supported models.`, {
      code: "ZVEC_GREP.ENGINE.CONFIG.EMBEDDING_ENVIRONMENT_INVALID",
      context: "source=ZVEC_GREP_EMBEDDING"
    });
  }
  return environmentReference ?? options.globalDefault ?? options.fallback;
}
function nonEmptyEnvironmentValue2(value) {
  const normalized = value?.trim();
  return normalized ? normalized : void 0;
}

// dist/engine/index-status.js
function indexStatusNeedsRefresh(status) {
  return Boolean(status && (status.filesAdded > 0 || status.filesModified > 0 || status.filesDeleted > 0 || status.filesPending > 0 || status.filesFailed > 0));
}

// dist/engine/manifest.js
import { rmSync as rmSync3 } from "node:fs";
import { join as join9 } from "node:path";
var WORKSPACE_MANIFEST_FILE = "manifest.json";
var CURRENT_MANIFEST_VERSION = 1;
var WORKSPACE_DIRECTORY_MODE = 448;
var WORKSPACE_MANIFEST_MODE = 384;
function workspaceManifestPath(home) {
  return join9(home, WORKSPACE_MANIFEST_FILE);
}
function readWorkspaceManifest(home) {
  const path = workspaceManifestPath(home);
  const value = readJsonFileSync(path, null);
  if (value === null) {
    return null;
  }
  if (!isWorkspaceManifest(value)) {
    throw new EngineError("Workspace index manifest is invalid", {
      code: "ZVEC_GREP.ENGINE.MANIFEST.INVALID",
      context: `path=${path}`
    });
  }
  return value;
}
function writeWorkspaceManifest(home, manifest) {
  writeJsonFileSync(workspaceManifestPath(home), manifest, {
    directoryMode: WORKSPACE_DIRECTORY_MODE,
    fileMode: WORKSPACE_MANIFEST_MODE
  });
}
function deleteWorkspaceManifest(home) {
  rmSync3(workspaceManifestPath(home), { force: true });
}
function workspaceIndexInfoFromManifest(manifest) {
  return {
    id: manifest.id,
    name: manifest.name,
    path: manifest.path,
    rootPaths: manifest.rootPaths,
    indexPolicy: manifest.indexPolicy,
    embedding: manifest.embedding,
    indexVersion: manifest.indexVersion,
    createdTime: manifest.createdTime,
    updatedTime: manifest.updatedTime
  };
}
function isWorkspaceManifest(value) {
  if (!isRecord3(value) || value.manifestVersion !== CURRENT_MANIFEST_VERSION) {
    return false;
  }
  return isNonEmptyString(value.id) && isNonEmptyString(value.name) && isNonEmptyString(value.path) && Array.isArray(value.rootPaths) && value.rootPaths.length > 0 && value.rootPaths.every(isRootPath) && (value.indexPolicy === "enabled" || value.indexPolicy === "disabled") && (value.embedding === null || isEmbeddingSchema(value.embedding)) && (value.indexVersion === null || Number.isInteger(value.indexVersion)) && typeof value.createdTime === "number" && Number.isFinite(value.createdTime) && typeof value.updatedTime === "number" && Number.isFinite(value.updatedTime) && isEmbeddingRuntime(value.embeddingRuntime);
}
function isRootPath(value) {
  return isRecord3(value) && isNonEmptyString(value.absolutePath) && typeof value.recursive === "boolean" && isOptionalStringArray(value.include) && isOptionalStringArray(value.exclude) && isOptionalStringArray(value.globs) && isOptionalStringArray(value.insensitiveGlobs) && isOptionalStringArray(value.fileTypes) && isOptionalStringArray(value.excludedFileTypes) && isOptionalBoolean(value.hidden) && isOptionalBoolean(value.noIgnore) && isOptionalStringArray(value.ignoreFiles) && isOptionalNonNegativeInteger(value.maxDepth) && isOptionalNonNegativeInteger(value.maxFileSizeBytes) && isOptionalBoolean(value.follow);
}
function isEmbeddingSchema(value) {
  return isRecord3(value) && isNonEmptyString(value.provider) && isNonEmptyString(value.model) && Number.isInteger(value.dimension) && typeof value.dimension === "number" && value.dimension > 0 && (value.metric === "cosine" || value.metric === "dot" || value.metric === "euclidean");
}
function isEmbeddingRuntime(value) {
  if (!isRecord3(value)) {
    return false;
  }
  return (value.apiKey === void 0 || typeof value.apiKey === "string") && (value.endpoint === void 0 || typeof value.endpoint === "string") && (value.device === void 0 || value.device === "auto" || value.device === "cpu" || value.device === "metal" || value.device === "vulkan" || value.device === "cuda");
}
function isOptionalStringArray(value) {
  return value === void 0 || Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isOptionalBoolean(value) {
  return value === void 0 || typeof value === "boolean";
}
function isOptionalNonNegativeInteger(value) {
  return value === void 0 || Number.isInteger(value) && Number(value) >= 0;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

// dist/engine/service/root.js
import { existsSync as existsSync5, realpathSync as realpathSync2 } from "node:fs";
import { dirname as dirname9, join as join10, resolve as resolve5 } from "node:path";
var ZVEC_GREP_DIR = ".zvec-grep";
function resolveZvecGrepRoot(root) {
  return resolve5(root ?? process.cwd());
}
function workspaceHome(root) {
  return join10(resolve5(root), ZVEC_GREP_DIR);
}
function workspaceIndexLocation(root) {
  const resolvedRoot = resolve5(root);
  const requestedHome = workspaceHome(resolvedRoot);
  const home = existsSync5(requestedHome) ? realpathSync2(requestedHome) : requestedHome;
  const canonicalRoot = dirname9(home);
  return {
    root: canonicalRoot,
    home,
    manifestPath: workspaceManifestPath(home),
    indexPath: workspaceIndexPath(home)
  };
}
function resetWorkspaceIndex(location) {
  deleteWorkspaceManifest(location.home);
  deleteWorkspaceIndexStorage(location.home);
}
function findNearestWorkspace(start) {
  return findNearestWorkspaceLocation(start, hasWorkspaceManifest);
}
function findNearestWorkspaceLocation(start, predicate) {
  let current = resolve5(start);
  while (true) {
    const location = workspaceIndexLocation(current);
    if (predicate(location)) {
      return location;
    }
    const parent = dirname9(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
function hasWorkspaceManifest(location) {
  return existsSync5(location.manifestPath);
}
function hasWorkspaceIndex(location) {
  return hasWorkspaceManifest(location) && hasWorkspaceIndexStorage(location.home);
}

// dist/engine/service/lexical.js
import { existsSync as existsSync6, readFileSync as readFileSync3, statSync as statSync4 } from "node:fs";
import { spawn } from "node:child_process";
import { isAbsolute as isAbsolute2, relative as relative3, resolve as resolve6 } from "node:path";
var HARD_IGNORED_HIDDEN_DIRECTORIES = [".git", ".zvec-grep"];
var bundledRipgrepPath;
async function runRgSearch(options) {
  const backends = await ripgrepBackends();
  const paths = checkSearchPaths(options.root, options.paths);
  if (options.paths && options.paths.length > 0 && !paths.paths?.length) {
    const backend = backends[0];
    const args = buildRipgrepArgs({
      ...options
    });
    return {
      items: [],
      diagnostics: {
        backend: backend.backend,
        command: backend.command,
        args,
        ignoredDirectories: HARD_IGNORED_HIDDEN_DIRECTORIES,
        missingPaths: paths.missingPaths,
        searchedPaths: [],
        limit: options.limit,
        truncated: false
      }
    };
  }
  let commandMissing;
  for (const backend of backends) {
    try {
      const result = await runRipgrep({
        ...options,
        paths: paths.paths
      }, backend.command);
      return {
        items: result.items,
        diagnostics: {
          backend: backend.backend,
          command: backend.command,
          args: result.args,
          ignoredDirectories: HARD_IGNORED_HIDDEN_DIRECTORIES,
          missingPaths: paths.missingPaths.length > 0 ? paths.missingPaths : void 0,
          searchedPaths: paths.paths,
          limit: options.limit,
          truncated: result.truncated
        }
      };
    } catch (error) {
      if (!isCommandMissing(error)) {
        throw error;
      }
      commandMissing = error;
    }
  }
  throw commandMissing instanceof Error ? commandMissing : new Error("ripgrep command not found");
}
async function ripgrepBackends() {
  const bundled = await resolveBundledRipgrepPath();
  const backends = [];
  if (bundled) {
    backends.push({
      backend: "bundled-rg",
      command: bundled
    });
  }
  backends.push({
    backend: "rg",
    command: "rg"
  });
  return backends;
}
async function resolveBundledRipgrepPath() {
  if (bundledRipgrepPath !== void 0) {
    return bundledRipgrepPath ?? void 0;
  }
  try {
    const { rgPath } = await import("@vscode/ripgrep");
    bundledRipgrepPath = rgPath;
  } catch {
    bundledRipgrepPath = null;
  }
  return bundledRipgrepPath ?? void 0;
}
function runRipgrep(options, command) {
  const args = buildRipgrepArgs(options);
  return runCommand({
    command,
    args,
    root: options.root,
    limit: options.limit,
    modifiedAfter: options.modifiedAfter,
    modifiedBefore: options.modifiedBefore,
    rgOptions: options.rgOptions,
    parseLine: (line, rank) => parseRipgrepJsonLine(line, options.root, rank)
  });
}
function buildRipgrepArgs(options) {
  return [
    "--json",
    "--line-number",
    "--column",
    "--with-filename",
    "--color",
    "never",
    ...ripgrepSearchArgs(options.rgOptions),
    ...hiddenSearchArgs(options.includePaths, options.hidden, options.rgOptions),
    ...ripgrepDiscoveryArgs(options),
    ...pathFilterArgs(options.includePaths, false),
    ...pathFilterArgs(options.excludePaths, true),
    ...globFilterArgs(options.globs, "--glob"),
    ...globFilterArgs(options.insensitiveGlobs, "--iglob"),
    ...(options.fileTypes ?? []).flatMap((type) => ["--type", type]),
    ...(options.excludedFileTypes ?? []).flatMap((type) => [
      "--type-not",
      type
    ]),
    ...hardIgnoredHiddenDirectoryArgs(),
    ...options.rgOptions?.extraArgs ?? [],
    ...patternArgs(options.patterns, options.rgOptions?.patternFiles),
    "--",
    ...options.paths && options.paths.length > 0 ? options.paths : [options.root]
  ];
}
function ripgrepSearchArgs(options) {
  const args = [];
  if (options?.fixedStrings) {
    args.push("--fixed-strings");
  }
  if (options?.ignoreCase) {
    args.push("--ignore-case");
  }
  if (options?.wordRegexp) {
    args.push("--word-regexp");
  }
  return args;
}
function hiddenSearchArgs(includePaths, hidden, options) {
  return hidden || options?.hidden || includesHiddenPath(includePaths) ? ["--hidden"] : [];
}
function ripgrepDiscoveryArgs(options) {
  return [
    ...options.noIgnore ? ["--no-ignore"] : [],
    ...(options.ignoreFiles ?? []).flatMap((path) => ["--ignore-file", path]),
    ...options.maxDepth !== void 0 ? ["--max-depth", String(options.maxDepth)] : [],
    ...options.maxFileSizeBytes !== void 0 ? ["--max-filesize", String(options.maxFileSizeBytes)] : [],
    ...options.follow ? ["--follow"] : []
  ];
}
function globFilterArgs(patterns, option) {
  return (patterns ?? []).flatMap((pattern) => [option, pattern]);
}
function hardIgnoredHiddenDirectoryArgs() {
  return HARD_IGNORED_HIDDEN_DIRECTORIES.flatMap((directory) => [
    "--glob",
    `!**/${directory}/**`
  ]);
}
function pathFilterArgs(patterns, negated) {
  if (!patterns || patterns.length === 0) {
    return [];
  }
  return patterns.flatMap((pattern) => expandRipgrepPathGlob(pattern).flatMap((expandedPattern) => [
    "--glob",
    negated ? `!${expandedPattern}` : expandedPattern
  ]));
}
function expandRipgrepPathGlob(pattern) {
  const normalized = pattern.startsWith("./") ? pattern.slice(2) : pattern;
  if (normalized.startsWith("**/") || isAbsolute2(normalized)) {
    return [normalized];
  }
  return [normalized, `**/${normalized}`];
}
function patternArgs(patterns, patternFiles) {
  return [
    ...patterns.flatMap((pattern) => ["--regexp", pattern]),
    ...(patternFiles ?? []).flatMap((path) => ["--file", path])
  ];
}
function includesHiddenPath(patterns) {
  if (!patterns || patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => pattern.split(/[\\/]+/).some((segment) => isHiddenPatternSegment(segment)));
}
function isHiddenPatternSegment(segment) {
  return segment.startsWith(".") && segment !== "." && segment !== "..";
}
function checkSearchPaths(root, paths) {
  if (!paths || paths.length === 0) {
    return {
      paths,
      missingPaths: []
    };
  }
  const existing = [];
  const missing = [];
  for (const path of paths) {
    if (existsSync6(resolveSearchPath(root, path))) {
      existing.push(path);
    } else {
      missing.push(path);
    }
  }
  return {
    paths: existing,
    missingPaths: missing
  };
}
function resolveSearchPath(root, path) {
  return isAbsolute2(path) ? path : resolve6(root, path);
}
function runCommand(options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(options.command, options.args, {
      cwd: options.root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const items = [];
    let stdoutBuffer = "";
    let stderr = "";
    let truncated = false;
    let killedAfterLimit = false;
    const hasLimit = options.limit !== void 0;
    const mtimeCache = /* @__PURE__ */ new Map();
    const contextCache = /* @__PURE__ */ new Map();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newlineIndex = stdoutBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        newlineIndex = stdoutBuffer.indexOf("\n");
        const parsedItem = options.parseLine(line, items.length + 1);
        const item = parsedItem ? expandContextItem(parsedItem, options.rgOptions, contextCache) : null;
        if (item && matchesModifiedTime(item.file.absolutePath, options, mtimeCache)) {
          items.push(item);
        }
        if (hasLimit && items.length > options.limit) {
          truncated = true;
          killedAfterLimit = true;
          child.kill();
          break;
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (!killedAfterLimit && stdoutBuffer.length > 0 && (!hasLimit || items.length < options.limit)) {
        const parsedItem = options.parseLine(stdoutBuffer, items.length + 1);
        const item = parsedItem ? expandContextItem(parsedItem, options.rgOptions, contextCache) : null;
        if (item && matchesModifiedTime(item.file.absolutePath, options, mtimeCache)) {
          items.push(item);
        }
      }
      if (code === 0 || code === 1 || killedAfterLimit) {
        resolvePromise({
          items: hasLimit ? items.slice(0, options.limit) : items,
          truncated,
          args: options.args
        });
        return;
      }
      reject(new Error(`${options.command} failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
}
function expandContextItem(item, options, cache) {
  if (item.range.kind !== "text") {
    return item;
  }
  const before = options?.beforeContext ?? 0;
  const after = options?.afterContext ?? 0;
  if (before === 0 && after === 0) {
    return item;
  }
  const lines = readTextLines(item.file.absolutePath, cache);
  if (!lines || lines.length === 0) {
    return item;
  }
  const startLine = Math.max(1, item.range.startLine - before);
  const endLine = Math.min(lines.length, item.range.endLine + after);
  const content = lines.slice(startLine - 1, endLine).join("\n");
  return {
    ...item,
    range: {
      kind: "text",
      startLine,
      endLine,
      startOffset: 0,
      endOffset: lines[endLine - 1]?.length ?? 0
    },
    excerptRange: item.range,
    content
  };
}
function readTextLines(path, cache) {
  if (cache.has(path)) {
    return cache.get(path) ?? null;
  }
  let lines = null;
  try {
    lines = readFileSync3(path, "utf8").split(/\r?\n/);
    if (lines.at(-1) === "") {
      lines = lines.slice(0, -1);
    }
  } catch {
    lines = null;
  }
  cache.set(path, lines);
  return lines;
}
function matchesModifiedTime(path, options, cache) {
  if (options.modifiedAfter === void 0 && options.modifiedBefore === void 0) {
    return true;
  }
  const cached = cache.get(path);
  if (cached !== void 0) {
    return cached;
  }
  let matched = false;
  try {
    const info = statSync4(path, { throwIfNoEntry: false });
    if (info?.isFile()) {
      const modifiedTime = info.mtimeMs;
      matched = (options.modifiedAfter === void 0 || modifiedTime >= options.modifiedAfter) && (options.modifiedBefore === void 0 || modifiedTime <= options.modifiedBefore);
    }
  } catch {
    matched = false;
  }
  cache.set(path, matched);
  return matched;
}
function parseRipgrepJsonLine(line, root, rank) {
  if (line.trim().length === 0) {
    return null;
  }
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord4(event) || event.type !== "match" || !isRecord4(event.data)) {
    return null;
  }
  const data = event.data;
  if (!isRecord4(data.path) || typeof data.path.text !== "string") {
    return null;
  }
  if (!isRecord4(data.lines) || typeof data.lines.text !== "string") {
    return null;
  }
  if (typeof data.line_number !== "number") {
    return null;
  }
  const path = normalizeResultPath(root, data.path.text);
  const lineText = trimTrailingNewline(data.lines.text);
  const firstSubmatch = Array.isArray(data.submatches) && isRecord4(data.submatches[0]) ? data.submatches[0] : void 0;
  const start = textPositionAtByteOffset(lineText, typeof firstSubmatch?.start === "number" ? firstSubmatch.start : 0);
  const end = textPositionAtByteOffset(lineText, typeof firstSubmatch?.end === "number" ? firstSubmatch.end : Buffer.byteLength(lineText, "utf8"));
  return {
    kind: "lexical_match",
    rank,
    file: path,
    range: {
      kind: "text",
      startLine: data.line_number + start.lineOffset,
      endLine: data.line_number + end.lineOffset,
      startOffset: start.column,
      endOffset: end.column
    },
    content: lineText,
    status: "fresh",
    matchedBy: "lexical"
  };
}
function normalizeResultPath(root, path) {
  const absolutePath = isAbsolute2(path) ? resolve6(path) : resolve6(root, path);
  return {
    absolutePath,
    relativePath: toDisplayPath(relative3(root, absolutePath) || "."),
    rootPath: root
  };
}
function trimTrailingNewline(value) {
  return value.replace(/\r?\n$/, "");
}
function textPositionAtByteOffset(value, byteOffset) {
  const prefix = Buffer.from(value, "utf8").subarray(0, Math.max(0, byteOffset)).toString("utf8");
  const lines = prefix.split("\n");
  return {
    lineOffset: lines.length - 1,
    column: lines.at(-1)?.replace(/\r$/, "").length ?? 0
  };
}
function isCommandMissing(error) {
  return isRecord4(error) && error.code === "ENOENT";
}
function isRecord4(value) {
  return typeof value === "object" && value !== null;
}

// dist/engine/utils/daemon-lease.js
import { hostname as hostname2 } from "node:os";
import { existsSync as existsSync7, mkdirSync as mkdirSync4, readFileSync as readFileSync4, renameSync as renameSync2, rmSync as rmSync4, statSync as statSync5, unlinkSync as unlinkSync2, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname10, join as join11 } from "node:path";
function daemonLeasePath(root) {
  return join11(workspaceHome(root), "locks", "daemon.json");
}
function daemonLeaseGuardPath(root) {
  return join11(workspaceHome(root), "locks", "daemon.guard");
}
function acquireDaemonLeaseGuard(root, instanceToken) {
  const path = daemonLeaseGuardPath(root);
  mkdirSync4(dirname10(path), { recursive: true, mode: 448 });
  const record = {
    pid: process.pid,
    hostname: hostname2(),
    instanceToken,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      mkdirSync4(path, { recursive: false, mode: 448 });
      writeFileSync3(join11(path, "owner.json"), `${JSON.stringify(record)}
`, {
        mode: 384
      });
      let released = false;
      return {
        release() {
          if (!released) {
            released = true;
            rmSync4(path, { recursive: true, force: true });
          }
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (!guardIsStale(path)) {
        return void 0;
      }
      const quarantine = `${path}.stale-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      try {
        renameSync2(path, quarantine);
      } catch (renameError) {
        if (renameError.code === "ENOENT") {
          continue;
        }
        return void 0;
      }
      rmSync4(quarantine, { recursive: true, force: true });
    }
  }
  return void 0;
}
function readDaemonLease(root) {
  const path = daemonLeasePath(root);
  if (!existsSync7(path)) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(readFileSync4(path, "utf8"));
    if (typeof parsed.pid !== "number" || typeof parsed.hostname !== "string" || typeof parsed.instanceToken !== "string" || typeof parsed.createdAt !== "number" || typeof parsed.updatedAt !== "number") {
      return void 0;
    }
    return parsed;
  } catch {
    return void 0;
  }
}
function daemonLeaseFileIsAbandoned(root) {
  try {
    return Date.now() - statSync5(daemonLeasePath(root)).mtimeMs > 3e4;
  } catch {
    return true;
  }
}
function assertDaemonWriteAllowed(root, instanceToken) {
  const path = daemonLeasePath(root);
  const initial = readDaemonLease(root);
  if (initial?.pid === process.pid && initial.instanceToken === instanceToken) {
    return void 0;
  }
  const guard = acquireDaemonLeaseGuard(root, instanceToken ?? `direct-${process.pid}`);
  if (!guard) {
    throw daemonLeaseActiveError(root, initial?.pid ?? 0);
  }
  const record = readDaemonLease(root);
  if (!existsSync7(path)) {
    return guard;
  }
  if (!record) {
    if (daemonLeaseFileIsAbandoned(root)) {
      unlinkSync2(path);
      return guard;
    }
    guard.release();
    throw new EngineError("A zvec-grep daemon lease exists for this root", {
      code: "ZVEC_GREP.ENGINE.DAEMON_LEASE_ACTIVE",
      context: `root=${root}`
    });
  }
  if (record.pid === process.pid && record.instanceToken === instanceToken) {
    guard.release();
    return void 0;
  }
  if (record.hostname === hostname2() && !processIsAlive2(record.pid)) {
    unlinkSync2(path);
    return guard;
  }
  guard.release();
  throw daemonLeaseActiveError(root, record.pid);
}
function daemonLeaseActiveError(root, pid) {
  return new EngineError("A zvec-grep daemon owns index writes for this root", {
    code: "ZVEC_GREP.ENGINE.DAEMON_LEASE_ACTIVE",
    context: [
      `root=${root}`,
      `pid=${pid}`,
      "hint=Run with --mode auto so a ready daemon handles indexed operations. If auto is already active, check zg server status and restore or stop the daemon before retrying.",
      'config=Edit ~/.zvec-grep/config.json and set client.mode to "auto" to persist this behavior.'
    ].join("\n")
  });
}
function guardIsStale(path) {
  try {
    const record = JSON.parse(readFileSync4(join11(path, "owner.json"), "utf8"));
    if (record.hostname === hostname2() && typeof record.pid === "number" && typeof record.instanceToken === "string" && typeof record.createdAt === "number" && typeof record.updatedAt === "number") {
      return !processIsAlive2(record.pid);
    }
    if (typeof record.hostname === "string" && typeof record.pid === "number" && typeof record.instanceToken === "string" && typeof record.createdAt === "number" && typeof record.updatedAt === "number") {
      return Date.now() - record.updatedAt > 3e4;
    }
    return Date.now() - statSync5(path).mtimeMs > 3e4;
  } catch {
    try {
      return Date.now() - statSync5(path).mtimeMs > 3e4;
    } catch {
      return true;
    }
  }
}
function processIsAlive2(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

// dist/engine/service/structure-enrichment.js
import { readFile as readFile5, stat as stat2 } from "node:fs/promises";
import { relative as relative4 } from "node:path";
var RG_STRUCTURE_ENRICH_FILE_LIMIT = 100;
var STRUCTURE_ENRICH_FILE_ID_NAMESPACE = "__rg_structure__";
async function enrichLexicalItemsWithStructure(root, items, fileLimit = RG_STRUCTURE_ENRICH_FILE_LIMIT, maxFileSizeBytes) {
  const matchedFiles = uniqueLexicalFilePaths(items);
  const selectedFiles = new Set(matchedFiles.slice(0, fileLimit));
  const fragmentsByFile = /* @__PURE__ */ new Map();
  let parsedFiles = 0;
  for (const absolutePath of selectedFiles) {
    const fragments = await parseStructuralFragments(root, absolutePath, maxFileSizeBytes);
    fragmentsByFile.set(absolutePath, fragments);
    if (fragments !== null) {
      parsedFiles++;
    }
  }
  let enrichedItems = 0;
  const enrichedFiles = /* @__PURE__ */ new Set();
  const enriched = items.map((item) => {
    if (item.kind !== "lexical_match") {
      return item;
    }
    const fragments = fragmentsByFile.get(normalizePath(item.file.absolutePath));
    if (!fragments || fragments.length === 0) {
      return item;
    }
    const matchRange = lexicalMatchRange(item);
    if (!matchRange) {
      return item;
    }
    const container = smallestContainingFragment(fragments, matchRange);
    if (!container) {
      return item;
    }
    enrichedItems++;
    enrichedFiles.add(item.file.absolutePath);
    const contextContainer = {
      entityId: container.group ?? container.id,
      range: container.range,
      metadata: container.metadata
    };
    return {
      ...item,
      metadata: container.metadata ?? item.metadata,
      container: contextContainer
    };
  });
  return {
    items: enriched,
    diagnostics: {
      source: "structural_extraction",
      fileLimit,
      matchedFiles: matchedFiles.length,
      parsedFiles,
      enrichedFiles: enrichedFiles.size,
      enrichedItems,
      skippedFiles: Math.max(0, matchedFiles.length - parsedFiles),
      truncated: matchedFiles.length > fileLimit
    }
  };
}
function uniqueLexicalFilePaths(items) {
  const seen = /* @__PURE__ */ new Set();
  const paths = [];
  for (const item of items) {
    if (item.kind !== "lexical_match") {
      continue;
    }
    const absolutePath = normalizePath(item.file.absolutePath);
    if (!seen.has(absolutePath)) {
      seen.add(absolutePath);
      paths.push(absolutePath);
    }
  }
  return paths;
}
async function parseStructuralFragments(root, absolutePath, maxFileSizeBytes) {
  try {
    const file = await fileInfoForStructure(root, absolutePath, maxFileSizeBytes);
    if (!file) {
      return null;
    }
    const text = await readFile5(absolutePath, "utf8");
    const source = {
      kind: "text",
      file,
      text
    };
    const fragments = await extract(source);
    const structuralFragments = fragments.filter(isStructuralFragment);
    return structuralFragments.length > 0 ? structuralFragments : null;
  } catch {
    return null;
  }
}
function isStructuralFragment(fragment) {
  return fragment.metadata?.kind === "code" || fragment.metadata?.kind === "markdown";
}
async function fileInfoForStructure(root, absolutePath, maxFileSizeBytes) {
  const info = await stat2(absolutePath).catch(() => null);
  if (!info || !info.isFile() || info.size <= 0) {
    return null;
  }
  const detected = detectFileType(absolutePath);
  if (!detected || !isStructurallyEnrichableFile(detected)) {
    return null;
  }
  if (info.size > resolveMaxFileSizeBytes(detected.kind, maxFileSizeBytes)) {
    return null;
  }
  return {
    id: makeStructureFileId(absolutePath),
    absolutePath: normalizePath(absolutePath),
    relativePath: toDisplayPath(relative4(root, absolutePath) || "."),
    rootPath: root,
    sizeBytes: info.size,
    lastModifiedTime: info.mtimeMs,
    kind: detected.kind,
    format: detected.format
  };
}
function isStructurallyEnrichableFile(file) {
  return file.kind === "code" || file.kind === "text" && file.format === "markdown";
}
function lexicalMatchRange(item) {
  const range = item.excerptRange ?? item.range;
  return range.kind === "text" ? range : null;
}
function smallestContainingFragment(fragments, matchRange) {
  let best = null;
  for (const fragment of fragments) {
    if (!textRangeContains(fragment.range, matchRange)) {
      continue;
    }
    if (!best || compareFragmentContainer(fragment, best) < 0) {
      best = fragment;
    }
  }
  return best;
}
function textRangeContains(outer, inner) {
  return outer.kind === "text" && outer.startLine <= inner.startLine && outer.endLine >= inner.endLine;
}
function compareFragmentContainer(left, right) {
  const leftRange = left.range;
  const rightRange = right.range;
  const leftLines = leftRange.kind === "text" ? leftRange.endLine - leftRange.startLine : Number.MAX_SAFE_INTEGER;
  const rightLines = rightRange.kind === "text" ? rightRange.endLine - rightRange.startLine : Number.MAX_SAFE_INTEGER;
  return leftLines - rightLines || fragmentSpecificityScore(right) - fragmentSpecificityScore(left) || left.id.localeCompare(right.id);
}
function fragmentSpecificityScore(fragment) {
  const metadata = fragment.metadata;
  if (!metadata) {
    return 0;
  }
  if (metadata.kind === "code") {
    return metadata.symbolName ? 2 : 1;
  }
  return metadata.heading ? 1 : 0;
}
function makeStructureFileId(absolutePath) {
  return sha256Text(`${STRUCTURE_ENRICH_FILE_ID_NAMESPACE}\0${normalizePath(absolutePath)}`);
}

// dist/authorization/operation.js
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { randomUUID as randomUUID4 } from "node:crypto";

// dist/authorization/store.js
import { createHmac, randomBytes, randomUUID as randomUUID3, timingSafeEqual } from "node:crypto";
import { chmod as chmod2, mkdir as mkdir3, readFile as readFile6, writeFile as writeFile3 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { dirname as dirname11, join as join12, resolve as resolve7 } from "node:path";

// dist/authorization/types.js
var REMOTE_EMBEDDING_CAPABILITY = "remote_embedding";

// dist/authorization/store.js
var DOCUMENT_VERSION = 1;
var GRANT_FILE = "authorization.json";
var RemoteEmbeddingAuthorizationStore = class {
  signingKeyPath;
  constructor(options = {}) {
    this.signingKeyPath = resolve7(options.signingKeyPath ?? process.env.ZVEC_GREP_AUTHORIZATION_KEY_FILE ?? join12(homedir3(), ".zvec-grep", "authorization-signing.key"));
  }
  grantPath(target) {
    const root = target.workspaceRoots[0];
    if (!root) {
      throw new Error("Remote Embedding target has no workspace roots.");
    }
    return join12(root, ".zvec-grep", GRANT_FILE);
  }
  async hasGrant(target) {
    const key = await this.readSigningKey();
    if (!key)
      return false;
    const document = await this.readDocument(this.grantPath(target));
    return document.grants.some((grant) => grant.targetFingerprint === target.targetFingerprint && this.verifyGrant(grant, key));
  }
  async grant(target) {
    const key = await this.getOrCreateSigningKey();
    const unsigned = {
      version: DOCUMENT_VERSION,
      id: randomUUID3(),
      capability: REMOTE_EMBEDDING_CAPABILITY,
      scope: "workspace",
      workspaceRoots: [...target.workspaceRoots],
      workspaceFingerprint: target.workspaceFingerprint,
      provider: target.provider,
      model: target.model,
      endpoint: target.endpoint,
      targetFingerprint: target.targetFingerprint,
      grantedAt: Date.now()
    };
    const grant = {
      ...unsigned,
      signature: sign(unsigned, key)
    };
    for (const root of target.workspaceRoots) {
      const path = join12(root, ".zvec-grep", GRANT_FILE);
      await this.withDocumentWrite(path, async (document) => {
        const next = {
          version: DOCUMENT_VERSION,
          grants: [
            ...document.grants.filter((candidate) => candidate.targetFingerprint !== target.targetFingerprint),
            grant
          ]
        };
        await this.writeDocument(path, next);
      });
    }
    return grant;
  }
  async revoke(target) {
    let revoked = false;
    for (const root of target.workspaceRoots) {
      const path = join12(root, ".zvec-grep", GRANT_FILE);
      await this.withDocumentWrite(path, async (document) => {
        const grants = document.grants.filter((grant) => grant.targetFingerprint !== target.targetFingerprint);
        if (grants.length === document.grants.length)
          return;
        revoked = true;
        await this.writeDocument(path, {
          version: DOCUMENT_VERSION,
          grants
        });
      });
    }
    return revoked;
  }
  async revokeAll(root) {
    const path = join12(resolve7(root), ".zvec-grep", GRANT_FILE);
    let revoked = 0;
    let validGrants = [];
    const key = await this.readSigningKey();
    await this.withDocumentWrite(path, async (document) => {
      revoked = document.grants.length;
      if (revoked === 0)
        return;
      validGrants = key ? document.grants.filter((grant) => this.verifyGrant(grant, key)) : [];
      await this.writeDocument(path, {
        version: DOCUMENT_VERSION,
        grants: []
      });
    });
    const fingerprintsByPath = /* @__PURE__ */ new Map();
    for (const grant of validGrants) {
      for (const workspaceRoot of grant.workspaceRoots) {
        const grantPath = join12(workspaceRoot, ".zvec-grep", GRANT_FILE);
        if (resolve7(grantPath) === resolve7(path))
          continue;
        const fingerprints = fingerprintsByPath.get(grantPath) ?? /* @__PURE__ */ new Set();
        fingerprints.add(grant.targetFingerprint);
        fingerprintsByPath.set(grantPath, fingerprints);
      }
    }
    for (const [grantPath, fingerprints] of fingerprintsByPath) {
      await this.withDocumentWrite(grantPath, async (document) => {
        const grants = document.grants.filter((grant) => !fingerprints.has(grant.targetFingerprint));
        if (grants.length === document.grants.length)
          return;
        await this.writeDocument(grantPath, {
          version: DOCUMENT_VERSION,
          grants
        });
      });
    }
    return revoked;
  }
  async status(root) {
    const path = join12(resolve7(root), ".zvec-grep", GRANT_FILE);
    const document = await this.readDocument(path);
    const key = await this.readSigningKey();
    return {
      path,
      grants: document.grants.map(({ signature, ...grant }) => ({
        ...grant,
        valid: key ? this.verifyGrant({ ...grant, signature }, key) : false
      }))
    };
  }
  async readDocument(path) {
    const value = await readJsonFile(path, {
      version: DOCUMENT_VERSION,
      grants: []
    });
    if (!isAuthorizationDocument(value)) {
      return { version: DOCUMENT_VERSION, grants: [] };
    }
    return value;
  }
  async writeDocument(path, document) {
    await writeJsonFile(path, document, {
      directoryMode: 448,
      fileMode: 384
    });
  }
  async withDocumentWrite(path, operation) {
    const lock = acquireReadWriteLock(join12(dirname11(path), "authorization-store"), "write", { operation: "remote-embedding-authorization" });
    try {
      return await operation(await this.readDocument(path));
    } finally {
      lock.release();
    }
  }
  verifyGrant(grant, key) {
    const { signature, ...unsigned } = grant;
    const expected = sign(unsigned, key);
    const actualBytes = Buffer.from(signature, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
  }
  async readSigningKey() {
    try {
      const value = (await readFile6(this.signingKeyPath, "utf8")).trim();
      return value ? Buffer.from(value, "hex") : void 0;
    } catch (error) {
      if (error.code === "ENOENT")
        return void 0;
      throw error;
    }
  }
  async getOrCreateSigningKey() {
    const existing = await this.readSigningKey();
    if (existing)
      return existing;
    await mkdir3(dirname11(this.signingKeyPath), { recursive: true, mode: 448 });
    await chmod2(dirname11(this.signingKeyPath), 448);
    const key = randomBytes(32);
    try {
      await writeFile3(this.signingKeyPath, key.toString("hex"), {
        encoding: "utf8",
        mode: 384,
        flag: "wx"
      });
      return key;
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
      const concurrent = await this.readSigningKey();
      if (!concurrent)
        throw error;
      return concurrent;
    }
  }
};
function sign(value, key) {
  return createHmac("sha256", key).update(stableStringify(value)).digest("hex");
}
function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function isAuthorizationDocument(value) {
  if (!value || typeof value !== "object")
    return false;
  const document = value;
  if (document.version !== DOCUMENT_VERSION || !Array.isArray(document.grants)) {
    return false;
  }
  return document.grants.every(isWorkspaceGrant);
}
function isWorkspaceGrant(value) {
  if (!value || typeof value !== "object")
    return false;
  const grant = value;
  return grant.version === DOCUMENT_VERSION && grant.capability === REMOTE_EMBEDDING_CAPABILITY && grant.scope === "workspace" && Array.isArray(grant.workspaceRoots) && grant.workspaceRoots.every((root) => typeof root === "string") && [
    "id",
    "workspaceFingerprint",
    "provider",
    "model",
    "endpoint",
    "targetFingerprint",
    "signature"
  ].every((key) => typeof grant[key] === "string") && typeof grant.grantedAt === "number";
}

// dist/authorization/operation.js
var operationPermit = new AsyncLocalStorage2();
function remoteEmbeddingAuthorizationGuard(options = {}) {
  const store = options.store ?? new RemoteEmbeddingAuthorizationStore();
  return async (request) => {
    const permit = operationPermit.getStore();
    if (!permit || permit.capability !== REMOTE_EMBEDDING_CAPABILITY || permit.target.provider !== request.provider || permit.target.model !== request.model || permit.target.endpoint !== request.endpoint) {
      throw authorizationRequiredError(request);
    }
    if (permit.scope === "workspace" && !await store.hasGrant(permit.target)) {
      throw authorizationRequiredError(request, "Workspace grant is missing, invalid, or revoked.");
    }
  };
}
function authorizationRequiredError(request, detail2) {
  return new EngineError("Remote Embedding authorization is required", {
    code: "ZVEC_GREP.ENGINE.AUTH.REMOTE_EMBEDDING_REQUIRED",
    context: [
      `provider=${request.provider}`,
      `model=${request.model}`,
      `endpoint=${request.endpoint}`,
      `purpose=${request.purpose}`,
      ...detail2 ? [`detail=${detail2}`] : []
    ].join(" ")
  });
}

// dist/engine/service/zvec-grep.js
var DEFAULT_CONTEXT_LIMIT = 10;
var DEFAULT_CONTEXT_TOTAL_LIMIT = 30;
var DEFAULT_LOCAL_EMBEDDING = "local/potion-code-16m-v2";
var PROVIDER_API_KEY_IDENTITY_SECRET = randomBytes2(32);
var MAX_RECOVERED_EMBEDDING_MODELS = 4;
async function createZvecGrep(options = {}) {
  return new ZvecGrepService(options);
}
var ZvecGrepService = class {
  options;
  root;
  embeddingModel;
  recoveredEmbeddingModels = /* @__PURE__ */ new Map();
  retiredEmbeddingModels = /* @__PURE__ */ new Set();
  activeEmbeddingModelOperations = 0;
  closed = false;
  constructor(options) {
    this.options = options;
    this.root = resolveZvecGrepRoot(options.root);
    this.embeddingModel = options.embeddingModel;
  }
  async index(options = {}) {
    this.ensureOpen();
    const root = resolveZvecGrepRoot(options.root ?? this.root);
    const daemonWritePermit = assertDaemonWriteAllowed(root, this.options.daemonInstanceToken);
    const location = workspaceIndexLocation(root);
    try {
      return await this.withEmbeddingModelOperation(() => withHomeWriteLock(location.home, options.rebuild ? "index.rebuild" : "index", async () => {
        const existing = readWorkspaceManifest(location.home);
        const existingRuntime = existing?.embeddingRuntime ?? {};
        const embeddingModel = this.embeddingModelForIndex(existing, "index", existingRuntime);
        const effectiveRuntime = effectiveEmbeddingRuntime(this.options, embeddingModel, runtimeForModelProvider(existing, embeddingModel, existingRuntime));
        if (!options.rebuild) {
          assertWorkspaceEndpointMatchesCurrentRuntime(existing, existingRuntime, effectiveRuntime, "zg index --endpoint <url> --rebuild");
        }
        const rootPaths = resolveIndexRootPaths(existing, options.rootPaths, root, {
          resetPaths: options.resetPaths === true,
          includePaths: options.includePaths,
          excludePaths: options.excludePaths,
          globs: options.globs,
          insensitiveGlobs: options.insensitiveGlobs,
          fileTypes: options.fileTypes,
          excludedFileTypes: options.excludedFileTypes,
          hidden: options.hidden,
          noIgnore: options.noIgnore,
          ignoreFiles: options.ignoreFiles,
          maxDepth: options.maxDepth,
          maxFileSizeBytes: options.maxFileSizeBytes,
          follow: options.follow
        });
        if (options.rebuild || !isWorkspaceIndexed(existing)) {
          resetWorkspaceIndex(location);
        }
        const existingAfterRebuild = options.rebuild ? null : existing;
        if (isWorkspaceIndexed(existingAfterRebuild)) {
          assertWorkspaceEmbeddingMatchesCurrentModel(existingAfterRebuild, embeddingModel, "zg index --rebuild");
        }
        const embeddingRuntime = embeddingRuntimeAfterIndex(existing, existingRuntime, embeddingModel, effectiveRuntime, this.options);
        const manifest = prepareWorkspaceManifest(location, existingAfterRebuild, rootPaths, embeddingModel, embeddingRuntime);
        const workspaceIndex = new WorkspaceIndex(manifest, {
          mode: "write",
          embeddingModel
        });
        writeWorkspaceManifest(location.home, manifest);
        try {
          const releaseWriterContext = options.onWriterContext?.((contextOptions) => this.contextFromWriterWorkspaceIndex(root, workspaceIndex, contextOptions));
          try {
            const result = await workspaceIndex.index({
              rebuild: false,
              embeddingConcurrency: options.embeddingConcurrency,
              onProgress: options.onProgress,
              changedPaths: options.changedPaths,
              signal: options.signal
            });
            writeWorkspaceManifest(location.home, {
              ...manifest,
              embeddingRuntime,
              updatedTime: Date.now()
            });
            return result;
          } catch (error) {
            writeWorkspaceManifest(location.home, {
              ...manifest,
              embeddingRuntime,
              updatedTime: Date.now()
            });
            throw error;
          } finally {
            await releaseWriterContext?.();
          }
        } finally {
          workspaceIndex.close();
        }
      }));
    } finally {
      daemonWritePermit?.release();
    }
  }
  async dropIndex(options = {}) {
    this.ensureOpen();
    const root = resolveZvecGrepRoot(options.root ?? this.root);
    const daemonWritePermit = assertDaemonWriteAllowed(root, this.options.daemonInstanceToken);
    const location = workspaceIndexLocation(root);
    try {
      if (!readWorkspaceManifest(location.home)) {
        return false;
      }
      return await withHomeWriteLock(location.home, "index.drop", async () => {
        resetWorkspaceIndex(location);
        return true;
      });
    } finally {
      daemonWritePermit?.release();
    }
  }
  async disableIndex(options = {}) {
    this.ensureOpen();
    const root = resolveZvecGrepRoot(options.root ?? this.root);
    const daemonWritePermit = assertDaemonWriteAllowed(root, this.options.daemonInstanceToken);
    const location = workspaceIndexLocation(root);
    try {
      await withHomeWriteLock(location.home, "index.disable", async () => {
        const existing = readWorkspaceManifest(location.home);
        const now = Date.now();
        writeWorkspaceManifest(location.home, {
          manifestVersion: CURRENT_MANIFEST_VERSION,
          id: existing?.id ?? randomUUID5(),
          name: existing?.name ?? workspaceDisplayName(root),
          path: location.home,
          rootPaths: existing?.rootPaths ?? validateRootPaths([root]),
          indexPolicy: "disabled",
          embedding: null,
          indexVersion: null,
          createdTime: existing?.createdTime ?? now,
          updatedTime: now,
          embeddingRuntime: existing?.embeddingRuntime ?? {}
        });
      });
      return this.info({ root });
    } finally {
      daemonWritePermit?.release();
    }
  }
  async context(options) {
    this.ensureOpen();
    return await this.withEmbeddingModelOperation(async () => {
      const timings = new TimingCollector();
      const result = await timings.time("total", () => this.contextWithTimings(options, timings));
      return withContextTimings(result, timings);
    });
  }
  async contextWithTimings(options, timings) {
    const request = normalizeContextRequest(options);
    const startRoot = resolveZvecGrepRoot(options.root ?? this.root);
    if (options.rg) {
      return this.contextFromRg(startRoot, request, options, timings);
    }
    assertNearestWorkspaceHomeUnlocked(startRoot, "context");
    const nearest = findNearestWorkspaceIndex(startRoot);
    if (nearest) {
      const { location, info } = nearest;
      if (info.indexPolicy === "disabled") {
        throw workspaceIndexDisabledError(location.root);
      }
      if (!isWorkspaceIndexed(info) || !hasWorkspaceIndex(location)) {
        throw workspaceIndexMissingError(location.root, info.indexPolicy ?? "enabled");
      }
      if (options.autoUpdate !== false) {
        await this.refreshWorkspaceIndexForContext(location, options, timings);
      }
      return await withHomeReadLock(location.home, "context", () => this.contextFromWorkspaceIndex(location, request, options, timings));
    }
    throw workspaceIndexMissingError(startRoot, "undecided");
  }
  async info(options = {}) {
    this.ensureOpen();
    const startRoot = resolveZvecGrepRoot(options.root ?? this.root);
    assertNearestWorkspaceHomeUnlocked(startRoot, "info");
    const nearest = findNearestWorkspaceIndex(startRoot);
    if (!nearest) {
      const location = workspaceIndexLocation(startRoot);
      return {
        root: startRoot,
        indexed: false,
        indexPolicy: "undecided",
        home: location.home,
        indexPath: location.indexPath,
        source: "unindexed",
        suggestion: "zg index or zg query --rg"
      };
    }
    return await withHomeReadLock(nearest.location.home, "info", async () => {
      const workspaceIndex = readWorkspaceManifest(nearest.location.home);
      const indexed = workspaceIndex !== null && workspaceIndex.indexPolicy !== "disabled" && isWorkspaceIndexed(workspaceIndex) && hasWorkspaceIndex(nearest.location);
      return {
        root: nearest.location.root,
        indexed,
        indexPolicy: workspaceIndex?.indexPolicy ?? "undecided",
        home: nearest.location.home,
        indexPath: nearest.location.indexPath,
        source: indexed ? "index" : "unindexed",
        workspaceIndex: workspaceIndex ? workspaceIndexInfoFromManifest(workspaceIndex) : void 0,
        status: indexed && options.includeStatus !== false ? await workspaceIndexStatus(workspaceIndex, nearest.location) : null,
        suggestion: workspaceInfoSuggestion(workspaceIndex)
      };
    });
  }
  async close() {
    const models = /* @__PURE__ */ new Set([
      ...this.embeddingModel && this.options.embeddingModelOwnership !== "borrowed" ? [this.embeddingModel] : [],
      ...this.recoveredEmbeddingModels.values(),
      ...this.retiredEmbeddingModels
    ]);
    this.recoveredEmbeddingModels.clear();
    this.retiredEmbeddingModels.clear();
    for (const model of models) {
      await model.dispose();
    }
    this.closed = true;
  }
  async contextFromWorkspaceIndex(location, request, options, timings) {
    const info = readWorkspaceManifest(location.home);
    if (!info) {
      throw new EngineError("Workspace index manifest not found", {
        code: "ZVEC_GREP.ENGINE.MANIFEST.NOT_FOUND"
      });
    }
    const workspaceIndex = this.openWorkspaceIndexForSearch(info, request, info.embeddingRuntime);
    try {
      return await contextFromOpenWorkspaceIndex({
        root: location.root,
        request,
        workspaceIndex,
        options,
        timings
      });
    } finally {
      workspaceIndex.close();
    }
  }
  async refreshWorkspaceIndexForContext(location, options, timings) {
    const daemonWritePermit = assertDaemonWriteAllowed(location.root, this.options.daemonInstanceToken);
    try {
      const needsRefresh = await timings.time("status_scan", () => withHomeReadLock(location.home, "context.status", async () => {
        const manifest = readWorkspaceManifest(location.home);
        const status = manifest ? await workspaceIndexStatus(manifest, location) : null;
        return indexStatusNeedsRefresh(status);
      }));
      if (!needsRefresh) {
        return;
      }
      await timings.time("auto_update", () => withHomeWriteLock(location.home, "context.refresh", async () => {
        const existing = readWorkspaceManifest(location.home);
        if (!existing) {
          return;
        }
        const stillNeedsRefresh = await timings.time("refresh_status_scan", () => workspaceIndexNeedsRefresh(location));
        if (!stillNeedsRefresh) {
          return;
        }
        const workspaceRuntime = existing.embeddingRuntime;
        const embeddingModel = this.embeddingModelForIndex(existing, "context.refresh", workspaceRuntime);
        assertWorkspaceEndpointMatchesCurrentRuntime(existing, workspaceRuntime, effectiveEmbeddingRuntime(this.options, embeddingModel, workspaceRuntime), "zg index --endpoint <url> --rebuild");
        assertWorkspaceEmbeddingMatchesCurrentModel(existing, embeddingModel, "zg index --rebuild");
        const workspaceIndex = new WorkspaceIndex(existing, {
          mode: "write",
          embeddingModel
        });
        try {
          const result = await workspaceIndex.index({
            embeddingConcurrency: options.embeddingConcurrency,
            onProgress: options.onAutoUpdateProgress
          });
          timings.addEntries(result.timings, "auto_update_");
        } finally {
          workspaceIndex.close();
        }
      }));
    } finally {
      daemonWritePermit?.release();
    }
  }
  async contextFromWriterWorkspaceIndex(root, workspaceIndex, options) {
    return await this.withEmbeddingModelOperation(async () => {
      const timings = new TimingCollector();
      const request = normalizeContextRequest(options);
      const result = await timings.time("total", () => contextFromOpenWorkspaceIndex({
        root,
        request,
        workspaceIndex,
        options: { ...options, autoUpdate: false },
        timings
      }));
      return withContextTimings(result, timings);
    });
  }
  async contextFromRg(root, request, options, timings) {
    let rgResult;
    try {
      rgResult = await timings.time("rg_search", () => runRgSearch({
        root,
        patterns: request.rgPatterns,
        paths: options.rgPaths,
        limit: options.limit,
        includePaths: options.includePaths,
        excludePaths: options.excludePaths,
        globs: options.globs,
        insensitiveGlobs: options.insensitiveGlobs,
        fileTypes: options.fileTypes,
        excludedFileTypes: options.excludedFileTypes,
        hidden: options.hidden,
        noIgnore: options.noIgnore,
        ignoreFiles: options.ignoreFiles,
        maxDepth: options.maxDepth,
        maxFileSizeBytes: options.maxFileSizeBytes,
        follow: options.follow,
        modifiedAfter: options.modifiedAfter,
        modifiedBefore: options.modifiedBefore,
        rgOptions: options.rgOptions
      }));
    } catch (cause) {
      throw new EngineError("Search failed", {
        code: "ZVEC_GREP.ENGINE.SEARCH.FAILED",
        context: errorDetails([detail("source", "rg"), detail("root", root)]),
        cause
      });
    }
    const structuralEnrichment = await timings.time("structure_enrichment", () => enrichLexicalItemsWithStructure(root, rgResult.items, void 0, options.maxFileSizeBytes));
    const items = dedupeAndRerankContextItems(structuralEnrichment.items);
    const emptyReason = items.length === 0 ? rgEmptyReason(rgResult.diagnostics) : void 0;
    return {
      query: request.displayQuery,
      root,
      source: "rg",
      coverage: rgResult.diagnostics.truncated ? "rg_truncated" : "rg_exhaustive",
      items,
      diagnostics: {
        emptyReason,
        rg: rgResult.diagnostics,
        structure: structuralEnrichment.diagnostics
      }
    };
  }
  openWorkspaceIndexForSearch(info, request, workspaceRuntime) {
    return new WorkspaceIndex(info, {
      mode: "read",
      embeddingModel: this.embeddingModelForSearch(indexedEmbeddingSchema(info), request, workspaceRuntime, info)
    });
  }
  embeddingModelForSearch(schema, request, workspaceRuntime, info) {
    if (!request.routes.some((route) => route.mode === "vector")) {
      return void 0;
    }
    const identity = {
      provider: schema.provider,
      name: schema.model
    };
    const effectiveRuntime = resolveEmbeddingRuntimeOptions(embeddingModelReference(identity), this.options, workspaceRuntime, readGlobalConfig());
    assertSearchEndpointMatchesWorkspace(info, workspaceRuntime, effectiveRuntime);
    if (this.embeddingModel) {
      return this.embeddingModel;
    }
    return this.recoverEmbeddingModel(schema, workspaceRuntime);
  }
  embeddingModelForIndex(existing, operation, workspaceRuntime = {}) {
    if (isWorkspaceIndexed(existing) && !this.embeddingModel && !this.options.embedding) {
      return this.recoverEmbeddingModel(existing.embedding, workspaceRuntime);
    }
    const config = readGlobalConfig();
    const reference = resolveEmbeddingReference({
      explicit: this.options.embedding,
      globalDefault: config.defaults?.embedding,
      fallback: DEFAULT_LOCAL_EMBEDDING
    });
    const referenceIdentity = reference ? parseEmbeddingModelReference(reference) : void 0;
    const selectedWorkspaceRuntime = isWorkspaceIndexed(existing) && referenceIdentity && existing.embedding.provider !== referenceIdentity.provider ? {} : workspaceRuntime;
    return this.embeddingModel ?? (reference ? this.embeddingModelFromReference(reference, config, selectedWorkspaceRuntime) : void 0) ?? this.requireEmbeddingModel(operation);
  }
  recoverEmbeddingModel(schema, workspaceRuntime = {}) {
    const config = readGlobalConfig();
    const identity = {
      provider: schema.provider,
      name: schema.model
    };
    const reference = embeddingModelReference(identity);
    const options = providerOptions(this.options, identity, config, workspaceRuntime);
    const key = `${reference}/${providerOptionsFingerprint(options)}`;
    return this.cachedEmbeddingModel(key, () => createServiceEmbeddingModel(reference, options, this.options));
  }
  embeddingModelFromReference(reference, config = readGlobalConfig(), workspaceRuntime = {}) {
    const identity = parseEmbeddingModelReference(reference);
    const options = providerOptions(this.options, identity, config, workspaceRuntime);
    const key = `configured/${reference}/${providerOptionsFingerprint(options)}`;
    return this.cachedEmbeddingModel(key, () => createServiceEmbeddingModel(reference, options, this.options));
  }
  cachedEmbeddingModel(key, create) {
    const cached = this.recoveredEmbeddingModels.get(key);
    if (cached) {
      this.recoveredEmbeddingModels.delete(key);
      this.recoveredEmbeddingModels.set(key, cached);
      return cached;
    }
    const model = create();
    this.recoveredEmbeddingModels.set(key, model);
    this.trimRecoveredEmbeddingModels();
    return model;
  }
  trimRecoveredEmbeddingModels() {
    while (this.recoveredEmbeddingModels.size > MAX_RECOVERED_EMBEDDING_MODELS) {
      const oldestKey = this.recoveredEmbeddingModels.keys().next().value;
      if (oldestKey === void 0) {
        return;
      }
      const model = this.recoveredEmbeddingModels.get(oldestKey);
      this.recoveredEmbeddingModels.delete(oldestKey);
      if (model) {
        this.retiredEmbeddingModels.add(model);
      }
    }
  }
  async withEmbeddingModelOperation(operation) {
    this.activeEmbeddingModelOperations += 1;
    try {
      return await operation();
    } finally {
      this.activeEmbeddingModelOperations -= 1;
      if (this.activeEmbeddingModelOperations === 0) {
        await this.disposeRetiredEmbeddingModels();
      }
    }
  }
  async disposeRetiredEmbeddingModels() {
    const models = [...this.retiredEmbeddingModels];
    this.retiredEmbeddingModels.clear();
    for (const model of models) {
      await model.dispose();
    }
  }
  requireEmbeddingModel(operation) {
    if (!this.embeddingModel) {
      throw new EngineError("zvec-grep operation requires an embedding model", {
        code: "ZVEC_GREP.ENGINE.SERVICE.EMBEDDING_MODEL_REQUIRED",
        context: errorDetails([
          detail("operation", operation),
          detail("hint", `Pass "--embedding <model>", set ZVEC_GREP_EMBEDDING, or configure defaults.embedding in ${globalConfigPath()}. Existing indexes can run "zg index" without --embedding to reuse the stored schema.`),
          detail("examples", "local/potion-code-16m-v2, qwen/text-embedding-v4")
        ])
      });
    }
    return this.embeddingModel;
  }
  ensureOpen() {
    if (this.closed) {
      throw new EngineError("zvec-grep service is already closed", {
        code: "ZVEC_GREP.ENGINE.SERVICE.CLOSED"
      });
    }
  }
};
async function contextFromOpenWorkspaceIndex(input) {
  const searches = [];
  const groups = input.options.fuse ? [
    {
      id: "Q1",
      query: input.request.displayQuery,
      role: input.request.groups.some((group) => group.role === "primary") ? "primary" : "supplemental",
      routes: input.request.routes
    }
  ] : input.request.groups;
  const limit = contextGroupLimit(input.options.limit, groups.length);
  for (const group of groups) {
    const search = await input.workspaceIndex.searchPlan({
      routes: group.routes,
      limit,
      trace: input.options.trace,
      preferSymbol: input.options.preferSymbol,
      symbolTypes: input.options.symbolTypes,
      includePaths: input.options.includePaths,
      excludePaths: input.options.excludePaths,
      globs: input.options.globs,
      insensitiveGlobs: input.options.insensitiveGlobs,
      fileTypes: input.options.fileTypes,
      excludedFileTypes: input.options.excludedFileTypes,
      modifiedAfter: input.options.modifiedAfter,
      modifiedBefore: input.options.modifiedBefore
    });
    input.timings.addEntries(search.timings);
    searches.push(search);
  }
  const groupItems = searches.map((search, index) => searchPlanToContextItems(search, input.root, groups[index]));
  const items = selectAndRankContextItems(groupItems.flat(), groups.filter((group) => group.role === "primary").map((group) => group.id));
  return {
    query: input.request.displayQuery,
    root: input.root,
    source: "index",
    coverage: "ranked_sample",
    workspaceIndex: {
      id: input.workspaceIndex.info.id,
      name: input.workspaceIndex.info.name,
      path: input.workspaceIndex.info.path
    },
    items,
    groupResults: groups.map((group, index) => ({
      id: group.id,
      query: group.query,
      role: group.role,
      items: groupItems[index] ?? []
    })),
    diagnostics: {
      emptyReason: items.length === 0 ? "no_matches" : void 0,
      index: {
        hitsReturned: items.length,
        queryGroups: groups.map((group) => ({
          id: group.id,
          query: group.query,
          role: group.role
        })),
        routes: searches.flatMap((search) => search.plan.routes)
      }
    }
  };
}
async function withHomeReadLock(home, operation, task) {
  const lock = acquireHomeLock(home, "read", operation);
  try {
    return await task();
  } finally {
    lock.release();
  }
}
async function withHomeWriteLock(home, operation, task) {
  const lock = acquireHomeLock(home, "write", operation);
  try {
    return await task();
  } finally {
    lock.release();
  }
}
async function workspaceIndexNeedsRefresh(location) {
  const manifest = readWorkspaceManifest(location.home);
  const status = manifest ? await workspaceIndexStatus(manifest, location) : null;
  return indexStatusNeedsRefresh(status);
}
function acquireHomeLock(home, mode, operation) {
  return acquireReadWriteLock(homeLockPath(home), mode, { operation });
}
function assertHomeUnlocked(home, operation) {
  assertNoWriteLock(homeLockPath(home), operation);
}
function assertNearestWorkspaceHomeUnlocked(start, operation) {
  let current = resolve8(start);
  while (true) {
    assertHomeUnlocked(workspaceHome(current), operation);
    const parent = dirname12(current);
    if (parent === current) {
      return;
    }
    current = parent;
  }
}
function homeLockPath(home) {
  return join13(home, "locks", "home");
}
function rgEmptyReason(diagnostics) {
  return diagnostics.missingPaths && diagnostics.missingPaths.length > 0 && diagnostics.searchedPaths && diagnostics.searchedPaths.length === 0 ? "no_searchable_files" : "no_matches";
}
function withContextTimings(result, timings) {
  const entries = timings.entries();
  if (entries.length === 0) {
    return result;
  }
  return {
    ...result,
    diagnostics: {
      ...result.diagnostics,
      timings: entries
    }
  };
}
function findNearestWorkspaceIndex(start) {
  const location = findNearestWorkspace(start);
  if (!location)
    return null;
  const info = readWorkspaceManifest(location.home);
  return info ? { location, info } : null;
}
function workspaceInfoSuggestion(workspaceIndex) {
  if (!workspaceIndex) {
    return "zg index or zg query --rg";
  }
  if (workspaceIndex.indexPolicy === "disabled") {
    return "zg query --rg";
  }
  if (!isWorkspaceIndexed(workspaceIndex)) {
    return "zg index";
  }
  return void 0;
}
function workspaceIndexMissingError(root, policy) {
  return new EngineError("No zvec-grep index found for this workspace", {
    code: "ZVEC_GREP.ENGINE.SERVICE.WORKSPACE_INDEX_NOT_FOUND",
    context: errorDetails([
      detail("root", root),
      detail("policy", policy),
      detail("hint", policy === "undecided" ? "Ask the user whether to build an index with zg index, or use zg query --rg for no-index search." : "Run zg index to build the enabled workspace index, or use zg query --rg for no-index search."),
      detail("agent_prompt", policy === "undecided" ? "Ask the user whether this workspace should be indexed. If yes, run zg index --embedding <model> with appropriate -g/--glob and -t/--type filters; otherwise use zg query --rg for immediate no-index search." : "This workspace is marked index-enabled but has no built index. Ask before running zg index if an embedding model or cost is involved; otherwise use zg query --rg for immediate no-index search.")
    ])
  });
}
function workspaceIndexDisabledError(root) {
  return new EngineError("The zvec-grep index is disabled for this workspace", {
    code: "ZVEC_GREP.ENGINE.SERVICE.WORKSPACE_INDEX_DISABLED",
    context: errorDetails([
      detail("root", root),
      detail("policy", "disabled"),
      detail("hint", "Use zg query --rg for no-index search. Run zg index only if the user explicitly decides to index this workspace."),
      detail("agent_action", "do_not_build_index")
    ])
  });
}
function resolveIndexRootPaths(existing, requested, fallbackRoot, options) {
  let rootPaths = requested ? inheritRequestedRootPathSettings(requested, existing?.rootPaths) : existing?.rootPaths ?? [fallbackRoot];
  if (options.resetPaths) {
    rootPaths = rootPaths.map(resetRootPathFilters);
  }
  if (options.includePaths !== void 0 || options.excludePaths !== void 0 || options.globs !== void 0 || options.insensitiveGlobs !== void 0 || options.fileTypes !== void 0 || options.excludedFileTypes !== void 0 || options.hidden !== void 0 || options.noIgnore !== void 0 || options.ignoreFiles !== void 0 || options.maxDepth !== void 0 || options.maxFileSizeBytes !== void 0 || options.follow !== void 0) {
    rootPaths = rootPaths.map((rootPath) => applyRootPathOverrides(rootPath, options));
  }
  return rootPaths;
}
function inheritRequestedRootPathSettings(requested, existing) {
  if (!existing?.length) {
    return requested;
  }
  return requested.map((rootPath) => {
    const absolutePath = normalizePath(typeof rootPath === "string" ? rootPath : rootPath.absolutePath);
    const inherited = existing.find((candidate) => normalizePath(candidate.absolutePath) === absolutePath);
    if (!inherited) {
      return rootPath;
    }
    if (typeof rootPath === "string") {
      return { ...inherited, absolutePath };
    }
    return {
      ...inherited,
      ...rootPath,
      absolutePath,
      include: rootPath.include ?? inherited.include,
      exclude: rootPath.exclude ?? inherited.exclude,
      globs: rootPath.globs ?? inherited.globs,
      insensitiveGlobs: rootPath.insensitiveGlobs ?? inherited.insensitiveGlobs,
      fileTypes: rootPath.fileTypes ?? inherited.fileTypes,
      excludedFileTypes: rootPath.excludedFileTypes ?? inherited.excludedFileTypes,
      hidden: rootPath.hidden ?? inherited.hidden,
      noIgnore: rootPath.noIgnore ?? inherited.noIgnore,
      ignoreFiles: rootPath.ignoreFiles ?? inherited.ignoreFiles,
      maxDepth: rootPath.maxDepth ?? inherited.maxDepth,
      maxFileSizeBytes: rootPath.maxFileSizeBytes ?? inherited.maxFileSizeBytes,
      follow: rootPath.follow ?? inherited.follow
    };
  });
}
function resetRootPathFilters(rootPath) {
  if (typeof rootPath === "string") {
    return rootPath;
  }
  return {
    absolutePath: rootPath.absolutePath,
    recursive: rootPath.recursive
  };
}
function applyRootPathOverrides(rootPath, options) {
  const normalized = typeof rootPath === "string" ? {
    absolutePath: rootPath,
    recursive: true
  } : rootPath;
  return {
    ...normalized,
    include: options.includePaths ?? normalized.include,
    exclude: options.excludePaths ?? normalized.exclude,
    globs: options.globs ?? normalized.globs,
    insensitiveGlobs: options.insensitiveGlobs ?? normalized.insensitiveGlobs,
    fileTypes: options.fileTypes ?? normalized.fileTypes,
    excludedFileTypes: options.excludedFileTypes ?? normalized.excludedFileTypes,
    hidden: options.hidden ?? normalized.hidden,
    noIgnore: options.noIgnore ?? normalized.noIgnore,
    ignoreFiles: options.ignoreFiles ?? normalized.ignoreFiles,
    maxDepth: options.maxDepth ?? normalized.maxDepth,
    maxFileSizeBytes: options.maxFileSizeBytes ?? normalized.maxFileSizeBytes,
    follow: options.follow ?? normalized.follow
  };
}
function prepareWorkspaceManifest(location, existing, rootPaths, embeddingModel, embeddingRuntime) {
  const now = Date.now();
  return {
    manifestVersion: CURRENT_MANIFEST_VERSION,
    id: existing?.id ?? randomUUID5(),
    name: existing?.name ?? workspaceDisplayName(location.root),
    path: location.home,
    rootPaths: validateRootPaths(rootPaths),
    indexPolicy: "enabled",
    embedding: currentEmbeddingSchema(embeddingModel),
    indexVersion: CURRENT_INDEX_VERSION,
    createdTime: existing?.createdTime ?? now,
    updatedTime: now,
    embeddingRuntime
  };
}
function currentEmbeddingSchema(embeddingModel) {
  return {
    provider: embeddingModel.info.provider,
    model: embeddingModel.info.name,
    dimension: embeddingModel.info.dimension,
    metric: embeddingModel.info.metric
  };
}
function workspaceDisplayName(root) {
  return basename4(normalizePath(root)) || "workspace";
}
async function workspaceIndexStatus(info, location) {
  if (info.indexPolicy === "disabled" || !isWorkspaceIndexed(info) || !hasWorkspaceIndex(location)) {
    return null;
  }
  const workspaceIndex = new WorkspaceIndex(info, { mode: "read" });
  try {
    return await workspaceIndex.status();
  } finally {
    workspaceIndex.close();
  }
}
function indexedEmbeddingSchema(info) {
  if (isWorkspaceIndexed(info)) {
    return info.embedding;
  }
  throw new EngineError("zvec-grep index has not been built", {
    code: "ZVEC_GREP.ENGINE.SERVICE.INDEX_MISSING",
    context: errorDetails([
      workspaceIndexDetail(info.name),
      detail("hint", "Run zg index to build this index.")
    ])
  });
}
function providerOptions(options, identity, config = readGlobalConfig(), workspaceRuntime = {}) {
  const reference = embeddingModelReference(identity);
  const runtime = resolveEmbeddingRuntimeOptions(reference, options, workspaceRuntime, config);
  return {
    apiKey: runtime.apiKey,
    endpoint: runtime.endpoint,
    modelCacheDir: options.modelCacheDir ?? config.defaults?.modelCacheDir ?? process.env.ZVEC_GREP_MODEL_CACHE ?? join13(options.home ?? defaultHome(), "models"),
    device: runtime.device
  };
}
function createServiceEmbeddingModel(reference, modelOptions, serviceOptions) {
  const model = createEmbeddingModel(reference, modelOptions);
  if (model.info.provider !== "qwen") {
    return model;
  }
  const endpoint = model.info.endpoint;
  if (endpoint === void 0) {
    throw new EngineError("Remote embedding model did not provide an endpoint", {
      code: "ZVEC_GREP.ENGINE.MODELS.REMOTE_ENDPOINT_NOT_IMPLEMENTED",
      context: `model=${model.info.reference}`
    });
  }
  const authorize = remoteEmbeddingAuthorizationGuard({
    store: new RemoteEmbeddingAuthorizationStore({
      signingKeyPath: serviceOptions.authorizationSigningKeyPath
    })
  });
  const authorizedModel = {
    info: model.info,
    async embed(contents, embedOptions) {
      await authorize({
        provider: model.info.provider,
        model: model.info.name,
        endpoint,
        purpose: embedOptions?.purpose ?? EmbeddingPurpose.Document,
        contentKinds: contents.map((content) => content.kind),
        contentCount: contents.length
      });
      return await model.embed(contents, embedOptions);
    },
    dispose: () => model.dispose()
  };
  return authorizedModel;
}
function parseEmbeddingModelReference(reference) {
  const separator = reference.indexOf("/");
  if (separator <= 0 || separator === reference.length - 1) {
    throw new EngineError("Embedding model reference is invalid", {
      code: "ZVEC_GREP.ENGINE.MODELS.EMBEDDING_INVALID_REFERENCE",
      context: `reference=${reference}`
    });
  }
  return {
    provider: reference.slice(0, separator),
    name: reference.slice(separator + 1)
  };
}
function embeddingModelReference(identity) {
  return `${identity.provider}/${identity.name}`;
}
function providerOptionsFingerprint(options) {
  const publicOptionsFingerprint = createHash2("sha256").update(JSON.stringify([options.endpoint, options.modelCacheDir, options.device])).digest("hex");
  return `${providerApiKeyIdentity(options.apiKey)}:${publicOptionsFingerprint}`;
}
function providerApiKeyIdentity(apiKey) {
  return createHmac2("sha256", PROVIDER_API_KEY_IDENTITY_SECRET).update(apiKey).digest("hex");
}
function effectiveEmbeddingRuntime(options, model, workspaceRuntime) {
  const resolved = resolveEmbeddingRuntimeOptions(model.info.reference, options, workspaceRuntime, readGlobalConfig());
  return {
    apiKey: resolved.apiKey,
    ...model.info.endpoint ?? resolved.endpoint ? { endpoint: model.info.endpoint ?? resolved.endpoint } : {},
    ...model.info.provider === "local" ? { device: resolved.device ?? "auto" } : {}
  };
}
function runtimeForModelProvider(existing, model, workspaceRuntime) {
  return isWorkspaceIndexed(existing) && existing.embedding.provider !== model.info.provider ? {} : workspaceRuntime;
}
function embeddingRuntimeAfterIndex(existing, existingRuntime, model, effectiveRuntime, explicit) {
  const sameProvider = isWorkspaceIndexed(existing) && existing.embedding.provider === model.info.provider;
  const apiKey = model.info.provider === "local" ? void 0 : explicit.apiKey ?? (sameProvider ? existingRuntime.apiKey : void 0);
  return {
    ...apiKey !== void 0 ? { apiKey } : {},
    ...model.info.provider !== "local" && effectiveRuntime.endpoint !== void 0 ? { endpoint: effectiveRuntime.endpoint } : {},
    ...model.info.provider === "local" ? { device: effectiveRuntime.device ?? "auto" } : {}
  };
}
function assertWorkspaceEndpointMatchesCurrentRuntime(info, workspaceRuntime, effectiveRuntime, rebuildCommand) {
  if (!isWorkspaceIndexed(info) || workspaceRuntime.endpoint === effectiveRuntime.endpoint) {
    return;
  }
  throw new EngineError("Existing zvec-grep index uses a different embedding endpoint", {
    code: "ZVEC_GREP.ENGINE.SERVICE.EMBEDDING_ENDPOINT_CHANGE_REQUIRES_REBUILD",
    context: errorDetails([
      workspaceIndexDetail(info.name),
      detail("hint", `Run "${rebuildCommand}" to rebuild this index with the requested endpoint.`)
    ])
  });
}
function assertSearchEndpointMatchesWorkspace(info, workspaceRuntime, effectiveRuntime) {
  if (workspaceRuntime.endpoint === effectiveRuntime.endpoint) {
    return;
  }
  throw new EngineError("Search cannot override the embedding endpoint of an existing index", {
    code: "ZVEC_GREP.ENGINE.SERVICE.SEARCH_ENDPOINT_CHANGE_REQUIRES_REBUILD",
    context: errorDetails([
      workspaceIndexDetail(info.name),
      detail("hint", 'Run "zg index --endpoint <url> --rebuild" before searching with this endpoint.')
    ])
  });
}
function assertWorkspaceEmbeddingMatchesCurrentModel(info, model, rebuildCommand) {
  if (!isWorkspaceIndexed(info)) {
    return;
  }
  const expected = info.embedding;
  const changed = expected.provider !== model.info.provider || expected.model !== model.info.name || expected.dimension !== model.info.dimension || expected.metric !== model.info.metric;
  if (!changed) {
    return;
  }
  throw new EngineError("Existing zvec-grep index uses a different embedding model", {
    code: "ZVEC_GREP.ENGINE.SERVICE.EMBEDDING_SCHEMA_CHANGE_REQUIRES_REBUILD",
    context: errorDetails([
      workspaceIndexDetail(info.name),
      detail("existing", `${expected.provider}/${expected.model}`),
      detail("requested", model.info.reference),
      detail("hint", `Run "${rebuildCommand}" to rebuild this index with the requested embedding model.`)
    ])
  });
}
function contextGroupLimit(limit, groupCount) {
  if (limit !== void 0) {
    return limit;
  }
  const safeGroupCount = Math.max(1, groupCount);
  if (safeGroupCount <= 3) {
    return DEFAULT_CONTEXT_LIMIT;
  }
  return Math.max(1, Math.ceil(DEFAULT_CONTEXT_TOTAL_LIMIT / safeGroupCount));
}
function normalizeContextRequest(options) {
  const primaryQueries = normalizePrimaryQueries(options.query, options.queries);
  const extraRoutes = normalizeContextRoutes(options.routes ?? []);
  const hasPatternFiles = options.rg === true && (options.rgOptions?.patternFiles?.length ?? 0) > 0;
  if (primaryQueries.length === 0 && extraRoutes.length === 0 && !hasPatternFiles) {
    throw new EngineError("zvec-grep context requires a non-empty query or route", {
      code: "ZVEC_GREP.ENGINE.SERVICE.EMPTY_QUERY"
    });
  }
  const groups = contextGroups(primaryQueries, extraRoutes);
  const routes = groups.flatMap((group) => group.routes);
  const rgPatterns = [
    ...primaryQueries,
    ...extraRoutes.map((route) => route.query)
  ];
  const displayQuery = primaryQueries.length > 0 ? primaryQueries.join(" | ") : extraRoutes.length > 0 ? extraRoutes.map((route) => route.query).join(" | ") : options.rgOptions.patternFiles.map((path) => `@${path}`).join(" | ");
  return {
    displayQuery,
    rgPatterns,
    routes,
    groups
  };
}
function normalizePrimaryQueries(query, queries) {
  return [query, ...queries ?? []].flatMap((value) => {
    const normalized = normalizeOptionalQuery(value);
    return normalized ? [normalized] : [];
  });
}
function normalizeOptionalQuery(query) {
  const normalized = query?.trim() ?? "";
  return normalized.length > 0 ? normalized : void 0;
}
function normalizeContextRoutes(routes) {
  return routes.map((route, index) => {
    if (route.mode !== "fts" && route.mode !== "vector") {
      throw new EngineError("zvec-grep context route has an unsupported mode", {
        code: "ZVEC_GREP.ENGINE.SERVICE.INVALID_ROUTE_MODE",
        context: `routeIndex=${index} mode=${String(route.mode)}`
      });
    }
    const query = route.query.trim();
    if (query.length === 0) {
      throw new EngineError("zvec-grep context route requires a non-empty query", {
        code: "ZVEC_GREP.ENGINE.SERVICE.EMPTY_ROUTE_QUERY",
        context: `routeIndex=${index} mode=${route.mode}`
      });
    }
    return {
      mode: route.mode,
      query
    };
  });
}
function contextGroups(primaryQueries, extraRoutes) {
  return [
    ...primaryQueries.map((query, index) => ({
      id: `Q${index + 1}`,
      query,
      role: "primary",
      routes: [
        { mode: "fts", query },
        { mode: "vector", query }
      ]
    })),
    ...extraRoutes.map((route, index) => ({
      id: `Q${primaryQueries.length + index + 1}`,
      query: route.query,
      role: "supplemental",
      routes: [route]
    }))
  ];
}
function searchPlanToContextItems(result, root, group) {
  return result.hits.map((hit) => {
    const target = contextItemTarget(hit);
    return {
      kind: "indexed_entity",
      rank: hit.rank,
      file: {
        absolutePath: hit.file.absolutePath,
        relativePath: hit.file.relativePath || relative5(root, hit.file.absolutePath) || ".",
        rootPath: hit.file.rootPath
      },
      range: hit.entity.range,
      excerptRange: target.excerptRange,
      content: contentToText(target.content),
      contentRole: target.contentRole,
      outline: target.outline,
      status: fileFreshnessStatus(hit.file),
      score: hit.score,
      matchedBy: hit.matchedBy,
      metadata: hit.entity.metadata,
      entityId: hit.entity.id,
      trace: hit.trace,
      queryGroups: [
        {
          id: group.id,
          query: group.query,
          role: group.role,
          rank: hit.rank,
          matchedBy: hit.matchedBy
        }
      ]
    };
  });
}
var DEFAULT_CONTEXT_PRIORITY_LIMIT = 6;
var CONTEXT_GROUP_RRF_K = 60;
function selectAndRankContextItems(items, coverageGroupIds) {
  const deduped = /* @__PURE__ */ new Map();
  for (const item of items) {
    const key = contextItemDedupeKey(item);
    const existing = deduped.get(key);
    if (existing) {
      existing.queryGroups = mergeContextQueryGroupMatches(existing.queryGroups ?? [], item.queryGroups ?? []);
      existing.matchedBy = mergedContextMatchedBy(existing.queryGroups);
      continue;
    }
    deduped.set(key, { ...item });
  }
  const candidates = [...deduped.values()];
  const globallyRanked = [...candidates].sort(compareContextGlobalRank);
  const selected = /* @__PURE__ */ new Set();
  const prioritized = [];
  for (const groupId of coverageGroupIds) {
    if (prioritized.length >= DEFAULT_CONTEXT_PRIORITY_LIMIT) {
      break;
    }
    const candidate = candidates.filter((item) => !selected.has(contextItemDedupeKey(item))).filter((item) => contextQueryGroupMatch(item, groupId) !== void 0).sort((left, right) => compareContextGroupRank(left, right, groupId))[0];
    if (!candidate) {
      continue;
    }
    selected.add(contextItemDedupeKey(candidate));
    prioritized.push({
      ...candidate,
      selectionReason: "coverage",
      coverageGroup: groupId
    });
  }
  for (const candidate of globallyRanked) {
    if (prioritized.length >= DEFAULT_CONTEXT_PRIORITY_LIMIT) {
      break;
    }
    const key = contextItemDedupeKey(candidate);
    if (selected.has(key)) {
      continue;
    }
    selected.add(key);
    prioritized.push({
      ...candidate,
      selectionReason: "global_fill",
      coverageGroup: void 0
    });
  }
  const unprioritized = globallyRanked.filter((item) => !selected.has(contextItemDedupeKey(item)));
  return [...prioritized, ...unprioritized].map((item, index) => ({
    ...item,
    rank: index + 1
  }));
}
function dedupeAndRerankContextItems(items) {
  const seen = /* @__PURE__ */ new Set();
  const deduped = [];
  for (const item of items) {
    const key = contextItemDedupeKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({ ...item, rank: deduped.length + 1 });
  }
  return deduped;
}
function mergeContextQueryGroupMatches(left, right) {
  const matches = new Map(left.map((match) => [match.id, match]));
  for (const match of right) {
    const existing = matches.get(match.id);
    if (!existing || match.rank < existing.rank) {
      matches.set(match.id, match);
    }
  }
  return [...matches.values()].sort((a, b) => contextGroupNumber(a.id) - contextGroupNumber(b.id));
}
function mergedContextMatchedBy(matches) {
  const hasFts = matches.some((match) => match.matchedBy === "fts" || match.matchedBy === "fts+vector");
  const hasVector = matches.some((match) => match.matchedBy === "vector" || match.matchedBy === "fts+vector");
  return hasFts && hasVector ? "fts+vector" : hasFts ? "fts" : "vector";
}
function compareContextGlobalRank(left, right) {
  return contextGlobalRrfScore(right) - contextGlobalRrfScore(left) || contextBestGroupRank(left) - contextBestGroupRank(right) || contextFirstGroupNumber(left) - contextFirstGroupNumber(right) || contextItemDedupeKey(left).localeCompare(contextItemDedupeKey(right));
}
function contextGlobalRrfScore(item) {
  return (item.queryGroups ?? []).reduce((score, match) => score + 1 / (CONTEXT_GROUP_RRF_K + match.rank), 0);
}
function compareContextGroupRank(left, right, groupId) {
  return contextQueryGroupMatch(left, groupId).rank - contextQueryGroupMatch(right, groupId).rank || compareContextGlobalRank(left, right);
}
function contextQueryGroupMatch(item, groupId) {
  return item.queryGroups?.find((match) => match.id === groupId);
}
function contextBestGroupRank(item) {
  return Math.min(...(item.queryGroups ?? []).map((match) => match.rank));
}
function contextFirstGroupNumber(item) {
  return Math.min(...(item.queryGroups ?? []).map((match) => contextGroupNumber(match.id)));
}
function contextGroupNumber(id) {
  const value = Number.parseInt(id.slice(1), 10);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}
function contextItemDedupeKey(item) {
  if (item.entityId) {
    return `entity:${item.entityId}`;
  }
  return ["range", item.file.absolutePath, JSON.stringify(item.range)].join(":");
}
function contextItemTarget(hit) {
  const evidence = hit.evidence.find((item) => !item.isEntity);
  const hasSeparateEvidence = evidence && !sameDisplayedContent(hit.entity, evidence);
  const content = hasSeparateEvidence ? evidence.content : hit.entity.content;
  const contentRole = hasSeparateEvidence || entityContentLooksLikeSource(hit.entity) ? "source" : "outline";
  const excerptRange = hasSeparateEvidence ? evidence.range : void 0;
  const outline = contentRole === "source" ? contextItemOutline(hit, evidence) : void 0;
  return {
    content,
    contentRole,
    excerptRange,
    outline
  };
}
function entityContentLooksLikeSource(entity) {
  if (entity.content.kind !== "text" || entity.range.kind !== "text") {
    return true;
  }
  const expectedLines = entity.range.endLine - entity.range.startLine + 1;
  const actualLines = entity.content.text.split(/\r?\n/).length;
  return actualLines >= expectedLines;
}
function contextItemOutline(hit, evidence) {
  if (hit.entity.content.kind !== "text") {
    return void 0;
  }
  const outline = hit.entity.content.text.trim();
  if (outline.length === 0) {
    return void 0;
  }
  if (!evidence) {
    return void 0;
  }
  if (evidence && sameDisplayedContent(hit.entity, evidence)) {
    return void 0;
  }
  if (!isUsefulOutline(hit.entity.metadata, outline)) {
    return void 0;
  }
  if (evidence?.content.kind === "text" && evidence.content.text.trim() === outline) {
    return void 0;
  }
  return outline;
}
function isUsefulOutline(metadata, outline) {
  if (!metadata || metadata.kind !== "code") {
    return false;
  }
  return metadata.symbolType === "class" || metadata.symbolType === "interface" || metadata.symbolType === "module" || outline.includes("\ncalls:");
}
function sameDisplayedContent(entity, evidence) {
  return JSON.stringify(entity.range) === JSON.stringify(evidence.range) && contentEquals(entity.content, evidence.content);
}
function contentEquals(left, right) {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "image") {
    return right.kind === "image" && left.format === right.format && left.data.byteLength === right.data.byteLength;
  }
  return right.kind === "text" && left.text === right.text;
}
function fileFreshnessStatus(file) {
  if (!file.indexStatus?.indexedTime) {
    return "possibly_stale";
  }
  try {
    const info = statSync6(file.absolutePath, { throwIfNoEntry: false });
    if (!info || !info.isFile()) {
      return "possibly_stale";
    }
    if (file.indexStatus.indexedTime >= info.mtimeMs) {
      return "fresh";
    }
    if (file.contentHash && sha256File(file.absolutePath) === file.contentHash) {
      return "fresh";
    }
  } catch {
    return "possibly_stale";
  }
  return "possibly_stale";
}
function sha256File(path) {
  return createHash2("sha256").update(readFileSync5(path)).digest("hex");
}
function contentToText(content) {
  if (content.kind === "text") {
    return content.text;
  }
  return `[image:${content.format} bytes=${content.data.byteLength}]`;
}

// zg-sdk-entry.js
var import_zvec3 = __toESM(require_src());
var export_ZVecCollectionSchema = import_zvec3.ZVecCollectionSchema;
var export_ZVecCreateAndOpen = import_zvec3.ZVecCreateAndOpen;
var export_ZVecDataType = import_zvec3.ZVecDataType;
var export_ZVecIndexType = import_zvec3.ZVecIndexType;
var export_ZVecInitialize = import_zvec3.ZVecInitialize;
var export_ZVecLogLevel = import_zvec3.ZVecLogLevel;
var export_ZVecOpen = import_zvec3.ZVecOpen;
export {
  EmbeddingPurpose,
  WorkspaceIndex,
  export_ZVecCollectionSchema as ZVecCollectionSchema,
  export_ZVecCreateAndOpen as ZVecCreateAndOpen,
  export_ZVecDataType as ZVecDataType,
  export_ZVecIndexType as ZVecIndexType,
  export_ZVecInitialize as ZVecInitialize,
  export_ZVecLogLevel as ZVecLogLevel,
  export_ZVecOpen as ZVecOpen,
  createEmbeddingModel,
  createZvecGrep,
  isImageContent,
  isTextContent,
  readWorkspaceManifest,
  workspaceIndexInfoFromManifest
};
