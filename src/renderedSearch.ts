import { JupyterFrontEnd } from '@jupyterlab/application';
import { NotebookPanel, INotebookTracker } from '@jupyterlab/notebook';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IDisposable } from '@lumino/disposable';

import {
  getCellSource,
  getRenderedRoot,
  IMarkdownCellLike,
  isMarkdownCellLike
} from './cellUtils';
import { IExtensionSettings } from './settings';
import { extractDisplayEquations } from './tex';

interface IRenderedMatch {
  cell: IMarkdownCellLike;
  element: HTMLElement;
}

export class RenderedSearchController implements IDisposable {
  constructor(options: RenderedSearchController.IOptions) {
    this._app = options.app;
    this._tracker = options.tracker;
    this._settings = options.settings;
    this._trans = (options.translator ?? nullTranslator).load('jupyterlab');
    this._registerCommands();
    this._tracker.currentChanged.connect(this._onCurrentChanged, this);
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
    this._hide();
  }

  updateSettings(settings: IExtensionSettings): void {
    this._settings = settings;
  }

  private _registerCommands(): void {
    this._app.commands.addCommand('math-notebook-tools:rendered-search', {
      label: this._trans.__('Find in Rendered Notebook'),
      caption: this._trans.__(
        'Search rendered Markdown notebook content without opening source cells'
      ),
      describedBy: {
        args: {
          type: 'object',
          additionalProperties: false
        }
      },
      execute: () => {
        const panel = this._tracker.currentWidget;
        if (!panel) {
          return;
        }
        this._show(panel);
      },
      isEnabled: () => !!this._tracker.currentWidget
    });
  }

  private _show(panel: NotebookPanel): void {
    if (this._panel !== panel) {
      this._hide();
      this._panel = panel;
    }

    if (!this._node) {
      this._node = this._createNode();
      panel.node.appendChild(this._node);
    }

    this._node.hidden = false;
    window.requestAnimationFrame(() => {
      this._input?.focus();
      this._input?.select();
    });
    this._update();
  }

  private _hide(): void {
    this._clearTimer();
    this._clearHighlights();
    this._matches = [];
    this._currentIndex = -1;
    this._node?.remove();
    this._node = null;
    this._input = null;
    this._countNode = null;
    this._panel = null;
  }

  private _createNode(): HTMLElement {
    const node = document.createElement('div');
    node.className = 'mnt-RenderedSearch';
    node.dataset.jpSuppressContextMenu = 'true';

    const input = document.createElement('input');
    input.className = 'mnt-RenderedSearch-input';
    input.type = 'search';
    input.placeholder = 'Search rendered notebook';
    input.setAttribute(
      'aria-label',
      this._trans.__('Search rendered notebook')
    );
    input.addEventListener('input', () => this._scheduleUpdate());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          this._previous();
        } else {
          this._next();
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this._hide();
      }
    });

    const previous = document.createElement('button');
    previous.className = 'mnt-RenderedSearch-button';
    previous.textContent = '↑';
    previous.title = this._trans.__('Previous match');
    previous.setAttribute('aria-label', this._trans.__('Previous match'));
    previous.addEventListener('click', () => this._previous());

    const next = document.createElement('button');
    next.className = 'mnt-RenderedSearch-button';
    next.textContent = '↓';
    next.title = this._trans.__('Next match');
    next.setAttribute('aria-label', this._trans.__('Next match'));
    next.addEventListener('click', () => this._next());

    const count = document.createElement('span');
    count.className = 'mnt-RenderedSearch-count';
    count.textContent = '0/0';

    const close = document.createElement('button');
    close.className = 'mnt-RenderedSearch-button';
    close.textContent = '×';
    close.title = this._trans.__('Close search');
    close.setAttribute('aria-label', this._trans.__('Close search'));
    close.addEventListener('click', () => this._hide());

    node.append(input, previous, next, count, close);
    this._input = input;
    this._countNode = count;
    return node;
  }

  private _scheduleUpdate(): void {
    this._clearTimer();
    this._timer = window.setTimeout(
      () => this._update(),
      this._settings.renderedSearchDebounceMs
    );
  }

  private _update(): void {
    this._clearTimer();
    this._clearHighlights();
    this._matches = [];
    this._currentIndex = -1;

    const query = this._input?.value.trim() ?? '';
    if (!query || !this._panel) {
      this._syncCount();
      return;
    }

    const widgets = this._panel.content.widgets as unknown[];
    const cells = widgets.filter(
      (cell): cell is IMarkdownCellLike =>
        isMarkdownCellLike(cell) && cell.rendered
    );

    for (const cell of cells) {
      const root = getRenderedRoot(cell);
      if (!root) {
        continue;
      }
      this._highlightInRoot(root, query, cell);
      this._highlightMathSourceMatches(root, query, cell);
    }

    if (this._matches.length > 0) {
      this._currentIndex = 0;
      this._activateCurrent();
    }
    this._syncCount();
  }

  private _highlightInRoot(
    root: HTMLElement,
    query: string,
    cell: IMarkdownCellLike
  ): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        if (!node.nodeValue?.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (!parent || shouldSkipNode(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      textNodes.push(current as Text);
      current = walker.nextNode();
    }

    for (const textNode of textNodes) {
      const text = textNode.nodeValue ?? '';
      const lowerText = text.toLocaleLowerCase();
      const lowerQuery = query.toLocaleLowerCase();
      let start = lowerText.indexOf(lowerQuery);
      if (start === -1) {
        continue;
      }

      const fragment = document.createDocumentFragment();
      let offset = 0;
      while (start !== -1) {
        fragment.append(document.createTextNode(text.slice(offset, start)));
        const mark = document.createElement('mark');
        mark.className = 'mnt-RenderedSearch-match';
        mark.textContent = text.slice(start, start + query.length);
        fragment.append(mark);
        this._matches.push({ cell, element: mark });
        offset = start + query.length;
        start = lowerText.indexOf(lowerQuery, offset);
      }
      fragment.append(document.createTextNode(text.slice(offset)));
      textNode.replaceWith(fragment);
    }
  }

  private _highlightMathSourceMatches(
    root: HTMLElement,
    query: string,
    cell: IMarkdownCellLike
  ): void {
    const equations = extractDisplayEquations(getCellSource(cell));
    if (equations.length === 0) {
      return;
    }

    const mathNodes = Array.from(root.querySelectorAll(mathSelector())).filter(
      node => isDisplayMathNode(node)
    );
    const lowerQuery = query.toLocaleLowerCase();

    equations.forEach((equation, index) => {
      const source = `${equation.source}\n${equation.body}`.toLocaleLowerCase();
      if (!source.includes(lowerQuery)) {
        return;
      }

      const mathNode = mathNodes[index];
      if (!(mathNode instanceof HTMLElement)) {
        return;
      }

      const matchElement =
        mathNode.closest<HTMLElement>('.mnt-EquationWithCopy') ?? mathNode;
      this._setMathHighlightBounds(matchElement, mathNode);
      matchElement.classList.add('mnt-RenderedSearch-mathMatch');
      this._matches.push({ cell, element: matchElement });
    });
  }

  private _setMathHighlightBounds(
    matchElement: HTMLElement,
    mathNode: Element
  ): void {
    const matchRect = matchElement.getBoundingClientRect();
    const mathRect = mathNode.getBoundingClientRect();
    const leftOverflow = Math.max(0, matchRect.left - mathRect.left);
    const rightOverflow = Math.max(0, mathRect.right - matchRect.right);

    matchElement.style.setProperty(
      '--mnt-search-highlight-left',
      `${leftOverflow}px`
    );
    matchElement.style.setProperty(
      '--mnt-search-highlight-right',
      `${rightOverflow + 8}px`
    );
  }

  private _next(): void {
    if (this._matches.length === 0) {
      return;
    }
    this._currentIndex = (this._currentIndex + 1) % this._matches.length;
    this._activateCurrent();
    this._syncCount();
  }

  private _previous(): void {
    if (this._matches.length === 0) {
      return;
    }
    this._currentIndex =
      (this._currentIndex - 1 + this._matches.length) % this._matches.length;
    this._activateCurrent();
    this._syncCount();
  }

  private _activateCurrent(): void {
    for (const match of this._matches) {
      match.element.classList.remove('mnt-mod-currentSearchMatch');
    }
    const current = this._matches[this._currentIndex];
    if (!current) {
      return;
    }
    current.element.classList.add('mnt-mod-currentSearchMatch');
    current.cell.node.scrollIntoView({ block: 'nearest' });
    current.element.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  private _clearHighlights(): void {
    if (!this._panel) {
      return;
    }
    const highlights = this._panel.node.querySelectorAll(
      'mark.mnt-RenderedSearch-match'
    );
    for (const highlight of Array.from(highlights)) {
      highlight.replaceWith(
        document.createTextNode(highlight.textContent ?? '')
      );
    }
    this._panel.node.normalize();
    const mathHighlights = this._panel.node.querySelectorAll(
      '.mnt-RenderedSearch-mathMatch, .mnt-mod-currentSearchMatch'
    );
    for (const highlight of Array.from(mathHighlights)) {
      highlight.classList.remove(
        'mnt-RenderedSearch-mathMatch',
        'mnt-mod-currentSearchMatch'
      );
      if (highlight instanceof HTMLElement) {
        highlight.style.removeProperty('--mnt-search-highlight-left');
        highlight.style.removeProperty('--mnt-search-highlight-right');
      }
    }
  }

  private _syncCount(): void {
    if (!this._countNode) {
      return;
    }
    const current = this._matches.length === 0 ? 0 : this._currentIndex + 1;
    this._countNode.textContent = `${current}/${this._matches.length}`;
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      window.clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _onCurrentChanged(): void {
    this._hide();
  }

  private _app: JupyterFrontEnd;
  private _tracker: INotebookTracker;
  private _settings: IExtensionSettings;
  private _trans: ReturnType<ITranslator['load']>;
  private _panel: NotebookPanel | null = null;
  private _node: HTMLElement | null = null;
  private _input: HTMLInputElement | null = null;
  private _countNode: HTMLElement | null = null;
  private _matches: IRenderedMatch[] = [];
  private _currentIndex = -1;
  private _timer: number | null = null;
  private _isDisposed = false;
}

export namespace RenderedSearchController {
  export interface IOptions {
    app: JupyterFrontEnd;
    tracker: INotebookTracker;
    settings: IExtensionSettings;
    translator?: ITranslator | null;
  }
}

function shouldSkipNode(node: HTMLElement): boolean {
  return !!node.closest(
    '.mnt-RenderedSearch, .mnt-EquationWithCopy, script, style, textarea, input, mark.mnt-RenderedSearch-match'
  );
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
