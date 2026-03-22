"use client";

import { useEffect, useState } from "react";

interface ShopifyStatus {
  configured: boolean;
  storeUrl: string | null;
  stats: {
    totalSynced: number;
    failedSyncs: number;
    lastSync: string | null;
  };
}

export default function ShopifySettingsPage() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    storeUrl: "",
    accessToken: "",
  });

  // Fetch Shopify status
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/shopify/status");
      if (!response.ok) throw new Error("Failed to fetch Shopify status");
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.storeUrl || !formData.accessToken) {
      setError("Store URL and Access Token are required");
      return;
    }

    try {
      setTesting(true);
      setError(null);
      setSuccess(null);

      // Test the Shopify API connection
      const response = await fetch(
        `https://${formData.storeUrl}/admin/api/2024-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": formData.accessToken,
          },
          body: JSON.stringify({
            query: `{
              shop {
                name
              }
            }`,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to connect to Shopify. Check your credentials.");
      }

      const data = await response.json();
      if (data.errors) {
        throw new Error(data.errors[0].message || "Connection failed");
      }

      setSuccess(`Connected successfully to ${data.data.shop.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-slate-600">Loading Shopify settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Shopify Settings</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
            {success}
          </div>
        )}

        {/* Connection Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Connection Status
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Status</p>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    status?.configured ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="font-semibold text-slate-900">
                  {status?.configured ? "Connected" : "Not Configured"}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Store URL</p>
              <p className="font-semibold text-slate-900">
                {status?.storeUrl || "Not configured"}
              </p>
            </div>
          </div>
        </div>

        {/* API Credentials */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            API Credentials
          </h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Shopify Store URL
              </label>
              <input
                type="text"
                value={formData.storeUrl}
                onChange={(e) => setFormData({ ...formData, storeUrl: e.target.value })}
                placeholder="example.myshopify.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Your Shopify store domain without https://
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Access Token
              </label>
              <input
                type="password"
                value={formData.accessToken}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                placeholder="shppa_••••••••••••••••••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Generate from Shopify Admin &gt; Apps and integrations &gt; App and sales channel settings
              </p>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testing || !formData.storeUrl || !formData.accessToken}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-slate-300 transition"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Setup Instructions</h3>
            <ol className="text-sm text-blue-800 space-y-2 list-decimal list-inside">
              <li>Go to your Shopify Admin dashboard</li>
              <li>Navigate to Apps and integrations &gt; App and sales channel settings</li>
              <li>Create a new app with access to write products and read orders</li>
              <li>Copy the Admin API access token</li>
              <li>Paste it above and test the connection</li>
              <li>Once configured, you can sync products from the Products page</li>
            </ol>
          </div>
        </div>

        {/* Sync Statistics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-4">
            Sync Statistics
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Total Synced</p>
              <p className="text-2xl font-bold text-green-600">
                {status?.stats.totalSynced || 0}
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Failed Syncs</p>
              <p className="text-2xl font-bold text-red-600">
                {status?.stats.failedSyncs || 0}
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Last Sync</p>
              <p className="font-semibold text-slate-900">
                {status?.stats.lastSync
                  ? new Date(status.stats.lastSync).toLocaleDateString() +
                    " " +
                    new Date(status.stats.lastSync).toLocaleTimeString()
                  : "Never"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
