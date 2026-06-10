export interface IMarkdownCellLike {
  node: HTMLElement;
  model: {
    type?: string;
    sharedModel?: {
      cell_type?: string;
      getSource?: () => string;
    };
    value?: {
      text?: string;
    };
  };
  rendered: boolean;
  update?: () => void;
  editor?: {
    focus?: () => void;
  };
}

export function isMarkdownCellLike(cell: unknown): cell is IMarkdownCellLike {
  const candidate = cell as Partial<IMarkdownCellLike>;
  return (
    candidate.node instanceof HTMLElement &&
    candidate.model !== undefined &&
    (candidate.model.type === 'markdown' ||
      candidate.model.sharedModel?.cell_type === 'markdown' ||
      candidate.node.classList.contains('jp-MarkdownCell')) &&
    typeof candidate.rendered === 'boolean'
  );
}

export function getRenderedRoot(cell: IMarkdownCellLike): HTMLElement | null {
  return (
    cell.node.querySelector<HTMLElement>('.jp-MarkdownOutput') ??
    cell.node.querySelector<HTMLElement>('.jp-RenderedHTMLCommon')
  );
}

export function getCellSource(cell: IMarkdownCellLike): string {
  const sharedModel = cell.model.sharedModel;
  if (typeof sharedModel?.getSource === 'function') {
    return sharedModel.getSource();
  }

  return cell.model.value?.text ?? '';
}
