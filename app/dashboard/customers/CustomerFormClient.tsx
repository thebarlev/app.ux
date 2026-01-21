"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Customer, createCustomerAction, updateCustomerAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { FormActions } from "@/components/ui/form-actions";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Users, Save, ArrowLeft, FileText } from "lucide-react";

type Props = {
  customer?: Customer;
};

const PAYMENT_TERMS_OPTIONS = [
  { value: "מיידי", label: "מיידי" },
  { value: "שוטף", label: "שוטף" },
  { value: "שוטף+10", label: "שוטף + 10" },
  { value: "שוטף+15", label: "שוטף + 15" },
  { value: "שוטף+30", label: "שוטף + 30" },
  { value: "שוטף+45", label: "שוטף + 45" },
  { value: "שוטף+60", label: "שוטף + 60" },
  { value: "שוטף+75", label: "שוטף + 75" },
  { value: "שוטף+90", label: "שוטף + 90" },
  { value: "שוטף+120", label: "שוטף + 120" },
];

export default function CustomerFormClient({ customer }: Props) {
  const router = useRouter();
  const isEdit = !!customer;

  const [formData, setFormData] = useState({
    name: customer?.name || "",
    tax_id: customer?.tax_id || "",
    profession: customer?.profession || "",
    contact_person: customer?.contact_person || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    phone_secondary: customer?.phone_secondary || "",
    mobile: customer?.mobile || "",
    address_street: customer?.address_street || "",
    address_number: customer?.address_number || "",
    address_city: customer?.address_city || "",
    address_zip: customer?.address_zip || "",
    address_country: customer?.address_country || "ישראל",
    payment_terms_text: customer?.payment_terms_text || "",
    external_account_key: customer?.external_account_key || "",
    bank_name: customer?.bank_name || "",
    bank_branch: customer?.bank_branch || "",
    bank_account: customer?.bank_account || "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    // Validation
    if (!formData.name.trim()) {
      setMessage({ type: "error", text: "שם העסק / לקוח הוא שדה חובה" });
      setIsSaving(false);
      return;
    }

    const payload = {
      name: formData.name,
      tax_id: formData.tax_id || undefined,
      profession: formData.profession || undefined,
      contact_person: formData.contact_person || undefined,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      phone_secondary: formData.phone_secondary || undefined,
      mobile: formData.mobile || undefined,
      address_street: formData.address_street || undefined,
      address_number: formData.address_number || undefined,
      address_city: formData.address_city || undefined,
      address_zip: formData.address_zip || undefined,
      address_country: formData.address_country || undefined,
      payment_terms_text: formData.payment_terms_text || undefined,
      external_account_key: formData.external_account_key || undefined,
      bank_name: formData.bank_name || undefined,
      bank_branch: formData.bank_branch || undefined,
      bank_account: formData.bank_account || undefined,
    };

    const result = isEdit
      ? await updateCustomerAction(customer.id, payload)
      : await createCustomerAction(payload);

    if (result.ok) {
      setMessage({ type: "success", text: isEdit ? "הלקוח עודכן בהצלחה!" : "הלקוח נוצר בהצלחה!" });
      setTimeout(() => {
        router.push("/dashboard/customers");
        router.refresh();
      }, 1000);
    } else {
      setMessage({ type: "error", text: result.message || "שגיאה בשמירה" });
    }

    setIsSaving(false);
  };

  return (
    <main dir="rtl" className="min-h-screen bg-bg">
      <div className="ui-container pt-10">
        {/* Page Header - Title aligned right, 50px margin bottom */}
        <h1 className="text-right">
          {isEdit ? "עריכת לקוח" : "לקוח חדש"}
        </h1>
        <div className="h-[50px]" />
        {isEdit && (
          <div className="mb-[50px]">
            <Link 
              href={`/dashboard/customers/${customer.id}/documents`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                color: '#19183B',
                textDecoration: 'underline',
                fontSize: '18px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <FileText size={18} />
              צפה במסמכים
            </Link>
          </div>
        )}

      {/* Message */}
      {message && (
        <Card className={cn(
          "mb-[50px]",
          message.type === "success" 
            ? "border-success bg-success/10" 
            : "border-danger bg-danger/10"
        )}>
          <CardContent className="p-4">
            <div className={cn(
              "font-semibold text-right",
              message.type === "success" ? "text-success" : "text-danger"
            )}>
              {message.text}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="ui-section-gap">
        {/* Basic Info Section */}
        <FormSection title="פרטי לקוח בסיסיים">
          <div className="relative w-full max-w-full px-0 sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
          <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <FieldWrapper label="שם העסק / לקוח" required id="name" className="w-full min-w-0">
                  <Input
                    id="name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </FieldWrapper>

                <FieldWrapper label="מספר עוסק (ת.ז / ח.פ)" id="tax_id" className="w-full min-w-0">
                  <Input
                    id="tax_id"
                    type="text"
                    name="tax_id"
                    value={formData.tax_id}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>

                <FieldWrapper label="עיסוק ומקצוע" id="profession" className="w-full min-w-0">
                  <Input
                    id="profession"
                    type="text"
                    name="profession"
                    value={formData.profession}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>
          </div>
          </div>
        </FormSection>

        {/* Contact Section */}
        <FormSection title="פרטי התקשרות">
          <div className="relative w-full max-w-full px-0 sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
          <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <FieldWrapper label="איש קשר" id="contact_person" className="w-full min-w-0">
                  <Input
                    id="contact_person"
                    type="text"
                    name="contact_person"
                    value={formData.contact_person}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>

                <FieldWrapper label="טלפון" id="phone" className="w-full min-w-0">
                  <Input
                    id="phone"
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>

                <FieldWrapper label="טלפון נוסף" id="phone_secondary" className="w-full min-w-0">
                  <Input
                    id="phone_secondary"
                    type="tel"
                    name="phone_secondary"
                    value={formData.phone_secondary}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>

                <FieldWrapper label="נייד" id="mobile" className="w-full min-w-0">
                  <Input
                    id="mobile"
                    type="tel"
                    name="mobile"
                    value={formData.mobile}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>

                <FieldWrapper label="דוא״ל" id="email" className="w-full min-w-0">
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>
          </div>
          </div>
        </FormSection>

        {/* Address Section */}
        <FormSection title="כתובת">
          <div className="relative w-full max-w-full px-0 sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
          <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <FieldWrapper label="רחוב" id="address_street" className="w-full min-w-0">
                  <Input
                    id="address_street"
                    type="text"
                    name="address_street"
                    value={formData.address_street}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>

                <FieldWrapper label="מספר" id="address_number" className="w-full min-w-0">
                  <Input
                    id="address_number"
                    type="text"
                    name="address_number"
                    value={formData.address_number}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>

                <FieldWrapper label="יישוב" id="address_city" className="w-full min-w-0">
                  <Input
                    id="address_city"
                    type="text"
                    name="address_city"
                    value={formData.address_city}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>

                <FieldWrapper label="מיקוד" id="address_zip" className="w-full min-w-0">
                  <Input
                    id="address_zip"
                    type="text"
                    name="address_zip"
                    value={formData.address_zip}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>
            <FieldWrapper label="מדינה" id="address_country" className="w-full min-w-0">
              <Input
                id="address_country"
                type="text"
                name="address_country"
                value={formData.address_country}
                onChange={handleInputChange}
              />
            </FieldWrapper>
          </div>
          </div>
        </FormSection>

        {/* Accounting Section */}
        <FormSection title="פרטים חשבונאיים">
          <div className="relative w-full max-w-full px-0 sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
          <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <FieldWrapper label="תנאי תשלום" id="payment_terms_text" className="w-full min-w-0">
                  <Select 
                    value={formData.payment_terms_text} 
                    onValueChange={(value) => setFormData(prev => ({...prev, payment_terms_text: value}))}
                  >
                    <SelectTrigger id="payment_terms_text">
                      <SelectValue placeholder="בחר תנאי תשלום" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS_OPTIONS.map((option) => (
                        <SelectItem 
                          key={option.value} 
                          value={option.value}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>

                <FieldWrapper label="מפתח לקוח" id="external_account_key" className="w-full min-w-0">
                  <Input
                    id="external_account_key"
                    type="text"
                    name="external_account_key"
                    value={formData.external_account_key}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>
          </div>
          </div>
        </FormSection>

        {/* Bank Details Section */}
        <FormSection 
          title="פרטי חשבון בנק"
        >
          <div className="relative w-full max-w-full px-0 sm:px-6 lg:px-8 py-6 bg-white rounded-[20px] border-0 [&_input:focus]:bg-[var(--input)] [&_textarea:focus]:bg-[var(--input)]">
          <div className="grid grid-cols-1 gap-6 sm:[grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] lg:gap-[50px]">
                <FieldWrapper label="שם הבנק" id="bank_name" className="w-full min-w-0">
                  <Input
                    id="bank_name"
                    type="text"
                    name="bank_name"
                    value={formData.bank_name}
                    onChange={handleInputChange}
                  />
                </FieldWrapper>

                <FieldWrapper label="מספר סניף" id="bank_branch" className="w-full min-w-0">
                  <Input
                    id="bank_branch"
                    type="text"
                    name="bank_branch"
                    value={formData.bank_branch}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>

                <FieldWrapper label="מספר חשבון" id="bank_account" className="w-full min-w-0">
                  <Input
                    id="bank_account"
                    type="text"
                    name="bank_account"
                    value={formData.bank_account}
                    onChange={handleInputChange}
                    dir="ltr"
                    className="text-left"
                  />
                </FieldWrapper>
          </div>
          </div>
        </FormSection>

        {/* Actions */}
        <div className="mt-10">
          <FormActions
            primaryLabel={isEdit ? "עדכן לקוח" : "צור לקוח"}
            secondaryLabel="ביטול"
            onSecondaryClick={() => router.push("/dashboard/customers")}
            primaryLoading={isSaving}
            primaryDisabled={isSaving}
            primaryType="submit"
          />
        </div>
      </form>
      </div>
    </main>
  );
}
