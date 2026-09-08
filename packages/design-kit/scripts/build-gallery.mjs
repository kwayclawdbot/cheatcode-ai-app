import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdir, copyFile, readFile, writeFile, cp } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const mobile = resolve(root, 'apps/mobile');
const require = createRequire(resolve(mobile, 'package.json'));
const { build } = require('esbuild');
const out = resolve(root, 'packages/design-kit/dist');
await mkdir(resolve(out,'fonts'),{recursive:true});
await build({
  entryPoints:[resolve(root,'packages/design-kit/gallery/main.tsx')],outfile:resolve(out,'gallery.js'),bundle:true,format:'iife',platform:'browser',jsx:'automatic',sourcemap:true,minify:false,
  nodePaths:[resolve(mobile,'node_modules')],
  alias:{'react-native':resolve(mobile,'node_modules/react-native-web'),'react-native-svg':resolve(mobile,'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js')},
  resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],
  define:{'process.env.NODE_ENV':'"production"','process.env.EXPO_PUBLIC_API_BASE':'""','process.env.EXPO_PUBLIC_SUPABASE_URL':'""','process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY':'""','process.env.EXPO_PUBLIC_FIXTURES':'"1"','process.env.EXPO_PUBLIC_DEV_TOOLS':'""','__DEV__':'false'},
});
const fonts = [
  ['space-grotesk','400Regular','SpaceGrotesk_400Regular'],['space-grotesk','500Medium','SpaceGrotesk_500Medium'],['space-grotesk','600SemiBold','SpaceGrotesk_600SemiBold'],['space-grotesk','700Bold','SpaceGrotesk_700Bold'],
  ['jetbrains-mono','400Regular','JetBrainsMono_400Regular'],['jetbrains-mono','500Medium','JetBrainsMono_500Medium'],['jetbrains-mono','600SemiBold','JetBrainsMono_600SemiBold'],['jetbrains-mono','700Bold','JetBrainsMono_700Bold'],
];
let fontCSS='';
for(const [pkg,folder,name] of fonts){await copyFile(resolve(mobile,`node_modules/@expo-google-fonts/${pkg}/${folder}/${name}.ttf`),resolve(out,`fonts/${name}.ttf`));fontCSS+=`@font-face{font-family:'${name}';src:url('./fonts/${name}.ttf') format('truetype');font-display:swap;}\n`;}
await writeFile(resolve(out,'fonts.css'),fontCSS);
for (const pkg of ['space-grotesk','jetbrains-mono']) await copyFile(resolve(mobile,`node_modules/@expo-google-fonts/${pkg}/LICENSE`),resolve(out,`fonts/${pkg}-LICENSE.txt`));
for(const file of ['index.html','gallery.css']) await copyFile(resolve(root,'packages/design-kit/gallery',file),resolve(out,file));
await cp(resolve(root,'packages/design-kit/references'),resolve(out,'references'),{recursive:true});
console.log(`Built same-source React Native gallery: ${out}`);
