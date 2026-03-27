# Composer Visual Manager

A visual interface for managing PHP Composer dependencies directly from VS Code.

![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### Dependency Management

- **View all packages** from `composer.json` with filtering by type (production/dev) and search
- **Install packages** from Packagist, GitHub repositories, or local paths with advanced options (version pinning, prefer source/dist, dev dependency toggle)
- **Update packages** individually or all at once with a preview of changes
- **Remove packages** with confirmation dialogs
- **Rollback** to specific versions
- **Bump version constraints** to match installed versions
- **Outdated detection** with semantic version update indicators (major/minor/patch)
- **Ignore packages** from update checks with reasons and pinned versions

### Security Auditing

- Run `composer audit` to detect vulnerabilities
- View security advisories and CVEs per package
- Visual indicators in the dependency table for packages with known issues

### Scripts Management

- View, add, edit, remove, and run Composer scripts
- **Tool suggestions** with one-click setup for popular tools:
  - PHPStan, Rector, Laravel Pint, Pest, PHPUnit, PHP-CS-Fixer, PHPMD, Psalm

### Autoload Configuration

- Manage PSR-4 and PSR-0 namespaces, classmap, and file entries
- Add entries to `autoload` or `autoload-dev`
- Dump autoloader with optimization options (classmap, authoritative, APCu)

### Platform Requirements

- View and manage PHP version and extension requirements (`ext-*`)
- Check platform requirements against your system
- Quick-add common extensions (mbstring, json, openssl, pdo, curl, etc.)

### Project Health

- Run `composer validate` and `composer diagnose`
- Check lock file sync status
- View results with status indicators and troubleshooting hints

### Framework Detection

Automatically detects and provides framework-specific commands for:

- **Laravel** — Artisan commands, service providers, aliases, package discovery management
- **Symfony** — Console commands
- **WordPress** — WP-CLI integration (plugins, themes, core updates, DB export)
- **Yii, CakePHP, CodeIgniter, Slim** — Auto-detected with relevant commands

### Licenses

- View all package licenses grouped by type
- Identify restrictive licenses (GPL, AGPL, SSPL, EUPL) with warning badges

### Repositories

- View, add, and remove Composer repositories
- Supports VCS, Composer, Path, Artifact, and Package types

### Suggested Packages

- View packages suggested by your installed dependencies
- See suggestion reasons and install with one click

### Stability

- Set minimum stability (stable, RC, beta, alpha, dev)
- Toggle `prefer-stable`

### Dependency Analysis

- `composer why` — understand why a package is installed
- `composer why-not` — understand why a version can't be installed

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **Composer Visual Manager**
4. Click **Install**

### From VSIX

1. Download the `.vsix` file from [Releases](https://github.com/yousefkadah/composer-Visual-manager/releases)
2. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run **Extensions: Install from VSIX...**
4. Select the downloaded file

## Usage

There are three ways to open Composer Visual Manager:

1. **Activity Bar** — Click the Composer icon in the sidebar
2. **Command Palette** — Run `Open Composer Visual Manager`
3. **Context Menu** — Right-click on a `composer.json` file and select **Open Composer Visual Manager**

The extension automatically watches for changes to `composer.json` and refreshes the UI.

## Requirements

- VS Code 1.85.0 or higher
- [Composer](https://getcomposer.org/) installed and available in your PATH
- PHP installed (required by Composer)

## Extension Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `composerVisualManager.columns.type` | `true` | Show dependency type column (require/require-dev) |
| `composerVisualManager.columns.lastUpdate` | `true` | Show last update date column |
| `composerVisualManager.columns.security` | `true` | Show security audit column |
| `composerVisualManager.columns.semverUpdate` | `true` | Show semver update type column |
| `composerVisualManager.columns.phpVersion` | `false` | Show required PHP version column |
| `composerVisualManager.ignoredPackages` | `[]` | Packages to ignore for update checks |

## Development

```bash
# Install dependencies
npm install
cd webview-ui && npm install && cd ..

# Development mode (watch + webview dev server)
npm run dev

# Build for production
npm run build

# Package as VSIX
npx @vscode/vsce package
```

## License

[MIT](LICENSE)
