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
  id: string;
  key: string;
  page: string;
  default_value: string;
  value: string | null;
  description: string | null;
  updated_at: string;
};

type GroupedTexts = Record<string, SystemText[]>;

interface TextsManagementClientProps {
  adminEmail: string;
}

export function TextsManagementClient({ adminEmail }: TextsManagementClientProps) {
  const [texts, setTexts] = useState<GroupedTexts>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newText, setNewText] = useState({
    key: "",
    page: "",
    default_value: "",
    description: "",
  });

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

  async function handleUpdate(id: string, currentValue: string | null) {
    setEditingId(id);
    setEditValue(currentValue || "");
  }

  async function saveUpdate(id: string) {
    const result = await updateTextAction(id, editValue);
    if (result.ok) {
      setEditingId(null);
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  async function handleReset(id: string) {
    if (!confirm("Reset this text to its default value?")) return;
    const result = await resetTextAction(id);
    if (result.ok) {
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this text entry? This cannot be undone.")) return;
    const result = await deleteTextAction(id);
    if (result.ok) {
      await loadTexts();
    } else {
      alert(`Error: ${result.message}`);
    }
  }

  async function handleCreate() {
    if (!newText.key || !newText.page || !newText.default_value) {
      alert("Key, Page, and Default Value are required");
      return;
    }

    const result = await createTextAction(newText);
    if (result.ok) {
      setShowNewForm(false);
      setNewText({ key: "", page: "", default_value: "", description: "" });
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
          <Button onClick={() => setShowNewForm(!showNewForm)}>
            {showNewForm ? "ביטול" : "+ הוסף טקסט חדש"}
          </Button>
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
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                ערך ברירת מחדל *
              </label>
              <Input
                value={newText.default_value}
                onChange={(e) =>
                  setNewText({ ...newText, default_value: e.target.value })
                }
                placeholder="הכנס טקסט ברירת מחדל"
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
                    default_value: "",
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
        {Object.entries(texts).map(([page, pageTexts]) => (
          <Card key={page}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{page}</span>
                <Badge variant="secondary">{pageTexts.length} טקסטים</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pageTexts.map((text) => (
                  <div
                    key={text.id}
                    className="border rounded-lg p-4 bg-gray-50"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-mono text-sm text-blue-600 mb-1">
                          {text.key}
                        </div>
                        {text.description && (
                          <div className="text-sm text-gray-500 mb-2">
                            {text.description}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {editingId === text.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => saveUpdate(text.id)}
                            >
                              שמור
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              ביטול
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdate(text.id, text.value)}
                            >
                              ערוך
                            </Button>
                            {text.value && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleReset(text.id)}
                              >
                                אפס
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(text.id)}
                            >
                              מחק
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {editingId === text.id ? (
                      <Textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={3}
                        className="font-sans"
                      />
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            ערך מותאם אישית:
                          </div>
                          <div className="bg-white p-2 rounded border">
                            {text.value || (
                              <span className="text-gray-400 italic">
                                לא הוגדר - משתמש בברירת מחדל
                              </span>
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">
                            ברירת מחדל:
                          </div>
                          <div className="bg-gray-100 p-2 rounded border border-gray-300">
                            {text.default_value}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-gray-400 mt-2">
                      עודכן לאחרונה:{" "}
                      {new Date(text.updated_at).toLocaleString("he-IL")}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
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
