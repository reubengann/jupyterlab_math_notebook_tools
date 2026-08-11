import { JupyterFrontEnd } from '@jupyterlab/application';
import { SystemClipboard } from '@jupyterlab/apputils';
import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IDisposable } from '@lumino/disposable';

import {
  getCellSource,
  getRenderedRoot,
  IMarkdownCellLike,
  isMarkdownCellLike
} from './cellUtils';
import { extractDisplayEquations, wrapDisplayEquation } from './tex';

type ClipboardLike = ReturnType<typeof SystemClipboard.getInstance>;

export const ADD_EQUATION_FORGE_ENTRY_COMMAND =
  'jupyterlab-equation-forge:add-equation-entry';

export class EquationHoverController implements IDisposable {
  constructor(options: EquationHoverController.IOptions) {
    this._app = options.app;
    this._tracker = options.tracker;
    this._trans = (options.translator ?? nullTranslator).load('jupyterlab');
    this._clipboard = SystemClipboard.getInstance();
    this._tracker.widgetAdded.connect((_, panel) => this._attach(panel));
    this._tracker.currentChanged.connect(this._onCurrentChanged, this);
    this._app.commands.commandChanged.connect(this._onCommandChanged, this);
    if (this._tracker.currentWidget) {
      this._attach(this._tracker.currentWidget);
    }
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._tracker.currentChanged.disconnect(this._onCurrentChanged, this);
    this._app.commands.commandChanged.disconnect(this._onCommandChanged, this);
    for (const [panel, observer] of this._observers) {
      observer.disconnect();
      this._removeButtons(panel);
    }
    this._observers.clear();
    for (const timer of this._installTimers.values()) {
      window.clearTimeout(timer);
    }
    this._installTimers.clear();
    for (const timer of this._positionTimers.values()) {
      window.clearTimeout(timer);
    }
    this._positionTimers.clear();
  }

  private _attach(panel: NotebookPanel): void {
    if (this._observers.has(panel)) {
      return;
    }

    const observer = new MutationObserver(() => this._scheduleInstall(panel));
    observer.observe(panel.node, { childList: true, subtree: true });
    this._observers.set(panel, observer);
    this._scheduleInstall(panel);

    panel.disposed.connect(() => {
      observer.disconnect();
      this._observers.delete(panel);
      this._removeButtons(panel);
      const installTimer = this._installTimers.get(panel);
      if (installTimer !== undefined) {
        window.clearTimeout(installTimer);
        this._installTimers.delete(panel);
      }
      const positionTimer = this._positionTimers.get(panel);
      if (positionTimer !== undefined) {
        window.clearTimeout(positionTimer);
        this._positionTimers.delete(panel);
      }
    });
  }

  private _onCurrentChanged(
    _: INotebookTracker,
    panel: NotebookPanel | null
  ): void {
    if (!panel) {
      return;
    }
    this._scheduleInstall(panel);
    this._schedulePosition(panel);
  }

  private _scheduleInstall(panel: NotebookPanel): void {
    const existing = this._installTimers.get(panel);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timer = window.setTimeout(() => {
      this._installTimers.delete(panel);
      this._installButtons(panel);
    }, 50);
    this._installTimers.set(panel, timer);
  }

  private _installButtons(panel: NotebookPanel): void {
    const widgets = panel.content.widgets as unknown[];
    for (const cell of widgets) {
      if (!isMarkdownCellLike(cell) || !cell.rendered) {
        continue;
      }

      const root = getRenderedRoot(cell);
      if (!root) {
        continue;
      }

      const mathNodes = Array.from(
        root.querySelectorAll(mathSelector())
      ).filter(
        node =>
          isDisplayMathNode(node) && !node.closest('.mnt-EquationWithCopy')
      );

      for (const mathNode of mathNodes) {
        this._addCopyButton(cell, mathNode);
      }
    }
    this._syncEquationForgeButtons(panel);
  }

  private _schedulePosition(panel: NotebookPanel): void {
    const existing = this._positionTimers.get(panel);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    const timer = window.setTimeout(() => {
      this._positionTimers.delete(panel);
      this._positionButtons(panel);
    }, 50);
    this._positionTimers.set(panel, timer);
  }

  private _positionButtons(panel: NotebookPanel): void {
    for (const wrapper of Array.from(
      panel.node.querySelectorAll('.mnt-EquationWithCopy')
    )) {
      const actions = wrapper.querySelector<HTMLElement>(
        '.mnt-EquationActions'
      );
      const mathNode = wrapper.querySelector(mathSelector());
      if (actions && mathNode) {
        this._positionActions(actions, mathNode);
      }
    }
  }

  private _addCopyButton(cell: IMarkdownCellLike, mathNode: Element): void {
    const parent = mathNode.parentNode;
    if (!parent) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'mnt-EquationWithCopy';
    wrapper.dataset.jpSuppressContextMenu = 'true';

    const actions = document.createElement('span');
    actions.className = 'mnt-EquationActions';

    const button = document.createElement('button');
    button.className = 'mnt-EquationCopyButton';
    button.type = 'button';
    button.textContent = '⧉';
    button.title = this._trans.__('Copy TeX');
    button.setAttribute('aria-label', this._trans.__('Copy equation TeX'));
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void this._copyTex(cell, mathNode, button);
    });

    const forgeButton = document.createElement('button');
    forgeButton.className = 'mnt-EquationForgeButton';
    forgeButton.type = 'button';
    forgeButton.textContent = 'EF';
    forgeButton.title = this._trans.__('Add to Equation Forge');
    forgeButton.setAttribute(
      'aria-label',
      this._trans.__('Add equation to Equation Forge')
    );
    forgeButton.hidden = !this._app.commands.hasCommand(
      ADD_EQUATION_FORGE_ENTRY_COMMAND
    );
    forgeButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void this._addToEquationForge(cell, mathNode, forgeButton);
    });

    parent.insertBefore(wrapper, mathNode);
    actions.append(button, forgeButton);
    wrapper.append(mathNode, actions);
    this._positionActions(actions, mathNode);
  }

  private _positionActions(actions: HTMLElement, mathNode: Element): void {
    window.requestAnimationFrame(() => {
      const wrapper = actions.closest('.mnt-EquationWithCopy');
      if (!wrapper) {
        return;
      }

      const equationBody =
        mathNode.querySelector('mjx-table') ??
        findNonEmptyMathCell(mathNode) ??
        mathNode.querySelector('mjx-math') ??
        mathNode;
      const wrapperRect = wrapper.getBoundingClientRect();
      const bodyRect = equationBody.getBoundingClientRect();
      if (wrapperRect.width === 0 || bodyRect.width === 0) {
        return;
      }
      const bodyRight = bodyRect.right - wrapperRect.left;
      const bodyCenter = bodyRect.top + bodyRect.height / 2 - wrapperRect.top;
      const gap =
        Number.parseFloat(
          getComputedStyle(wrapper).getPropertyValue('--mnt-equation-copy-gap')
        ) || 16;

      actions.style.left = `${Math.max(0, bodyRight + gap)}px`;
      actions.style.top = `${Math.max(0, bodyCenter)}px`;
    });
  }

  private _syncEquationForgeButtons(panel: NotebookPanel): void {
    const available = this._app.commands.hasCommand(
      ADD_EQUATION_FORGE_ENTRY_COMMAND
    );
    for (const button of Array.from(
      panel.node.querySelectorAll<HTMLButtonElement>('.mnt-EquationForgeButton')
    )) {
      button.hidden = !available;
    }
    this._schedulePosition(panel);
  }

  private _removeButtons(panel: NotebookPanel): void {
    const wrappers = panel.node.querySelectorAll('.mnt-EquationWithCopy');
    for (const wrapper of Array.from(wrappers)) {
      const mathNode = wrapper.querySelector(mathSelector());
      if (mathNode) {
        wrapper.replaceWith(mathNode);
      } else {
        wrapper.remove();
      }
    }
  }

  private async _copyTex(
    cell: IMarkdownCellLike,
    mathNode: Element,
    button: HTMLButtonElement
  ): Promise<void> {
    const equation = equationForMathNode(cell, mathNode);
    if (!equation) {
      return;
    }
    await Promise.resolve(
      this._clipboard.setData(
        'text/plain',
        wrapDisplayEquation(equation.source)
      )
    );
    this._showCopiedState(button);
  }

  private async _addToEquationForge(
    cell: IMarkdownCellLike,
    mathNode: Element,
    button: HTMLButtonElement
  ): Promise<void> {
    const equation = equationForMathNode(cell, mathNode);
    if (!equation) {
      return;
    }
    await this._app.commands.execute(ADD_EQUATION_FORGE_ENTRY_COMMAND, {
      latex: equation.body
    });
    this._showSuccessState(button, this._trans.__('Added'));
  }

  private _showCopiedState(button: HTMLButtonElement): void {
    this._showSuccessState(button, this._trans.__('Copied'));
  }

  private _showSuccessState(button: HTMLButtonElement, title: string): void {
    const originalText = button.textContent ?? '⧉';
    const originalTitle = button.title;
    button.textContent = '✓';
    button.title = title;
    button.classList.add('mnt-mod-copied');

    window.setTimeout(() => {
      button.textContent = originalText;
      button.title = originalTitle;
      button.classList.remove('mnt-mod-copied');
    }, 1200);
  }

  private _onCommandChanged(): void {
    for (const panel of this._observers.keys()) {
      this._scheduleInstall(panel);
    }
  }

  private _app: JupyterFrontEnd;
  private _tracker: INotebookTracker;
  private _trans: ReturnType<ITranslator['load']>;
  private _clipboard: ClipboardLike;
  private _observers = new Map<NotebookPanel, MutationObserver>();
  private _installTimers = new Map<NotebookPanel, number>();
  private _positionTimers = new Map<NotebookPanel, number>();
  private _isDisposed = false;
}

export namespace EquationHoverController {
  export interface IOptions {
    app: JupyterFrontEnd;
    tracker: INotebookTracker;
    translator?: ITranslator | null;
  }
}

export function equationForMathNode(
  cell: IMarkdownCellLike,
  mathNode: Element
): ReturnType<typeof extractDisplayEquations>[number] | null {
  const source = getCellSource(cell);
  const equations = extractDisplayEquations(source);
  if (equations.length === 0) {
    return null;
  }

  const root = getRenderedRoot(cell);
  if (!root) {
    return equations[0];
  }

  const nodes = Array.from(root.querySelectorAll(mathSelector())).filter(node =>
    isDisplayMathNode(node)
  );
  const index = Math.max(0, nodes.indexOf(mathNode));
  return equations[Math.min(index, equations.length - 1)] ?? equations[0];
}

function mathSelector(): string {
  return 'mjx-container, .MathJax';
}

function isDisplayMathNode(node: Element): boolean {
  if (node.matches('mjx-container')) {
    return node.getAttribute('display') === 'true';
  }
  return true;
}

function findNonEmptyMathCell(mathNode: Element): Element | null {
  const cells = Array.from(mathNode.querySelectorAll('mjx-mtd'));
  return (
    cells.find(cell => {
      return (cell.textContent ?? '').trim() || cell.children.length > 1;
    }) ?? null
  );
}
