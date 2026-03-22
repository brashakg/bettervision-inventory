const rawStoreUrl = process.env.SHOPIFY_STORE_URL || "";
const SHOPIFY_STORE_URL = rawStoreUrl.startsWith("http") ? rawStoreUrl : `https://${rawStoreUrl}`;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || "";
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || "";
const SHOPIFY_LEGACY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ADMIN_TOKEN || "";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (SHOPIFY_CLIENT_ID && SHOPIFY_CLIENT_SECRET) {
    if (cachedToken && Date.now() < cachedToken.expiresAt - 300000) {
      return cachedToken.token;
    }
    const response = await fetch(
      `${SHOPIFY_STORE_URL}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      }
    );
    if (!response.ok) {
      throw new Error(`OAuth token request failed: HTTP ${response.status}`);
    }
    const data = await response.json();
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 86399) * 1000,
    };
    return cachedToken.token;
  }
  if (SHOPIFY_LEGACY_TOKEN) {
    return SHOPIFY_LEGACY_TOKEN;
  }
  throw new Error("No Shopify credentials configured.");
}

// ─── GraphQL helpers ───────────────────────────────────

interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: string[];
}
interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

async function makeGraphQLRequest<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const accessToken = await getAccessToken();
    const response = await fetch(
      `${SHOPIFY_STORE_URL}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables: variables || {} }),
      }
    );
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }
    const result: GraphQLResponse<T> = await response.json();
    if (result.errors && result.errors.length > 0) {
      return { success: false, error: result.errors.map((e) => e.message).join("; ") };
    }
    return { success: true, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ─── Types ─────────────────────────────────────────────

export interface ShopifyVariantInput {
  optionValues: Array<{ optionName: string; name: string }>;
  price: string;
  compareAtPrice?: string;
  sku?: string;
  barcode?: string;
}

export interface CreateProductInput {
  title: string;
  description?: string;
  images?: Array<{ src: string; alt?: string }>;
  variants?: ShopifyVariantInput[];
  productOptions?: Array<{ name: string; values: Array<{ name: string }> }>;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
}

export interface CreateProductResult {
  success: boolean;
  shopifyId?: string;
  variantIds?: Array<{ sku?: string; shopifyVariantId: string; title?: string; inventoryItemId?: string }>;
  message: string;
}

// ─── CREATE PRODUCT (with variants) ────────────────────

export async function createProduct(
  productData: CreateProductInput
): Promise<CreateProductResult> {
  const mutation = `
    mutation CreateProduct($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          handle
          title
          variants(first: 50) {
            edges {
              node {
                id
                sku
                title
                price
                inventoryItem {
                  id
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const input: Record<string, unknown> = {
    title: productData.title,
    descriptionHtml: productData.description || "",
    tags: productData.tags || [],
    status: "ACTIVE",
    seo: {
      title: productData.seoTitle || productData.title,
      description: productData.seoDescription || "",
    },
  };

  // Add product options (Color, Size) if variants exist
  if (productData.productOptions && productData.productOptions.length > 0) {
    input.productOptions = productData.productOptions;
  }

  // Add variants
  if (productData.variants && productData.variants.length > 0) {
    input.variants = productData.variants;
  }

  const media = (productData.images || []).map((img) => ({
    originalSource: img.src,
    alt: img.alt || "",
    mediaContentType: "IMAGE",
  }));

  const result = await makeGraphQLRequest<{
    productCreate: {
      product: {
        id: string;
        handle: string;
        title: string;
        variants: {
          edges: Array<{
            node: {
              id: string;
              sku: string;
              title: string;
              price: string;
              inventoryItem: { id: string };
            };
          }>;
        };
      } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { input, media: media.length > 0 ? media : undefined });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to create product" };
  }

  const userErrors = result.data?.productCreate.userErrors || [];
  if (userErrors.length > 0) {
    return {
      success: false,
      message: userErrors.map((e) => `${e.field}: ${e.message}`).join("; "),
    };
  }

  const product = result.data?.productCreate.product;
  if (!product?.id) {
    return { success: false, message: "Product created but no ID returned" };
  }

  const variantIds = (product.variants?.edges || []).map((edge) => ({
    sku: edge.node.sku,
    shopifyVariantId: edge.node.id,
    title: edge.node.title,
    inventoryItemId: edge.node.inventoryItem?.id,
  }));

  return {
    success: true,
    shopifyId: product.id,
    variantIds,
    message: "Product created successfully",
  };
}

// ─── UPDATE PRODUCT ────────────────────────────────────

export interface UpdateProductInput {
  title?: string;
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  tags?: string[];
}

export async function updateProduct(
  shopifyId: string,
  productData: UpdateProductInput
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation UpdateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id title }
        userErrors { field message }
      }
    }
  `;

  const input: Record<string, unknown> = { id: shopifyId };
  if (productData.title) input.title = productData.title;
  if (productData.description) input.descriptionHtml = productData.description;
  if (productData.tags) input.tags = productData.tags;

  const seo: Record<string, string> = {};
  if (productData.seoTitle) seo.title = productData.seoTitle;
  if (productData.seoDescription) seo.description = productData.seoDescription;
  if (Object.keys(seo).length > 0) input.seo = seo;

  const result = await makeGraphQLRequest<{
    productUpdate: {
      product: { id: string; title: string } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { input });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to update product" };
  }
  const errors = result.data?.productUpdate.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Product updated successfully" };
}

// ─── CREATE / UPDATE VARIANT ───────────────────────────

export async function createVariant(
  shopifyProductId: string,
  variant: ShopifyVariantInput
): Promise<{ success: boolean; shopifyVariantId?: string; message: string }> {
  const mutation = `
    mutation CreateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          sku
          title
          inventoryItem { id }
        }
        userErrors { field message }
      }
    }
  `;

  const result = await makeGraphQLRequest<{
    productVariantsBulkCreate: {
      productVariants: Array<{
        id: string;
        sku: string;
        title: string;
        inventoryItem: { id: string };
      }>;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { productId: shopifyProductId, variants: [variant] });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to create variant" };
  }
  const errors = result.data?.productVariantsBulkCreate.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  const created = result.data?.productVariantsBulkCreate.productVariants?.[0];
  return {
    success: true,
    shopifyVariantId: created?.id,
    message: "Variant created successfully",
  };
}

export async function updateVariantPrice(
  shopifyVariantId: string,
  price: string,
  compareAtPrice?: string
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation UpdateVariant($input: ProductVariantInput!) {
      productVariantUpdate(input: $input) {
        productVariant { id price }
        userErrors { field message }
      }
    }
  `;

  const input: Record<string, unknown> = { id: shopifyVariantId, price };
  if (compareAtPrice) input.compareAtPrice = compareAtPrice;

  const result = await makeGraphQLRequest<{
    productVariantUpdate: {
      productVariant: { id: string; price: string } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { input });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to update variant" };
  }
  const errors = result.data?.productVariantUpdate.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Variant updated successfully" };
}

// ─── INVENTORY ─────────────────────────────────────────

export async function updateInventory(
  inventoryItemId: string,
  locationId: string,
  quantity: number
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation AdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
      inventoryAdjustQuantities(input: $input) {
        inventoryAdjustmentGroup { createdAt reason }
        userErrors { field message }
      }
    }
  `;

  const result = await makeGraphQLRequest<{
    inventoryAdjustQuantities: {
      inventoryAdjustmentGroup: Record<string, unknown> | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, {
    input: {
      reason: "CORRECTION",
      changes: [{ inventoryItemId, locationId, quantityAdjustment: quantity }],
    },
  });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to update inventory" };
  }
  const errors = result.data?.inventoryAdjustQuantities.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Inventory updated successfully" };
}

// ─── DELETE PRODUCT ────────────────────────────────────

export async function deleteProduct(
  shopifyId: string
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation DeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        deletedProductId
        userErrors { field message }
      }
    }
  `;

  const result = await makeGraphQLRequest<{
    productDelete: {
      deletedProductId: string | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { input: { id: shopifyId } });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to delete product" };
  }
  const errors = result.data?.productDelete.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Product deleted successfully" };
}

// ─── COLLECTIONS ──────────────────────────────────────

export interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml: string;
  sortOrder: string;
  templateSuffix: string | null;
  image: { url: string; altText: string | null } | null;
  seo: { title: string | null; description: string | null };
  productsCount: { count: number };
  ruleSet: { appliedDisjunctively: boolean; rules: Array<{ column: string; relation: string; condition: string }> } | null;
  updatedAt: string;
}

export async function fetchAllCollections(): Promise<{
  success: boolean;
  collections?: ShopifyCollection[];
  error?: string;
}> {
  const query = `
    query FetchCollections($cursor: String) {
      collections(first: 50, after: $cursor) {
        edges {
          cursor
          node {
            id
            title
            handle
            description
            descriptionHtml
            sortOrder
            templateSuffix
            image { url altText }
            seo { title description }
            productsCount { count }
            ruleSet {
              appliedDisjunctively
              rules { column relation condition }
            }
            updatedAt
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const allCollections: ShopifyCollection[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  interface CollectionsResponse {
    collections: {
      edges: Array<{ cursor: string; node: ShopifyCollection }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }

  while (hasNextPage) {
    const result: { success: boolean; data?: CollectionsResponse; error?: string } =
      await makeGraphQLRequest<CollectionsResponse>(query, { cursor });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || "Failed to fetch collections" };
    }

    for (const edge of result.data.collections.edges) {
      allCollections.push(edge.node);
    }

    hasNextPage = result.data.collections.pageInfo.hasNextPage;
    cursor = result.data.collections.pageInfo.endCursor || null;
  }

  return { success: true, collections: allCollections };
}

export async function fetchCollectionProducts(
  collectionId: string
): Promise<{ success: boolean; productIds?: string[]; error?: string }> {
  const query = `
    query CollectionProducts($id: ID!, $cursor: String) {
      collection(id: $id) {
        products(first: 100, after: $cursor) {
          edges {
            node { id }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  `;

  const allProductIds: string[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  interface CollectionProductsResponse {
    collection: {
      products: {
        edges: Array<{ node: { id: string } }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  }

  while (hasNextPage) {
    const result: { success: boolean; data?: CollectionProductsResponse; error?: string } =
      await makeGraphQLRequest<CollectionProductsResponse>(query, { id: collectionId, cursor });

    if (!result.success || !result.data) {
      return { success: false, error: result.error || "Failed to fetch collection products" };
    }

    for (const edge of result.data.collection.products.edges) {
      allProductIds.push(edge.node.id);
    }

    hasNextPage = result.data.collection.products.pageInfo.hasNextPage;
    cursor = result.data.collection.products.pageInfo.endCursor || null;
  }

  return { success: true, productIds: allProductIds };
}

export async function updateCollection(
  shopifyCollectionId: string,
  data: {
    title?: string;
    description?: string;
    descriptionHtml?: string;
    seoTitle?: string;
    seoDescription?: string;
    sortOrder?: string;
    imageUrl?: string;
    imageAlt?: string;
  }
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation UpdateCollection($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection { id title }
        userErrors { field message }
      }
    }
  `;

  const input: Record<string, unknown> = { id: shopifyCollectionId };
  if (data.title) input.title = data.title;
  if (data.descriptionHtml !== undefined) input.descriptionHtml = data.descriptionHtml;
  if (data.sortOrder) input.sortOrder = data.sortOrder;

  const seo: Record<string, string> = {};
  if (data.seoTitle) seo.title = data.seoTitle;
  if (data.seoDescription) seo.description = data.seoDescription;
  if (Object.keys(seo).length > 0) input.seo = seo;

  if (data.imageUrl) {
    input.image = { src: data.imageUrl, altText: data.imageAlt || "" };
  }

  const result = await makeGraphQLRequest<{
    collectionUpdate: {
      collection: { id: string; title: string } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { input });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to update collection" };
  }
  const errors = result.data?.collectionUpdate.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Collection updated successfully" };
}

export async function addProductsToCollection(
  collectionId: string,
  productIds: string[]
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation CollectionAddProducts($id: ID!, $productIds: [ID!]!) {
      collectionAddProducts(id: $id, productIds: $productIds) {
        collection { id productsCount { count } }
        userErrors { field message }
      }
    }
  `;

  const result = await makeGraphQLRequest<{
    collectionAddProducts: {
      collection: { id: string } | null;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { id: collectionId, productIds });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to add products" };
  }
  const errors = result.data?.collectionAddProducts.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Products added to collection" };
}

export async function removeProductsFromCollection(
  collectionId: string,
  productIds: string[]
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation CollectionRemoveProducts($id: ID!, $productIds: [ID!]!) {
      collectionRemoveProducts(id: $id, productIds: $productIds) {
        userErrors { field message }
      }
    }
  `;

  const result = await makeGraphQLRequest<{
    collectionRemoveProducts: {
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { id: collectionId, productIds });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to remove products" };
  }
  const errors = result.data?.collectionRemoveProducts.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Products removed from collection" };
}

// ─── PRODUCT METAFIELDS ────────────────────────────────

export async function setProductMetafields(
  shopifyProductId: string,
  metafields: Array<{
    namespace: string;
    key: string;
    value: string;
    type: string;
  }>
): Promise<{ success: boolean; message: string }> {
  const mutation = `
    mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message }
      }
    }
  `;

  const input = metafields.map((mf) => ({ ...mf, ownerId: shopifyProductId }));

  const result = await makeGraphQLRequest<{
    metafieldsSet: {
      metafields: Array<{ id: string }>;
      userErrors: Array<{ field: string; message: string }>;
    };
  }>(mutation, { metafields: input });

  if (!result.success) {
    return { success: false, message: result.error || "Failed to set metafields" };
  }
  const errors = result.data?.metafieldsSet.userErrors || [];
  if (errors.length > 0) {
    return { success: false, message: errors.map((e) => `${e.field}: ${e.message}`).join("; ") };
  }
  return { success: true, message: "Metafields set successfully" };
}
