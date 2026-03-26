"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Trash2, Save } from "lucide-react";

interface DiscountRule {
  id: string;
  category: string;
  discountPercentage: number;
}

export default function DiscountRulesPage() {
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New rule form
  const [newCategory, setNewCategory] = useState("");
  const [newDiscount, setNewDiscount] = useState("");

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/discount-rules");
      const data = await res.json();
      if (data.success) setRules(data.data || []);
    } catch {
      setError("Failed to load discount rules");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (category: string, discountPercentage: number) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/discount-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, discountPercentage }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(`Saved discount for ${category}`);
        fetchRules();
      } else {
        setError(data.error);
      }
    } catch {
      setError("Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this discount rule?")) return;
    try {
      const res = await fetch(`/api/discount-rules?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setRules(rules.filter((r) => r.id !== id));
        setSuccess("Rule deleted");
      }
    } catch {
      setError("Failed to delete rule");
    }
  };

  const handleAddNew = () => {
    if (!newCategory || !newDiscount) return;
    handleSave(newCategory, parseFloat(newDiscount));
    setNewCategory("");
    setNewDiscount("");
  };

  const handleUpdateRule = (rule: DiscountRule, newPct: string) => {
    const pct = parseFloat(newPct);
    if (isNaN(pct) || pct < 0 || pct > 100) return;
    handleSave(rule.category, pct);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Discount Rules</h1>
          <p className="text-slate-600 mt-1">
            Set category-based discount percentages. These are applied automatically when creating products.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
        )}
        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">{success}</div>
        )}

        {/* Existing Rules */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Active Rules</h2>

          {rules.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">No discount rules configured yet.</p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{rule.category}</p>
                    <p className="text-xs text-slate-500">
                      MRP 10,000 → Selling Price {(10000 * (1 - rule.discountPercentage / 100)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      defaultValue={rule.discountPercentage}
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-20 px-2 py-1.5 border border-slate-300 rounded text-sm text-center"
                      onBlur={(e) => handleUpdateRule(rule, e.target.value)}
                    />
                    <span className="text-sm text-slate-500">%</span>
                    <button
                      onClick={() => handleDelete(rule.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add New Rule */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Add New Rule</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              >
                <option value="">Select category...</option>
                <option value="SPECTACLES">SPECTACLES</option>
                <option value="SUNGLASSES">SUNGLASSES</option>
                <option value="SOLUTIONS">SOLUTIONS</option>
                <option value="CONTACT_LENSES">CONTACT_LENSES</option>
                <option value="ACCESSORIES">ACCESSORIES</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Discount %</label>
              <input
                type="number"
                value={newDiscount}
                onChange={(e) => setNewDiscount(e.target.value)}
                placeholder="e.g., 30"
                min="0"
                max="100"
                step="0.5"
                className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={handleAddNew}
              disabled={!newCategory || !newDiscount || saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800">
            <strong>How it works:</strong> When a product is created or updated, the discounted selling price is
            calculated as: <code className="bg-amber-100 px-1 rounded">MRP × (1 - discount%/100)</code>.
            For example, with a 30% discount, a 10,000 MRP product sells at 7,000.
          </p>
        </div>
      </div>
    </div>
  );
}
