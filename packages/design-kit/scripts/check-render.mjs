import { createRequire } from 'node:module';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');const mobile=resolve(root,'apps/mobile');const require=createRequire(resolve(mobile,'package.json'));const {build}=require('esbuild');const dir=await mkdtemp(resolve(tmpdir(),'ccai-render-'));const output=resolve(dir,'check.cjs');
await build({entryPoints:[resolve(root,process.argv.includes('--assets')?'packages/design-kit/scripts/export-assets.tsx':'packages/design-kit/scripts/render-check.tsx')],outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'automatic',nodePaths:[resolve(mobile,'node_modules')],alias:{'react-native':resolve(mobile,'node_modules/react-native-web'),'react-native-svg':resolve(mobile,'node_modules/react-native-svg/lib/module/ReactNativeSVG.web.js')},resolveExtensions:['.web.tsx','.web.ts','.web.js','.tsx','.ts','.jsx','.js','.json'],define:{'process.env.NODE_ENV':'"production"','process.env.EXPO_PUBLIC_API_BASE':'""','__DEV__':'false'}});
const result=spawnSync(process.execPath,[output],{stdio:'inherit'});process.exitCode=result.status??1;
