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

// POST - Receive Facebook + Instagram webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const envAppSecret = process.env.FACEBOOK_APP_SECRET || '';

    const webhookBody: FbWebhookBody = JSON.parse(body);

    const isPage = webhookBody.object === 'page';
    const isInstagram = webhookBody.object === 'instagram';

    if (!isPage && !isInstagram) {
      console.log('Webhook: unknown object type:', webhookBody.object);
      return NextResponse.json({ status: 'ok' });
    }

    console.log('Webhook received:', webhookBody.object, 'entries:', webhookBody.entry.length);

    for (const entry of webhookBody.entry) {
      if (!entry.messaging) {
        console.log('Webhook: entry has no messaging field, keys:', Object.keys(entry));
        continue;
      }

      const entryId = entry.id; // Page ID for FB, IG Account ID for Instagram
      console.log('Webhook: entry messaging events:', entry.messaging.length, isInstagram ? 'igAccountId:' : 'pageId:', entryId);

      // Find the chat_account for this entry
      const account = isInstagram
        ? await fbService.findAccountByIgAccountId(entryId)
        : await fbService.findAccountByPageId(entryId);

      if (!account) {
        console.error(`Webhook: no chat_account found for ${isInstagram ? 'ig_account_id' : 'page_id'}:`, entryId);
        continue;
      }

      const creds = getFbCredsFromAccount(account);
      if (!creds) {
        console.error('Webhook: invalid credentials for account:', account.id);
        continue;
      }

      const appSecret = envAppSecret || creds.app_secret;
      const pageAccessToken = creds.page_access_token;
      const companyId = account.company_id;
      const chatAccountId = account.id;
      const pageId = creds.page_id; // Always use actual page_id for API calls

      // Verify signature
      if (appSecret && !fbService.verifySignature(body, signature, appSecret)) {
        console.error('Webhook: invalid signature for account:', account.id);
        continue;
      }

      for (const event of entry.messaging) {
        if (!event.message && !event.postback) continue;
        if (!event.message) continue; // postback handling can be added later

        const senderId = event.sender.id;
        const recipientId = event.recipient.id;
        const isEcho = event.message.is_echo === true;

        console.log('Webhook event:', { platform: isInstagram ? 'instagram' : 'facebook', isEcho, senderId, recipientId, hasMessage: !!event.message, mid: event.message?.mid });

        if (isEcho) {
          // Echo: message sent FROM our page/IG account
          // For IG: sender.id = IG account ID, recipient.id = IG user ID (IGSID)
          // For FB: sender.id = page ID, recipient.id = user PSID
          const userId = recipientId;
          const contact = await fbService.getOrCreateContact(userId, pageId, pageAccessToken, companyId, chatAccountId, isInstagram);
          if (!contact) continue;

          await fbService.saveEchoMessage(contact, event, companyId);
        } else {
          // Incoming: message FROM user TO our page/IG account
          // For IG: sender.id = IG user ID (IGSID), recipient.id = IG account ID
          // For FB: sender.id = user PSID, recipient.id = page ID
          if (isInstagram && senderId === entryId) continue;
          if (!isInstagram && senderId === pageId) continue;

          const contact = await fbService.getOrCreateContact(senderId, pageId, pageAccessToken, companyId, chatAccountId, isInstagram);
          if (!contact) continue;

          await fbService.saveIncomingMessage(contact, event, companyId);
        }
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ status: 'ok' });
  }
}
