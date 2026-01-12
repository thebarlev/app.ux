"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * Fix receipt templates with unclosed {{#if}} blocks
 * This action checks all receipt templates and fixes any with unclosed blocks
 */
export async function fixReceiptTemplatesAction() {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false as const, message: "משתמש לא מחובר" }
    }
    
    // Check if user is admin
    const { data: adminData } = await supabase
      .from("system_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    
    const isAdmin = !!adminData
    if (!isAdmin) {
      return { ok: false as const, message: "רק אדמינים יכולים להריץ תיקון זה" }
    }

    // Get all active receipt templates
    const { data: templates, error: fetchError } = await supabase
      .from("templates")
      .select("id, html_template, name, is_default, company_id")
      .eq("document_type", "receipt")
      .eq("is_active", true)

    if (fetchError) {
      return { ok: false as const, message: fetchError.message }
    }

    if (!templates || templates.length === 0) {
      return { ok: true as const, message: "לא נמצאו תבניות קבלה", fixed: 0 }
    }

    const fixedTemplate = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>קבלה {{RECEIPTNUMBER}}</title>
  <link rel="stylesheet" href="receipt-standard-styles.css" />
</head>
<body>
  <main class="page">

<section class="header">
  <!-- העבר את header-card לפני brand -->
  <div class="header-card">
    <div class="header-meta">
      <span>{{Datecreation}}</span>
    </div>
    
    <h1>קבלה {{RECEIPTNUMBER}}</h1>
    
    <div class="client-info">
      <div class="muted">לכבוד</div>
      <div><strong>{{CLIENTNAME}}</strong></div>
      
      <!-- Tax ID - only show if exists -->
      {{#if BUSINESSID}}
      <div>ח.פ / ע.מ: {{BUSINESSID}}</div>
      {{/if}}
      
      <!-- Phone - only show if exists -->
      {{#if CLIENTPHONE}}
      <div>טלפון: {{CLIENTPHONE}}</div>
      {{/if}}
    </div>
  </div>
  
  <div class="brand">
    <!-- Logo - no {{#if}}, CSS will hide if empty -->
    <div class="brand-logo">
      <img src="{{{LOGO_URL}}}" alt="{{USERCOMPANYNAME}}" />
    </div>
    
    <div class="company-info">
      <div><strong>{{USERCOMPANYNAME}}</strong></div>
      <div>עוסק מורשה / ח.פ: {{USERID}}</div>
      <div>{{USERADDRESS}}</div>
      <div>טלפון: {{PHONE}}</div>
      <div>{{EMAIL}}</div>
      <div>{{DOMAIN}}</div>
    </div>
  </div>
</section>
    <!-- Description Section - only if description exists -->
    {{#if description}}
    <div class="description-section">
      {{description}}
    </div>
    {{/if}}

    <!-- Payments Table -->
    <section class="payments-section">
      <table class="table">
        <thead>
          <tr>
            <th>אמצעי תשלום</th>
            <th>פירוט</th>
            <th>תאריך</th>
            <th>סכום</th>
          </tr>
        </thead>
        <tbody>
          {{{PAYMENTS_ROWS_HTML}}}
        </tbody>
      </table>
    </section>

    <!-- Summary -->
    <div class="summary">
      <span>סה"כ</span>
      <strong>{{TOTAL_AMOUNT}}</strong>
    </div>

    <!-- Notes Section - SINGLE section, only if notes exist -->
    {{#if notes}}
    <div class="notes-section">
      <strong>הערות:</strong>
      <div>{{{notes}}}</div>
    </div>
    {{/if}}

    <!-- Signature Section -->
    {{#if SIGNATURE_URL}}
    <section class="stamp">
      <div class="stamp-title">חותמת / חתימה</div>
      <div class="stamp-image">
        <img src="{{{SIGNATURE_URL}}}" alt="חתימה" />
      </div>
    </section>
    {{/if}}

    <!-- Footer -->
    <footer class="footer">
      <div>מסמך ממוחשב הופק על ידי israel.green</div>
      <div class="footer-meta">
        <span>הופק ב-{{CURRENT_DATE_TIME}}</span>
        <span>עמוד {{PAGE_NUMBER}} מתוך {{TOTAL_PAGES}}</span>
      </div>
    </footer>
  </main>
</body>
</html>`

    let fixedCount = 0
    const results: Array<{ id: string; name: string; fixed: boolean; reason: string }> = []

    for (const template of templates) {
      const templateHtml = (template as any).html_he || template.html_template || ""
      // Count {{#if}} and {{/if}} blocks
      const ifMatches = templateHtml.match(/\{\{#if/g) || []
      const ifEndMatches = templateHtml.match(/\{\{\/if\}\}/g) || []
      const ifCount = ifMatches.length
      const ifEndCount = ifEndMatches.length
      const unclosedCount = ifCount - ifEndCount

      if (unclosedCount > 0) {
        // Fix the template
        const { error: updateError } = await supabase
          .from("templates")
          .update({
            html_he: fixedTemplate,
            updated_at: new Date().toISOString(),
          })
          .eq("id", template.id)

        if (updateError) {
          results.push({
            id: template.id,
            name: template.name || "ללא שם",
            fixed: false,
            reason: updateError.message,
          })
        } else {
          fixedCount++
          results.push({
            id: template.id,
            name: template.name || "ללא שם",
            fixed: true,
            reason: `תוקן - נמצאו ${unclosedCount} {{#if}} לא סגורים`,
          })
        }
      } else {
        results.push({
          id: template.id,
          name: template.name || "ללא שם",
          fixed: false,
          reason: "תבנית תקינה - כל ה-{{#if}} נסגרים",
        })
      }
    }

    return {
      ok: true as const,
      message: `נבדקו ${templates.length} תבניות, תוקנו ${fixedCount}`,
      fixed: fixedCount,
      total: templates.length,
      results,
    }
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "שגיאה בתיקון תבניות",
    }
  }
}
