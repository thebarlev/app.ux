"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Customer, createCustomerAction, updateCustomerAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldWrapper } from "@/components/ui/field-wrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-6 rounded-2xl border" style={{backgroundColor: '#1e293b', borderColor: '#334155'}}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black ui-text-dark">
                {isEdit ? "עריכת לקוח" : "לקוח חדש"}
              </h1>
              <p className="text-sm ui-text-dark-muted mt-1">
                {isEdit ? "עדכן את פרטי הלקוח" : "הוסף לקוח חדש למערכת"}
              </p>
            </div>
          </div>
        </div>

        {isEdit && (
          <Link href={`/dashboard/customers/${customer.id}/documents`}>
            <Button variant="outline" size="sm" className="ui-button-dark-secondary">
              <FileText className="h-4 w-4 ml-2" />
              צפה במסמכים
            </Button>
          </Link>
        )}
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-xl border ${
          message.type === "success" 
            ? "bg-ui-success-light border-ui-success text-ui-success" 
            : "bg-ui-danger-light border-ui-danger text-ui-danger"
        }`}>
          <div className="font-semibold">{message.text}</div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="ui-card-dark space-y-6">
          {/* Basic Info Section */}
          <div>
            <h3 className="text-lg font-bold ui-text-dark mb-4">פרטי לקוח בסיסיים</h3>
            <div className="grid gap-4">
              <FieldWrapper label="שם העסק / לקוח" required>
                <Input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="שם מלא או שם עסק"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <FieldWrapper label="מספר עוסק (ת.ז / ח.פ)">
                <Input
                  type="text"
                  name="tax_id"
                  value={formData.tax_id}
                  onChange={handleInputChange}
                  placeholder="123456789"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <FieldWrapper label="עיסוק ומקצוע">
                <Input
                  type="text"
                  name="profession"
                  value={formData.profession}
                  onChange={handleInputChange}
                  placeholder="לדוגמה: עורך דין, רופא, יועץ עסקי"
                  className="ui-input-dark"
                />
              </FieldWrapper>
            </div>
          </div>

          {/* Contact Section */}
          <div className="pt-6 border-t border-ui-border-dark">
            <h3 className="text-lg font-bold ui-text-dark mb-4">פרטי התקשרות</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldWrapper label="איש קשר">
                <Input
                  type="text"
                  name="contact_person"
                  value={formData.contact_person}
                  onChange={handleInputChange}
                  placeholder="שם איש הקשר"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <FieldWrapper label="טלפון">
                <Input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="03-1234567"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <FieldWrapper label="טלפון נוסף">
                <Input
                  type="tel"
                  name="phone_secondary"
                  value={formData.phone_secondary}
                  onChange={handleInputChange}
                  placeholder="04-7654321"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <FieldWrapper label="נייד">
                <Input
                  type="tel"
                  name="mobile"
                  value={formData.mobile}
                  onChange={handleInputChange}
                  placeholder="050-1234567"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <FieldWrapper label="אימייל" className="md:col-span-2">
                <Input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="example@domain.com"
                  className="ui-input-dark"
                />
              </FieldWrapper>
            </div>
          </div>

          {/* Address Section */}
          <div className="pt-6 border-t border-ui-border-dark">
            <h3 className="text-lg font-bold ui-text-dark mb-4">כתובת</h3>
            <div className="grid gap-4">
              <div className="grid grid-cols-[1fr_120px] gap-4">
                <FieldWrapper label="רחוב">
                  <Input
                    type="text"
                    name="address_street"
                    value={formData.address_street}
                    onChange={handleInputChange}
                    placeholder="שם הרחוב"
                    className="ui-input-dark"
                  />
                </FieldWrapper>

                <FieldWrapper label="מספר">
                  <Input
                    type="text"
                    name="address_number"
                    value={formData.address_number}
                    onChange={handleInputChange}
                    placeholder="123"
                    className="ui-input-dark"
                  />
                </FieldWrapper>
              </div>

              <div className="grid grid-cols-[1fr_120px] gap-4">
                <FieldWrapper label="ישוב">
                  <Input
                    type="text"
                    name="address_city"
                    value={formData.address_city}
                    onChange={handleInputChange}
                    placeholder="תל אביב"
                    className="ui-input-dark"
                  />
                </FieldWrapper>

                <FieldWrapper label="מיקוד">
                  <Input
                    type="text"
                    name="address_zip"
                    value={formData.address_zip}
                    onChange={handleInputChange}
                    placeholder="1234567"
                    className="ui-input-dark"
                  />
                </FieldWrapper>
              </div>

              <FieldWrapper label="מדינה">
                <Input
                  type="text"
                  name="address_country"
                  value={formData.address_country}
                  onChange={handleInputChange}
                  placeholder="ישראל"
                  className="ui-input-dark"
                />
              </FieldWrapper>
            </div>
          </div>

          {/* Accounting Section */}
          <div className="pt-6 border-t border-ui-border-dark">
            <h3 className="text-lg font-bold ui-text-dark mb-4">פרטים חשבונאיים</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldWrapper label="תנאי תשלום">
                <Select 
                  value={formData.payment_terms_text} 
                  onValueChange={(value) => setFormData(prev => ({...prev, payment_terms_text: value}))}
                >
                  <SelectTrigger className="ui-input-dark">
                    <SelectValue placeholder="בחר תנאי תשלום" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldWrapper>

              <FieldWrapper label="מפתח לקוח">
                <Input
                  type="text"
                  name="external_account_key"
                  value={formData.external_account_key}
                  onChange={handleInputChange}
                  placeholder="מפתח חשבון בתוכנה חיצונית"
                  className="ui-input-dark"
                />
              </FieldWrapper>
            </div>
          </div>

          {/* Bank Details Section */}
          <div className="pt-6 border-t border-ui-border-dark">
            <div className="mb-4">
              <h3 className="text-lg font-bold ui-text-dark">פרטי חשבון בנק</h3>
              <p className="text-sm ui-text-dark-muted mt-1">פרטי החשבון יוצגו אוטומטית בקבלות</p>
            </div>
            <div className="grid gap-4">
              <FieldWrapper label="שם הבנק">
                <Input
                  type="text"
                  name="bank_name"
                  value={formData.bank_name}
                  onChange={handleInputChange}
                  placeholder="לדוגמה: בנק הפועלים"
                  className="ui-input-dark"
                />
              </FieldWrapper>

              <div className="grid grid-cols-2 gap-4">
                <FieldWrapper label="מספר סניף">
                  <Input
                    type="text"
                    name="bank_branch"
                    value={formData.bank_branch}
                    onChange={handleInputChange}
                    placeholder="123"
                    className="ui-input-dark"
                  />
                </FieldWrapper>

                <FieldWrapper label="מספר חשבון">
                  <Input
                    type="text"
                    name="bank_account"
                    value={formData.bank_account}
                    onChange={handleInputChange}
                    placeholder="1234567"
                    className="ui-input-dark"
                  />
                </FieldWrapper>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-ui-border-dark">
            <Button
              type="submit"
              disabled={isSaving}
              className="ui-button-dark-primary"
            >
              <Save className="h-4 w-4 ml-2" />
              {isSaving ? "שומר..." : isEdit ? "עדכן לקוח" : "צור לקוח"}
            </Button>
            
            <Link href="/dashboard/customers">
              <Button type="button" variant="outline" className="ui-button-dark-secondary">
                <ArrowLeft className="h-4 w-4 ml-2" />
                ביטול
              </Button>
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
