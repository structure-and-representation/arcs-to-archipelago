import { defineConfig } from 'vite';

/**
 * 末尾スラッシュなしのディレクトリ URL(例: /works/arcs)で配信されても、資産が 404 にならないようにする。
 * index.html の先頭の script が <base> を補うが、ブラウザの先読み(preload scanner)は <base> を補う前の URL で
 * ./assets/… を取りに行ってしまう。そこで、ビルドした index.html の資産のタグ(module script、modulepreload、stylesheet)を
 * 先読みされない形(document.write で、<base> を補った後に書き出す)に変える。
 */
function deferAssetTagsUntilBase() {
  const TAG = /\s*<(script type="module"[^>]*src="\.\/[^"]+"[^>]*><\/script|link rel="(?:stylesheet|modulepreload)"[^>]*href="\.\/[^"]+"[^>]*)>/g;
  return {
    name: 'defer-asset-tags-until-base',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tags = [];
        const out = html.replace(TAG, (m) => {
          tags.push(m.trim());
          return '';
        });
        if (!tags.length) return html;
        const write = tags.map((t) => `document.write(${JSON.stringify(t).replace(/</g, '\\u003c')});`).join('');
        return out.replace('</head>', `  <script>${write}</script>\n</head>`);
      },
    },
  };
}

// base を相対にして、どの階層に置いても資産を解決できるようにする
export default defineConfig({
  base: './',
  plugins: [deferAssetTagsUntilBase()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 800 }, // three.js だけで約 500 kB
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
