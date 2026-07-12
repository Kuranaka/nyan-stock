type SupportInquiry = {
  id: string;
  created_at?: string;
};

type ProductLinkReport = {
  id: string;
  product_name?: string;
  issue_type?: string;
  created_at?: string;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  record?: SupportInquiry | ProductLinkReport | null;
};

const recipient = 'support@nyanstock.com';
const sender = 'にゃんストック <support@nyanstock.com>';
const allowedTables = new Set(['support_inquiries', 'product_link_reports']);

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const webhookSecret = Deno.env.get('SUPPORT_INQUIRY_WEBHOOK_SECRET');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!webhookSecret || !resendApiKey) return json({ error: 'missing_configuration' }, 500);

  if (request.headers.get('x-support-inquiry-webhook-secret') !== webhookSecret) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = (await request.json()) as DatabaseWebhookPayload;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (payload.type !== 'INSERT' || !payload.table || !allowedTables.has(payload.table) || !payload.record?.id) {
    return json({ error: 'unsupported_webhook' }, 400);
  }

  const notification = buildNotification(payload);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      // A database webhook can be retried. Keep one notification per report for 24 hours.
      'Idempotency-Key': `nyanstock-${payload.table}-${payload.record.id}`,
    },
    body: JSON.stringify({
      from: sender,
      to: [recipient],
      subject: notification.subject,
      text: notification.text,
    }),
  });

  if (!response.ok) {
    console.error('[support-inquiry-notify] Resend request failed', response.status, await response.text());
    return json({ error: 'email_send_failed' }, 502);
  }

  return json({ notified: true });
});

function buildNotification(payload: DatabaseWebhookPayload): { subject: string; text: string } {
  const createdAt = payload.record?.created_at ?? '不明';
  if (payload.table === 'support_inquiries') {
    return {
      subject: '【にゃんストック】新しいお問い合わせ',
      text: `新しいお問い合わせが届いています。\n\nID: ${payload.record?.id}\n受信日時: ${createdAt}\n\n本文は Supabase の support_inquiries テーブルで確認してください。`,
    };
  }

  const report = payload.record as ProductLinkReport;
  return {
    subject: '【にゃんストック】商品情報の報告',
    text: `商品情報に関する報告が届いています。\n\nID: ${report.id}\n商品: ${report.product_name ?? '不明'}\n種別: ${report.issue_type ?? '不明'}\n受信日時: ${createdAt}\n\n詳細は Supabase の product_link_reports テーブルで確認してください。`,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
