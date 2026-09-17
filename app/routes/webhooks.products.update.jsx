import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  // authenticate.webhook(request) does two important things at once:
  // 1. It verifies the request's HMAC signature against our app's secret,
  //    proving this request genuinely came from Shopify and was not
  //    forged or tampered with in transit. If verification fails, it
  //    throws before any of our code below runs.
  // 2. It parses the request body into `payload` and tells us which shop
  //    and which webhook `topic` this is.
  let shop, topic, payload;

  try {
    ({ shop, topic, payload } = await authenticate.webhook(request));
  } catch (err) {
    console.error("products/update webhook: verification failed", err);
    // Returning a 401 tells Shopify the request was rejected. Shopify will
    // retry a legitimate webhook automatically, so this is safe.
    return new Response("Webhook verification failed", { status: 401 });
  }

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    const productId =
      payload?.admin_graphql_api_id ||
      (payload?.id ? `gid://shopify/Product/${payload.id}` : "unknown");

    await prisma.productActivity.create({
      data: {
        shop,
        productId,
        action: "webhook_products_update",
        oldValue: null,
        newValue: payload?.title
          ? `Shopify reported an update to "${payload.title}" (status: ${payload?.status || "unknown"})`
          : "Shopify reported a product update.",
      },
    });
  } catch (err) {
    // A failure to log should not cause Shopify to think the webhook
    // delivery itself failed, so we log the error but still return 200.
    console.error("products/update webhook: failed to write activity log", err);
  }

  return new Response();
};
