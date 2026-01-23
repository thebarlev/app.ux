import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Mail } from "lucide-react"
import Link from "next/link"

export default function RegisterSuccessPage() {
  return (
    <div 
      className="flex min-h-svh w-full items-center justify-center px-4 py-8" 
      style={{ backgroundColor: 'var(--bg)' }}
      dir="rtl"
    >
      <div className="w-full max-w-[600px]">
        <Card className="p-8">
          <CardContent className="p-0">
            <div className="flex flex-col items-center text-center space-y-6">
              {/* Success Icon */}
              <div 
                className="flex h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(29, 134, 143, 0.1)' }}
              >
                <CheckCircle2 
                  className="h-10 w-10" 
                  style={{ color: 'var(--primary)' }}
                />
              </div>

              {/* Title and Subtitle */}
              <div className="space-y-2">
                <h1 className="text-right">ההרשמה הושלמה בהצלחה</h1>
                <p 
                  className="text-right"
                  style={{ color: 'var(--muted-fg)', fontSize: '16px' }}
                >
                  החשבון העסקי שלך נוצר
                </p>
              </div>

              {/* Email Verification Notice */}
              <div 
                className="w-full rounded-[5px] p-4 border"
                style={{ 
                  backgroundColor: 'var(--card)', 
                  borderColor: 'var(--border)'
                }}
              >
                <div className="flex items-start gap-3 text-right">
                  <Mail 
                    className="mt-0.5 h-5 w-5 shrink-0" 
                    style={{ color: 'var(--muted-fg)' }}
                  />
                  <div className="space-y-1">
                    <p 
                      className="text-sm font-medium"
                      style={{ color: 'var(--fg)' }}
                    >
                      בדוק את האימייל שלך
                    </p>
                    <p 
                      className="text-sm"
                      style={{ color: 'var(--muted-fg)' }}
                    >
                      שלחנו לך מייל אימות. לחץ על הקישור כדי לאשר את החשבון לפני ההתחברות.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-3 mt-2">
                <Link href="/login" className="w-full">
                  <Button variant="primary" className="w-full">
                    מעבר להתחברות
                  </Button>
                </Link>
                <Link href="/" className="w-full">
                  <Button variant="secondary" className="w-full">
                    חזרה לדף הבית
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
