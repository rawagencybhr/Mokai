export default function handler(req: any, res: any) { 
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN; 

  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send("Verification failed");
    }
  }

  if (req.method === "POST") { 
    console.log("Webhook Received:", JSON.stringify(req.body, null, 2)); 
    return res.status(200).send("EVENT_RECEIVED"); 
  } 

  return res.status(405).send("Method Not Allowed");
}
