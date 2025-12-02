import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig.js';

export default async function handler(request: Request) {
  // --- FIX: Build full URL for Vercel ---
  const host = request.headers.get("host");
  const url = new URL(request.url, `https://${host}`);

  const code = url.searchParams.get('code');
  const botId = url.searchParams.get('state');

  if (!code || !botId) {
    return new Response('Missing code or state', { status: 400 });
  }

  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = `${url.origin}/api/instagram/oauth/callback`;

    // 1) Exchange Code for Token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new Response(`Error exchanging token: ${tokenData.error.message}`, { status: 500 });
    }

    const shortLivedToken = tokenData.access_token;

    // 2) Get user's pages
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${shortLivedToken}&fields=id,name,access_token,instagram_business_account`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    const connectedPage = pagesData.data?.find((p: any) => p.instagram_business_account);

    if (!connectedPage) {
      return new Response('No Instagram Business Account linked.', { status: 404 });
    }

    const pageId = connectedPage.id;
    const pageAccessToken = connectedPage.access_token;
    const instagramBusinessId = connectedPage.instagram_business_account.id;

    // 3) Get IG username
    const igDetailsUrl = `https://graph.facebook.com/v21.0/${instagramBusinessId}?fields=username&access_token=${pageAccessToken}`;
    const igDetailsRes = await fetch(igDetailsUrl);
    const igDetails = await igDetailsRes.json();

    // 4) Exchange for Long-lived token
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${pageAccessToken}`;
    const longLivedRes = await fetch(longLivedUrl);
    const longLivedData = await longLivedRes.json();

    const finalToken = longLivedData.access_token || pageAccessToken;

    // 5) Save to Firestore
    const botRef = doc(db, 'bots', botId);

    await updateDoc(botRef, {
      instagramConnected: true,
      instagramAccessToken: finalToken,
      instagramBusinessId,
      instagramPageId: pageId,
      instagramUsername: igDetails.username,
      longLivedToken: finalToken,
      connectedAt: new Date().toISOString(),
    } as any);

    // 6) Redirect to dashboard
    return Response.redirect(`${url.origin}?success=true`);

  } catch (error: any) {
    console.error("OAuth Callback Error:", error);
    return new Response(`Internal Error: ${error.message}`, { status: 500 });
  }
}
