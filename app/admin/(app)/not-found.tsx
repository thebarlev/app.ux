"use client"

import Link from "next/link"
import { FileQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <FileQuestion className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Page Not Found</h2>
          <p className="text-muted-foreground">
            The admin page you're looking for doesn't exist.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Link href="/admin">
            <Button>Go to Admin Dashboard</Button>
          </Link>
          <Link href="/admin/login">
            <Button variant="secondary">Login</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
