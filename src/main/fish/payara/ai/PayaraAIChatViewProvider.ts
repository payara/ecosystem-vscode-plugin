/*
 * Copyright (c) 2026 Payara Foundation and/or its affiliates and others.
 * All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0, which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the
 * Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
 * version 2 with the GNU Classpath Exception, which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 */

'use strict';

import * as vscode from 'vscode';
import { PayaraServerMavenInstance } from '../server/maven/PayaraServerMavenInstance';

export class PayaraAIChatViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'payara.ai.chat';

    // Markers emitted by the Payara Server Maven Plugin to delimit AI responses in stdout.
    public static readonly AI_RESPONSE_START = '%%PAYARA-AI-START%%';
    public static readonly AI_RESPONSE_END = '%%PAYARA-AI-END%%';

    private _view?: vscode.WebviewView;
    private _instance?: PayaraServerMavenInstance;

    // Rolling stdout buffer used to detect split markers across data chunks.
    private _stdoutBuf = '';
    private _inResponse = false;
    private _responseBuf = '';

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._buildHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'ready') {
                // WebView JS is live — safe to send the current server state now.
                this._post({ type: 'status', running: this._instance?.isStarted() === true });
            } else if (msg.type === 'send') {
                this._sendToAgent(msg.text);
            }
        });
    }

    /** Called by the controller when the Maven process reports the server is running. */
    public onInstanceStarted(instance: PayaraServerMavenInstance): void {
        this._instance = instance;
        this._resetBuffers();
        this._post({ type: 'status', running: true });
    }

    /** Called by the controller when the Maven process exits or errors. */
    public onInstanceStopped(): void {
        this._instance = undefined;
        this._resetBuffers();
        this._post({ type: 'status', running: false });
    }

    /**
     * Called by the controller for every chunk of Maven process stdout/stderr.
     * Scans for %%PAYARA-AI-START%% / %%PAYARA-AI-END%% delimiters and forwards
     * the enclosed text to the WebView as an AI response message.
     */
    public handleData(data: string): void {
        this._stdoutBuf += data;

        while (true) {
            if (!this._inResponse) {
                const startIdx = this._stdoutBuf.indexOf(PayaraAIChatViewProvider.AI_RESPONSE_START);
                if (startIdx === -1) {
                    // Retain a trailing window in case the marker is split across chunks.
                    const keep = PayaraAIChatViewProvider.AI_RESPONSE_START.length - 1;
                    if (this._stdoutBuf.length > keep) {
                        this._stdoutBuf = this._stdoutBuf.slice(-keep);
                    }
                    break;
                }
                const afterMarker = startIdx + PayaraAIChatViewProvider.AI_RESPONSE_START.length;
                const nlIdx = this._stdoutBuf.indexOf('\n', afterMarker);
                if (nlIdx === -1) { break; } // wait for the newline after the start marker
                this._stdoutBuf = this._stdoutBuf.slice(nlIdx + 1);
                this._inResponse = true;
                this._responseBuf = '';
            } else {
                const endIdx = this._stdoutBuf.indexOf(PayaraAIChatViewProvider.AI_RESPONSE_END);
                if (endIdx === -1) {
                    const keep = PayaraAIChatViewProvider.AI_RESPONSE_END.length - 1;
                    if (this._stdoutBuf.length > keep) {
                        this._responseBuf += this._stdoutBuf.slice(0, this._stdoutBuf.length - keep);
                        this._stdoutBuf = this._stdoutBuf.slice(this._stdoutBuf.length - keep);
                    }
                    break;
                }
                this._responseBuf += this._stdoutBuf.slice(0, endIdx);
                this._stdoutBuf = this._stdoutBuf.slice(endIdx + PayaraAIChatViewProvider.AI_RESPONSE_END.length);
                this._inResponse = false;
                this._post({ type: 'response', text: this._responseBuf.trim() });
                this._responseBuf = '';
            }
        }
    }

    private _sendToAgent(text: string): void {
        if (!this._instance?.isStarted()) {
            this._post({ type: 'error', text: 'Payara Server Maven is not running.' });
            return;
        }
        this._instance.sendCommand(text);
    }

    private _resetBuffers(): void {
        this._stdoutBuf = '';
        this._inResponse = false;
        this._responseBuf = '';
    }

    private _post(message: unknown): void {
        this._view?.webview.postMessage(message);
    }

    private _nonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let n = '';
        for (let i = 0; i < 32; i++) {
            n += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return n;
    }

    private _buildHtml(webview: vscode.Webview): string {
        const nonce = this._nonce();
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .msg {
    padding: 6px 10px;
    border-radius: 4px;
    max-width: 92%;
    word-break: break-word;
    white-space: pre-wrap;
    line-height: 1.45;
  }
  .user {
    background: var(--vscode-inputOption-activeBackground);
    align-self: flex-end;
    border-radius: 8px 8px 2px 8px;
  }
  .agent {
    background: var(--vscode-editor-selectionBackground);
    align-self: flex-start;
    border-radius: 8px 8px 8px 2px;
  }
  .system {
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    font-size: 0.85em;
    align-self: center;
    padding: 2px 8px;
  }
  #footer {
    border-top: 1px solid var(--vscode-panel-border);
    padding: 6px 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  #input-row { display: flex; gap: 6px; align-items: flex-end; }
  #input {
    flex: 1;
    resize: none;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 3px;
    padding: 5px 7px;
    font-family: inherit;
    font-size: inherit;
    min-height: 52px;
    max-height: 120px;
    overflow-y: auto;
  }
  #input:focus { outline: none; border-color: var(--vscode-focusBorder); }
  #input::placeholder { color: var(--vscode-input-placeholderForeground); }
  #send {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 0 12px;
    height: 28px;
    cursor: pointer;
    font-size: inherit;
  }
  #send:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  #send:disabled { opacity: 0.45; cursor: not-allowed; }
  #status-bar { display: flex; align-items: center; gap: 5px; font-size: 0.75em; color: var(--vscode-descriptionForeground); }
  #dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vscode-errorForeground); flex-shrink: 0; }
  #dot.on { background: #4caf50; }
  .agent pre { background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.1)); border-left: 3px solid var(--vscode-textBlockQuote-border, #888); border-radius: 0 3px 3px 0; padding: 6px 8px; margin: 4px 0; overflow-x: auto; font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; white-space: pre; }
</style>
</head>
<body>
<div id="messages">
  <div class="msg system">Start Payara Server Maven with AI agent enabled to begin chatting.</div>
</div>
<div id="footer">
  <div id="input-row">
    <textarea id="input" placeholder="Ask the Payara AI agent… (Shift+Enter for new line)" rows="3" disabled></textarea>
    <button id="send" disabled>Send</button>
  </div>
  <div id="status-bar"><div id="dot"></div><span id="status-text">Not connected</span></div>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const inputEl    = document.getElementById('input');
const sendBtn    = document.getElementById('send');
const statusText = document.getElementById('status-text');
const dotEl      = document.getElementById('dot');
let running = false;

function addMsg(text, cls) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  if (cls === 'agent') {
    const BT3 = '\\x60\\x60\\x60';
    const lines = text.split('\\n');
    let inCode = false;
    let buf = [];
    const flush = function(asCode) {
      if (!buf.length) { return; }
      if (asCode) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = buf.join('\\n');
        pre.appendChild(code); div.appendChild(pre);
      } else {
        const s = document.createElement('span');
        s.textContent = buf.join('\\n');
        div.appendChild(s);
      }
      buf = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\\r$/, '');
      if (line.startsWith(BT3)) { flush(inCode); inCode = !inCode; }
      else { buf.push(line); }
    }
    flush(inCode);
  } else {
    div.textContent = text;
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function syncSendBtn() {
  sendBtn.disabled = !running || !inputEl.value.trim();
}

function doSend() {
  const text = inputEl.value.trim();
  if (!text || !running) { return; }
  addMsg(text, 'user');
  vscode.postMessage({ type: 'send', text });
  inputEl.value = '';
  sendBtn.disabled = true;
  statusText.textContent = 'Waiting for response…';
}

sendBtn.addEventListener('click', doSend);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
});
inputEl.addEventListener('input', syncSendBtn);

window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.type) {
    case 'status':
      running = msg.running;
      dotEl.className = running ? 'on' : '';
      inputEl.disabled = !running;
      statusText.textContent = running ? 'Connected to Payara AI Agent' : 'Not connected';
      syncSendBtn();
      break;
    case 'response':
      addMsg(msg.text, 'agent');
      statusText.textContent = running ? 'Connected to Payara AI Agent' : 'Not connected';
      syncSendBtn();
      break;
    case 'error':
      addMsg(msg.text, 'system');
      syncSendBtn();
      break;
  }
});

// Notify the extension that the event listener is registered and we can receive messages.
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }

}
