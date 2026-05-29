import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')

  if (!signature || !endpointSecret) {
    return new Response('Webhook Error: Sem assinatura ou secret ausente', { status: 400 })
  }

  const body = await req.text()
  let event

  try {
    event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const clinicaId = session.client_reference_id;
      const customerId = session.customer;

      if (clinicaId) {
        await supabaseAdmin
          .from('clinicas')
          .update({ 
             status_pagamento: 'ativo', 
             stripe_customer_id: customerId,
             plano: 'prata', // TODO: Fazer match com o priceId da session
             limite_mensagens: 1000,
             limite_procedimentos: 30
          })
          .eq('id', clinicaId)
      }
    } else if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.canceled') {
      const subscription = event.data.object as any;
      const customerId = subscription.customer;
      
      await supabaseAdmin
          .from('clinicas')
          .update({ 
             status_pagamento: 'cancelado'
          })
          .eq('stripe_customer_id', customerId)
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (error: any) {
    return new Response(`Error: ${error.message}`, { status: 400 })
  }
})
