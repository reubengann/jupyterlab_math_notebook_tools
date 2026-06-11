import { buildMathJaxSeed, normalizeMacros } from '../macros';
import { extractDisplayEquations, wrapDisplayEquation } from '../tex';

describe('jupyterlab_math_notebook_tools', () => {
  it('extracts display equations in source order', () => {
    const equations = extractDisplayEquations(`
Some text

$$
g = h - Ts
$$

More text

\\[
F = ma
\\]

\\begin{align}
a &= b + c
\\end{align}
`);

    expect(equations.map(equation => equation.body)).toEqual([
      'g = h - Ts',
      'F = ma',
      'a &= b + c'
    ]);
  });

  it('does not double-count environments wrapped in display delimiters', () => {
    const equations = extractDisplayEquations(`
$$
\\begin{align}
a &= b
\\end{align}
$$
`);

    expect(equations).toHaveLength(1);
    expect(equations[0].source.trim()).toMatch(/^\$\$/);
  });

  it('extracts tagged eqnarray environments', () => {
    const equations = extractDisplayEquations(`
\\begin{eqnarray}
x &=& y \\tag{7-25}
\\end{eqnarray}
`);

    expect(equations).toHaveLength(1);
    expect(equations[0].source).toContain('\\tag{7-25}');
  });

  it('wraps bare equation bodies for clipboard use', () => {
    expect(wrapDisplayEquation('g = h - Ts')).toBe('$$\ng = h - Ts\n$$');
    expect(wrapDisplayEquation('$$\ng = h - Ts\n$$')).toBe(
      '$$\ng = h - Ts\n$$'
    );
  });

  it('normalizes MathJax macros from settings', () => {
    expect(
      normalizeMacros({
        vec: '\\mathbf{#1}',
        dd: ['\\,d#1', 1],
        'not-valid': 'ignored',
        bad: [1]
      })
    ).toEqual({
      vec: '\\mathbf{#1}',
      dd: ['\\,d#1', 1]
    });
  });

  it('uses the bold vector preset before custom macros', () => {
    expect(normalizeMacros({}, true)).toEqual({
      vec: ['\\mathbf{#1}', 1]
    });

    expect(
      normalizeMacros(
        {
          vec: ['\\mathrm{#1}', 1]
        },
        true
      )
    ).toEqual({
      vec: ['\\mathrm{#1}', 1]
    });
  });

  it('builds a MathJax macro seed', () => {
    expect(
      buildMathJaxSeed({
        vec: ['\\mathbf{#1}', 1],
        RR: '\\mathbb{R}'
      })
    ).toBe('$$\n\\def\\vec#1{\\mathbf{#1}}\n\\def\\RR{\\mathbb{R}}\n$$');
  });
});
