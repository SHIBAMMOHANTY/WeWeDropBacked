/**
 * Route Optimizer Script
 * Adds missing: corsHeaders, OPTIONS handler, runtime='nodejs', dynamic='force-dynamic'
 * to all route.ts files that need them.
 * NEVER removes anything.
 */
const fs = require('fs');
const path = require('path');

const CORS_BLOCK = `
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-agent-key, x-user-id',
};
`;

const OPTIONS_FN = `
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
`;

const RUNTIME_LINE = `export const runtime = 'nodejs';\n`;
const DYNAMIC_LINE = `export const dynamic = 'force-dynamic';\n`;

function routeFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(routeFiles(full));
    else if (entry.name === 'route.ts') results.push(full);
  }
  return results;
}

const apiDir = path.join(__dirname, '..', 'src', 'app', 'api');
const files = routeFiles(apiDir);
let changed = 0;

for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  const orig = src;

  const hasNextResponse = src.includes('NextResponse');
  const hasRuntime = src.includes("export const runtime");
  const hasDynamic = src.includes("force-dynamic");
  const hasCors = src.includes('corsHeaders');
  const hasOptions = src.includes('export async function OPTIONS');

  // Only add NextResponse import if file uses responses and doesn't already import it
  const hasNextResponseImport = /from ['"]next\/server['"]/.test(src) && src.includes('NextResponse');

  // Locate the first import line end to insert after imports
  const firstImportMatch = src.match(/^import .+\n/m);
  const lastImportIdx = src.lastIndexOf('\nimport ');
  const afterImports = lastImportIdx !== -1 
    ? lastImportIdx + src.slice(lastImportIdx).indexOf('\n') + 1
    : (firstImportMatch ? firstImportMatch.index + firstImportMatch[0].length : 0);

  let insertions = '';

  // A: Add runtime & dynamic after imports
  if (!hasRuntime) insertions += RUNTIME_LINE;
  if (!hasDynamic) insertions += DYNAMIC_LINE;

  // B: Add corsHeaders if missing and file uses NextResponse
  if (!hasCors && hasNextResponse) insertions += CORS_BLOCK;

  if (insertions) {
    // Insert after last import block
    src = src.slice(0, afterImports) + insertions + src.slice(afterImports);
  }

  // C: Add OPTIONS handler if missing, after first export const / export async
  if (!hasOptions && !hasCors && hasNextResponse) {
    // Re-check after potential insertion
    const firstExport = src.search(/\nexport (const|async|function)/);
    if (firstExport !== -1) {
      src = src.slice(0, firstExport + 1) + OPTIONS_FN + src.slice(firstExport + 1);
    }
  } else if (!hasOptions && hasCors && hasNextResponse) {
    // Has cors but no OPTIONS - just add OPTIONS
    const firstExport = src.search(/\nexport (const|async|function)/);
    if (firstExport !== -1) {
      src = src.slice(0, firstExport + 1) + OPTIONS_FN + src.slice(firstExport + 1);
    }
  }

  // D: Add Cache-Control to GET responses in static-ish endpoints
  const staticRoutes = ['banner', 'membership', 'mobile\\[id]\\prices', 'mobile\\search'];
  const isStatic = staticRoutes.some(s => file.includes(s));
  if (isStatic && src.includes('NextResponse.json(') && !src.includes('Cache-Control')) {
    // Inject cache header into the first GET NextResponse.json call by appending a headers option
    src = src.replace(
      /(return NextResponse\.json\([^)]+)\)/,
      (match, p1) => {
        // If already has second arg (options object), skip
        if (/,\s*\{/.test(p1)) return match;
        return p1 + `, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } })`;
      }
    );
  }

  if (src !== orig) {
    fs.writeFileSync(file, src, 'utf8');
    const rel = file.split('api')[1] || file;
    console.log('✅ Optimized:', rel);
    changed++;
  }
}

console.log(`\nDone. ${changed}/${files.length} files updated.`);
