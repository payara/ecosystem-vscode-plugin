'use strict';

// Intercept require('vscode') before any source module loads it.
const Module = require('module');
const original = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'vscode') { return 'vscode'; }
    return original(request, parent, isMain, options);
};

class EventEmitter {
    constructor() { this.event = () => {}; }
    fire() {}
    dispose() {}
}

const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (_key) => undefined,
            update: () => Promise.resolve(),
        }),
        workspaceFolders: undefined,
        onDidSaveTextDocument: () => ({ dispose: () => {} }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        getWorkspaceFolder: () => undefined,
    },
    window: {
        showErrorMessage: () => Promise.resolve(undefined),
        showWarningMessage: () => Promise.resolve(undefined),
        showInformationMessage: () => Promise.resolve(undefined),
        createTerminal: () => ({ show: () => {} }),
        createQuickPick: () => ({
            show: () => {}, hide: () => {}, dispose: () => {},
            onDidAccept: () => {}, onDidHide: () => {},
            items: [], busy: false, placeholder: '', ignoreFocusOut: false,
        }),
        withProgress: (_opts, task) => task({ report: () => {} }),
        registerTreeDataProvider: () => ({ dispose: () => {} }),
    },
    commands: {
        registerCommand: () => ({ dispose: () => {} }),
        executeCommand: () => Promise.resolve(),
    },
    EventEmitter,
    Uri: {
        file: (p) => ({ fsPath: p, toString: () => `file://${p}` }),
        parse: (s) => ({ fsPath: s, toString: () => s }),
    },
    ProgressLocation: { Notification: 15, Window: 10, SourceControl: 1 },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    debug: {
        startDebugging: () => Promise.resolve(true),
        onDidTerminateDebugSession: () => ({ dispose: () => {} }),
    },
    extensions: {
        getExtension: () => undefined,
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class ThemeIcon { constructor(id) { this.id = id; } },
};

require.cache['vscode'] = {
    id: 'vscode',
    filename: 'vscode',
    loaded: true,
    exports: vscodeMock,
    parent: null,
    children: [],
    paths: [],
};
