import { useEffect, useState } from "react";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const PRODUCT_QUERY = `#graphql
  query getProduct($id: ID!) {
    product(id: $id) {
      id
      title
      description
      status
      productType
      vendor
      totalInventory
      images(first: 5) {
        edges {
          node {
            url
            altText
          }
        }
      }
      variants(first: 25) {
        edges {
          node {
            id
            title
            sku
            price
            inventoryQuantity
          }
        }
      }
    }
  }
`;

const UPDATE_PRODUCT_MUTATION = `#graphql
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        description
        status
        productType
        vendor
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const VALID_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"];

function resolveGid(rawId) {
  return rawId?.startsWith("gid://")
    ? rawId
    : `gid://shopify/Product/${rawId}`;
}

export const loader = async ({ params, request }) => {
  const { admin } = await authenticate.admin(request);

  const gid = resolveGid(params.id || "");

  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(gid)) {
    return { product: null, error: "Invalid product ID." };
  }

  try {
    const response = await admin.graphql(PRODUCT_QUERY, {
      variables: { id: gid },
    });
    const result = await response.json();

    if (result.errors?.length) {
      return {
        product: null,
        error:
          result.errors[0]?.message ||
          "Shopify returned an error while loading this product.",
      };
    }

    const node = result.data.product;

    if (!node) {
      return {
        product: null,
        error: "Product not found. It may have been deleted from Shopify.",
      };
    }

    const product = {
      id: node.id,
      title: node.title,
      description: node.description || "",
      status: node.status,
      productType: node.productType || "",
      vendor: node.vendor || "",
      totalInventory:
        typeof node.totalInventory === "number" ? node.totalInventory : null,
      images: node.images.edges.map((e) => e.node),
      variants: node.variants.edges.map((e) => e.node),
    };

    return { product, error: null };
  } catch (err) {
    console.error("Product Details: failed to fetch product", err);
    return {
      product: null,
      error:
        "Could not reach Shopify to load this product. Please check your connection and try again.",
    };
  }
};

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = resolveGid(params.id || "");

  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(gid)) {
    return { ok: false, error: "Invalid product ID." };
  }

  const formData = await request.formData();
  const title = formData.get("title")?.toString().trim() || "";
  const description = formData.get("description")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  const productType = formData.get("productType")?.toString() ?? "";
  const vendor = formData.get("vendor")?.toString() ?? "";

  if (!title) {
    return { ok: false, error: "Title cannot be empty." };
  }
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: "Please choose a valid status." };
  }

  try {
    const response = await admin.graphql(UPDATE_PRODUCT_MUTATION, {
      variables: {
        product: {
          id: gid,
          title,
          descriptionHtml: description,
          status,
          productType,
          vendor,
        },
      },
    });
    const result = await response.json();
    const payload = result.data?.productUpdate;

    if (result.errors?.length) {
      return {
        ok: false,
        error: result.errors[0]?.message || "Shopify rejected this update.",
      };
    }

    if (payload?.userErrors?.length) {
      return {
        ok: false,
        error: payload.userErrors.map((e) => e.message).join(" "),
      };
    }

    return { ok: true, error: null, savedAt: Date.now() };
  } catch (err) {
    console.error("Edit Product: failed to update product", err);
    return {
      ok: false,
      error:
        "Could not reach Shopify to save changes. Please check your connection and try again.",
    };
  }
};

const backButtonStyle = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "1px solid #333",
  background: "#1a1a1a",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const secondaryButtonStyle = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "1px solid #999",
  background: "#fff",
  color: "#1a1a1a",
  cursor: "pointer",
  fontSize: 14,
};

const inputStyle = {
  padding: "6px 10px",
  border: "1px solid #c9cccf",
  borderRadius: 4,
  width: "100%",
  maxWidth: 420,
  boxSizing: "border-box",
};

export default function ProductDetails() {
  const { product, error } = useLoaderData();
  const actionData = useActionData();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [isEditing, setIsEditing] = useState(false);
  const isSaving = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.ok) {
      setIsEditing(false);
    }
  }, [actionData]);

  if (error || !product) {
    return (
      <s-page heading="Product details" backAction="/app">
        <s-section>
          <s-paragraph>
            <span style={{ color: "#d82c0d" }}>
              ⚠ {error || "This product could not be loaded."}
            </span>
          </s-paragraph>
          <button
            type="button"
            onClick={() => navigate("/app")}
            style={backButtonStyle}
          >
            ← Back to dashboard
          </button>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading={product.title} backAction="/app">
      {actionData?.ok && (
        <s-section>
          <s-paragraph>
            <span style={{ color: "#108043" }}>
              ✔ Changes saved to Shopify.
            </span>
          </s-paragraph>
        </s-section>
      )}

      {actionData?.ok === false && (
        <s-section>
          <s-paragraph>
            <span style={{ color: "#d82c0d" }}>⚠ {actionData.error}</span>
          </s-paragraph>
        </s-section>
      )}

      <s-section heading="Overview">
        <s-stack direction="inline" gap="loose">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {product.images.length > 0 ? (
              product.images.map((img) => (
                <img
                  key={img.url}
                  src={img.url}
                  alt={img.altText || product.title}
                  width={100}
                  height={100}
                  style={{ objectFit: "cover", borderRadius: 6 }}
                />
              ))
            ) : (
              <span style={{ color: "#999" }}>No images</span>
            )}
          </div>
        </s-stack>

        {!isEditing && (
          <>
            <table style={{ marginTop: "1rem", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>
                    Status
                  </td>
                  <td style={{ padding: "4px 0" }}>{product.status}</td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>
                    Product type
                  </td>
                  <td style={{ padding: "4px 0" }}>
                    {product.productType || "—"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>
                    Vendor
                  </td>
                  <td style={{ padding: "4px 0" }}>{product.vendor || "—"}</td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 12px 4px 0", fontWeight: 600 }}>
                    Total inventory
                  </td>
                  <td style={{ padding: "4px 0" }}>
                    {product.totalInventory ?? "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ marginTop: "1rem" }}>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                style={backButtonStyle}
              >
                Edit product
              </button>
            </div>
          </>
        )}

        {isEditing && (
          <Form method="post" style={{ marginTop: "1rem" }}>
            <s-stack direction="block" gap="base">
              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                  Title
                </label>
                <input
                  type="text"
                  name="title"
                  defaultValue={product.title}
                  required
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                  Description
                </label>
                <textarea
                  name="description"
                  defaultValue={product.description}
                  rows={5}
                  style={{ ...inputStyle, maxWidth: 600, fontFamily: "inherit" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={product.status}
                  style={inputStyle}
                >
                  {VALID_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                  Product type
                </label>
                <input
                  type="text"
                  name="productType"
                  defaultValue={product.productType}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
                  Vendor
                </label>
                <input
                  type="text"
                  name="vendor"
                  defaultValue={product.vendor}
                  style={inputStyle}
                />
              </div>

              <s-stack direction="inline" gap="base">
                <button
                  type="submit"
                  disabled={isSaving}
                  style={backButtonStyle}
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSaving}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
              </s-stack>
            </s-stack>
          </Form>
        )}
      </s-section>

      {!isEditing && (
        <s-section heading="Description">
          <s-paragraph>
            {product.description || "No description provided."}
          </s-paragraph>
        </s-section>
      )}

      <s-section heading="Variants">
        <table
          style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}
        >
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
              <th style={{ padding: "8px" }}>Variant</th>
              <th style={{ padding: "8px" }}>SKU</th>
              <th style={{ padding: "8px" }}>Price</th>
              <th style={{ padding: "8px" }}>Inventory</th>
            </tr>
          </thead>
          <tbody>
            {product.variants.map((variant) => (
              <tr key={variant.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px" }}>{variant.title}</td>
                <td style={{ padding: "8px" }}>{variant.sku || "—"}</td>
                <td style={{ padding: "8px" }}>
                  {variant.price ? `$${variant.price}` : "—"}
                </td>
                <td style={{ padding: "8px" }}>
                  {variant.inventoryQuantity ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </s-section>

      <s-section>
        <button
          type="button"
          onClick={() => navigate("/app")}
          style={backButtonStyle}
        >
          ← Back to dashboard
        </button>
      </s-section>
    </s-page>
  );
}


export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
