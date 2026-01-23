-- ====================================================
-- Migration 024: Fix Receipt Template - Unclosed {{#if}}
-- ====================================================
-- Date: January 7, 2026
-- Purpose: Fix unclosed {{#if}} block in receipt templates
-- ====================================================

-- This script finds and fixes receipt templates with unclosed {{#if}} blocks
-- It updates the default receipt template with the correct HTML

DO $$
DECLARE
  template_record RECORD;
  if_count INTEGER;
  if_end_count INTEGER;
  fixed_html TEXT;
BEGIN
  -- Find all active receipt templates
  FOR template_record IN 
    SELECT id, html_template, name, is_default, company_id
    FROM public.templates
    WHERE document_type = 'receipt'
    AND is_active = true
  LOOP
    -- Count {{#if}} and {{/if}} blocks
    if_count := (SELECT COUNT(*) FROM regexp_matches(template_record.html_template, '\{\{#if', 'g'));
    if_end_count := (SELECT COUNT(*) FROM regexp_matches(template_record.html_template, '\{\{/if\}\}', 'g'));
    
    RAISE NOTICE 'Template: % (ID: %, Default: %, Company: %)', 
      template_record.name, 
      template_record.id, 
      template_record.is_default,
      template_record.company_id;
    RAISE NOTICE '  {{#if}} blocks: %, {{/if}} blocks: %, Unclosed: %', 
      if_count, if_end_count, if_count - if_end_count;
    
    -- If there's an unclosed {{#if}}, update with fixed template
    IF if_count > if_end_count THEN
      RAISE NOTICE '  ⚠️  Found unclosed {{#if}} block! Fixing...';
      
      -- Update with the correct template HTML
      -- This is the fixed template from the user
      fixed_html := '<!DOCTYPE html>
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
</html>';
      
      -- Update the template
      UPDATE public.templates
      SET html_template = fixed_html,
          updated_at = NOW()
      WHERE id = template_record.id;
      
      RAISE NOTICE '  ✅ Template fixed!';
    ELSE
      RAISE NOTICE '  ✅ Template is valid (all {{#if}} blocks are closed)';
    END IF;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Receipt template fix completed!';
  RAISE NOTICE '========================================';
END $$;
