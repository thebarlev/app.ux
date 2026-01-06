/**
 * UI Kit Examples / Reference
 * 
 * This file demonstrates how to use the UI Kit components.
 * Use this as a quick reference when building new features.
 */

import { Button } from "./button"
import { Input } from "./input"
import { Label } from "./label"
import { HelperText } from "./helper-text"
import { FieldWrapper } from "./field-wrapper"
import { FormSection } from "./form-section"
import { FormActions } from "./form-actions"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card"
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "./table"
import { Sidebar, SidebarItem } from "./sidebar"
import { Home, Settings, Users, Save, X } from "lucide-react"

export function UIKitExamples() {
  return (
    <div className="p-8 space-y-12 bg-bg">
      <div className="ui-container">
        <h1 className="ui-page-title">UI Kit Examples</h1>
        <p className="ui-page-subtitle">Reference guide for all UI components</p>
      </div>

      {/* Buttons */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Buttons</h2>
        <div className="flex flex-wrap gap-4">
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary">Secondary Button</Button>
          <Button variant="danger">Danger Button</Button>
          <Button variant="ghost">Ghost Button</Button>
          <Button variant="link">Link Button</Button>
          <Button variant="primary" loading>Loading...</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="primary" size="sm">Small</Button>
          <Button variant="primary" size="icon">
            <Home className="h-4 w-4" />
          </Button>
        </div>
      </section>

      {/* Inputs */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Inputs</h2>
        <div className="ui-form-grid">
          <FieldWrapper label="Email Address" id="email" hint="We'll never share your email">
            <Input id="email" type="email" placeholder="user@example.com" />
          </FieldWrapper>
          <FieldWrapper label="Password" required id="password" error="Password is required">
            <Input id="password" type="password" placeholder="Enter password" />
          </FieldWrapper>
          <FieldWrapper label="Disabled Input" id="disabled">
            <Input id="disabled" disabled placeholder="Disabled" />
          </FieldWrapper>
        </div>
      </section>

      {/* Form Section */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Form Section</h2>
        <FormSection title="פרטי לקוח" description="מידע בסיסי על הלקוח">
          <div className="ui-form-grid">
            <FieldWrapper label="שם לקוח" required id="customer-name">
              <Input id="customer-name" placeholder="הזן שם לקוח" />
            </FieldWrapper>
            <FieldWrapper label="אימייל" id="customer-email">
              <Input id="customer-email" type="email" placeholder="example@domain.com" />
            </FieldWrapper>
            <FieldWrapper label="טלפון" id="customer-phone">
              <Input id="customer-phone" type="tel" placeholder="03-1234567" />
            </FieldWrapper>
          </div>
        </FormSection>
      </section>

      {/* Form Actions */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Form Actions</h2>
        <FormActions
          primaryLabel="שמירה"
          secondaryLabel="ביטול"
          primaryIcon={<Save className="h-4 w-4" />}
          secondaryIcon={<X className="h-4 w-4" />}
          onPrimaryClick={() => console.log("Save")}
          onSecondaryClick={() => console.log("Cancel")}
        />
      </section>

      {/* Cards */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description goes here</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-card-fg">Card content area</p>
            </CardContent>
            <CardFooter>
              <Button variant="primary" className="w-full">Action</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Another Card</CardTitle>
              <CardDescription>With different content</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-card-fg">More content here</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tables */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Tables</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>John Doe</TableCell>
              <TableCell>john@example.com</TableCell>
              <TableCell className="text-table-positive">Active</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm">Edit</Button>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Jane Smith</TableCell>
              <TableCell>jane@example.com</TableCell>
              <TableCell className="text-table-negative">Inactive</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm">Edit</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* Sidebar */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Sidebar</h2>
        <div className="flex gap-8">
          <Sidebar className="w-64 p-4 space-y-2">
            <SidebarItem href="#" active icon={<Home className="h-4 w-4" />}>
              Dashboard
            </SidebarItem>
            <SidebarItem href="#" icon={<Users className="h-4 w-4" />}>
              Users
            </SidebarItem>
            <SidebarItem href="#" icon={<Settings className="h-4 w-4" />}>
              Settings
            </SidebarItem>
            <div className="pt-4">
              <SidebarItem href="#" subItem>
              Sub Item 1
            </SidebarItem>
            <SidebarItem href="#" subItem>
              Sub Item 2
            </SidebarItem>
            </div>
          </Sidebar>
          <div className="flex-1">
            <p className="text-muted-fg">Main content area</p>
          </div>
        </div>
      </section>

      {/* Utility Classes */}
      <section className="ui-container">
        <h2 className="text-xl font-bold text-fg mb-4">Utility Classes</h2>
        <div className="space-y-4">
          <div className="ui-card p-6">
            <h3 className="ui-page-title">Card with Utility Classes</h3>
            <p className="ui-page-subtitle">Using .ui-card, .ui-page-title, .ui-page-subtitle</p>
            <div className="ui-divider my-4"></div>
            <Button variant="primary" className="ui-focus">Focus Ring Example</Button>
          </div>
        </div>
      </section>
    </div>
  )
}
