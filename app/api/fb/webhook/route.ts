import { NextRequest, NextResponse } from 'next/server';
import { FacebookChatService } from '@/lib/services/chat';
import { getFbCredsFromAccount } from '@/lib/chat-config';
import type { FbWebhookBody } from '@/lib/services/chat';

const fbService = new FacebookChatService();

// GET - Facebook webhook verification
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge) {
      return NextResponse.json({ error: 'Invalid verification request' }, { status: 400 });
    }

    const matched = await fbService.verifySubscription(token);
    if (!matched) {
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 });
    }

    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (error) {
    console.error('FB webhook verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

// POST - Receive Facebook webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const envAppSecret = process.env.FACEBOOK_APP_SECRET || '';

    const webhookBody: FbWebhookBody = JSON.parse(body);

    if (webhookBody.object !== 'page') {
      return NextResponse.json({ status: 'ok' });
    }

    for (const entry of webhookBody.entry) {
      if (!entry.messaging) continue;

      const pageId = entry.id;

      const account = await fbService.findAccountByPageId(pageId);
      if (!account) {
        console.error('FB webhook: no chat_account found for page_id:', pageId);
        continue;
      }

      const creds = getFbCredsFromAccount(account);
      if (!creds) {
        console.error('FB webhook: invalid credentials for account:', account.id);
        continue;
      }

      const appSecret = envAppSecret || creds.app_secret;
      const pageAccessToken = creds.page_access_token;
      const companyId = account.company_id;
      const chatAccountId = account.id;

      // Verify signature
      if (appSecret && !fbService.verifySignature(body, signature, appSecret)) {
        console.error('FB webhook: invalid signature for page_id:', pageId);
        continue;
      }

      for (const event of entry.messaging) {
        if (!event.message && !event.postback) continue;
        if (!event.message) continue; // postback handling can be added later

        const senderPsid = event.sender.id;
        const recipientId = event.recipient.id;
        const isEcho = event.message.is_echo === true;

        if (isEcho) {
          // Echo: message sent FROM our page (via Messenger or our API)
          // recipient.id = the user's PSID, sender.id = page
          const userPsid = recipientId;
          const contact = await fbService.getOrCreateContact(userPsid, pageId, pageAccessToken, companyId, chatAccountId);
          if (!contact) continue;

          await fbService.saveEchoMessage(contact, event, companyId);
        } else {
          // Incoming: message FROM user TO our page
          // Skip if sender is page itself (shouldn't happen without is_echo, but safety check)
          if (senderPsid === pageId) continue;

          const contact = await fbService.getOrCreateContact(senderPsid, pageId, pageAccessToken, companyId, chatAccountId);
          if (!contact) continue;

          await fbService.saveIncomingMessage(contact, event, companyId);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('FB webhook error:', error);
    return NextResponse.json({ status: 'ok' });
  }
}
