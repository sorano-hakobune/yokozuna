// scripts/sync-version.js
const fs = require("fs");
const path = require("path");

// パスの設定
const packageJsonPath = path.resolve(__dirname, "../package.json");
const cargoTomlPath = path.resolve(__dirname, "../src-tauri/Cargo.toml");
const tauriConfJsonPath = path.resolve(
  __dirname,
  "../src-tauri/tauri.conf.json",
);

// 1. package.json から最新バージョンを取得
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const newVersion = packageJson.version;
console.log(`Syncing version to ${newVersion}...`);

// 2. src-tauri/Cargo.toml のバージョンを更新
let cargoToml = fs.readFileSync(cargoTomlPath, "utf8");
cargoToml = cargoToml.replace(
  /^version\s*=\s*"[^"]*"/m,
  `version = "${newVersion}"`,
);
fs.writeFileSync(cargoTomlPath, cargoToml, "utf8");

// 3. src-tauri/tauri.conf.json のバージョンを更新
const tauriConf = JSON.parse(fs.readFileSync(tauriConfJsonPath, "utf8"));
tauriConf.version = newVersion;
fs.writeFileSync(
  tauriConfJsonPath,
  JSON.stringify(tauriConf, null, 2) + "\n",
  "utf8",
);

console.log("Version sync completed successfully.");
