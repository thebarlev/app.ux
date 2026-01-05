"use client";

import { useState, useEffect } from "react";
import { ReceiptStyleSettings, isValidHexColor } from "@/lib/types/receipt-style";
import { saveReceiptStyleSettings, resetReceiptStyleSettings } from "./actions";

type Props = {
  initialSettings: ReceiptStyleSettings;
};

export default function ReceiptStyleForm({ initialSettings }: Props) {
  const [settings, setSettings] = useState<ReceiptStyleSettings>(initialSettings);
  const [activeTab, setActiveTab] = useState<"typography" | "colors" | "layout" | "css">("typography");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [colorErrors, setColorErrors] = useState<Record<string, string>>({});

  const validateColor = (key: string, value: string) => {
    if (!isValidHexColor(value)) {
      setColorErrors((prev) => ({
        ...prev,
        [key]: "יש להזין צבע בפורמט HEX תקין (לדוגמה #111827)",
      }));
      return false;
    } else {
      setColorErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
      return true;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    const result = await saveReceiptStyleSettings(settings);

    if (result.ok) {
      setMessage({ type: "success", text: result.message || "הגדרות נשמרו בהצלחה" });
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה בשמירת ההגדרות" });
    }

    setSaving(false);

    // Clear message after 5 seconds
    setTimeout(() => setMessage(null), 5000);
  };

  const handleReset = async () => {
    if (!confirm("האם אתה בטוח שברצונך לאפס להגדרות ברירת מחדל?")) {
      return;
    }

    setSaving(true);
    setMessage(null);

    const result = await resetReceiptStyleSettings();

    if (result.ok) {
      window.location.reload();
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה באיפוס ההגדרות" });
    }

    setSaving(false);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold">עיצוב תצוגת קבלה – הגדרות מערכת</h1>
        <p className="text-gray-600 mt-2">
          התאמה אישית של מראה הקבלות עבור כל החברות במערכת
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-4 p-4 rounded-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200">
          {[
            { key: "typography", label: "טיפוגרפיה" },
            { key: "colors", label: "צבעים" },
            { key: "layout", label: "פריסה ומרווחים" },
            { key: "css", label: "CSS מותאם" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Typography Tab */}
          {activeTab === "typography" && (
            <div className="space-y-4">
              <div>
                <label className="block font-semibold mb-2">משפחת גופן</label>
                <input
                  type="text"
                  value={settings.typography.fontFamily}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      typography: { ...settings.typography, fontFamily: e.target.value },
                    })
                  }
                  className="w-full p-3 border border-gray-300 rounded-lg"
                  placeholder="Arial, sans-serif"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold mb-2">גודל גופן בסיסי</label>
                  <input
                    type="number"
                    min="8"
                    max="24"
                    value={settings.typography.baseFontSize}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        typography: { ...settings.typography, baseFontSize: parseInt(e.target.value) },
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-2">גודל כותרת (קבלה)</label>
                  <input
                    type="number"
                    min="16"
                    max="48"
                    value={settings.typography.titleFontSize}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        typography: { ...settings.typography, titleFontSize: parseInt(e.target.value) },
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-2">גודל כתובית</label>
                  <input
                    type="number"
                    min="8"
                    max="20"
                    value={settings.typography.subtitleFontSize}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        typography: { ...settings.typography, subtitleFontSize: parseInt(e.target.value) },
                      })
                    }
                    className="w-full p-3 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Colors Tab */}
          {activeTab === "colors" && (
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(settings.colors).map(([key, value]) => {
                const labels: Record<string, string> = {
                  background: "רקע כללי",
                  text: "טקסט כללי",
                  accent: "צבע הדגשה / קו מפריד",
                  headerBackground: "רקע אזור עליון",
                  headerText: "טקסט באזור עליון",
                  tableHeaderBackground: "רקע כותרת טבלה",
                  tableHeaderText: "טקסט כותרת טבלה",
                  tableRowBorder: "צבע קו שורות בטבלה",
                  totalBoxBackground: "רקע תיבת סה״כ",
                  totalBoxBorder: "גבול תיבת סה״כ",
                };

                return (
                  <div key={key}>
                    <label className="block font-semibold mb-2">{labels[key]}</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={value}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setSettings({
                            ...settings,
                            colors: { ...settings.colors, [key]: newValue },
                          });
                          validateColor(key, newValue);
                        }}
                        className="w-16 h-12 rounded border border-gray-300 cursor-pointer"
                      />
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setSettings({
                            ...settings,
                            colors: { ...settings.colors, [key]: newValue },
                          });
                          validateColor(key, newValue);
                        }}
                        className="flex-1 p-3 border border-gray-300 rounded-lg font-mono"
                        placeholder="#111827"
                      />
                    </div>
                    {colorErrors[key] && (
                      <p className="text-red-600 text-sm mt-1">{colorErrors[key]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Layout Tab */}
          {activeTab === "layout" && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg mb-3">ריפוד עמוד</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold mb-2">ריפוד עליון (mm)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={settings.layout.pagePaddingTop}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          layout: { ...settings.layout, pagePaddingTop: parseInt(e.target.value) },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-2">ריפוד צדדים (mm)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={settings.layout.pagePaddingSide}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          layout: { ...settings.layout, pagePaddingSide: parseInt(e.target.value) },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-lg mb-3">כותרת עליונה</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block font-semibold mb-2">ריפוד עליון (px)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={settings.sections.header.paddingTop}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            header: { ...settings.sections.header, paddingTop: parseInt(e.target.value) },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-2">ריפוד תחתון (px)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={settings.sections.header.paddingBottom}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            header: { ...settings.sections.header, paddingBottom: parseInt(e.target.value) },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-2">יישור</label>
                    <select
                      value={settings.sections.header.alignment}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            header: { ...settings.sections.header, alignment: e.target.value as any },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    >
                      <option value="top">למעלה</option>
                      <option value="center">מיושר למרכז</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-lg mb-3">טבלת תקבולים</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold mb-2">ריפוד אנכי בשורה (px)</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={settings.sections.paymentsTable.rowPaddingY}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            paymentsTable: { ...settings.sections.paymentsTable, rowPaddingY: parseInt(e.target.value) },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-2">ריפוד אופקי בשורה (px)</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={settings.sections.paymentsTable.rowPaddingX}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            paymentsTable: { ...settings.sections.paymentsTable, rowPaddingX: parseInt(e.target.value) },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-lg mb-3">תיבת סה״כ</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold mb-2">ריפוד (px)</label>
                    <input
                      type="number"
                      min="0"
                      max="50"
                      value={settings.sections.totalBox.padding}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            totalBox: { ...settings.sections.totalBox, padding: parseInt(e.target.value) },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-2">יישור סכום</label>
                    <select
                      value={settings.sections.totalBox.alignAmount}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          sections: {
                            ...settings.sections,
                            totalBox: { ...settings.sections.totalBox, alignAmount: e.target.value as any },
                          },
                        })
                      }
                      className="w-full p-3 border border-gray-300 rounded-lg"
                    >
                      <option value="right">ימין</option>
                      <option value="left">שמאל</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CSS Tab */}
          {activeTab === "css" && (
            <div>
              <label className="block font-semibold mb-2">
                Custom CSS (יישום על #receipt-preview בלבד)
              </label>
              <p className="text-sm text-gray-600 mb-3">
                כאן ניתן להוסיף CSS מותאם אישית. הוא יוחל רק בתוך #receipt-preview. אין להשתמש ב-lab() או color-mix().
              </p>
              <textarea
                value={settings.customCss}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    customCss: e.target.value,
                  })
                }
                rows={15}
                className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder={`/* דוגמה:\n#receipt-preview .header {\n  background: #f0f0f0;\n}\n*/`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving || Object.keys(colorErrors).length > 0}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {saving ? "שומר..." : "שמור הגדרות"}
        </button>
        <button
          onClick={handleReset}
          disabled={saving}
          className="px-6 py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
        >
          איפוס לברירת מחדל
        </button>
      </div>
    </div>
  );
}
