export interface IDisplayEquation {
  source: string;
  body: string;
}

interface IIndexedDisplayEquation extends IDisplayEquation {
  index: number;
  end: number;
}

const DISPLAY_ENVIRONMENTS = [
  'align',
  'align*',
  'eqnarray',
  'eqnarray*',
  'equation',
  'equation*',
  'gather',
  'gather*',
  'multline',
  'multline*'
];

export function extractDisplayEquations(markdown: string): IDisplayEquation[] {
  const equations: IIndexedDisplayEquation[] = [];
  collectDelimited(markdown, '$$', '$$', equations);
  collectDelimited(markdown, '\\[', '\\]', equations);
  collectEnvironments(markdown, equations);

  return equations
    .sort((left, right) => left.index - right.index)
    .filter((equation, index, sorted) => {
      return !sorted.some((other, otherIndex) => {
        return (
          otherIndex !== index &&
          other.index <= equation.index &&
          other.end >= equation.end &&
          other.source.length > equation.source.length
        );
      });
    })
    .map(({ source, body }) => ({ source, body }));
}

export function wrapDisplayEquation(source: string): string {
  const trimmed = source.trim();
  if (
    trimmed.startsWith('$$') ||
    trimmed.startsWith('\\[') ||
    trimmed.startsWith('\\begin')
  ) {
    return trimmed;
  }

  return `$$\n${trimmed}\n$$`;
}

function collectDelimited(
  markdown: string,
  startDelimiter: string,
  endDelimiter: string,
  equations: IIndexedDisplayEquation[]
): void {
  let start = markdown.indexOf(startDelimiter);
  while (start !== -1) {
    const bodyStart = start + startDelimiter.length;
    const end = markdown.indexOf(endDelimiter, bodyStart);
    if (end === -1) {
      break;
    }

    const source = markdown.slice(start, end + endDelimiter.length);
    const body = markdown.slice(bodyStart, end).trim();
    if (body) {
      equations.push({
        source,
        body,
        index: start,
        end: end + endDelimiter.length
      });
    }

    start = markdown.indexOf(startDelimiter, end + endDelimiter.length);
  }
}

function collectEnvironments(
  markdown: string,
  equations: IIndexedDisplayEquation[]
): void {
  for (const environment of DISPLAY_ENVIRONMENTS) {
    const escaped = environment.replace('*', '\\*');
    const pattern = new RegExp(
      `\\\\begin\\{${escaped}\\}([\\s\\S]*?)\\\\end\\{${escaped}\\}`,
      'g'
    );
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(markdown)) !== null) {
      equations.push({
        source: match[0],
        body: match[1].trim(),
        index: match.index,
        end: match.index + match[0].length
      });
    }
  }
}
