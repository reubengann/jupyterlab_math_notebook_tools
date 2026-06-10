import { INotebookTracker } from '@jupyterlab/notebook';
import { ILatexTypesetter } from '@jupyterlab/rendermime';
import { IDisposable } from '@lumino/disposable';

import { getRenderedRoot, isMarkdownCellLike } from './cellUtils';
import { MathJaxMacro, normalizeMacros } from './macros';
import { IExtensionSettings } from './settings';

interface IMathJaxDocument {
  inputJax?: Array<{
    options?: {
      macros?: Record<string, MathJaxMacro>;
    };
  }>;
  rerender?: () => void;
}

interface IMathJaxTypesetter {
  mathDocument?: () => IMathJaxDocument;
  typeset?: (node: HTMLElement) => Promise<void> | void;
}

export class MathJaxMacroController implements IDisposable {
  constructor(options: MathJaxMacroController.IOptions) {
    this._tracker = options.tracker;
    this._typesetter = options.typesetter as IMathJaxTypesetter | null;
    this._tracker.widgetAdded.connect(this._onNotebookAdded, this);
    this._tracker.currentChanged.connect(this._onNotebookAdded, this);
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    this._tracker.widgetAdded.disconnect(this._onNotebookAdded, this);
    this._tracker.currentChanged.disconnect(this._onNotebookAdded, this);
    this._isDisposed = true;
  }

  updateSettings(settings: IExtensionSettings): void {
    this._macros = normalizeMacros(settings.mathMacros);
    this._applyMacros();
    void this._retTypesetRenderedCells();
  }

  private _applyMacros(): void {
    const document = this._typesetter?.mathDocument?.();
    const texInput = document?.inputJax?.find(input => input.options);
    if (!texInput?.options) {
      return;
    }

    texInput.options.macros = {
      ...(texInput.options.macros ?? {}),
      ...this._macros
    };
    document?.rerender?.();
  }

  private async _retTypesetRenderedCells(): Promise<void> {
    if (!this._typesetter?.typeset) {
      return;
    }

    const renderedNodes: HTMLElement[] = [];
    this._tracker.forEach(panel => {
      for (const cell of panel.content.widgets) {
        if (!isMarkdownCellLike(cell) || !cell.rendered) {
          continue;
        }
        const node = getRenderedRoot(cell);
        if (node) {
          renderedNodes.push(node);
        }
      }
    });

    for (const node of renderedNodes) {
      await this._typesetter.typeset(node);
    }
  }

  private _onNotebookAdded(): void {
    this._applyMacros();
    void this._retTypesetRenderedCells();
  }

  private _tracker: INotebookTracker;
  private _typesetter: IMathJaxTypesetter | null;
  private _macros: Record<string, MathJaxMacro> = {};
  private _isDisposed = false;
}

export namespace MathJaxMacroController {
  export interface IOptions {
    tracker: INotebookTracker;
    typesetter: ILatexTypesetter | null;
  }
}
