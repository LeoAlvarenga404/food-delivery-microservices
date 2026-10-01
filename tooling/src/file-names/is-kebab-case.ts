const kebabCaseSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isKebabCase(segment: string): boolean {
  return kebabCaseSegmentPattern.test(segment);
}
