import { cert, getApps, initializeApp } from 'npm:firebase-admin@13.0.1/app';
import { getMessaging } from 'npm:firebase-admin@13.0.1/messaging';
import { getNewsImpact, isRelevantNews } from '../../../lib/news-relevance.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SOURCE = 'SM_News_24h';
const TELEGRAM_WEB_BASES = [
  'https://telegram.me/s',
  'https://telegram.dog/s'
];
const RETRY_WINDOW_MS = 15 * 60 * 1000;

const dbHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function fetchTimed(url: string, init: RequestInit = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetchTimed(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...dbHeaders, ...(init.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function expectedCronSecret() {
  const response = await fetchTimed(`${SUPABASE_URL}/rest/v1/rpc/get_backend_secret`, {
    method: 'POST',
    headers: dbHeaders,
    body: JSON.stringify({ secret_name: 'amyfx_cron_secret' })
  });
  if (!response.ok) throw new Error(`Unable to read cron secret: ${response.status}`);
  return response.json();
}

async function authorized(req: Request) {
  if ((req.headers.get('authorization') || '') === `Bearer ${SERVICE_ROLE_KEY}`) return true;
  const supplied = req.headers.get('x-amyfx-cron-secret') || '';
  if (!supplied) return false;
  const expected = await expectedCronSecret();
  return typeof expected === 'string' && expected.length > 20 && supplied === expected;
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTime(html: string, start: number, end: number) {
  const block = html.slice(start, Math.min(html.length, end + 1600));
  return block.match(/datetime="([^"]+)"/)?.[1]
    || html.slice(Math.max(0, start - 700), start).match(/datetime="([^"]+)"/)?.[1]
    || '';
}

function extractPosts(html: string) {
  const posts: Array<{ id: string; text: string; time: string; link: string }> = [];
  const regex = /data-post="SM_News_24h\/(\d+)"[\s\S]*?<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div class="tgme_widget_message_author|<div class="tgme_widget_message_footer)/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const text = decodeHtml(match[2]);
    if (text.length < 20) continue;
    posts.push({
      id: match[1],
      text,
      time: extractTime(html, match.index, regex.lastIndex),
      link: `https://telegram.me/${SOURCE}/${match[1]}`
    });
  }

  return posts.sort((a, b) => Number(b.id) - Number(a.id));
}

async function fetchSourcePosts() {
  let lastError: unknown;

  for (const base of TELEGRAM_WEB_BASES) {
    try {
      const response = await fetchTimed(`${base}/${SOURCE}?_=${Date.now()}`, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AmyFX-NewsSync/1.0'
        }
      }, 20000);
      const html = await response.text();
      if (!response.ok) {
        throw new Error(`Telegram ${response.status}: ${html.slice(0, 300)}`);
      }

      const posts = extractPosts(html).slice(0, 50);
      if (!posts.length) throw new Error('Telegram response contained no posts');
      return posts;
    } catch (error) {
      lastError = error;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError || 'unknown');
  throw new Error(`All Telegram web endpoints failed: ${message}`);
}

async function translate(text: string) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=id&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetchTimed(url, {}, 8000);
    if (!response.ok) return text;
    const data = await response.json();
    return Array.isArray(data?.[0])
      ? data[0].map((part: unknown[]) => String(part?.[0] || '')).join('').trim() || text
      : text;
  } catch (_) {
    return text;
  }
}

async function hash(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function startRun() {
  const rows = await rest('news_sync_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'running' })
  });
  return Number(rows?.[0]?.id || 0);
}

async function finishRun(id: number, patch: Record<string, unknown>) {
  if (!id) return;
  await rest(`news_sync_runs?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, finished_at: new Date().toISOString() })
  });
}

function parseFirebaseConfig() {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    || Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
    || Deno.env.get('FIREBASE_ADMIN_SDK');
  if (!raw) throw new Error('Firebase service account belum tersedia');

  let value = raw.trim();
  if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
  let parsed: any = JSON.parse(value);
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);

  const projectId = parsed.project_id || parsed.projectId;
  const clientEmail = parsed.client_email || parsed.clientEmail;
  const privateKey = String(parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('Firebase service account tidak lengkap');
  }
  return { projectId, clientEmail, privateKey };
}

function messaging() {
  if (!getApps().length) initializeApp({ credential: cert(parseFirebaseConfig()) });
  return getMessaging();
}

async function saveLog(
  newsId: number,
  deviceId: string,
  status: string,
  messageId: string | null,
  error: string | null
) {
  await rest('notification_logs?on_conflict=news_id,device_token_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      news_id: newsId,
      device_token_id: deviceId,
      status,
      provider_message_id: messageId,
      error: error?.slice(0, 1800) || null,
      sent_at: status === 'sent' ? new Date().toISOString() : null
    })
  });
}

async function disableDevice(id: string) {
  await rest(`device_tokens?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ enabled: false, updated_at: new Date().toISOString() })
  });
}

async function pushNews(inserted: any[]) {
  const since = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  const recent = await rest(
    `news?select=id,telegram_post_id,text_original,text_indonesian,impact,source,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc,id.asc&limit=50`
  ) || [];

  const newsMap = new Map<number, any>();
  for (const row of [...recent, ...inserted]) newsMap.set(Number(row.id), row);
  const newsRows = [...newsMap.values()].filter(
    row => isRelevantNews(row.text_original || row.text_indonesian || '')
  );
  const devices = await rest(
    'device_tokens?select=id,fcm_token&enabled=eq.true&order=last_seen_at.desc&limit=500'
  ) || [];

  if (!newsRows.length || !devices.length) {
    return { sent: 0, attempted: 0, configured: true, error: null };
  }

  const ids = newsRows.map(row => row.id).join(',');
  const logs = await rest(
    `notification_logs?select=news_id,device_token_id,status&news_id=in.(${ids})`
  ) || [];
  const delivered = new Set(
    logs.filter((row: any) => row.status === 'sent')
      .map((row: any) => `${row.news_id}|${row.device_token_id}`)
  );

  let client;
  try {
    client = messaging();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const pending = newsRows.flatMap(news => devices
      .filter((device: any) => !delivered.has(`${news.id}|${device.id}`))
      .map((device: any) => ({ news, device }))
    );
    await Promise.all(
      pending.map(({ news, device }) => saveLog(news.id, device.id, 'failed', null, message))
    );
    return { sent: 0, attempted: pending.length, configured: false, error: message };
  }

  let sent = 0;
  let attempted = 0;

  for (const news of newsRows) {
    const pendingDevices = devices.filter(
      (device: any) => !delivered.has(`${news.id}|${device.id}`)
    );
    if (!pendingDevices.length) continue;

    attempted += pendingDevices.length;
    const body = String(
      news.text_indonesian || news.text_original || 'Berita baru XAU/USD tersedia.'
    ).slice(0, 900);
    const postId = String(news.telegram_post_id || news.id);
    const title = news.impact === 'high'
      ? '🚨 Breaking News Penting XAU/USD'
      : '📰 Breaking News XAU/USD';

    try {
      const result = await client.sendEachForMulticast({
        tokens: pendingDevices.map((device: any) => device.fcm_token),
        data: {
          news_id: postId,
          id: postId,
          title,
          body,
          text: body,
          impact: String(news.impact || 'medium'),
          source: String(news.source || SOURCE),
          target_url: `https://appassets.androidplatform.net/assets/apps/market-intel/index.html#news=${encodeURIComponent(postId)}`
        },
        android: { priority: 'high', ttl: 300000 }
      });

      for (let index = 0; index < result.responses.length; index++) {
        const response = result.responses[index];
        const device = pendingDevices[index];
        if (response.success) {
          sent++;
          await saveLog(news.id, device.id, 'sent', response.messageId || null, null);
        } else {
          const code = String(response.error?.code || 'unknown');
          await saveLog(
            news.id,
            device.id,
            'failed',
            null,
            `${code}: ${response.error?.message || ''}`
          );
          if (
            code.includes('registration-token-not-registered')
            || code.includes('mismatched-credential')
          ) {
            await disableDevice(device.id);
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await Promise.all(
        pendingDevices.map((device: any) => saveLog(news.id, device.id, 'failed', null, message))
      );
    }
  }

  return { sent, attempted, configured: true, error: null };
}

export async function handler(req: Request) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let runId = 0;
  try {
    if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401);
    runId = await startRun();

    const candidates = await fetchSourcePosts();
    const existing = await rest('news?select=telegram_post_id&order=id.desc&limit=500') || [];
    const existingIds = new Set(existing.map((row: any) => String(row.telegram_post_id)));
    const missing = candidates.filter(post => !existingIds.has(post.id));

    const prepared: any[] = [];
    for (let index = 0; index < missing.length; index += 5) {
      const batch = missing.slice(index, index + 5);
      prepared.push(...await Promise.all(batch.map(async post => ({
        telegram_post_id: post.id,
        text_original: post.text,
        text_indonesian: await translate(post.text),
        published_at: post.time && !Number.isNaN(Date.parse(post.time))
          ? new Date(post.time).toISOString()
          : null,
        impact: getNewsImpact(post.text),
        source: SOURCE,
        source_url: post.link,
        content_hash: await hash(post.text)
      }))));
    }

    let inserted: any[] = [];
    if (prepared.length) {
      inserted = await rest('news?on_conflict=telegram_post_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(prepared)
      }) || [];
    }

    const push = await pushNews(inserted);
    await finishRun(runId, {
      status: push.error ? 'partial' : 'success',
      fetched_count: candidates.length,
      inserted_count: inserted.length,
      notification_count: push.sent,
      error: push.error
    });

    return json({
      ok: true,
      fetched: candidates.length,
      inserted: inserted.length,
      notifications_sent: push.sent,
      notifications_attempted: push.attempted,
      push_configured: push.configured,
      push_error: push.error,
      delivery: 'firebase_high_priority_data_push'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('news-sync failed', error);
    if (runId) {
      try {
        await finishRun(runId, { status: 'failed', error: message.slice(0, 2000) });
      } catch (_) {}
    }
    return json({ error: 'sync_failed', detail: message }, 500);
  }
}
