'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  RefreshCw,
  Loader2,
  Search,
  FolderOpen,
  Image as ImageIcon,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  Tag,
  Filter,
} from 'lucide-react';

interface Collection {
  id: string;
  shopifyCollectionId: string;
  title: string;
  handle: string | null;
  description: string | null;
  collectionType: string;
  sortOrder: string | null;
  imageUrl: string | null;
  seoTitle: string | null;
  published: boolean;
  productsCount: number;
  locallyModified: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { products: number };
}

export default function CollectionsPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === 'ADMIN';

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      params.set('limit', '100');

      const res = await fetch(`/api/collections?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setCollections(json.data);
      }
    } catch (error) {
      console.error('Error fetching collections:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, [typeFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCollections();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage('');
    try {
      const res = await fetch('/api/collections/sync', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSyncMessage(json.message);
        await fetchCollections();
      } else {
        setSyncMessage(`Error: ${json.error}`);
      }
    } catch (error) {
      setSyncMessage('Failed to sync collections');
    } finally {
      setSyncing(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Collections</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your Shopify collections. Sync from Shopify and edit locally.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              {syncing ? 'Syncing...' : 'Sync from Shopify'}
            </button>
          )}
        </div>

        {/* Sync status message */}
        {syncMessage && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
              syncMessage.startsWith('Error')
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-green-50 text-green-800 border border-green-200'
            }`}
          >
            {syncMessage.startsWith('Error') ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
            )}
            {syncMessage}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search collections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTypeFilter('')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  typeFilter === ''
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('CUSTOM')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  typeFilter === 'CUSTOM'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Custom
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('SMART')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  typeFilter === 'SMART'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Smart
              </button>
            </div>
          </div>
        </div>

        {/* Collections Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : collections.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <FolderOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No collections found</h3>
            <p className="text-sm text-gray-500 mb-4">
              {search
                ? 'Try a different search term.'
                : 'Click "Sync from Shopify" to pull your collections.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((col) => (
              <Link
                key={col.id}
                href={`/dashboard/collections/${col.id}`}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden group"
              >
                {/* Image */}
                <div className="h-36 bg-gray-100 relative overflow-hidden">
                  {col.imageUrl ? (
                    <img
                      src={col.imageUrl}
                      alt={col.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-10 h-10 text-gray-300" />
                    </div>
                  )}

                  {/* Type badge */}
                  <span
                    className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${
                      col.collectionType === 'SMART'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {col.collectionType}
                  </span>

                  {/* Locally modified badge */}
                  {col.locallyModified && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      Modified
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">
                    {col.title}
                  </h3>
                  {col.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{col.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {col.productsCount} products
                    </span>
                    {col.handle && (
                      <span className="truncate">/{col.handle}</span>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-gray-400">
                    Last synced: {formatDate(col.lastSyncedAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Summary */}
        {!loading && collections.length > 0 && (
          <div className="mt-4 text-sm text-gray-500 text-center">
            {collections.length} collection{collections.length !== 1 ? 's' : ''}
            {typeFilter && ` (${typeFilter.toLowerCase()})`}
          </div>
        )}
      </div>
    </div>
  );
}
