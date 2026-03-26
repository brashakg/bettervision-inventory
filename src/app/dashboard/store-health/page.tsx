'use client';

import { useState } from 'react';
import { Loader, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';

interface HealthMetric {
  field: string;
  count: number;
  total: number;
  percentage: number;
}

interface AuditData {
  dataQuality: HealthMetric[];
  seoHealth: HealthMetric[];
  contentCompletenessScore: number;
  recommendations: {
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    affectedCount: number;
  }[];
}

export default function StoreHealthPage() {
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditStarted, setAuditStarted] = useState(false);

  const runAudit = async () => {
    try {
      setLoading(true);
      setAuditStarted(true);

      const response = await fetch('/api/store-health', {
        method: 'GET',
      });

      if (response.ok) {
        const json = await response.json();
        setAuditData(json.data || json);
      } else {
        console.error('Audit failed:', response.statusText);
      }
    } catch (error) {
      console.error('Error running audit:', error);
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (percentage: number) => {
    if (percentage >= 90) return 'from-green-400 to-green-600';
    if (percentage >= 70) return 'from-yellow-400 to-yellow-600';
    return 'from-red-400 to-red-600';
  };

  const getHealthIcon = (percentage: number) => {
    if (percentage >= 90) return <CheckCircle className="text-green-600" size={20} />;
    if (percentage >= 70) return <AlertTriangle className="text-yellow-600" size={20} />;
    return <AlertCircle className="text-red-600" size={20} />;
  };

  const getHealthLabel = (percentage: number) => {
    if (percentage >= 90) return 'Excellent';
    if (percentage >= 70) return 'Good';
    return 'Needs Work';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Online Store Health & AI Audit</h1>
          <p className="text-gray-600">Analyze product data quality, SEO optimization, and content completeness</p>
        </div>

        {/* Run Audit Button */}
        <div className="mb-8">
          <button
            onClick={runAudit}
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading && <Loader className="animate-spin" size={20} />}
            {loading ? 'Running Audit...' : 'Run Audit'}
          </button>
        </div>

        {loading && !auditData && (
          <div className="flex items-center justify-center min-h-96">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
              <p className="text-gray-600">Analyzing store health...</p>
            </div>
          </div>
        )}

        {auditStarted && auditData && (
          <div className="space-y-8">
            {/* Content Completeness Score */}
            <div className="bg-white rounded-lg shadow-md p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Content Completeness Score</h2>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-4xl font-bold text-gray-900">
                      {auditData.contentCompletenessScore.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {getHealthLabel(auditData.contentCompletenessScore)}
                    </p>
                  </div>
                  <div className="mb-1">{getHealthIcon(auditData.contentCompletenessScore)}</div>
                </div>
              </div>
              <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${getHealthColor(auditData.contentCompletenessScore)} transition-all duration-1000`}
                  style={{ width: `${auditData.contentCompletenessScore}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-3">Average percentage of filled fields across all products</p>
            </div>

            {/* Product Data Quality */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-6 text-gray-900">Product Data Quality</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {auditData.dataQuality?.map((metric, idx) => (
                  <div key={idx} className="p-4 border rounded-lg hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">{metric.field}</h3>
                      {getHealthIcon(metric.percentage)}
                    </div>
                    <div className="bg-gray-200 rounded-full h-6 overflow-hidden mb-3">
                      <div
                        className={`h-full bg-gradient-to-r ${getHealthColor(metric.percentage)}`}
                        style={{ width: `${metric.percentage}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {metric.count} of {metric.total}
                      </span>
                      <span className="font-semibold text-gray-900">{metric.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* SEO Health */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-6 text-gray-900">SEO Health</h2>
              <div className="space-y-4">
                {auditData.seoHealth?.map((metric, idx) => {
                  const percentage = metric.percentage;
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{metric.field}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">
                            {metric.count} of {metric.total}
                          </span>
                          {getHealthIcon(percentage)}
                        </div>
                      </div>
                      <div className="bg-gray-200 rounded-full h-6 overflow-hidden">
                        <div
                          className={`h-full bg-gradient-to-r ${getHealthColor(percentage)} transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-right mt-1">
                        <span className="text-xs font-semibold text-gray-900">{percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Recommendations */}
            {auditData.recommendations && auditData.recommendations.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-6 text-gray-900">AI-Generated Recommendations</h2>
                <div className="space-y-4">
                  {auditData.recommendations.map((rec, idx) => (
                    <div
                      key={idx}
                      className={`p-4 border-l-4 rounded ${
                        rec.priority === 'high'
                          ? 'bg-red-50 border-red-500'
                          : rec.priority === 'medium'
                            ? 'bg-yellow-50 border-yellow-500'
                            : 'bg-blue-50 border-blue-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900">{rec.title}</h3>
                            <span
                              className={`text-xs font-bold px-2 py-1 rounded ${
                                rec.priority === 'high'
                                  ? 'bg-red-200 text-red-800'
                                  : rec.priority === 'medium'
                                    ? 'bg-yellow-200 text-yellow-800'
                                    : 'bg-blue-200 text-blue-800'
                              }`}
                            >
                              {rec.priority.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{rec.description}</p>
                          <p className="text-xs text-gray-600">
                            Affects {rec.affectedCount} products
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary Stats */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Audit Summary</h3>
              <ul className="text-sm text-gray-700 space-y-2">
                <li>
                  Overall store health score: <span className="font-bold">{auditData.contentCompletenessScore.toFixed(1)}%</span>
                </li>
                <li>
                  Data quality metrics: <span className="font-bold">{auditData.dataQuality?.length || 0} fields checked</span>
                </li>
                <li>
                  SEO metrics: <span className="font-bold">{auditData.seoHealth?.length || 0} dimensions analyzed</span>
                </li>
                <li>
                  Recommendations: <span className="font-bold">{auditData.recommendations?.length || 0} actions suggested</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {auditStarted && !auditData && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="mx-auto mb-3 text-red-600" size={32} />
            <p className="text-red-800 font-semibold">Unable to run audit</p>
            <p className="text-red-700 text-sm mt-1">Please check your connection and try again.</p>
          </div>
        )}

        {!auditStarted && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-8 text-center">
            <p className="text-gray-700 mb-4">Click "Run Audit" to analyze your store's product data quality and SEO optimization</p>
            <p className="text-sm text-gray-600">
              This comprehensive audit will check your product catalog for missing data, incomplete SEO information, and provide
              AI-generated recommendations for improvement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
