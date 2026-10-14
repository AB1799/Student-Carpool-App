import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
function walk(dir) {
  for (const item of readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir,item.name);
    if (item.isDirectory() && item.name !== 'node_modules') walk(p);
    else if (item.isFile() && item.name.endsWith('.js')) execFileSync(process.execPath,['--check',p]);
  }
}
walk('src'); walk('database'); walk('tests'); walk('scripts');
console.log('JavaScript syntax check passed.');
