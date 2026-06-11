import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ILatexTypesetter } from '@jupyterlab/rendermime';
import { IDisposable } from '@lumino/disposable';

import { isMarkdownCellLike } from './cellUtils';
import { buildMathJaxSeed, normalizeMacros } from './macros';
import { IExtensionSettings } from './settings';

export class MathJaxSeedController implements IDisposable {
  constructor(options: MathJaxSeedController.IOptions) {
    this._tracker = options.tracker;
    this._typesetter = options.typesetter;
    this._settings = options.settings;

    this._tracker.widgetAdded.connect((_, panel) => {
      void this._seedPanel(panel);
    });
    if (this._tracker.currentWidget) {
      void this._seedPanel(this._tracker.currentWidget);
    }
  }

  updateSettings(settings: IExtensionSettings): void {
    this._settings = settings;
    this._seededPanels = new WeakSet();
    this._seededSeed = '';
    for (const panel of this._panels) {
      void this._seedPanel(panel);
    }
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    this._isDisposed = true;
    this._seededPanels = new WeakSet();
    this._panels = new Set();
  }

  private async _seedPanel(panel: NotebookPanel): Promise<void> {
    if (this._isDisposed || this._seededPanels.has(panel)) {
      return;
    }
    this._panels.add(panel);

    panel.disposed.connect(() => {
      this._panels.delete(panel);
    });

    const seedText = this._seedText();
    if (!seedText) {
      return;
    }

    this._seededPanels.add(panel);

    try {
      await this._seedTypesetter(seedText);
      this._refreshRenderedMarkdown(panel);
    } catch (reason) {
      console.warn(
        'Unable to seed MathJax macros for JupyterLab Math Notebook Tools.',
        reason
      );
    }
  }

  private async _seedTypesetter(seedText: string): Promise<void> {
    if (this._seededSeed === seedText) {
      return;
    }

    const seed = document.createElement('div');
    seed.hidden = true;
    seed.textContent = seedText;
    document.body.appendChild(seed);

    try {
      await this._typesetter.typeset(seed);
      this._seededSeed = seedText;
    } finally {
      seed.remove();
    }
  }

  private _seedText(): string {
    return buildMathJaxSeed(
      normalizeMacros(
        this._settings.mathMacros,
        this._settings.enableBoldVectorMacro
      )
    );
  }

  private _refreshRenderedMarkdown(panel: NotebookPanel): void {
    for (const cell of panel.content.widgets as unknown[]) {
      if (isMarkdownCellLike(cell) && cell.rendered) {
        cell.update?.();
      }
    }
  }

  private _tracker: INotebookTracker;
  private _typesetter: ILatexTypesetter;
  private _settings: IExtensionSettings;
  private _seededPanels = new WeakSet<NotebookPanel>();
  private _seededSeed = '';
  private _panels = new Set<NotebookPanel>();
  private _isDisposed = false;
}

export namespace MathJaxSeedController {
  export interface IOptions {
    tracker: INotebookTracker;
    typesetter: ILatexTypesetter;
    settings: IExtensionSettings;
  }
}
