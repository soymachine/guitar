// Empaqueta la web en UN solo archivo HTML para publicarla como artifact de Claude:
// JS en un único <script>, CSS inline y tipografías incrustadas como data: URIs.
//
//   cd tools && npm install && npm run artifact          (escribe ../dist/artifact/index.html)
//   node build-artifact.mjs ruta/de/salida.html          (otra ruta)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(process.argv[2] || resolve(root, 'dist/artifact/index.html'));
const read = (p) => readFileSync(resolve(root, p), 'utf8');

// 1) JavaScript: todos los módulos en un solo script clásico
const js = (await build({
  entryPoints: [resolve(root, 'js/app.js')], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none',
})).outputFiles[0].text;

// 2) CSS con las tipografías como data: URIs
let css = read('css/style.css');
let fonts = 0;
css = css.replace(/url\('\.\.\/(fonts\/[^']+\.woff2)'\)/g, (_, file) => {
  fonts++;
  return `url('data:font/woff2;base64,${readFileSync(resolve(root, file)).toString('base64')}')`;
});
if (!fonts) throw new Error('No se encontraron tipografías en el CSS: ¿ha cambiado su formato?');

// 3) Marcado de la página: lo que hay dentro de <body>, sin el script de módulo
const html = read('index.html');
const body = html.match(/<body>([\s\S]*?)<script type="module"[^>]*><\/script>\s*<\/body>/);
if (!body) throw new Error('No se pudo extraer el contenido de <body> de index.html.');
const desktop = readFileSync(resolve(here, 'artifact-desktop.js'), 'utf8');
const inline = (code) => code.replace(/<\/script/gi, '<\\/script');

const page = `<title>Mástil</title>
<style>
:root { color-scheme: dark; }
${css}
.topbar .install-app { margin-left: auto; font-size: .82rem; padding: .35rem .8rem; }
</style>
${body[1].trim()}
<script>${inline(js)}</script>
<script>${inline(desktop)}</script>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`${out}  ${(Buffer.byteLength(page) / 1024).toFixed(0)} KB (${fonts} tipografías incrustadas)`);
