// Temporary sharing server: expose the built site and explicitly allowed API routes.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../frontend/dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function fail(res, status, message) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ message }));
}
function inside(file) {
  const relative = path.relative(root, file);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return fail(res, 400, '잘못된 요청입니다.'); }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (url.pathname.startsWith('/api/')) {
    const readOnly = /^\/api\/(?:status|regions|districts|tours|places(?:\/(?:[0-9]{1,20}|csv-[a-f0-9]{20}))?)$/.test(url.pathname);
    const identifier = '[a-f0-9-]{36}';
    const communityRoutes = [
      [/^\/api\/places\/(?:[0-9]{1,20}|csv-[a-f0-9]{20})\/kakao-photo$/, ['POST']],
      [/^\/api\/community\/profile$/, ['GET', 'HEAD', 'POST']],
      [/^\/api\/community\/courses$/, ['GET', 'HEAD', 'POST']],
      [new RegExp(`^/api/community/courses/${identifier}$`), ['GET', 'HEAD', 'PUT', 'DELETE']],
      [new RegExp(`^/api/community/courses/${identifier}/like$`), ['PUT']],
    ];
    const route = communityRoutes.find(([pattern]) => pattern.test(url.pathname));
    if (!readOnly && !route) return fail(res, 404, '경로를 찾을 수 없습니다.');
    const allowed = readOnly ? ['GET', 'HEAD'] : route[1];
    if (!allowed.includes(req.method)) { res.setHeader('Allow', allowed.join(', ')); return fail(res, 405, '지원하지 않는 요청입니다.'); }
    const headers = { Accept: 'application/json' };
    if (!readOnly) {
      if (req.headers.cookie) headers.Cookie = req.headers.cookie;
      if (req.headers['x-community-client']) headers['X-Community-Client'] = req.headers['x-community-client'];
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      if (Number(req.headers['content-length']) > 850000) return fail(res, 413, '사진 또는 글의 용량이 너무 커요.');
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: 8080, path: url.pathname + url.search, method: req.method, headers }, response => {
      const resultHeaders = { 'Content-Type': response.headers['content-type'] || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (!readOnly && response.headers['set-cookie']) resultHeaders['Set-Cookie'] = response.headers['set-cookie'];
      res.writeHead(response.statusCode || 502, resultHeaders);
      response.pipe(res);
    });
    upstream.setTimeout(120000, () => upstream.destroy());
    upstream.on('error', () => { if (res.writableEnded) return; if (!res.headersSent) fail(res, 502, '백엔드 서버를 실행한 뒤 다시 시도해주세요.'); else res.destroy(); });
    req.on('aborted', () => upstream.destroy());
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > 850000) { if (!res.headersSent) fail(res, 413, '사진 또는 글의 용량이 너무 커요.'); req.unpipe(upstream); upstream.destroy(); } });
    req.pipe(upstream);
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return fail(res, 405, '지원하지 않는 요청입니다.'); }
  try {
    const pathname = decodeURIComponent(url.pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!inside(target)) return fail(res, 404, '파일을 찾을 수 없습니다.');
    const file = await realpath(target);
    if (!inside(file)) return fail(res, 404, '파일을 찾을 수 없습니다.');
    const info = await stat(file);
    if (!info.isFile()) return fail(res, 404, '파일을 찾을 수 없습니다.');
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { fail(res, 404, '파일을 찾을 수 없습니다.'); }
});
server.listen(4174, '127.0.0.1', () => console.log('Temporary preview: http://127.0.0.1:4174'));
server.on('error', error => { console.error(error.code || 'PREVIEW_START_FAILED'); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
