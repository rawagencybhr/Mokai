import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../services/firebaseConfig.js';

export default async function handler(req: any, res: any) {
  try {
    const fullUrl = `${req.headers["x-forwarded-proto"]}://${req.headers.host}${req.url}`;
    const url = new URL(fullUrl);

    const code = url.searchParams.get("code");
    const botId = url.searchParams.get("state");

    if (!code || !botId) {
      return res.status(400).send("Missing code or state");
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = `${url.origin}/api/instagram/oauth/callback`;

    // 1) Exchange code for access token
    const tokenUrl =
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(500).send(`Error exchanging token: ${tokenData.error.message}`);
    }

    const shortLivedToken = tokenData.access_token;

    // 2) Get user pages
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${shortLivedToken}&fields=id,name,access_token,instagram_business_account`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return res.status(404).send("No pages found");
    }

    const connectedPage = pagesData.data.find((p: any) => p.instagram_business_account);
    if (!connectedPage) {
      return res.status(404).send("No Instagram Business Account linked");
    }

    const pageId = connectedPage.id;
    const pageAccessToken = connectedPage.access_token;
    const igBusinessId = connectedPage.instagram_business_account.id;

    // 3) Get IG username
    const igDetailsRes = await fetch(
      `https://graph.facebook.com/v21.0/${igBusinessId}?fields=username&access_token=${pageAccessToken}`
    );
    const igDetails = await igDetailsRes.json();

    // Save to Firestore
    const botRef = doc(db, "bots", botId);
    await updateDoc(botRef, {
      instagramConnected: true,
      instagramAccessToken: pageAccessToken,
      instagramBusinessId: igBusinessId,
      instagramPageId: pageId,
      instagramUsername: igDetails.username,
      connectedAt: new Date().toISOString(),
    });

    return res.redirect(`${url.origin}?success=true`);

  } catch (e: any) {
    console.error("OAuth Callback Error:", e);
    return res.status(500).send(e.toString());
  }
}
