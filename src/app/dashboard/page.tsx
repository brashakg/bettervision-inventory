"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  total: number;
  published: number;
  draft: number;
  lowStock: number;
}

interface Product {
  id: string;
  name: string;
  status: string;
  stock: number;
  createdAt: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats>({
    total: 0,
    published: 0,
    draft: 0,
    lowStock: 0,
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch stats and recent products in parallel
        const [statsRes, productsRes] = await Promise.all([
          fetch("/api/products/stats"),
          fetch("/api/products?limit=10"),
        ]);
        const statsJson = await statsRes.json();
        const productsJson = await productsRes.json();

        if (statsJson.success) {
          setStats({
            total: statsJson.data.total,
            published: statsJson.data.published,
            draft: statsJson.data.draft,
            lowStock: statsJson.data.lowStock,
          });
        }

        const productsList = productsJson.data || [];
        setProducts(
          productsList.slice(0, 10).map((p: any) => ({
            id: p.id,
            name: p.title || p.productName || "Untitled",
            status: p.status,
            stock: p.locations
              ? p.locations.reduce((sum: number, loc: any) => sum + (loc.quantity || 0), 0)
              : 0,
            createdAt: p.createdAt,
          }))
        );
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const userName = (session?.user as any)?.name || "User";

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Welcome Section */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
          Welcome back, {userName}!
        </h1>
        <p className="text-sm sm:text-base text-slate-600">
          Here's what's happening with your inventory today.
        </p>
      </div>

      {/* Stats Cards - iPad-first responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 border-l-4 border-blue-600 min-h-[120px]">
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-2">
            Total Products
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 border-l-4 border-green-600 min-h-[120px]">
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-2">Published</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.published}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 border-l-4 border-yellow-600 min-h-[120px]">
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-2">Draft</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.draft}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 border-l-4 border-red-600 min-h-[120px]">
          <p className="text-slate-600 text-xs sm:text-sm font-medium mb-2">Low Stock</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900">{stats.lowStock}</p>
        </div>
      </div>

      {/* Quick Actions - responsive button layout */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:mb-8">
        <Link
          href="/dashboard/products?action=create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 py-3 min-h-[44px] rounded-lg font-medium transition-colors text-center sm:text-left"
        >
          + Add Product
        </Link>
        <Link
          href="/dashboard/shopify"
          className="bg-slate-200 hover:bg-slate-300 text-slate-900 px-4 sm:px-6 py-3 min-h-[44px] rounded-lg font-medium transition-colors text-center sm:text-left"
        >
          Sync to Shopify
        </Link>
      </div>

      {/* Recent Products Table - responsive with scroll on mobile */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900">
            Recent Products
          </h2>
        </div>

        {loading ? (
          <div className="p-6 text-center text-slate-600">Loading...</div>
        ) : products.length === 0 ? (
          <div className="p-6 text-center text-slate-600">
            No products yet. Create one to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm sm:text-base">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Name
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Status
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Stock
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-slate-600 uppercase">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4 text-sm font-medium text-slate-900">
                      {product.name}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm">
                      <span
                        className={`inline-block px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
                          product.status === "PUBLISHED"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-slate-600">
                      {product.stock}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-slate-600">
                      {new Date(product.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
