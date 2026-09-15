import db from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session) {
    await db.session.updateMany({
      where: {
        shop,
      },
      data: {
        scope: current.toString(),
      },
    });
  }

  return new Response();
};
