"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Play, Save, MessageSquare, CheckSquare, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Project = {
  id: string
  domain: string | null
  website_url: string | null
  status: string
  created_at: string
  keyword_1?: string | null
  keyword_2?: string | null
  keyword_3?: string | null
  business_type?: string | null
  seo_goal?: string | null
  auditor_customers: {
    company_id: string | null
    customer_status: string
    auditor_leads: { full_name: string; email: string; phone: string } | null
  } | null
}

type Scan = { id: string; status: string; step: string; created_at: string; target_url: string | null }
type Note = { id: string; content: string; created_at: string }
type Task = { id: string; title: string; description: string | null; status: string; due_date: string | null; created_at: string }

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("he-IL", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return "—"
  }
}

export default function AuditorProjectDetailClient({
  project,
  scans,
  notes,
  tasks,
}: {
  project: Project
  scans: Scan[]
  tasks: Task[]
  notes: Note[]
}) {
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [editProject, setEditProject] = useState({
    domain: project.domain || "",
    website_url: project.website_url || "",
    keyword_1: project.keyword_1 || "",
    keyword_2: project.keyword_2 || "",
    keyword_3: project.keyword_3 || "",
  })
  const [newNote, setNewNote] = useState("")
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [notesList, setNotesList] = useState(notes)
  const [tasksList, setTasksList] = useState(tasks)
  const cust = project.auditor_customers
  const lead = cust?.auditor_leads
  const isActive = cust?.customer_status === "active"

  const handleRunScan = async () => {
    const url = project.website_url || (project.domain ? `https://${project.domain}` : "")
    if (!url) return
    setScanning(true)
    try {
      const res = await fetch("/api/admin/auditor/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.scanId) {
        window.location.href = `/auditor?scanId=${data.scanId}&token=${data.scanAccessToken || ""}`
      } else {
        alert(data?.error || "Scan failed")
      }
    } finally {
      setScanning(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    const res = await fetch("/api/admin/auditor/projects/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, content: newNote.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (data?.ok && data?.note) {
      setNotesList([data.note, ...notesList])
      setNewNote("")
    }
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return
    const res = await fetch("/api/admin/auditor/projects/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id, title: newTaskTitle.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (data?.ok && data?.task) {
      setTasksList([data.task, ...tasksList])
      setNewTaskTitle("")
    }
  }

  const handleSaveProject = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/auditor/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editProject),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        setEditProject({ ...editProject })
      } else {
        alert(data?.error || "שמירה נכשלה")
      }
    } finally {
      setSaving(false)
    }
  }

  const handleTaskStatus = async (taskId: string, status: string) => {
    await fetch("/api/admin/auditor/projects/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, status }),
    })
    setTasksList((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/auditor-projects">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{project.domain || project.website_url || "Project"}</h1>
          <p className="text-muted-foreground">{lead?.email || "—"}</p>
        </div>
        <Badge variant={isActive ? "default" : "secondary"}>{cust?.customer_status || "—"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>פרטי פרויקט</span>
            <Button onClick={handleSaveProject} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              שמירה
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">דומיין</label>
            <Input
              value={editProject.domain}
              onChange={(e) => setEditProject({ ...editProject, domain: e.target.value })}
              placeholder="example.com"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">כתובת אתר</label>
            <Input
              value={editProject.website_url}
              onChange={(e) => setEditProject({ ...editProject, website_url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מילת מפתח 1</label>
            <Input
              value={editProject.keyword_1}
              onChange={(e) => setEditProject({ ...editProject, keyword_1: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מילת מפתח 2</label>
            <Input
              value={editProject.keyword_2}
              onChange={(e) => setEditProject({ ...editProject, keyword_2: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">מילת מפתח 3</label>
            <Input
              value={editProject.keyword_3}
              onChange={(e) => setEditProject({ ...editProject, keyword_3: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              סריקה ושמירת נתונים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {project.website_url || `https://${project.domain || ""}`}
            </p>
            <Button onClick={handleRunScan} disabled={!isActive || scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {scanning ? "מתחיל..." : "הרץ סריקה"}
            </Button>
            {!isActive && (
              <p className="text-xs text-amber-600">סריקות חסומות – לקוח לא פעיל</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>צפייה בביצועים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scans.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין סריקות עדיין</p>
              ) : (
                scans.slice(0, 5).map((s) => (
                  <Link
                    key={s.id}
                    href={`/auditor/dashboard/scan/${s.id}`}
                    className="block rounded border p-2 text-sm hover:bg-muted/50"
                  >
                    <span className="font-medium">{s.target_url || s.id}</span>
                    <span className="ml-2 text-muted-foreground">• {s.status}</span>
                    <span className="ml-2 text-xs">{formatDate(s.created_at)}</span>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            הערות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Textarea
              placeholder="הוסף הערה..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={2}
            />
            <Button onClick={handleAddNote} disabled={!newNote.trim()}>
              הוסף
            </Button>
          </div>
          <div className="space-y-2">
            {notesList.map((n) => (
              <div key={n.id} className="rounded border bg-muted/30 p-3 text-sm">
                {n.content}
                <div className="mt-1 text-xs text-muted-foreground">{formatDate(n.created_at)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            פעולות עבודה (CRM)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="כותרת משימה..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
            />
            <Button onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
              הוסף משימה
            </Button>
          </div>
          <div className="space-y-2">
            {tasksList.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded border p-3 text-sm"
              >
                <div>
                  <span className={t.status === "done" ? "line-through text-muted-foreground" : ""}>
                    {t.title}
                  </span>
                  <div className="text-xs text-muted-foreground">{formatDate(t.created_at)}</div>
                </div>
                <Select value={t.status} onValueChange={(v) => handleTaskStatus(t.id, v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">ממתין</SelectItem>
                    <SelectItem value="in_progress">בביצוע</SelectItem>
                    <SelectItem value="done">הושלם</SelectItem>
                    <SelectItem value="cancelled">בוטל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
