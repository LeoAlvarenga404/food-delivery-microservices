import { describe, expect, it } from 'vitest';
import { toHighlightSegments } from './search-highlight.message-mapper.ts';

describe('toHighlightSegments', () => {
  it('splits a highlight into plain and emphasized segments', () => {
    expect(toHighlightSegments('Torta <em>abacaxi</em> da casa')).toEqual([
      { text: 'Torta ', isEmphasized: false },
      { text: 'abacaxi', isEmphasized: true },
      { text: ' da casa', isEmphasized: false },
    ]);
  });

  it('keeps markup typed by restaurant staff as text instead of elements', () => {
    expect(
      toHighlightSegments(
        '&lt;img src=x onerror=&quot;alert(&#x27;x&#x27;)&quot;&#x2F;&gt; <em>pizza</em>',
      ),
    ).toEqual([
      { text: '<img src=x onerror="alert(\'x\')"/> ', isEmphasized: false },
      { text: 'pizza', isEmphasized: true },
    ]);
  });

  it('decodes numeric entities an HTML encoder may write for accented letters', () => {
    expect(toHighlightSegments('S&#227;o <em>Jo&#227;o</em> &amp; A&#231;a&#237;')).toEqual([
      { text: 'São ', isEmphasized: false },
      { text: 'João', isEmphasized: true },
      { text: ' & Açaí', isEmphasized: false },
    ]);
  });

  it('decodes an escaped ampersand once, so an escaped entity stays visible', () => {
    expect(toHighlightSegments('<em>Fish</em> &amp;lt;3')).toEqual([
      { text: 'Fish', isEmphasized: true },
      { text: ' &lt;3', isEmphasized: false },
    ]);
  });

  it('answers two emphasized words as two segments', () => {
    expect(toHighlightSegments('<em>pizza</em> <em>bella</em>')).toEqual([
      { text: 'pizza', isEmphasized: true },
      { text: ' ', isEmphasized: false },
      { text: 'bella', isEmphasized: true },
    ]);
  });
});
