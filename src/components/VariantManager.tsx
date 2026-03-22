'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import SearchableDropdown from './SearchableDropdown';

interface Variant {
  id: string;
  colorCode: string;
  colorName: string;
  frameSize: string;
  mrp: number;
  stockByLocation: Record<string, number>;
  images?: string[];
  lensColor?: string;
  tint?: string;
}

interface QuickAddPreview {
  colorCode: string;
  colorName: string;
  frameSize: string;
}

interface VariantManagerProps {
  productId: string;
  category: string;
  attributes: Array<{
    id: string;
    name: string;
    options: Array<{ id: string; value: string }>;
  }>;
  locations: Array<{ id: string; name: string }>;
  onVariantsChange?: (variants: Variant[]) => void;
}

export default function VariantManager({
  productId,
  category,
  attributes,
  locations,
  onVariantsChange,
}: VariantManagerProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddColors, setQuickAddColors] = useState('');
  const [quickAddSizes, setQuickAddSizes] = useState('');
  const [quickAddMRP, setQuickAddMRP] = useState('');
  const [previewData, setPreviewData] = useState<QuickAddPreview[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Get attribute options
  const colorFrameOptions =
    attributes.find((attr) => attr.name === 'frame_color')?.options.map((o) => o.value) || [];
  const lensColorOptions =
    attributes.find((attr) => attr.name === 'lens_color')?.options.map((o) => o.value) || [];
  const tintOptions =
    attributes.find((attr) => attr.name === 'tint')?.options.map((o) => o.value) || [];

  // Notify parent of changes
  useEffect(() => {
    onVariantsChange?.(variants);
  }, [variants, onVariantsChange]);

  // Add new empty variant
  const addVariant = () => {
    const newVariant: Variant = {
      id: `variant_${Date.now()}`,
      colorCode: '',
      colorName: '',
      frameSize: '',
      mrp: 0,
      stockByLocation: Object.fromEntries(locations.map((loc) => [loc.id, 0])),
      images: [],
      ...(category === 'SUNGLASSES' && { lensColor: '', tint: '' }),
    };
    setVariants([...variants, newVariant]);
  };

  // Update variant field
  const updateVariant = (id: string, field: string, value: any) => {
    setVariants(
      variants.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  // Update stock for a location
  const updateStock = (id: string, locationId: string, value: number) => {
    setVariants(
      variants.map((v) =>
        v.id === id
          ? {
              ...v,
              stockByLocation: { ...v.stockByLocation, [locationId]: value },
            }
          : v
      )
    );
  };

  // Delete variant
  const deleteVariant = (id: string) => {
    setVariants(variants.filter((v) => v.id !== id));
  };

  // Generate preview for quick add
  const generatePreview = () => {
    if (!quickAddColors.trim() || !quickAddSizes.trim()) {
      alert('Please enter both color codes and sizes');
      return;
    }

    const colors = quickAddColors.split(',').map((c) => c.trim());
    const sizes = quickAddSizes.split(',').map((s) => s.trim());

    const preview: QuickAddPreview[] = [];
    colors.forEach((color) => {
      sizes.forEach((size) => {
        preview.push({
          colorCode: color,
          colorName: '',
          frameSize: size,
        });
      });
    });

    setPreviewData(preview);
    setShowPreview(true);
  };

  // Confirm and create variants
  const confirmQuickAdd = () => {
    if (!quickAddMRP.trim()) {
      alert('Please enter MRP');
      return;
    }

    setIsGenerating(true);

    setTimeout(() => {
      const newVariants: Variant[] = previewData.map((p) => ({
        id: `variant_${Date.now()}_${Math.random()}`,
        colorCode: p.colorCode,
        colorName: p.colorName,
        frameSize: p.frameSize,
        mrp: parseFloat(quickAddMRP),
        stockByLocation: Object.fromEntries(locations.map((loc) => [loc.id, 0])),
        images: [],
        ...(category === 'SUNGLASSES' && { lensColor: '', tint: '' }),
      }));

      setVariants([...variants, ...newVariants]);
      setQuickAddColors('');
      setQuickAddSizes('');
      setQuickAddMRP('');
      setPreviewData([]);
      setShowPreview(false);
      setShowQuickAdd(false);
      setIsGenerating(false);
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Product Variants</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowQuickAdd(!showQuickAdd)}
            className="px-4 py-2 bg-blue-50 text-blue-600 font-medium rounded-lg hover:bg-blue-100 transition-colors"
          >
            Quick Add
          </button>
          <button
            type="button"
            onClick={addVariant}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Variant
          </button>
        </div>
      </div>

      {/* Quick Add Section */}
      {showQuickAdd && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Quick Add Variants</h3>

          {!showPreview ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color Codes (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., 086, 567, 432"
                  value={quickAddColors}
                  onChange={(e) => setQuickAddColors(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sizes (comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., 55, 52"
                  value={quickAddSizes}
                  onChange={(e) => setQuickAddSizes(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  MRP (applies to all)
                </label>
                <input
                  type="number"
                  placeholder="Enter MRP"
                  value={quickAddMRP}
                  onChange={(e) => setQuickAddMRP(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowQuickAdd(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={generatePreview}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Preview Combinations
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-3">
                  {previewData.length} variants will be created:
                </p>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {previewData.map((p, idx) => (
                    <div
                      key={idx}
                      className="text-sm bg-gray-50 p-2 rounded border border-gray-200"
                    >
                      <span className="font-medium">{p.colorCode}</span> - Size{' '}
                      <span className="font-medium">{p.frameSize}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmQuickAdd}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                >
                  {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Confirm & Create
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Variants Table/Grid */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {variants.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No variants added yet</p>
            <p className="text-sm">Click "Add Variant" or use "Quick Add" to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Color Code
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Color Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Frame Size
                  </th>
                  {category === 'SUNGLASSES' && (
                    <>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                        Lens Color
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                        Tint
                      </th>
                    </>
                  )}
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    MRP
                  </th>
                  {locations.map((loc) => (
                    <th key={loc.id} className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                      Stock - {loc.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, idx) => (
                  <tr key={variant.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                    {/* Color Code */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={variant.colorCode}
                        onChange={(e) => updateVariant(variant.id, 'colorCode', e.target.value)}
                        placeholder="e.g., 086"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    {/* Color Name - SearchableDropdown */}
                    <td className="px-4 py-3">
                      <SearchableDropdown
                        options={colorFrameOptions}
                        value={variant.colorName}
                        onChange={(value) => updateVariant(variant.id, 'colorName', value)}
                        placeholder="Select color"
                      />
                    </td>

                    {/* Frame Size */}
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={variant.frameSize}
                        onChange={(e) => updateVariant(variant.id, 'frameSize', e.target.value)}
                        placeholder="e.g., 55"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    {/* Lens Color - only for SUNGLASSES */}
                    {category === 'SUNGLASSES' && (
                      <td className="px-4 py-3">
                        <SearchableDropdown
                          options={lensColorOptions}
                          value={variant.lensColor || ''}
                          onChange={(value) => updateVariant(variant.id, 'lensColor', value)}
                          placeholder="Select lens color"
                        />
                      </td>
                    )}

                    {/* Tint - only for SUNGLASSES */}
                    {category === 'SUNGLASSES' && (
                      <td className="px-4 py-3">
                        <SearchableDropdown
                          options={tintOptions}
                          value={variant.tint || ''}
                          onChange={(value) => updateVariant(variant.id, 'tint', value)}
                          placeholder="Select tint"
                        />
                      </td>
                    )}

                    {/* MRP */}
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        value={variant.mrp}
                        onChange={(e) => updateVariant(variant.id, 'mrp', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>

                    {/* Stock by Location */}
                    {locations.map((loc) => (
                      <td key={loc.id} className="px-4 py-3">
                        <input
                          type="number"
                          value={variant.stockByLocation[loc.id] || 0}
                          onChange={(e) =>
                            updateStock(variant.id, loc.id, parseInt(e.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                    ))}

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => deleteVariant(variant.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary */}
      {variants.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{variants.length}</span> variant
            {variants.length !== 1 ? 's' : ''} configured
          </p>
        </div>
      )}
    </div>
  );
}
