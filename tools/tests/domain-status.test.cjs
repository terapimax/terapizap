const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('../../zapflow-app/node_modules/typescript');

const src = path.resolve(__dirname, '../../zapflow-app/src');
const domain = 'crm.empresa.example';
const projectId = 'prj_painel';

function load(relativeFile, imports, runtime = {}) {
  const source = readFileSync(path.join(src, relativeFile), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, require: (name) => { assert.ok(name in imports, name); return imports[name]; },
    process: { env: {} }, AbortSignal, Response, URL, ...runtime,
  }, { filename: relativeFile });
  return exports;
}

const brand = load('lib/brand.ts', { './brand-kit': {} });
const manual = { domain, automatic: false, status: 'manual', project: projectId };

function client(saved, probe) {
  const calls = [];
  const { fetchDomainStatus } = load('lib/domain-client.ts', { './brand': brand }, {
    window: { location: new URL('https://painel.example') },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url === '/api/domain') return Response.json(saved);
      return probe();
    },
  });
  return { check: fetchDomainStatus, calls };
}

test('um domínio salvo manualmente precisa responder por HTTPS pelo mesmo projeto', async () => {
  const { check, calls } = client(manual, () => Response.json({ project: projectId }));
  assert.equal((await check({ domain })).status, 'connected');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[1].url, 'https://' + domain + '/api/domain/check');
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[1].options.redirect, 'error');
  assert.equal(calls[1].options.referrerPolicy, 'no-referrer');
  assert.equal((await client(manual, () => Response.json({ project: 'outro' })).check()).status, 'manual');
  assert.equal((await client(manual, () => new Response('TLS', { status: 525 })).check()).status, 'manual');
  const configured = { ...manual, status: 'connected', automatic: true };
  assert.equal((await client(configured, () => { throw new Error('TLS'); }).check()).status, 'https');
});

test('respostas incompletas geram erro visível e um domínio vazio não faz consulta externa', async () => {
  const malformed = client({}, () => assert.fail('consulta inesperada'));
  await assert.rejects(malformed.check(), /confirmar o estado/);
  assert.equal(malformed.calls.length, 1);
  const empty = client({ domain: null, automatic: false, status: 'none' }, () => assert.fail('consulta inesperada'));
  assert.equal((await empty.check()).status, 'none');
  assert.equal(empty.calls.length, 1);
  assert.equal(brand.cleanDomain('https://'), null);
  assert.equal(brand.cleanDomain('  '), '');
});

function api(hostingFetch) {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'conta' } } }) },
    from(table) {
      assert.equal(table, 'branding');
      return { select: () => ({ maybeSingle: async () => ({ data: { custom_domain: domain } }) }) };
    },
  };
  return load('app/api/domain/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/brand': brand,
    '@/lib/domain-status': { domainProject: projectId },
  }, {
    process: { env: { VERCEL_PROJECT_ID: projectId, VERCEL_TOKEN: 'fixture' } },
    fetch: (url, init) => hostingFetch(new URL(url), init),
  });
}

test('a verificação do TXT consulta a Vercel novamente sem alterar o domínio salvo', async () => {
  let verified = false;
  let txtReady = false;
  let verifyCalls = 0;
  const project = () => ({ apexName: 'empresa.example', verified,
    verification: [{ type: 'TXT', domain: '_vercel.empresa.example', value: 'prova' }] });
  const { GET, POST } = api((url, init) => {
    if (url.pathname.endsWith('/verify')) {
      assert.equal(init.method, 'POST');
      verifyCalls++;
      verified = txtReady;
      return verified ? Response.json(project()) : Response.json({}, { status: 400 });
    }
    if (url.pathname.endsWith('/config')) {
      assert.equal(url.searchParams.get('projectIdOrName'), projectId);
      return Response.json({ misconfigured: false, recommendedCNAME: [{ rank: 1, value: 'projeto.example.' }] });
    }
    assert.equal(url.pathname, '/v9/projects/' + projectId + '/domains/' + domain);
    return Response.json(project());
  });
  const initial = await (await GET()).json();
  assert.equal(initial.status, 'pending');
  assert.equal(initial.verification[0].name, '_vercel');
  assert.deepEqual(initial.record, { type: 'CNAME', name: 'crm', value: 'projeto.example.' });
  assert.equal(verifyCalls, 0);
  const recheck = () => POST(new Request('https://painel.example/api/domain', {
    method: 'POST', body: JSON.stringify({ domain, action: 'verify' }),
  }));
  assert.equal((await (await recheck()).json()).status, 'pending');
  assert.equal(verifyCalls, 1);
  txtReady = true;
  assert.equal((await (await recheck()).json()).status, 'connected');
  assert.equal(verifyCalls, 2);
});

test('o teste público devolve apenas a identificação pública do projeto', async () => {
  const { GET } = load('app/api/domain/check/route.ts', { '@/lib/domain-status': { domainProject: projectId } });
  const response = GET();
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { project: projectId });
});
