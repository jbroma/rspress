import path from 'path';
import { groupBy } from 'lodash-es';
import { SEARCH_INDEX_NAME } from '@rspress/shared';
import fs from '@rspress/shared/fs-extra';
import { FactoryContext, RuntimeModuleID } from '..';
import { normalizeThemeConfig } from './normalizeThemeConfig';
import { extractPageData } from './extractPageData';
import { createHash } from '@/node/utils';
import { TEMP_DIR, isProduction } from '@/node/constants';

// How can we let the client runtime access the `indexHash`?
// We can only do something after the Rspack build process becuase the index hash is generated within Rspack build process.There are two ways to do this:
// 1. insert window.__INDEX_HASH__ = 'foo' into the html template manually
// 2. replace the `__INDEX_HASH__` placeholder in the html template with the real index hash after Rspack build
export const indexHash = '';

function deletePriviteKey<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  const newObj = { ...obj };
  Object.keys(newObj).forEach(key => {
    if (key.startsWith('_')) {
      delete newObj[key];
    }
  });
  return newObj;
}

export async function siteDataVMPlugin(context: FactoryContext) {
  const { config, alias, userDocRoot, routeService, pluginDriver } = context;
  const userConfig = config;
  // prevent modify the origin config object
  const tempSearchObj = Object.assign({}, userConfig.search);

  // searchHooks is a absolute path which may leak information
  if (tempSearchObj) {
    tempSearchObj.searchHooks = undefined;
  }

  const replaceRules = userConfig?.replaceRules || [];
  // If the dev server restart when config file, we will reuse the siteData instead of extracting the siteData from source files again.
  const domain =
    userConfig?.search && userConfig?.search?.mode === 'remote'
      ? userConfig?.search.domain ?? ''
      : '';
  const pages = (
    await extractPageData(
      replaceRules,
      alias,
      domain,
      userDocRoot,
      routeService,
    )
  ).filter(Boolean);
  // modify page index by plugins
  await pluginDriver.modifySearchIndexData(pages);

  const versioned =
    userConfig.search &&
    userConfig.search.mode === 'local' &&
    userConfig.search.versioned;

  const groupedPages = groupBy(pages, page => {
    if (page.frontmatter?.pageType === 'home') {
      return 'omit';
    }

    const version = versioned ? page.version : '';
    const lang = page.lang || '';

    return `${version}###${lang}`;
  });
  // remove the pages marked as omit
  delete groupedPages.omit;

  const indexHashByGroup = {} as Record<string, string>;

  // Generate search index by different versions & languages, file name is {SEARCH_INDEX_NAME}.{version}.{lang}.{hash}.json
  await Promise.all(
    Object.keys(groupedPages).map(async group => {
      // Avoid writing filepath in compile-time
      const stringifiedIndex = JSON.stringify(
        groupedPages[group].map(deletePriviteKey),
      );
      const indexHash = createHash(stringifiedIndex);
      indexHashByGroup[group] = indexHash;

      const [version, lang] = group.split('###');
      const indexVersion = version ? `.${version.replace('.', '_')}` : '';
      const indexLang = lang ? `.${lang}` : '';

      await fs.ensureDir(TEMP_DIR);
      await fs.writeFile(
        path.join(
          TEMP_DIR,
          `${SEARCH_INDEX_NAME}${indexVersion}${indexLang}.${indexHash}.json`,
        ),
        stringifiedIndex,
      );
    }),
  );

  // Run extendPageData hook in plugins
  await Promise.all(
    pages.map(async pageData => pluginDriver.extendPageData(pageData)),
  );

  const siteData = {
    title: userConfig?.title || '',
    description: userConfig?.description || '',
    icon: userConfig?.icon || '',
    route: userConfig?.route,
    themeConfig: normalizeThemeConfig(userConfig, pages),
    base: userConfig?.base || '/',
    lang: userConfig?.lang || '',
    locales: userConfig?.locales || userConfig.themeConfig?.locales || [],
    logo: userConfig?.logo || '',
    logoText: userConfig?.logoText || '',
    ssg: userConfig?.ssg ?? true,
    multiVersion: {
      default: userConfig?.multiVersion?.default || '',
      versions: userConfig?.multiVersion?.versions || [],
    },
    search: tempSearchObj ?? { mode: 'local' },
    pages: pages.map(page => {
      const { content, id, domain, _filepath, ...rest } = page;
      // In production, we cannot expose the complete filepath for security reasons
      return isProduction() ? rest : { ...rest, _filepath };
    }),
    markdown: {
      showLineNumbers: userConfig?.markdown?.showLineNumbers ?? false,
      defaultWrapCode: userConfig?.markdown?.defaultWrapCode ?? false,
      codeHighlighter: userConfig?.markdown?.codeHighlighter || 'prism',
    },
  };

  return {
    [`${RuntimeModuleID.SiteData}.mjs`]: `export default ${JSON.stringify(
      siteData,
    )}`,
    [RuntimeModuleID.SearchIndexHash]: `export default ${JSON.stringify(
      indexHashByGroup,
    )}`,
  };
}
