import path from "path";
import { Module, files, docker, ModuleCategory } from "zksync-cli/lib";

import type { ConfigHandler, NodeInfo } from "zksync-cli/lib";

type ModuleConfig = {
  version?: string;
  nodeType?: "memory" | "docker";
};

let latestVersion: string | undefined;

const REPO_URL = "matter-labs/dapp-portal";

export default class SetupModule extends Module<ModuleConfig> {
  constructor(config: ConfigHandler) {
    super(
      {
        name: "Portal",
        description: "DApp with Wallet and Bridge functionality",
        category: ModuleCategory.Dapp,
      },
      config
    );
  }

  composeFile = path.join(files.getDirPath(import.meta.url), "../docker-compose.yml");

  inMemoryNode = {
    id: 260,
    rpcUrl: "http://127.0.0.1:8011",
  };
  dockerizedNode = {
    id: 270,
    rpcUrl: "http://127.0.0.1:3050",
    l1Chain: {
      id: 9,
      rpcUrl: "http://127.0.0.1:8545",
    },
  };
  async isNodeSupported(nodeInfo: NodeInfo) {
    if (nodeInfo.id === this.inMemoryNode.id && nodeInfo.rpcUrl === this.inMemoryNode.rpcUrl) {
      return true;
    } else if (
      nodeInfo.id === this.dockerizedNode.id &&
      nodeInfo.rpcUrl === this.dockerizedNode.rpcUrl &&
      nodeInfo.l1Chain?.id === this.dockerizedNode.l1Chain.id &&
      nodeInfo.l1Chain?.rpcUrl === this.dockerizedNode.l1Chain.rpcUrl
    ) {
      return true;
    }
    return false;
  }

  /**
   * Retrieves the type of node being used based on the L1 node presence.
   *
   * Assumptions:
   * - If an L1 node is detected, we assume the user is utilizing the default dockerized testing node.
   * - If no L1 node is found, it's assumed the user is using the default in-memory node.
   *
   * This approach allows for the downloading of prebuilt distributions for the identified node type,
   * as building from scratch can be time-consuming.
   *
   * Limitation:
   * This method does not account for custom RPC URLs. This limitation should be addressed in future
   * iterations of this module.
   */
  async getNodeType(): Promise<ModuleConfig["nodeType"]> {
    const nodeInfo = await this.configHandler.getNodeInfo();
    return nodeInfo.l1Chain ? "docker" : "memory";
  }

  async isInstalled() {
    if (!this.moduleConfig.version || !this.moduleConfig.nodeType) {
      return false;
    }

    const nodeType = await this.getNodeType();
    if (nodeType !== this.moduleConfig.nodeType) {
      return false;
    }

    return (await docker.compose.status(this.composeFile)).length ? true : false;
  }
  async install() {
    const latestVersion = (await this.getLatestVersion())!;
    const nodeType = await this.getNodeType();

    await docker.compose.build(this.composeFile, undefined, [
      `--build-arg VERSION=${latestVersion} --build-arg NODE_TYPE=${nodeType}`,
    ]);
    this.setModuleConfig({
      ...this.moduleConfig,
      version: latestVersion,
      nodeType,
    });
    await docker.compose.create(this.composeFile);
  }

  async isRunning() {
    return (await docker.compose.status(this.composeFile)).some(({ isRunning }) => isRunning);
  }
  async start() {
    await docker.compose.up(this.composeFile);
  }
  async getStartupInfo() {
    const nodeType = await this.getNodeType();
    if (nodeType === "docker") {
      return ["Wallet: http://localhost:3000", "Bridge: http://localhost:3000/bridge"];
    } else if (nodeType === "memory") {
      return ["Wallet: http://localhost:3000"];
    }
    return [];
  }

  async getLogs() {
    return await docker.compose.logs(this.composeFile);
  }

  get version() {
    return this.moduleConfig.version?.toString() ?? undefined;
  }
  async getLatestVersion(): Promise<string> {
    if (latestVersion) {
      return latestVersion;
    }
    const apiUrl = `https://api.github.com/repos/${REPO_URL}/releases/latest`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API request failed with status: ${response.status}`);
      }
      const releaseInfo = await response.json();
      if (typeof releaseInfo?.tag_name !== "string") {
        throw new Error(`Failed to parse the latest release version: ${JSON.stringify(releaseInfo)}`);
      }
      latestVersion = releaseInfo.tag_name;
      return latestVersion!;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch the latest release version: ${error.message}`);
      }
      throw error;
    }
  }
  async update() {
    await this.clean();
    await this.install();
  }

  async stop() {
    await docker.compose.stop(this.composeFile);
  }

  async clean() {
    await docker.compose.down(this.composeFile);
  }
}
