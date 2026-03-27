import * as vscode from "vscode";

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "composerVisualManager.sidebar";

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message) => {
      if (message.type === "openPanel") {
        vscode.commands.executeCommand("composerVisualManager.open");
      }
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      padding: 16px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .logo {
      text-align: center;
      margin-bottom: 16px;
      font-size: 48px;
    }
    h2 {
      text-align: center;
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
    }
    .version {
      text-align: center;
      margin-bottom: 20px;
      opacity: 0.7;
      font-size: 12px;
    }
    .description {
      margin-bottom: 20px;
      line-height: 1.5;
      opacity: 0.8;
      font-size: 13px;
    }
    .open-btn {
      width: 100%;
      padding: 8px 16px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
      font-family: var(--vscode-font-family);
      margin-bottom: 16px;
    }
    .open-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }
    .links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .links a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      font-size: 12px;
    }
    .links a:hover {
      text-decoration: underline;
    }
    .tip {
      margin-top: 20px;
      padding: 10px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.85;
    }
  </style>
</head>
<body>
  <div class="logo">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--vscode-foreground)" width="56" height="56" opacity="0.85">
      <circle cx="12" cy="4" r="2.5"/>
      <path d="M10 7.5 C9.5 7.5 7.5 9.5 7.5 12 L7.5 15 L9.5 15 L9.5 12.5 L14.5 12.5 L14.5 15 L16.5 15 L16.5 12 C16.5 9.5 14.5 7.5 14 7.5 Z"/>
      <path d="M7.5 9.5 L4 6.5 L5 5.5 L8.5 9 Z"/>
      <line x1="4" y1="6.5" x2="2" y2="3.5" stroke="var(--vscode-foreground)" stroke-width="0.9" stroke-linecap="round" fill="none"/>
      <path d="M16.5 9.5 L20 7 L20.8 8.2 L16.8 10.5 Z"/>
      <path d="M9.5 15 L8.5 22 L10.5 22 L12 17 L13.5 22 L15.5 22 L14.5 15 Z"/>
    </svg>
  </div>
  <h2>Composer Visual Manager</h2>
  <div class="version">v0.1.0</div>
  <p class="description">
    Manage your PHP Composer dependencies visually. Install, update, remove, and audit packages without leaving VS Code.
  </p>
  <button class="open-btn" id="openBtn">Open Package Manager</button>
  <div class="links">
    <a href="https://getcomposer.org/doc/" target="_blank">Composer Documentation</a>
    <a href="https://packagist.org" target="_blank">Browse Packagist</a>
  </div>
  <div class="tip">
    <strong>Tip:</strong> Right-click on any <code>composer.json</code> file in the Explorer to open the package manager.
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('openBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'openPanel' });
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
