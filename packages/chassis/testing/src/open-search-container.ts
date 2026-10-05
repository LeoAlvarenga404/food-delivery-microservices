import { GenericContainer, Wait } from 'testcontainers';

export interface StartedOpenSearch {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

const openSearchImage = 'opensearchproject/opensearch:3.9.0';
const openSearchPort = 9200;
const openSearchStartupTimeoutInMilliseconds = 120_000;

export async function startOpenSearchContainer(): Promise<StartedOpenSearch> {
  const container = await new GenericContainer(openSearchImage)
    .withExposedPorts(openSearchPort)
    .withEnvironment({
      'discovery.type': 'single-node',
      DISABLE_SECURITY_PLUGIN: 'true',
      DISABLE_INSTALL_DEMO_CONFIG: 'true',
      OPENSEARCH_JAVA_OPTS: '-Xms512m -Xmx512m',
    })
    .withStartupTimeout(openSearchStartupTimeoutInMilliseconds)
    .withWaitStrategy(
      Wait.forHttp('/_cluster/health?wait_for_status=yellow', openSearchPort).forStatusCode(200),
    )
    .start();
  return {
    url: `http://${container.getHost()}:${String(container.getMappedPort(openSearchPort))}`,
    stop: async () => {
      await container.stop();
    },
  };
}
