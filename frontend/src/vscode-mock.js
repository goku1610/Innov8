// Mock vscode module for browser compatibility
export const window = {
  showErrorMessage: () => {},
  showWarningMessage: () => {},
  showInformationMessage: () => {}
};

export const workspace = {
  getConfiguration: () => ({
    get: () => undefined
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} })
};

export const languages = {
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  registerHoverProvider: () => ({ dispose: () => {} }),
  registerDefinitionProvider: () => ({ dispose: () => {} }),
  registerReferenceProvider: () => ({ dispose: () => {} }),
  registerDocumentSymbolProvider: () => ({ dispose: () => {} }),
  registerCodeActionsProvider: () => ({ dispose: () => {} }),
  registerCodeLensProvider: () => ({ dispose: () => {} }),
  registerDocumentFormattingEditProvider: () => ({ dispose: () => {} }),
  registerDocumentRangeFormattingEditProvider: () => ({ dispose: () => {} }),
  registerOnTypeFormattingEditProvider: () => ({ dispose: () => {} }),
  registerRenameProvider: () => ({ dispose: () => {} }),
  registerDocumentHighlightProvider: () => ({ dispose: () => {} }),
  registerFoldingRangeProvider: () => ({ dispose: () => {} }),
  registerSelectionRangeProvider: () => ({ dispose: () => {} }),
  registerCallHierarchyProvider: () => ({ dispose: () => {} }),
  registerTypeHierarchyProvider: () => ({ dispose: () => {} }),
  registerLinkedEditingRangeProvider: () => ({ dispose: () => {} }),
  registerInlayHintsProvider: () => ({ dispose: () => {} }),
  registerInlineValuesProvider: () => ({ dispose: () => {} }),
  registerEvaluatableExpressionProvider: () => ({ dispose: () => {} }),
  registerInlineCompletionItemProvider: () => ({ dispose: () => {} })
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: () => Promise.resolve()
};

export const Uri = {
  file: (path) => ({ fsPath: path, scheme: 'file' }),
  parse: (uri) => ({ fsPath: uri, scheme: 'file' })
};

export const Range = class {};
export const Position = class {};
export const Location = class {};
export const Diagnostic = class {};
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 };
export const CompletionItemKind = {};
export const SymbolKind = {};
export const TextEdit = class {};
export const WorkspaceEdit = class {};
export const CodeActionKind = {};
export const CodeLens = class {};
export const DocumentSymbol = class {};
export const CallHierarchyItem = class {};
export const TypeHierarchyItem = class {};
export const InlayHint = class {};
export const InlineValue = class {};
export const EvaluatableExpression = class {};
export const InlineCompletionItem = class {};
export const LinkedEditingRanges = class {};
export const FoldingRange = class {};
export const SelectionRange = class {};
export const DocumentHighlight = class {};
export const DocumentHighlightKind = {};
export const SignatureHelp = class {};
export const SignatureInformation = class {};
export const ParameterInformation = class {};
export const Hover = class {};
export const MarkdownString = class {};
export const CancellationToken = class {};
export const ProgressType = class {};
export const Event = class {};
export const Disposable = class {};
export const ExtensionContext = class {};
export const ExtensionMode = {};
export const ExtensionKind = {};
export const Extension = class {};
export const extensions = {
  getExtension: () => undefined,
  all: []
};
export const env = {
  language: 'en',
  machineId: 'mock'
};
export const version = '1.0.0';
