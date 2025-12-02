import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../services/firebaseConfig.js";

export default async function handler(req, res) {
  try {
    // Build full callback URL
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

    // 1. Exchange code for user access token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`;

    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res
        .status(500)
        .send(`Token exchange error: ${tokenData.error.message}`);
    }

    const userAccessToken = tokenData.access_token;

    // 2. Get the pages the user selected
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}&fields=id,name,access_token,instagram_business_account`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      return res.status(404).send("No pages found");
    }

    // Try to find a page with IG connected
    let connectedPage = pagesData.data.find(
      (p) => p.instagram_business_account
    );

    if (!connectedPage) {
      return res
        .status(404)
        .send("No Instagram Business Account linked to any Page");
    }

    const pageId = connectedPage.id;
    const pageAccessToken = connectedPage.access_token;
    const igBusinessId = connectedPage.instagram_business_account.id;

    // 3. Fetch Instagram username
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${igBusinessId}?fields=username&access_token=${pageAccessToken}`
    );
    const igData = await igRes.json();

    if (igData.error) {
      return res
        .status(500)
        .send(`Failed to fetch IG username: ${igData.error.message}`);
    }

    // 4. Save to Firestore
    const botRef = doc(db, "bots", botId);
    await updateDoc(botRef, {
      instagramConnected: true,
      instagramAccessToken: pageAccessToken,
      instagramBusinessId: igBusinessId,
      instagramPageId: pageId,
      instagramUsername: igData.username,
      connectedAt: new Date().toISOString(),
    });

    return res.redirect(`${url.origin}/?success=true`);
  } catch (err) {
    console.error("OAuth Callback Error:", err);
    return res.status(500).send(err.toString());
  }
}
