const fs = require("fs");
const path = require("path");

const packageJsonPath = path.resolve(__dirname, "../package.json");
const cargoTomlPath = path.resolve(__dirname, "../src-tauri/Cargo.toml");
const tauriConfJsonPath = path.resolve(
  __dirname,
  "../src-tauri/tauri.conf.json",
);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Failed to read/parse JSON: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    console.error(`Failed to read file: ${filePath}`);
    console.error(err.message);
    process.exit(1);
  }
}

// 1. package.json から最新バージョンを取得
const packageJson = readJson(packageJsonPath);
const newVersion = packageJson.version;

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
  console.error(`Invalid version format in package.json: "${newVersion}"`);
  process.exit(1);
}

console.log(`Syncing version to ${newVersion}...`);

// 2. Cargo.toml の [package] セクション内の version だけを更新
let cargoToml = readText(cargoTomlPath);

// [package] セクションを見つけて、その中の version だけ置換
const packageSectionRegex = /(\[package\][\s\S]*?)(^version\s*=\s*"[^"]*")/m;
if (!packageSectionRegex.test(cargoToml)) {
  console.error("Could not find version in [package] section of Cargo.toml");
  process.exit(1);
}

cargoToml = cargoToml.replace(
  packageSectionRegex,
  `$1version = "${newVersion}"`,
);
fs.writeFileSync(cargoTomlPath, cargoToml, "utf8");
console.log(`  ✓ Cargo.toml → ${newVersion}`);

// 3. tauri.conf.json のバージョンを更新
const tauriConf = readJson(tauriConfJsonPath);
const oldTauriVersion = tauriConf.version;
tauriConf.version = newVersion;

// 既存のインデントをできるだけ維持（2スペース想定）
fs.writeFileSync(
  tauriConfJsonPath,
  JSON.stringify(tauriConf, null, 2) + "\n",
  "utf8",
);
console.log(`  ✓ tauri.conf.json → ${newVersion} (was ${oldTauriVersion})`);

console.log("Version sync completed successfully.");
