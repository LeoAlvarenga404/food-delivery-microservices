export interface HighlightSegment {
  readonly text: string;
  readonly isEmphasized: boolean;
}

const emphasizedPartPattern = /^<em>(.*)<\/em>$/s;
const escapedCharacterPattern = /&(?:amp|lt|gt|quot|#x27|#x2F|#\d+);/g;
const unescapedCharacters = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#x27;', "'"],
  ['&#x2F;', '/'],
]);

function unescapeCharacter(entity: string): string {
  const unescaped = unescapedCharacters.get(entity);
  if (unescaped !== undefined) return unescaped;
  return String.fromCharCode(Number(entity.slice(2, -1)));
}

function unescapeHtml(escaped: string): string {
  return escaped.replace(escapedCharacterPattern, unescapeCharacter);
}

function toSegment(part: string): HighlightSegment {
  const emphasized = emphasizedPartPattern.exec(part);
  if (emphasized === null) return { text: unescapeHtml(part), isEmphasized: false };
  return { text: unescapeHtml(emphasized[1] ?? ''), isEmphasized: true };
}

export function toHighlightSegments(highlight: string): readonly HighlightSegment[] {
  return highlight
    .split(/(<em>.*?<\/em>)/s)
    .filter((part) => part !== '')
    .map(toSegment);
}
