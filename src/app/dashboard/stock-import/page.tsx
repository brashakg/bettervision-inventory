"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";

interface StockItem {
  sku: string;
  quantity: number;
}

interface ImportResult {
  success: boolean;
  summary: {
    totalItems: number;
    matched: number;
    updated: number;
    notFound: number;
    errors: number;
  };
  notFoundSkus: string[];
  errors: string[];
}

export default function StockImportPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StockItem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setParsing(true);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      const allItems: StockItem[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) continue;

        // Find SKU and QTY columns
        const header = rows[0];
        let skuIdx = -1;
        let qtyIdx = -1;

        for (let i = 0; i < header.length; i++) {
          const h = String(header[i] || "").trim().toUpperCase();
          if (h === "SKU" && skuIdx === -1) skuIdx = i;
          if (h === "QTY" && qtyIdx === -1) qtyIdx = i;
        }

        if (skuIdx === -1 || qtyIdx === -1) continue;

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const sku = String(row[skuIdx] || "").trim();
          if (!sku) continue;

          const qty = Number(row[qtyIdx]) || 0;
          allItems.push({ sku, quantity: qty });
        }
      }

      setItems(allItems);
      setPreview(allItems.slice(0, 50));
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message}`);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (items.length === 0) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/stock/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Import failed");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const withStock = items.filter((i) => i.quantity > 0).length;
  const zeroStock = items.filter((i) => i.quantity === 0).length;

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Stock Import
        </h1>
        <p className="text-slate-600 mb-8">
          Upload your Shopify inventory tracking Excel file to update product
          stock quantities. The file should have SKU and QTY columns.
        </p>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            1. Upload Excel File
          </h2>
          <div className="flex items-center gap-4">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={parsing || importing}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 transition font-medium"
            >
              {parsing ? "Parsing..." : "Choose File"}
            </button>
            {fileName && (
              <span className="text-slate-600">
                {fileName}
              </span>
            )}
          </div>
        </div>

        {/* Stats & Preview */}
        {items.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              2. Review Data
            </h2>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">
                  {items.length}
                </div>
                <div className="text-sm text-blue-600">Total Products</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">
                  {withStock}
                </div>
                <div className="text-sm text-green-600">With Stock &gt; 0</div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">
                  {zeroStock}
                </div>
                <div className="text-sm text-amber-600">Zero Stock</div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-slate-700">#</th>
                    <th className="text-left px-4 py-2 text-slate-700">SKU</th>
                    <th className="text-right px-4 py-2 text-slate-700">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-500">{idx + 1}</td>
                      <td className="px-4 py-2 font-mono text-slate-900">
                        {item.sku}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-medium ${
                          item.quantity > 0 ? "text-green-600" : "text-slate-400"
                        }`}
                      >
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 50 && (
                <div className="text-center py-2 text-sm text-slate-500 bg-slate-50">
                  Showing first 50 of {items.length} items
                </div>
              )}
            </div>

            {/* Import Button */}
            <div className="mt-6">
              <button
                onClick={handleImport}
                disabled={importing || items.length === 0}
                className="px-8 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-slate-300 transition font-medium text-lg"
              >
                {importing ? "Importing..." : `Import ${items.length} Items`}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              3. Import Results
            </h2>

            <div
              className={`p-4 rounded-lg mb-4 ${
                result.success ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div className="text-lg font-semibold mb-2">
                {result.success ? "Import Completed!" : "Import Failed"}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-slate-600">Total:</span>{" "}
                  <span className="font-medium">{result.summary.totalItems}</span>
                </div>
                <div>
                  <span className="text-green-700">Matched:</span>{" "}
                  <span className="font-medium">{result.summary.matched}</span>
                </div>
                <div>
                  <span className="text-blue-700">Updated:</span>{" "}
                  <span className="font-medium">{result.summary.updated}</span>
                </div>
                <div>
                  <span className="text-amber-700">Not Found:</span>{" "}
                  <span className="font-medium">{result.summary.notFound}</span>
                </div>
              </div>
            </div>

            {result.notFoundSkus.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">
                  Sample SKUs not found in database (first 20):
                </h3>
                <div className="bg-amber-50 rounded-lg p-3 text-sm font-mono text-amber-800 max-h-40 overflow-y-auto">
                  {result.notFoundSkus.map((sku, i) => (
                    <div key={i}>{sku}</div>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-red-700 mb-2">
                  Errors:
                </h3>
                <div className="bg-red-50 rounded-lg p-3 text-sm text-red-800">
                  {result.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
