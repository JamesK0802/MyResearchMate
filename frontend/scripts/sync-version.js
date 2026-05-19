#!/usr/bin/env node

/**
 * sync-version.js
 * 
 * Single Source of Truth: reads the project root VERSION file
 * and patches environment.ts, environment.prod.ts, and package.json.
 *
 * Runs automatically via npm prestart/prebuild hooks.
 */

const fs = require('fs');
const path = require('path');

// Try multiple possible locations for the VERSION file
const candidates = [
  path.resolve(__dirname, '..', '..', 'VERSION'),       // Local dev: frontend/scripts/../../VERSION
  path.resolve(__dirname, '..', 'VERSION'),              // Docker: /app/VERSION (copied into WORKDIR)
];

let version = null;
for (const p of candidates) {
  if (fs.existsSync(p)) {
    version = fs.readFileSync(p, 'utf-8').trim();
    break;
  }
}

if (!version) {
  console.warn('[sync-version] VERSION file not found - skipping.');
  process.exit(0);
}

console.log(`[sync-version] Syncing version: ${version}`);

// 1. Patch environment files
const envFiles = [
  path.join(__dirname, '..', 'src', 'environments', 'environment.ts'),
  path.join(__dirname, '..', 'src', 'environments', 'environment.prod.ts'),
];

for (const filePath of envFiles) {
  if (!fs.existsSync(filePath)) continue;
  let content = fs.readFileSync(filePath, 'utf-8');
  const updated = content.replace(/version:\s*'[^']*'/, `version: '${version}'`);
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    console.log(`  ✔ ${path.basename(filePath)}`);
  } else {
    console.log(`  ○ ${path.basename(filePath)} (already up-to-date)`);
  }
}

// 2. Patch package.json
const pkgPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('  ✔ package.json');
  } else {
    console.log('  ○ package.json (already up-to-date)');
  }
}

console.log('[sync-version] Done.');
