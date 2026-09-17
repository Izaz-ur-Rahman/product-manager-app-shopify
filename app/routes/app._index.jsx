import { Form, useLoaderData, useNavigate, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const PAGE_SIZE = 10;

const PRODUCTS_QUERY = `#graphql
  query getProducts(
    $first: Int
    $after: String
    $last: Int
    $before: String
    $query: String
  ) {
    products(
      first: $first
      after: $after
      last: $last
      before: $before
      query: $query
      sortKey: TITLE
    ) {
      edges {
        cursor
        node {
          id
          title
          status
          featuredImage {
            url
            altText
          }
          totalInventory
          variants(first: 1) {
            edges {
              node {
                id
                sku
                price
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const searchQuery = url.searchParams.get("query")?.trim() || "";
  const cursor = url.searchParams.get("cursor") || null;
  const direction = url.searchParams.get("direction") || "next";

  const baseVariables = searchQuery ? { query: searchQuery } : {};

  const variables =
    direction === "prev" && cursor
      ? { last: PAGE_SIZE, before: cursor, ...baseVariables }
      : { first: PAGE_SIZE, after: cursor || undefined, ...baseVariables };

  try {
    const response = await admin.graphql(PRODUCTS_QUERY, { variables });
    const result = await response.json();

    if (result.errors?.length) {
      return {
        products: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
        error:
          result.errors[0]?.message ||
          "Shopify returned an error while loading products.",
        searchQuery,
      };
    }

    const products = result.data.products.edges.map(({ node }) => {
      const variant = node.variants.edges[0]?.node;
      return {
        id: node.id,
        numericId: node.id.split("/").pop(),
        title: node.title,
        status: node.status,
        image: node.featuredImage?.url || null,
        inventory:
          typeof node.totalInventory === "number" ? node.totalInventory : null,
        sku: variant?.sku || "—",
        price: variant?.price ? `$${variant.price}` : "—",
      };
    });

    return {
      products,
      pageInfo: result.data.products.pageInfo,
      error: null,
      searchQuery,
    };
  } catch (err) {
    console.error("Product Dashboard: failed to fetch products", err);
    return {
      products: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      error:
        "Could not reach Shopify to load products. Please check your connection and try again.",
      searchQuery,
    };
  }
};

function buildPageLink(searchQuery, cursor, direction) {
  const params = new URLSearchParams();
  if (searchQuery) params.set("query", searchQuery);
  if (cursor) params.set("cursor", cursor);
  params.set("direction", direction);
  return `?${params.toString()}`;
}

const buttonStyle = {
  padding: "6px 14px",
  borderRadius: 4,
  border: "1px solid #333",
  background: "#1a1a1a",
  color: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const buttonStyleDisabled = {
  ...buttonStyle,
  border: "1px solid #ccc",
  background: "#f0f0f0",
  color: "#999",
  cursor: "not-allowed",
};

const secondaryButtonStyle = {
  padding: "5px 12px",
  borderRadius: 4,
  border: "1px solid #999",
  background: "#fff",
  color: "#1a1a1a",
  cursor: "pointer",
  fontSize: 13,
};

export default function ProductDashboard() {
  const { products, pageInfo, error, searchQuery } = useLoaderData();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const isLoading = navigation.state === "loading";

  return (
    <s-page heading="Products">
      <s-section heading="Product Dashboard">
        <Form method="get">
          <s-stack direction="inline" gap="base">
            <input
              type="text"
              name="query"
              defaultValue={searchQuery}
              placeholder="Search by title, SKU, vendor..."
              style={{
                padding: "6px 10px",
                border: "1px solid #c9cccf",
                borderRadius: 4,
                minWidth: 260,
              }}
            />
            <button
              type="submit"
              style={{
                padding: "6px 14px",
                borderRadius: 4,
                border: "1px solid #333",
                background: "#1a1a1a",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Search
            </button>
            {searchQuery && (
              <button
                type="button"
                onClick={() => navigate("/app")}
                style={secondaryButtonStyle}
              >
                Clear
              </button>
            )}
          </s-stack>
        </Form>

        {isLoading && (
          <s-paragraph>Loading products…</s-paragraph>
        )}

        {!isLoading && error && (
          <s-paragraph>
            <span style={{ color: "#d82c0d" }}>
              ⚠ {error}
            </span>
          </s-paragraph>
        )}

        {!isLoading && !error && products.length === 0 && (
          <s-paragraph>
            No products found{searchQuery ? ` for "${searchQuery}"` : ""}.
          </s-paragraph>
        )}

        {!isLoading && !error && products.length > 0 && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: "1rem",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
                <th style={{ padding: "8px" }}>Image</th>
                <th style={{ padding: "8px" }}>Title</th>
                <th style={{ padding: "8px" }}>SKU</th>
                <th style={{ padding: "8px" }}>Price</th>
                <th style={{ padding: "8px" }}>Inventory</th>
                <th style={{ padding: "8px" }}>Status</th>
                <th style={{ padding: "8px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "8px" }}>
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.title}
                        width={40}
                        height={40}
                        style={{ objectFit: "cover", borderRadius: 4 }}
                      />
                    ) : (
                      <span style={{ color: "#999" }}>No image</span>
                    )}
                  </td>
                  <td style={{ padding: "8px" }}>{product.title}</td>
                  <td style={{ padding: "8px" }}>{product.sku}</td>
                  <td style={{ padding: "8px" }}>{product.price}</td>
                  <td style={{ padding: "8px" }}>
                    {product.inventory ?? "—"}
                  </td>
                  <td style={{ padding: "8px" }}>{product.status}</td>
                  <td style={{ padding: "8px" }}>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/app/products/${product.numericId}`)
                      }
                      style={secondaryButtonStyle}
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <s-stack direction="inline" gap="base">
          <button
            type="button"
            disabled={!pageInfo.hasPreviousPage}
            onClick={() =>
              navigate(
                buildPageLink(searchQuery, pageInfo.startCursor, "prev"),
              )
            }
            style={
              pageInfo.hasPreviousPage ? buttonStyle : buttonStyleDisabled
            }
          >
            ← Previous
          </button>
          <button
            type="button"
            disabled={!pageInfo.hasNextPage}
            onClick={() =>
              navigate(buildPageLink(searchQuery, pageInfo.endCursor, "next"))
            }
            style={pageInfo.hasNextPage ? buttonStyle : buttonStyleDisabled}
          >
            Next →
          </button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
