const isolatedRoutes = ['/pilot', '/pilot/admin', '/pilot/legacy', '/api/pilot/state'];

function normalizeOrigin(value) {
  if (!value) throw new Error('Pass a deployment origin as the first argument or set SITE_ORIGIN.');
  const url = new URL(value);
  const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (!isLocal && url.protocol !== 'https:') throw new Error('A public deployment must use HTTPS.');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an HTTP(S) deployment origin.');
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Use an exact origin without credentials, path, query, or fragment.');
  }
  return url.origin;
}

async function request(origin, path) {
  return fetch(new URL(path, `${origin}/`), {
    redirect: 'manual',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'cache-control': 'no-cache',
      'user-agent': 'GhostLayer-Challenge-Preflight/1.0',
    },
    signal: AbortSignal.timeout(15_000),
  });
}

function expectHeader(failures, response, name, expected) {
  const actual = response.headers.get(name) ?? '';
  const matches = typeof expected === 'string' ? actual.toLowerCase() === expected.toLowerCase() : expected.every((part) => actual.includes(part));
  if (!matches) failures.push(`${name} is ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`);
}

async function main() {
  const origin = normalizeOrigin(process.argv[2] ?? process.env.SITE_ORIGIN);
  const failures = [];
  const root = await request(origin, '/');
  const html = await root.text();

  if (root.status !== 200) {
    console.error(`Deployment preflight failed for ${origin}:`);
    console.error(`- Signed-out root returned HTTP ${root.status}; judges need HTTP 200 without an account.`);
    process.exitCode = 1;
    return;
  }
  const contentType = root.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/html')) failures.push(`Root content type is ${JSON.stringify(contentType)}, not HTML.`);

  for (const marker of ['Give agents tools.', 'find_customer', 'create_invoice_draft', 'WebMCP Challenge']) {
    if (!html.includes(marker)) failures.push(`Root HTML is missing ${JSON.stringify(marker)}.`);
  }

  expectHeader(failures, root, 'content-security-policy', ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"]);
  expectHeader(failures, root, 'x-frame-options', 'DENY');
  expectHeader(failures, root, 'x-content-type-options', 'nosniff');
  expectHeader(failures, root, 'referrer-policy', 'no-referrer');
  expectHeader(failures, root, 'permissions-policy', ['camera=()', 'geolocation=()', 'microphone=()', 'payment=()', 'usb=()']);
  if (root.headers.has('set-cookie')) failures.push('The public sandbox unexpectedly sets a cookie.');

  const routeResults = await Promise.all(isolatedRoutes.map(async (path) => ({ path, response: await request(origin, path) })));
  for (const { path, response } of routeResults) {
    await response.body?.cancel();
    if (response.status !== 404) failures.push(`${path} returned HTTP ${response.status}; expected isolated HTTP 404.`);
  }

  if (failures.length > 0) {
    console.error(`Deployment preflight failed for ${origin}:`);
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Deployment preflight passed for ${origin}.`);
  console.log(`- signed-out root: HTTP ${root.status}`);
  console.log('- security headers: present');
  console.log('- application cookies: none');
  console.log(`- isolated routes: ${isolatedRoutes.length} of ${isolatedRoutes.length} returned HTTP 404`);
}

main().catch((error) => {
  console.error(`Deployment preflight could not run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
