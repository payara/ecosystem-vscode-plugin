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
import * as http from 'http';
import { PayaraServerMavenInstance } from '../server/maven/PayaraServerMavenInstance';

export class PayaraAIChatViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'payara.ai.chat';

    // Markers emitted by the Payara Server Maven Plugin to delimit AI responses in stdout.
    public static readonly AI_RESPONSE_START = '%%PAYARA-AI-START%%';
    public static readonly AI_RESPONSE_END = '%%PAYARA-AI-END%%';

    private _view?: vscode.WebviewView;
    private _instance?: PayaraServerMavenInstance;

    private _agentBaseUrl?: string;  // e.g. "http://localhost:PORT"
    private _streamUrl?: string;
    private _sseRequest?: http.ClientRequest;
    private _sseBuf = '';

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
                this._post({ type: 'status', running: this._instance?.isStarted() === true });
            } else if (msg.type === 'send') {
                this._sendToAgent(msg.text);
            } else if (msg.type === 'chart-disconnect') {
                this._stopChart(msg.chartId);
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
        this._disconnectFromStream();
        this._post({ type: 'status', running: false });
    }

    /**
     * Called by the controller for every chunk of Maven process stdout/stderr.
     * Scans for %%PAYARA-AI-START%% / %%PAYARA-AI-END%% delimiters and forwards
     * the enclosed text to the WebView as an AI response message.
     */
    public handleData(data: string): void {
        // Detect the SSE stream URL emitted once by the agent at startup.
        const SU = '%%PAYARA-AI-STREAM-URL%%';
        let si = 0, su: number;
        while ((su = data.indexOf(SU, si)) !== -1) {
            const after = su + SU.length;
            const end = data.indexOf(SU, after);
            if (end === -1) { break; }
            const url = data.slice(after, end).trim();
            if (url && !this._streamUrl) { this._connectToStream(url); }
            si = end + SU.length;
        }

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

    private _stopChart(chartId: string): void {
        if (!this._agentBaseUrl) { return; }
        try {
            const parsed = new URL(`${this._agentBaseUrl}/api/metrics/charts/${encodeURIComponent(chartId)}/stop`);
            const req = http.request({
                hostname: parsed.hostname,
                port: parseInt(parsed.port || '80'),
                path: parsed.pathname,
                method: 'POST',
                headers: { 'Content-Length': '0' }
            }, () => {});
            req.on('error', () => {});
            req.end();
        } catch (_) {}
    }

    private _connectToStream(url: string): void {
        this._disconnectFromStream();
        this._streamUrl = url;
        try {
            const parsed = new URL(url);
            this._agentBaseUrl = `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
            const req = http.request({
                hostname: parsed.hostname,
                port: parseInt(parsed.port || '80'),
                path: parsed.pathname,
                method: 'GET',
                headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' }
            }, (res) => {
                res.setEncoding('utf8');
                res.on('data', (chunk: string) => {
                    this._sseBuf += chunk;
                    this._processSseBuffer();
                });
                res.on('end', () => this._scheduleStreamReconnect());
                res.on('error', () => this._scheduleStreamReconnect());
            });
            req.on('error', () => this._scheduleStreamReconnect());
            req.end();
            this._sseRequest = req;
        } catch (_) {}
    }

    private _disconnectFromStream(): void {
        if (this._sseRequest) {
            try { this._sseRequest.destroy(); } catch (_) {}
            this._sseRequest = undefined;
        }
        this._streamUrl = undefined;
        this._agentBaseUrl = undefined;
        this._sseBuf = '';
    }

    private _scheduleStreamReconnect(): void {
        const url = this._streamUrl;
        if (url && this._instance?.isStarted()) {
            setTimeout(() => { if (this._instance?.isStarted()) { this._connectToStream(url); } }, 3000);
        }
    }

    private _processSseBuffer(): void {
        let pos: number;
        while ((pos = this._sseBuf.indexOf('\n\n')) !== -1) {
            const block = this._sseBuf.slice(0, pos);
            this._sseBuf = this._sseBuf.slice(pos + 2);
            this._handleSseEvent(block);
        }
    }

    private _handleSseEvent(block: string): void {
        let eventType = 'message';
        let data = '';
        for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) { eventType = line.slice(7).trim(); }
            else if (line.startsWith('data: ')) { data += line.slice(6); }
        }
        if (!data) { return; }
        try {
            const json = JSON.parse(data.trim());
            switch (eventType) {
                case 'metric':
                    this._post({ type: 'chart-data', chartId: json.chartId, point: json.point });
                    break;
                case 'chart-def':
                    this._post({ type: 'chart-def', chartId: json.chartId, chartType: json.chartType, title: json.title, series: json.series });
                    break;
                case 'chart-remove':
                    this._post({ type: 'chart-remove', chartId: json.chartId });
                    break;
            }
        } catch (_) {}
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
    overflow-x: auto;
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
  .chart-card { background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08)); border: 1px solid rgba(127,127,127,0.35); border-radius: 4px; padding: 6px 8px 4px; margin: 4px 0; width: 100%; min-width: 340px; box-sizing: border-box; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
  .chart-title { font-size: 0.8em; color: var(--vscode-descriptionForeground); }
  .chart-stop-btn { font-size: 0.7em; background: transparent; color: var(--vscode-descriptionForeground); border: 1px solid rgba(127,127,127,0.5); border-radius: 2px; padding: 1px 6px; cursor: pointer; opacity: 0.7; flex-shrink: 0; }
  .chart-stop-btn:hover:not(:disabled) { opacity: 1; color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
  .chart-stop-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .chart-card canvas { display: block; width: 100%; }
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

// ── Chart rendering ──────────────────────────────────────────────────────────
const liveCharts = {};

function renderTextBlock(container, text) {
  const BT3 = '\\x60\\x60\\x60';
  const lines = text.split('\\n');
  let inCode = false, buf = [];
  const flush = function(asCode) {
    if (!buf.length) { return; }
    if (asCode) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = buf.join('\\n');
      pre.appendChild(code); container.appendChild(pre);
    } else {
      const joined = buf.join('\\n');
      if (joined.trim().length > 0) {
        const s = document.createElement('span');
        s.textContent = joined;
        container.appendChild(s);
      }
    }
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\\r$/, '');
    if (line.startsWith(BT3)) { flush(inCode); inCode = !inCode; }
    else { buf.push(line); }
  }
  flush(inCode);
}

function chartCssHeight(spec) {
  var type = spec.type || 'line';
  var ds = spec.live ? (spec.live.series || []) : (spec.static ? (spec.static.datasets || []) : []);
  var n = ds.length || 1;
  if (type === 'gauge') { return Math.max(160, 110 + Math.ceil(n / 3) * 110); }
  if (type === 'sparkline') { return Math.max(80, n * 36 + 16); }
  if (type === 'heatmap') { return Math.max(80, n * 28 + 24); }
  if (type === 'stacked-area') { return 200; }
  return 180;
}

function fmtVal(v) {
  if (!isFinite(v)) { return '?'; }
  if (Math.abs(v) >= 1e6) { return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; }
  if (Math.abs(v) >= 1e3) { return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'; }
  if (Math.abs(v) < 10 && v !== Math.round(v)) { return v.toFixed(1); }
  return Math.round(v).toString();
}

function niceTicks(maxVal, count) {
  if (maxVal <= 0) { return [0, 1]; }
  var raw = maxVal / count;
  var mag = Math.pow(10, Math.floor(Math.log10(raw)));
  var nice = [1, 2, 2.5, 5, 10].find(function(f) { return f * mag >= raw; }) || 10;
  var step = nice * mag;
  var ticks = [];
  for (var t = 0; t <= maxVal * 1.001; t += step) {
    ticks.push(Math.round(t * 1e9) / 1e9);
    if (ticks.length > count + 1) { break; }
  }
  return ticks;
}

function renderChartBlock(container, spec) {
  const card = document.createElement('div');
  card.className = 'chart-card';
  const header = document.createElement('div');
  header.className = 'chart-header';
  if (spec.title) {
    const t = document.createElement('span');
    t.className = 'chart-title';
    t.textContent = spec.title;
    header.appendChild(t);
  }
  const canvas = document.createElement('canvas');
  var stopBtn = null;
  if (spec.live && spec.live.chartId) {
    stopBtn = document.createElement('button');
    stopBtn.className = 'chart-stop-btn';
    stopBtn.textContent = 'Disconnect';
    (function(chartId, btn, cv) {
      btn.addEventListener('click', function() {
        btn.textContent = 'Stopped';
        btn.disabled = true;
        var ctx = cv.getContext('2d');
        if (ctx) {
          var dpr = window.devicePixelRatio || 1;
          ctx.save(); ctx.scale(dpr, dpr);
          ctx.fillStyle = 'rgba(128,128,128,0.35)';
          ctx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
          ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
          ctx.font = '10px var(--vscode-font-family, monospace)';
          ctx.fillText('(disconnected)', 4, 14);
          ctx.restore();
        }
        delete liveCharts[chartId];
        vscode.postMessage({ type: 'chart-disconnect', chartId: chartId });
      });
    })(spec.live.chartId, stopBtn, canvas);
    header.appendChild(stopBtn);
  }
  card.appendChild(header);
  canvas.style.height = chartCssHeight(spec) + 'px';
  card.appendChild(canvas);
  container.appendChild(card);
  setTimeout(function() {
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.offsetWidth, cssH = canvas.offsetHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (spec.static) {
      drawChart(canvas, spec.type || 'line', spec.static);
    } else if (spec.live && spec.live.chartId) {
      liveCharts[spec.live.chartId] = { canvas: canvas, spec: spec, points: [], timestamps: [], stopBtn: stopBtn };
      drawWaiting(canvas);
    }
  }, 0);
}

function drawWaiting(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(127,127,127,0.55)';
  ctx.font = '10px var(--vscode-font-family, monospace)';
  ctx.textAlign = 'center';
  ctx.fillText('Waiting for data…', W / 2, H / 2 + 3);
  ctx.restore();
}

function updateLiveChart(chartId, point) {
  const ch = liveCharts[chartId];
  if (!ch) { return; }
  ch.points.push(point);
  var now = new Date();
  ch.timestamps.push(now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0') + ':' + now.getSeconds().toString().padStart(2,'0'));
  if (ch.points.length > 60) { ch.points.shift(); ch.timestamps.shift(); }
  const liveSeries = ch.spec.live.series || [];
  const type = ch.spec.type || 'line';
  const datasets = liveSeries.map(function(s) {
    return { label: s.label, data: ch.points.map(function(p) { var v = p[s.label]; return (v === undefined || v === null) ? null : v; }), color: s.color, dashed: s.dashed };
  });
  const hasData = datasets.some(function(ds) { return ds.data.some(function(v) { return v !== null && v !== undefined; }); });
  if (!hasData) { drawWaiting(ch.canvas); return; }
  drawChart(ch.canvas, type, type === 'heatmap' ? { labels: ch.timestamps, datasets: datasets } : { datasets: datasets });
}

function drawChart(canvas, type, data) {
  if (type === 'bar') { drawBarChart(canvas, data); }
  else if (type === 'gauge') { drawGaugeChart(canvas, data); }
  else if (type === 'sparkline') { drawSparklineChart(canvas, data); }
  else if (type === 'stacked-area') { drawStackedAreaChart(canvas, data); }
  else if (type === 'heatmap') { drawHeatmapChart(canvas, data); }
  else { drawLineChart(canvas, data); }
}

function drawLineChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const TW = canvas.width / dpr, TH = canvas.height / dpr;
  const AX = 36, LEG = 18;
  const W = TW - AX, H = TH - LEG;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);
  if (!data.datasets || !data.datasets.length) { ctx.restore(); return; }
  const allVals = data.datasets.reduce(function(a, d) { return a.concat((d.data || []).filter(function(v) { return v !== null && v !== undefined; })); }, []);
  const maxVal = Math.max.apply(null, allVals.concat([1]));
  const n = (data.datasets[0].data || []).length;
  if (n < 1) { ctx.restore(); return; }
  const toX = function(i) { return AX + (n < 2 ? W / 2 : Math.round((i / (n - 1)) * (W - 1))); };
  const toY = function(v) { return Math.round(H - (v / maxVal) * (H - 6)) + 3; };
  // Y-axis ticks
  const ticks = niceTicks(maxVal, 4);
  ctx.font = '8px var(--vscode-font-family, monospace)';
  ctx.fillStyle = 'rgba(127,127,127,0.55)';
  ctx.textAlign = 'right';
  ticks.forEach(function(t) {
    const y = toY(t);
    ctx.fillText(fmtVal(t), AX - 3, y + 3);
    ctx.beginPath(); ctx.moveTo(AX, y); ctx.lineTo(AX + W, y);
    ctx.strokeStyle = 'rgba(127,127,127,0.1)'; ctx.lineWidth = 0.5; ctx.stroke();
  });
  ctx.textAlign = 'left';
  // Series
  data.datasets.forEach(function(ds, di) {
    const pts = ds.data || [];
    if (!pts.length) { return; }
    const validPts = pts.filter(function(v) { return v !== null && v !== undefined; });
    if (!validPts.length) { return; }
    if (!ds.dashed) {
      ctx.beginPath();
      var started = false;
      pts.forEach(function(v, i) {
        if (v === null || v === undefined) { started = false; return; }
        if (!started) { ctx.moveTo(toX(i), toY(v)); started = true; } else { ctx.lineTo(toX(i), toY(v)); }
      });
      var lastValidIdx = pts.reduce(function(a, v, i) { return (v !== null && v !== undefined) ? i : a; }, 0);
      ctx.lineTo(toX(lastValidIdx), H + LEG); ctx.lineTo(AX, H + LEG); ctx.closePath();
      ctx.fillStyle = (ds.color || '#4caf50') + '28'; ctx.fill();
    }
    ctx.beginPath();
    var lineStarted = false;
    pts.forEach(function(v, i) {
      if (v === null || v === undefined) { lineStarted = false; return; }
      if (!lineStarted) { ctx.moveTo(toX(i), toY(v)); lineStarted = true; } else { ctx.lineTo(toX(i), toY(v)); }
    });
    ctx.strokeStyle = ds.color || '#4caf50'; ctx.lineWidth = 1.5;
    ctx.setLineDash(ds.dashed ? [3, 3] : []); ctx.stroke(); ctx.setLineDash([]);
    const latest = validPts[validPts.length - 1];
    ctx.fillStyle = ds.color || '#4caf50';
    ctx.font = '9px var(--vscode-font-family, monospace)';
    ctx.fillText(ds.label + ': ' + (typeof latest === 'number' ? latest.toFixed(1) : String(latest)), AX + 2 + di * 120, TH - 3);
  });
  ctx.restore();
}

function drawBarChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const TW = canvas.width / dpr, TH = canvas.height / dpr;
  const AX = 36, LEG = 18;
  const W = TW - AX, H = TH - LEG;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);
  if (!data.labels || !data.datasets || !data.datasets.length) { ctx.restore(); return; }
  const n = data.labels.length;
  const allVals = data.datasets.reduce(function(a, d) { return a.concat(d.data || []); }, []);
  const maxVal = Math.max.apply(null, allVals.concat([1]));
  // Y-axis ticks
  const ticks = niceTicks(maxVal, 4);
  ctx.font = '8px var(--vscode-font-family, monospace)'; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(127,127,127,0.55)';
  ticks.forEach(function(t) {
    const y = Math.round(H - (t / maxVal) * (H - 4)) + 3;
    ctx.fillText(fmtVal(t), AX - 3, y + 3);
    ctx.beginPath(); ctx.moveTo(AX, y); ctx.lineTo(AX + W, y);
    ctx.strokeStyle = 'rgba(127,127,127,0.1)'; ctx.lineWidth = 0.5; ctx.stroke();
  });
  ctx.textAlign = 'left';
  const groupW = (W - 2) / n;
  const barW = Math.max(2, (groupW - 4) / data.datasets.length);
  const colors = ['#4caf50', '#2196f3', '#ff9800', '#e53935'];
  data.datasets.forEach(function(ds, di) {
    ctx.fillStyle = ds.color || colors[di % colors.length];
    (ds.data || []).forEach(function(v, i) {
      const x = AX + 1 + i * groupW + di * barW;
      const h = Math.round((v / maxVal) * (H - 4));
      ctx.fillRect(x, H - h, barW - 1, h);
    });
  });
  ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
  ctx.font = '9px var(--vscode-font-family, monospace)';
  data.labels.forEach(function(lbl, i) { ctx.fillText(String(lbl).substring(0, 8), AX + 1 + i * groupW, TH - 3); });
  ctx.restore();
}
function drawGaugeChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);
  if (!data.datasets || !data.datasets.length) { ctx.restore(); return; }
  // Solid series = values to chart; dashed series = reference max (not shown as its own gauge)
  const solid = data.datasets.filter(function(ds) { return !ds.dashed; });
  const dashed = data.datasets.filter(function(ds) { return ds.dashed; });
  if (!solid.length) { ctx.restore(); return; }
  const n = solid.length;
  const slotW = W / n;
  const r = Math.min(slotW * 0.38, H * 0.54);
  const cy = Math.min(H * 0.65, r + 10);
  // Global max fallback: max across all solid series latest values
  const solidLatests = solid.map(function(ds) {
    var pts = (ds.data || []).filter(function(v) { return v !== null && v !== undefined; });
    return pts.length ? pts[pts.length - 1] : 0;
  });
  const globalMax = Math.max.apply(null, solidLatests.concat([1]));
  // If there's a dashed reference series, use its latest value as the max
  const refPts = dashed.length ? (dashed[0].data || []).filter(function(v) { return v !== null && v !== undefined; }) : [];
  const refMax = refPts.length ? refPts[refPts.length - 1] : null;
  const trackW = Math.max(4, Math.round(r * 0.22));
  solid.forEach(function(ds, di) {
    const pts = (ds.data || []).filter(function(v) { return v !== null && v !== undefined; });
    if (!pts.length) { return; }
    const latest = pts[pts.length - 1];
    const maxVal = refMax !== null ? refMax : globalMax;
    const pct = Math.min(1, Math.max(0, maxVal > 0 ? latest / maxVal : 0));
    const color = ds.color || '#4caf50';
    const gx = di * slotW + slotW / 2;
    // Background track (full semicircle π → 2π)
    ctx.beginPath();
    ctx.arc(gx, cy, r, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(127,127,127,0.18)';
    ctx.lineWidth = trackW; ctx.lineCap = 'round'; ctx.stroke();
    // Value arc
    if (pct > 0.01) {
      ctx.beginPath();
      ctx.arc(gx, cy, r, Math.PI, Math.PI + pct * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = trackW; ctx.lineCap = 'round'; ctx.stroke();
    }
    // Value text
    var fontSize = Math.max(9, Math.round(r * 0.32));
    ctx.fillStyle = color;
    ctx.font = 'bold ' + fontSize + 'px var(--vscode-font-family, monospace)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(typeof latest === 'number' ? latest.toFixed(1) : String(latest), gx, cy - r * 0.08);
    // Percent text (small, below value)
    var pctStr = Math.round(pct * 100) + '%';
    ctx.font = Math.max(7, Math.round(r * 0.2)) + 'px var(--vscode-font-family, monospace)';
    ctx.fillStyle = 'rgba(127,127,127,0.7)';
    ctx.fillText(pctStr, gx, cy + r * 0.28);
    // Label text below the arc
    ctx.font = Math.max(8, Math.round(r * 0.2)) + 'px var(--vscode-font-family, monospace)';
    ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
    ctx.fillText(ds.label, gx, cy + r * 0.62);
  });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
function drawSparklineChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);
  if (!data.datasets || !data.datasets.length) { ctx.restore(); return; }
  const valid = data.datasets.filter(function(ds) {
    return (ds.data || []).some(function(v) { return v !== null && v !== undefined; });
  });
  if (!valid.length) { ctx.restore(); return; }
  const n = valid.length;
  const valueColW = 68;
  const plotW = W - valueColW;
  const rowH = H / n;
  // Shared scale across all series so rows are comparable
  const allVals = valid.reduce(function(a, ds) {
    return a.concat((ds.data || []).filter(function(v) { return v !== null && v !== undefined; }));
  }, []);
  const maxVal = Math.max.apply(null, allVals.concat([1]));
  const minVal = Math.min.apply(null, allVals.concat([0]));
  const range = maxVal - minVal || 1;
  valid.forEach(function(ds, ri) {
    const pts = ds.data || [];
    const color = ds.color || '#4caf50';
    const pad = 3;
    const y0 = ri * rowH + pad, rH = rowH - pad * 2;
    const m = pts.length;
    const toX = function(i) { return m < 2 ? plotW / 2 : Math.round((i / (m - 1)) * (plotW - 1)); };
    const toY = function(v) { return y0 + rH - ((v - minVal) / range) * rH; };
    // Fill
    ctx.beginPath();
    var s = false, li = 0;
    pts.forEach(function(v, i) {
      if (v === null || v === undefined) { s = false; return; }
      li = i;
      if (!s) { ctx.moveTo(toX(i), toY(v)); s = true; } else { ctx.lineTo(toX(i), toY(v)); }
    });
    ctx.lineTo(toX(li), y0 + rH); ctx.lineTo(toX(0), y0 + rH); ctx.closePath();
    ctx.fillStyle = color + '22'; ctx.fill();
    // Line
    ctx.beginPath(); s = false;
    pts.forEach(function(v, i) {
      if (v === null || v === undefined) { s = false; return; }
      if (!s) { ctx.moveTo(toX(i), toY(v)); s = true; } else { ctx.lineTo(toX(i), toY(v)); }
    });
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash([]); ctx.stroke();
    // Right-side label + value
    const validPts = pts.filter(function(v) { return v !== null && v !== undefined; });
    const latest = validPts.length ? validPts[validPts.length - 1] : null;
    const midY = ri * rowH + rowH / 2 + 3;
    ctx.fillStyle = color;
    ctx.font = '8px var(--vscode-font-family, monospace)';
    ctx.textAlign = 'left';
    const valStr = latest !== null ? (typeof latest === 'number' ? latest.toFixed(1) : String(latest)) : '—';
    ctx.fillText(ds.label + ': ' + valStr, plotW + 3, midY);
  });
  ctx.textAlign = 'left'; ctx.restore();
}

function drawStackedAreaChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const TW = canvas.width / dpr, TH = canvas.height / dpr;
  const AX = 36, LEG = 18;
  const W = TW - AX, H = TH - LEG;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);
  if (!data.datasets || !data.datasets.length) { ctx.restore(); return; }
  const n = (data.datasets[0].data || []).length;
  if (n < 1) { ctx.restore(); return; }
  const num = data.datasets.length;
  const stacks = [], prev = new Array(n).fill(0);
  for (var di = 0; di < num; di++) {
    const pts = data.datasets[di].data || [];
    const bottom = prev.slice(), top = prev.slice();
    for (var i = 0; i < n; i++) {
      const v = pts[i];
      if (v !== null && v !== undefined) { top[i] = (top[i] || 0) + v; prev[i] = top[i]; }
    }
    stacks.push({ ds: data.datasets[di], bottom: bottom, top: top });
  }
  const maxVal = Math.max.apply(null, prev.concat([1]));
  const toX = function(i) { return AX + (n < 2 ? W / 2 : Math.round((i / (n - 1)) * (W - 1))); };
  const toY = function(v) { return Math.round(H - (v / maxVal) * (H - 6)) + 3; };
  // Y-axis ticks
  const ticks = niceTicks(maxVal, 4);
  ctx.font = '8px var(--vscode-font-family, monospace)'; ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(127,127,127,0.55)';
  ticks.forEach(function(t) {
    const y = toY(t);
    ctx.fillText(fmtVal(t), AX - 3, y + 3);
    ctx.beginPath(); ctx.moveTo(AX, y); ctx.lineTo(AX + W, y);
    ctx.strokeStyle = 'rgba(127,127,127,0.1)'; ctx.lineWidth = 0.5; ctx.stroke();
  });
  ctx.textAlign = 'left';
  stacks.forEach(function(s, si) {
    const color = s.ds.color || '#4caf50';
    ctx.beginPath();
    s.top.forEach(function(v, i) { i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)); });
    for (var i = n - 1; i >= 0; i--) { ctx.lineTo(toX(i), toY(s.bottom[i] || 0)); }
    ctx.closePath(); ctx.fillStyle = color + '70'; ctx.fill();
    ctx.beginPath();
    s.top.forEach(function(v, i) { i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)); });
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    const latest = s.top[n - 1] - (s.bottom[n - 1] || 0);
    ctx.fillStyle = color; ctx.font = '9px var(--vscode-font-family, monospace)';
    ctx.fillText(s.ds.label + ': ' + (typeof latest === 'number' ? latest.toFixed(1) : latest), AX + 2 + si * 120, TH - 3);
  });
  ctx.restore();
}

function drawHeatmapChart(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.scale(dpr, dpr);
  if (!data.datasets || !data.datasets.length || !data.labels || !data.labels.length) { ctx.restore(); return; }
  const numCols = data.labels.length, numRows = data.datasets.length;
  const labelW = 58, labelH = 14;
  const cellW = (W - labelW) / numCols, cellH = (H - labelH) / numRows;
  const allVals = data.datasets.reduce(function(a, ds) {
    return a.concat((ds.data || []).filter(function(v) { return v !== null && v !== undefined && !isNaN(v); }));
  }, []);
  const minVal = Math.min.apply(null, allVals.concat([0]));
  const maxVal = Math.max.apply(null, allVals.concat([1]));
  const range = maxVal - minVal || 1;
  data.datasets.forEach(function(ds, ri) {
    (ds.data || []).forEach(function(val, ci) {
      if (val === null || val === undefined || isNaN(val)) { return; }
      const intensity = (val - minVal) / range;
      ctx.fillStyle = heatColor(ds.color || '#4caf50', intensity);
      ctx.fillRect(labelW + ci * cellW, ri * cellH, cellW - 1, cellH - 1);
    });
    ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
    ctx.font = '8px var(--vscode-font-family, monospace)';
    ctx.textAlign = 'right';
    ctx.fillText(ds.label.substring(0, 10), labelW - 2, ri * cellH + cellH / 2 + 3);
  });
  ctx.textAlign = 'center'; ctx.font = '7px var(--vscode-font-family, monospace)';
  ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
  data.labels.forEach(function(lbl, ci) {
    ctx.fillText(String(lbl).substring(0, 6), labelW + ci * cellW + cellW / 2, H - 2);
  });
  ctx.textAlign = 'left'; ctx.restore();
}

function heatColor(hex, intensity) {
  var r = parseInt(hex.slice(1, 3), 16) || 76;
  var g = parseInt(hex.slice(3, 5), 16) || 175;
  var b = parseInt(hex.slice(5, 7), 16) || 80;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (0.08 + intensity * 0.88).toFixed(2) + ')';
}
// ── End chart rendering ───────────────────────────────────────────────────────

function addMsg(text, cls) {
  const div = document.createElement('div');
  div.className = 'msg ' + cls;
  if (cls === 'agent') {
    const parts = text.split('%%CHART%%');
    parts.forEach(function(part, i) {
      if (i % 2 === 0) {
        renderTextBlock(div, part);
      } else {
        try { renderChartBlock(div, JSON.parse(part.trim())); }
        catch (_) { renderTextBlock(div, part); }
      }
    });
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
    case 'chart-data':
      updateLiveChart(msg.chartId, msg.point);
      break;
    case 'chart-remove':
      var remCh = liveCharts[msg.chartId];
      if (remCh) {
        if (remCh.stopBtn) { remCh.stopBtn.textContent = 'Stopped'; remCh.stopBtn.disabled = true; }
        var rCtx = remCh.canvas.getContext('2d');
        if (rCtx) {
          rCtx.fillStyle = 'rgba(128,128,128,0.35)';
          rCtx.fillRect(0, 0, remCh.canvas.width, remCh.canvas.height);
          rCtx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
          rCtx.font = '10px var(--vscode-font-family, monospace)';
          rCtx.fillText('(stopped)', 4, 14);
        }
        delete liveCharts[msg.chartId];
      }
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
