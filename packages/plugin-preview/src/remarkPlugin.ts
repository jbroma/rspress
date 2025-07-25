import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { MdxjsEsm } from 'mdast-util-mdxjs-esm';
import { normalizePosixPath } from 'rspress/core';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { getASTNodeImport, getExternalDemoContent } from './ast-helpers';
import { demoBlockComponentPath, virtualDir } from './constant';
import type { DemoInfo, RemarkPluginOptions } from './types';
import { generateId, getLangFileExt, injectDemoBlockImport } from './utils';

export const demos: DemoInfo = {};

/**
 * remark plugin to transform code to demo
 */
export const remarkCodeToDemo: Plugin<[RemarkPluginOptions], Root> = function ({
  getRouteMeta,
  previewMode,
  defaultRenderMode,
  position,
  previewLanguages,
  previewCodeTransform,
}) {
  const routeMeta = getRouteMeta();
  fs.mkdirSync(virtualDir, { recursive: true });
  const data = this.data() as {
    pageMeta: Record<string, unknown>;
  };
  return (tree, vfile) => {
    const demoMdx: MdxjsEsm[] = [];
    const route = routeMeta.find(
      meta =>
        normalizePosixPath(meta.absolutePath) ===
        normalizePosixPath(vfile.path || vfile.history[0]),
    );
    if (!route) {
      return;
    }
    const { pageName } = route;
    // clear all demo in this pageName and recollect, because we may delete the demo
    demos[pageName] = [];
    let title = pageName;
    let index = 1;

    function constructDemoNode(
      demoId: string,
      demoPath: string,
      currentNode: Code | MdxJsxFlowElement,
      isMobileMode: boolean,
      // Only for external demo
      externalDemoIndex?: number,
    ) {
      if (isMobileMode) {
        const relativePathReg = new RegExp(/^\.\.?\/.*$/);
        demos[pageName].push({
          title,
          id: demoId,
          path: relativePathReg.test(demoPath)
            ? resolve(vfile.dirname || dirname(vfile.path), demoPath)
            : demoPath,
        });
      } else {
        demoMdx.push(getASTNodeImport(`Demo${demoId}`, demoPath));
      }

      // get external demo content
      const tempVar = `externalDemoContent${externalDemoIndex}`;
      if (externalDemoIndex !== undefined) {
        // Such as `import externalDemoContent0 from '!!foo?raw'`
        // `!!` prefix is used to avoid other loaders in rspack
        demoMdx.push(getASTNodeImport(tempVar, `!!${demoPath}?raw`));
      }

      if (isMobileMode && position === 'fixed') {
        // Only show the code block
        externalDemoIndex !== undefined &&
          Object.assign(currentNode, getExternalDemoContent(tempVar));
      } else {
        // Use container to show the code and view
        Object.assign(currentNode, {
          type: 'mdxJsxFlowElement',
          name: 'Container',
          attributes: [
            {
              type: 'mdxJsxAttribute',
              name: 'isMobile',
              value: isMobileMode,
            },
            {
              type: 'mdxJsxAttribute',
              name: 'demoId',
              value: demoId,
            },
          ],
          children: [
            externalDemoIndex === undefined
              ? {
                  ...currentNode,
                  hasVisited: true,
                }
              : getExternalDemoContent(tempVar),
            isMobileMode
              ? {
                  type: 'mdxJsxFlowElement',
                  name: null,
                }
              : {
                  type: 'mdxJsxFlowElement',
                  name: `Demo${demoId}`,
                },
          ],
        });
      }
    }
    visit(tree, 'heading', node => {
      if (node.depth === 1) {
        const firstChild = node.children[0];
        title =
          (firstChild && 'value' in firstChild && firstChild.value) || title;
      }
    });

    // Internal demo, such as using ```jsx to declare demo
    visit(tree, 'code', node => {
      // hasVisited is a custom property
      if ('hasVisited' in node) {
        return;
      }
      if (node.lang && previewLanguages.includes(node.lang)) {
        // do not anything for pure mode
        if (
          node.meta?.includes('pure') ||
          (!node.meta?.includes('preview') && defaultRenderMode === 'pure')
        ) {
          return;
        }
        const isJsx = node.lang === 'jsx' || node.lang === 'tsx';
        const value = isJsx
          ? injectDemoBlockImport(
              previewCodeTransform({
                language: node.lang,
                code: node.value,
              }),
              demoBlockComponentPath,
            )
          : previewCodeTransform({
              language: node.lang,
              code: node.value,
            });

        // every code block can change their preview mode by meta
        const isMobileMode =
          node.meta?.includes('mobile') ||
          node.meta?.includes('iframe') ||
          (!node.meta?.includes('web') &&
            !node.meta?.includes('internal') &&
            previewMode === 'iframe');

        const id = generateId(pageName, index++);
        const virtualModulePath = join(
          virtualDir,
          `${id}.${getLangFileExt(node.lang)}`,
        );
        constructDemoNode(id, virtualModulePath, node, isMobileMode);
        // Only when the content of the file changes, the file will be written
        // Avoid to trigger the hmr indefinitely
        if (fs.existsSync(virtualModulePath)) {
          const content = fs.readFileSync(virtualModulePath, 'utf-8');
          if (content === value) {
            return;
          }
        }
        fs.writeFileSync(virtualModulePath, value);
      }
    });

    tree.children.unshift(...demoMdx);

    if (demos[pageName].length > 0) {
      data.pageMeta.haveDemos = true;
    }
  };
};
