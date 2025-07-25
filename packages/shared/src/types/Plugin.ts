import type { RsbuildConfig } from '@rsbuild/core';
import type { PluggableList } from 'unified';
import type { PageIndexInfo, RouteMeta, UserConfig } from '.';

/**
 * There are two ways to define what addition routes represent.
 * 1. Define filepath, then the content will be read from the file.
 * 2. Define content, then then content will be written to temp file and read from it.
 */
export interface AdditionalPage {
  routePath: string;
  content?: string;
  filepath?: string;
}

export interface RspressPlugin {
  /**
   * Name of the plugin.
   */
  name: string;
  /**
   * Global style
   */
  globalStyles?: string;
  /**
   * Markdown options.
   */
  markdown?: {
    remarkPlugins?: PluggableList;
    rehypePlugins?: PluggableList;
    globalComponents?: string[];
  };
  /**
   * Rsbuild config.
   */
  builderConfig?: RsbuildConfig;
  /**
   * Inject global components.
   */
  globalUIComponents?: (string | [string, object])[];
  /**
   * Modify doc config.
   */
  config?: (
    config: UserConfig,
    utils: {
      addPlugin: (plugin: RspressPlugin) => void;
      removePlugin: (pluginName: string) => void;
    },
    isProd: boolean,
  ) => UserConfig | Promise<UserConfig>;
  /**
   * Callback before build
   */
  beforeBuild?: (config: UserConfig, isProd: boolean) => void | Promise<void>;
  /**
   * Callback after build
   */
  afterBuild?: (config: UserConfig, isProd: boolean) => void | Promise<void>;
  /**
   * Extend every page's data
   */
  extendPageData?: (
    pageData: PageIndexInfo,
    isProd: boolean,
  ) => void | Promise<void>;
  /**
   * Add custom route
   */
  addPages?: (
    config: UserConfig,
    isProd: boolean,
  ) => AdditionalPage[] | Promise<AdditionalPage[]>;
  /**
   * Add runtime modules
   * @deprecated use [rsbuild-plugin-virtual-module](https://github.com/rspack-contrib/rsbuild-plugin-virtual-module) instead.
   */
  addRuntimeModules?: (
    config: UserConfig,
    isProd: boolean,
  ) => Record<string, string> | Promise<Record<string, string>>;
  /**
   * Callback after route generated
   */
  routeGenerated?: (
    routes: RouteMeta[],
    isProd: boolean,
  ) => Promise<void> | void;
  /**
   * Callback after routeService generated
   */
  routeServiceGenerated?: (
    routeService: any,
    isProd: boolean,
  ) => Promise<void> | void;
  /**
   * Add addition ssg routes, for dynamic routes.
   */
  addSSGRoutes?: (
    config: UserConfig,
    isProd: boolean,
  ) => { path: string }[] | Promise<{ path: string }[]>;
  /**
   * @private
   * Modify search index data.
   */
  modifySearchIndexData?: (
    data: PageIndexInfo[],
    isProd: boolean,
  ) => void | Promise<void>;
}
