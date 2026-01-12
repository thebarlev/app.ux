"use client";

import { useEffect, useState } from "react";
import {
  getAllTextsAction,
  updateTextAction,
  resetTextAction,
  createTextAction,
  deleteTextAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdminHeader } from "@/components/admin/admin-header";

type SystemText = {
  key: string;
  page: string;
  description: string | null;
  updated_at: string;
  he?: { id: string; default_value: string; value: string | null };
  en?: { id: string; default_value: string; value: string | null };
};

type GroupedTexts = Record<string, SystemText[]>;

interface TextsManagementClientProps {
  adminEmail: string;
}

export function TextsManagementClient({ adminEmail }: TextsManagementClientProps) {
  const [texts, setTexts] = useState<GroupedTexts>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ key: string; page: string; lang: "he" | "en" } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [query, setQuery] = useState("");
  const [activePage, setActivePage] = useState<string>("all");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newText, setNewText] = useState({
    key: "",
    page: "",
    default_value_he: "",
    default_value_en: "",
    description: "",
  });

  const pages = Object.keys(texts);
  const orderedPages = (() => {
    const preferred = ["common", "receipt", "invoice"];
    const rest = pages.filter((p) => !preferred.includes(p)).sort((a, b) => a.localeCompare(b));
    return [...preferred.filter((p) => pages.includes(p)), ...rest];
  })();

  function normalize(s: unknown) {
    return String(s || "").trim();
  }

  function getEffectiveValue(row?: { default_value: string; value: string | null }) {
    const custom = normalize(row?.value);
    if (custom) return { kind: "custom" as const, value: custom };
    const def = normalize(row?.default_value);
    if (def) return { kind: "default" as const, value: def };
    return { kind: "missing" as const, value: "" };
  }

  function isMissingCustom(row?: { default_value: string; value: string | null }) {
    return !normalize(row?.value);
  }

  useEffect(() => {
    loadTexts();
  }, []);

  async function loadTexts() {
    setLoading(true);
    const result = await getAllTextsAction();
    if (result.ok && result.data) {
      setTexts(result.data);
    }
    setLoading(false);
  }

  async function handleUpdate(target: { key: string; page: string; lang: "he" | "en" }, currentValue: string | null) {
    setEditing(target);
    setEditValue(currentValue || "");
  }

  async function saveUpdate() {
    if (!editing) return;
    const result = await updateTextAction({ ...editing, value: editValue });
    if (result.ok) {
      setEditing(null);
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  async function handleReset(target: { key: string; page: string; lang: "he" | "en" }) {
    if (!confirm("Reset this text to its default value?")) return;
    const result = await resetTextAction(target);
    if (result.ok) {
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  async function handleDelete(target: { key: string; page: string }) {
    if (!confirm("Delete this text entry? This cannot be undone.")) return;
    const result = await deleteTextAction(target);
    if (result.ok) {
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  async function handleCreate() {
    if (!newText.key || !newText.page || !newText.default_value_he || !newText.default_value_en) {
      alert("Key, Page, and Default Value (HE + EN) are required");
      return;
    }

    const result = await createTextAction(newText);
    if (result.ok) {
      setShowNewForm(false);
      setNewText({ key: "", page: "", default_value_he: "", default_value_en: "", description: "" });
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30">
        <AdminHeader adminName={adminEmail} onSettingsClick={() => {}} />
        <div className="p-8">
          <div className="text-center">טוען...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <AdminHeader adminName={adminEmail} onSettingsClick={() => {}} />
      
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between" dir="rtl">
          <div>
            <h1 className="text-3xl font-bold">ניהול טקסטים במערכת</h1>
            <p className="text-gray-600 mt-2">
              ערוך את כל הטקסטים שמוצגים ללקוחות במערכת
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי key / page / תיאור / ערכים (HE/EN)..."
              className="w-[320px]"
            />
            <Button onClick={() => setShowNewForm(!showNewForm)}>
              {showNewForm ? "ביטול" : "+ הוסף טקסט חדש"}
            </Button>
          </div>
        </div>

        {/* Tabs by page/scope (based on existing DB values only) */}
        <div className="mb-6 flex flex-wrap gap-2" dir="rtl">
          <Button
            variant={activePage === "all" ? "primary" : "outline"}
            size="sm"
            onClick={() => setActivePage("all")}
          >
            הכל
          </Button>
          {orderedPages.map((p) => (
            <Button
              key={p}
              variant={activePage === p ? "primary" : "outline"}
              size="sm"
              onClick={() => setActivePage(p)}
            >
              {p}
            </Button>
          ))}
        </div>

      {/* New Text Form */}
      {showNewForm && (
        <Card className="mb-6" dir="rtl">
          <CardHeader>
            <CardTitle>הוסף טקסט חדש</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                מפתח (Key) *
              </label>
              <Input
                value={newText.key}
                onChange={(e) =>
                  setNewText({ ...newText, key: e.target.value })
                }
                placeholder="receipt_new_label"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">עמוד *</label>
              <Input
                value={newText.page}
                onChange={(e) =>
                  setNewText({ ...newText, page: e.target.value })
                }
                placeholder="receipt"
                list="system-text-pages"
              />
              <datalist id="system-text-pages">
                {orderedPages.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <div className="text-xs text-gray-500 mt-1">
                ניתן לבחור מתוך הקבוצות הקיימות או להקליד קבוצה חדשה (ללא שינוי DB).
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                ערך ברירת מחדל (עברית) *
              </label>
              <Input
                value={newText.default_value_he}
                onChange={(e) =>
                  setNewText({ ...newText, default_value_he: e.target.value })
                }
                placeholder="הכנס טקסט ברירת מחדל (עברית)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                ערך ברירת מחדל (English) *
              </label>
              <Input
                value={newText.default_value_en}
                onChange={(e) =>
                  setNewText({ ...newText, default_value_en: e.target.value })
                }
                placeholder="Enter default text (English)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <Input
                value={newText.description}
                onChange={(e) =>
                  setNewText({ ...newText, description: e.target.value })
                }
                placeholder="תיאור קצר של הטקסט"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate}>שמור</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewForm(false);
                  setNewText({
                    key: "",
                    page: "",
                    default_value_he: "",
                    default_value_en: "",
                    description: "",
                  });
                }}
              >
                ביטול
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped Texts */}
      <div className="space-y-6" dir="rtl">
        {Object.entries(texts).map(([page, pageTexts]) => {
          const q = query.trim().toLowerCase();
          if (activePage !== "all" && page !== activePage) return null;

          const filtered = q
            ? pageTexts.filter((t) => {
                const heEff = getEffectiveValue(t.he);
                const enEff = getEffectiveValue(t.en);
                return (
                  t.key.toLowerCase().includes(q) ||
                  t.page.toLowerCase().includes(q) ||
                  (t.description || "").toLowerCase().includes(q) ||
                  normalize(t.he?.value).toLowerCase().includes(q) ||
                  normalize(t.he?.default_value).toLowerCase().includes(q) ||
                  normalize(t.en?.value).toLowerCase().includes(q) ||
                  normalize(t.en?.default_value).toLowerCase().includes(q) ||
                  heEff.value.toLowerCase().includes(q) ||
                  enEff.value.toLowerCase().includes(q)
                );
              })
            : pageTexts;

          if (q && filtered.length === 0) return null;

          const missingHe = filtered.filter((t) => !t.he || isMissingCustom(t.he)).length;
          const missingEn = filtered.filter((t) => !t.en || isMissingCustom(t.en)).length;

          return (
            <Card key={page}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <span>{page}</span>
                  <Badge variant="secondary">{filtered.length} טקסטים</Badge>
                  <Badge variant="outline">חסרים בעברית: {missingHe}</Badge>
                  <Badge variant="outline">חסרים באנגלית: {missingEn}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filtered.map((text) => (
                    <div key={text.key} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-mono text-sm text-blue-600 mb-1">{text.key}</div>
                          {text.description && (
                            <div className="text-sm text-gray-500 mb-2">{text.description}</div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete({ key: text.key, page: text.page })}
                        >
                          מחק
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {(["he", "en"] as const).map((lang) => {
                          const row = lang === "he" ? text.he : text.en;
                          const isEditing =
                            editing?.key === text.key &&
                            editing?.page === text.page &&
                            editing?.lang === lang;

                          const effective = getEffectiveValue(row);
                          const hasCustom = effective.kind === "custom";

                          return (
                            <div key={lang} className="space-y-2 rounded-md border bg-white p-3">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-semibold">
                                  {lang === "he" ? "עברית" : "English"}
                                </div>
                                <div className="flex items-center gap-2">
                                  {isEditing ? (
                                    <>
                                      <Button size="sm" onClick={saveUpdate}>
                                        שמור
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                                        ביטול
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          handleUpdate(
                                            { key: text.key, page: text.page, lang },
                                            row?.value || null
                                          )
                                        }
                                      >
                                        ערוך
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleReset({ key: text.key, page: text.page, lang })}
                                      >
                                        אפס
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Current (effective) value */}
                              <div>
                                <div className="text-xs text-gray-500 mb-1 flex items-center justify-between">
                                  <span>ערך נוכחי</span>
                                  <Badge variant={hasCustom ? "secondary" : "outline"}>
                                    {hasCustom ? "מותאם אישית" : "ברירת מחדל"}
                                  </Badge>
                                </div>
                                <div className="bg-white p-2 rounded border">
                                  {effective.kind === "missing" ? (
                                    <span className="text-gray-400 italic">—</span>
                                  ) : (
                                    effective.value
                                  )}
                                </div>
                                {!hasCustom && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    לא הוגדר – משתמש בברירת מחדל
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-xs text-gray-500 mb-1">ברירת מחדל</div>
                                <div className="bg-gray-100 p-2 rounded border border-gray-300">
                                  {row?.default_value ? row.default_value : <span className="text-gray-400 italic">—</span>}
                                </div>
                              </div>

                              <div>
                                <div className="text-xs text-gray-500 mb-1">ערך מותאם אישית</div>
                                {isEditing ? (
                                  <Textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    rows={3}
                                    className="font-sans"
                                  />
                                ) : (
                                  <div className="bg-white p-2 rounded border">
                                    {row?.value || (
                                      <span className="text-gray-400 italic">לא הוגדר - משתמש בברירת מחדל</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-xs text-gray-400 mt-2">
                        עודכן לאחרונה: {new Date(text.updated_at).toLocaleString("he-IL")}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {Object.keys(texts).length === 0 && (
        <div className="text-center text-gray-500 py-12" dir="rtl">
          אין טקסטים במערכת. הוסף טקסט חדש כדי להתחיל.
        </div>
      )}
      </main>
    </div>
  );
}
