const goldenSamplesPrefix = 'packages/contracts/samples/';
const topicNamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
const messageTypeFileNamePattern = /^[A-Z][A-Za-z0-9]*\.json$/;

export function isGoldenSamplePath(path: string): boolean {
  return path.startsWith(goldenSamplesPrefix);
}

export function findGoldenSampleReasons(path: string): readonly string[] {
  const [topic, fileName, ...extraSegments] = path.slice(goldenSamplesPrefix.length).split('/');
  if (topic === undefined || fileName === undefined || extraSegments.length > 0) {
    return ['golden sample must be samples/<topic>/<MessageType>.json'];
  }
  return [
    ...(topicNamePattern.test(topic) ? [] : [`topic directory "${topic}" is not a topic name`]),
    ...(messageTypeFileNamePattern.test(fileName)
      ? []
      : [`golden sample "${fileName}" must be <MessageType>.json`]),
  ];
}
