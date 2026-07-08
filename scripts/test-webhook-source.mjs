const webhookUrl = 'https://gykzvglfqzebexpczwvr.supabase.co/functions/v1/nuvempay-webhook';

const testSources = [
  'nuvempay',
  'nuvempago',
  'nuvemshop',
  'nuvem_pay',
  'nuvem_pago',
  'nuvem_shop',
  'mercadopago',
  'mercado_pago',
  'manual',
  'easydental',
  'whatsapp',
  'tiendanube',
  'tienda_nube',
  'venda'
];

async function testSource(source) {
  const payload = {
    saldo: 338.15,
    entries: [
      {
        posted_at: new Date().toISOString(),
        description: 'Teste de Source ' + source,
        amount: 10.00,
        counterparty: 'Teste Source',
        source_ref: 'test-ref-' + source + '-' + Date.now(),
        balance_after: 338.15,
        category: 'venda',
        source: source
      }
    ]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer cc22baf43f2c97c1595a2af63757d72741aa8954c43ab9e4',
        'X-Webhook-Secret': 'cc22baf43f2c97c1595a2af63757d72741aa8954c43ab9e4'
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    return {
      source,
      status: res.status,
      ok: data.ok,
      insert_error: data.insert_error
    };
  } catch (err) {
    return {
      source,
      error: err.message
    };
  }
}

async function main() {
  console.log('Testing sources against the webhook...');
  for (const src of testSources) {
    const res = await testSource(src);
    console.log(`Source: "${res.source}" -> OK: ${res.ok}, Status: ${res.status}, Error: ${res.insert_error || 'null'}`);
    if (res.insert_error === null) {
      console.log(`[SUCCESS] Found valid source: "${res.source}"`);
    }
  }
}

main().catch(console.error);
