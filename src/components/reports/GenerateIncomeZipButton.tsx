"use client";

import { useState } from 'react';

interface GenerateIncomeZipButtonProps {
  businessId: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  className?: string;
}

export default function GenerateIncomeZipButton({
  businessId,
  dateFrom,
  dateTo,
  className = '',
}: GenerateIncomeZipButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/reports/income', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessId,
          dateFrom,
          dateTo,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      // Get the ZIP file as blob
      const blob = await response.blob();
      
      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch ? filenameMatch[1] : `Income.${businessId}.zip`;

      // Create download link and trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Report downloaded successfully:', filename);
      
    } catch (err) {
      console.error('Report generation error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={`
          px-6 py-3 rounded-lg font-semibold
          bg-blue-600 text-white
          hover:bg-blue-700
          disabled:bg-gray-400 disabled:cursor-not-allowed
          transition-colors
          ${className}
        `}
      >
        {loading ? 'מפיק דוח...' : 'הפקת דוח הכנסות'}
      </button>
      
      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          שגיאה: {error}
        </div>
      )}
    </div>
  );
}
