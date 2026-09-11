import { readFileSync, writeFileSync, copyFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const rootDir = path.dirname(desktopDir)

const pkg = JSON.parse(readFileSync(path.join(desktopDir, 'package.json'), 'utf8'))
const targetPublic = path.join(rootDir, 'public')

writeFileSync(
  path.join(targetPublic, 'version.json'),
  JSON.stringify({ version: pkg.version }, null, 2),
)

const candidates = [
  path.join(desktopDir, 'release', `${pkg.productName || 'DTDC Service'} Setup.exe`),
  path.join(desktopDir, 'release', 'HireMe Setup.exe'),
  path.join(desktopDir, 'release', 'DTDC Service Setup.exe'),
]
const source = candidates.find((p) => existsSync(p))

if (!source) {
  console.error(`ERROR: Installer not found in release/. Run "npm run dist" in desktop/ first.`)
  process.exit(1)
}

const targetInstaller = path.join(targetPublic, path.basename(source))
copyFileSync(source, targetInstaller)
const sizeMB = (statSync(source).size / (1024 * 1024)).toFixed(1)
console.log(`Synced ${path.basename(source)} v${pkg.version} (${sizeMB} MB) into public/`)
console.log('Next: commit and push — Vercel will deploy the site with the new installer.')

