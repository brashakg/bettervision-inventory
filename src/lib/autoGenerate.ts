// Use Record type for flexibility with Prisma models
type Product = Record<string, any>;

interface DiscountRule {
  category: string;
  percentage?: number;
  discountPercentage?: number;
}

export function generateTitle(product: Product): string {
  const parts = [
    product.brand,
    product.subBrand,
    product.fullModelNo,
    product.frameSize,
    product.frameColor,
    product.productName,
    product.category,
  ].filter(Boolean);

  return parts.join(" ");
}

export function generateSKU(product: Product): string {
  // Map category to short prefix
  const catMap: Record<string, string> = {
    SPECTACLES: "SP",
    SUNGLASSES: "SG",
    SOLUTIONS: "SL",
  };
  const prefix = catMap[(product.category || "").toUpperCase()] || "XX";

  // Brand code: first 3-4 chars
  const brand = (product.brand || "XX")
    .replace(/[^A-Za-z]/g, "")
    .substring(0, 4)
    .toUpperCase();

  const modelNo = (product.modelNo || "XXXX").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const size = (product.frameSize || "").replace(/[^\w]/g, "").toUpperCase();
  const color = (product.colorCode || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  // Format: SP-BOSS-1234-086-55
  const parts = [prefix, brand, modelNo];
  if (color) parts.push(color);
  if (size) parts.push(size);

  return parts.join("-");
}

export function generateSEOTitle(product: Product): string {
  return `Buy ${product.brand || ""} ${product.fullModelNo || ""} ${product.frameSize || ""} ${product.frameColor || ""} ${product.gender || ""} ${product.category || ""} | Better Vision`.trim();
}

export function generateSEODescription(product: Product): string {
  return `Shop authentic ${product.brand || ""} ${product.productName || ""} ${product.shape || ""} ${product.frameType || ""}. ${product.frameColor || ""} frame with ${product.templeColor || ""} temples. ${product.frameMaterial || ""} frame. Best discounted prices with pan-India free shipping. COD available.`.trim();
}

export function generatePageUrl(product: Product): string {
  const title = generateTitle(product);
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateTags(product: Product): string {
  const tags: string[] = [];

  if (product.brand) tags.push(`brand_${product.brand.toLowerCase()}`);
  if (product.shape) tags.push(`shape_${product.shape.toLowerCase()}`);
  if (product.frameColor) tags.push(`framecolor_${product.frameColor.toLowerCase()}`);
  if (product.frameMaterial)
    tags.push(`framematerial_${product.frameMaterial.toLowerCase()}`);
  if (product.frameType) tags.push(`frametype_${product.frameType.toLowerCase()}`);
  if (product.gender) tags.push(`gender_${product.gender.toLowerCase()}`);
  if (product.category) tags.push(`category_${product.category.toLowerCase()}`);
  if (product.templeColor)
    tags.push(`templecolor_${product.templeColor.toLowerCase()}`);
  if (product.subBrand) tags.push(`subbrand_${product.subBrand.toLowerCase()}`);

  return tags.join(", ");
}

export function generateHTMLDescription(product: Product): string {
  const styles = `
    <style>
      .product-details-section {
        font-family: Arial, sans-serif;
        color: #333;
        line-height: 1.6;
      }
      .section-title {
        font-size: 18px;
        font-weight: bold;
        margin: 20px 0 10px 0;
        color: #1a1a1a;
        border-bottom: 2px solid #007bff;
        padding-bottom: 8px;
      }
      .details-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
      }
      .details-table th,
      .details-table td {
        border: 1px solid #ddd;
        padding: 12px;
        text-align: left;
      }
      .details-table th {
        background-color: #f8f9fa;
        font-weight: bold;
        color: #333;
      }
      .details-table tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      .details-table tr:hover {
        background-color: #f0f0f0;
      }
    </style>
  `;

  const productDetailsRows = [
    ["Frame Color", product.frameColor || "N/A"],
    ["Temple Color", product.templeColor || "N/A"],
    ["Shape", product.shape || "N/A"],
    ["Weight", product.weight || "N/A"],
    ["Bridge Width", product.bridgeWidth || "N/A"],
    ["Temple Length", product.templeLength || "N/A"],
  ];

  const technicalRows = [
    ["Frame Material", product.frameMaterial || "N/A"],
    ["Temple Material", product.templeMaterial || "N/A"],
    ["Frame Type", product.frameType || "N/A"],
    ["Lens Material", product.lensMaterial || "N/A"],
    ["Polarization", product.polarization || "N/A"],
  ];

  const generalRows = [
    ["Brand", product.brand || "N/A"],
    ["Model", product.fullModelNo || "N/A"],
    ["Size", product.frameSize || "N/A"],
    ["Gender", product.gender || "N/A"],
    ["GTIN", product.gtin || "N/A"],
    ["UPC", product.upc || "N/A"],
  ];

  const createTable = (rows: string[][]): string => {
    let html = '<table class="details-table"><tbody>';
    rows.forEach(([label, value]) => {
      html += `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`;
    });
    html += "</tbody></table>";
    return html;
  };

  let html = styles;
  html += '<div class="product-details-section">';
  html += '<h3 class="section-title">Product Details</h3>';
  html += createTable(productDetailsRows);

  html += '<h3 class="section-title">Technical Specifications</h3>';
  html += createTable(technicalRows);

  html += '<h3 class="section-title">General Information</h3>';
  html += createTable(generalRows);

  if (product.warranty) {
    html += '<h3 class="section-title">Warranty</h3>';
    html += `<p>${product.warranty}</p>`;
  }

  html += "</div>";

  return html;
}

export function calculateDiscountedPrice(
  mrp: number,
  category: string,
  discountRules: DiscountRule[]
): number {
  if (!mrp || mrp <= 0) return 0;

  const rule = discountRules.find(
    (r) => r.category.toLowerCase() === category.toLowerCase()
  );

  if (!rule) return mrp;

  const pct = rule.discountPercentage || rule.percentage || 0;
  const discountAmount = (mrp * pct) / 100;
  return Math.round((mrp - discountAmount) * 100) / 100;
}
