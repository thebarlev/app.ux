"use client";

import { useState, useEffect, useRef } from "react";

type Customer = {
  id: string;
  name: string;
  tax_id: string | null;
  external_account_key: string | null;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSelectCustomer: (customer: Customer | null) => void;
  onAddNewCustomer?: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function CustomerAutocomplete({
  value,
  onChange,
  onSelectCustomer,
  onAddNewCustomer,
  placeholder = "התחל להקליד שם לקוח...",
  disabled = false,
}: Props) {
  const [suggestions, setSuggestions] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [lastValue, setLastValue] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout>();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search customers with debounce
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Don't search if user just selected a customer
    if (justSelectedRef.current) {
      return;
    }

    if (!value || value.trim().length === 0) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/customers/search?q=${encodeURIComponent(value.trim())}`
        );
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.customers || []);
          setShowDropdown(true);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error("Customer search error:", error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setLastValue(newValue);
    
    // Clear justSelected when user starts typing again
    if (newValue !== value) {
      justSelectedRef.current = false;
    }
    // Don't call onSelectCustomer(null) here - it would trigger the add customer modal
  };

  const handleSelectCustomer = (customer: Customer) => {
    onChange(customer.name);
    onSelectCustomer(customer);
    setShowDropdown(false);
    setSuggestions([]);
    setSelectedIndex(-1);
    setLastValue(customer.name);
    justSelectedRef.current = true;
    
    // Clear justSelected after a delay to allow next click on field without reopening
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;

    const totalOptions = suggestions.length + 1; // +1 for "New Customer" option

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < totalOptions - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelectCustomer(suggestions[selectedIndex]);
        } else if (selectedIndex === suggestions.length) {
          // User selected "New Customer" option
          onAddNewCustomer?.();
          setShowDropdown(false);
        }
        break;
      case "Escape":
        setShowDropdown(false);
        break;
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={async () => {
          // Don't show dropdown if user just selected a customer
          if (justSelectedRef.current) {
            return;
          }
          
          // Don't show dropdown if value exists and matches lastValue (already selected)
          // This prevents reopening after selection
          if (value && value.trim().length > 0 && value === lastValue) {
            return;
          }
          
          // Show dropdown only if user is actively searching (empty or typing)
          if (value.trim().length === 0) {
            // Empty field - fetch initial customers
            if (!isLoading) {
              setIsLoading(true);
              try {
                const response = await fetch('/api/customers/search?q=');
                if (response.ok) {
                  const data = await response.json();
                  setSuggestions(data.customers || []);
                  setShowDropdown(true);
                  setSelectedIndex(-1);
                }
              } catch (error) {
                console.error('Customer search error:', error);
              } finally {
                setIsLoading(false);
              }
            }
          } else if (suggestions.length > 0) {
            // Has suggestions from typing - show them
            setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          height: 50,
          padding: "0 16px",
          borderRadius: 12,
          border: "none",
          backgroundColor: "#EDF1F5",
          fontSize: 18,
          color: "#19183B",
          outline: "none",
          transition: "border-color 200ms, box-shadow 200ms",
        }}
        onFocus={async (e) => {
          e.currentTarget.style.boxShadow = "0 0 0 2px rgba(29, 134, 143, 0.3)";
          
          // Don't show dropdown if user just selected a customer
          if (justSelectedRef.current) {
            return;
          }
          
          // Don't show dropdown if value exists and matches lastValue (already selected)
          // This prevents reopening after selection
          if (value && value.trim().length > 0 && value === lastValue) {
            return;
          }
          
          // Show dropdown only if user is actively searching (empty or typing)
          if (value.trim().length === 0) {
            // Empty field - fetch initial customers
            if (!isLoading) {
              setIsLoading(true);
              try {
                const response = await fetch('/api/customers/search?q=');
                if (response.ok) {
                  const data = await response.json();
                  setSuggestions(data.customers || []);
                  setShowDropdown(true);
                  setSelectedIndex(-1);
                }
              } catch (error) {
                console.error('Customer search error:', error);
              } finally {
                setIsLoading(false);
              }
            }
          } else if (suggestions.length > 0) {
            // Has suggestions from typing - show them
            setShowDropdown(true);
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      {isLoading && (
        <div
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 12,
            color: "#9ca3af",
          }}
        >
          מחפש...
        </div>
      )}

      {showDropdown && (suggestions.length > 0 || !isLoading) && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            left: 0,
            marginTop: 4,
            background: "#1e293b",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 12,
            boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 1000,
          }}
        >
          {suggestions.length > 0 && suggestions.map((customer, index) => (
            <div
              key={customer.id}
              onClick={() => handleSelectCustomer(customer)}
              onMouseEnter={(e) => {
                setSelectedIndex(index);
                e.currentTarget.style.height = "50px";
                e.currentTarget.style.minHeight = "50px";
                e.currentTarget.style.maxHeight = "50px";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.height = "50px";
                e.currentTarget.style.minHeight = "50px";
                e.currentTarget.style.maxHeight = "50px";
              }}
              style={{
                height: 50,
                minHeight: 50,
                maxHeight: 50,
                display: "flex",
                alignItems: "center",
                paddingLeft: 12,
                paddingRight: 12,
                cursor: "pointer",
                background: index === selectedIndex ? "#1D868F" : "transparent",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                transition: "background 150ms",
              }}
            >
              <div style={{ fontWeight: 500, color: "white", fontSize: 18 }}>
                {customer.name}
              </div>
            </div>
          ))}

          {suggestions.length === 0 && !isLoading && value.trim() && (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                fontSize: 14,
                color: "rgba(255, 255, 255, 0.6)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
              }}
            >
              לא נמצאו לקוחות תואמים
            </div>
          )}

          {/* Add New Customer Option - Always visible when dropdown is open */}
          {!isLoading && (
            <div
              onClick={() => {
                onAddNewCustomer?.();
                setShowDropdown(false);
              }}
              onMouseEnter={(e) => {
                setSelectedIndex(suggestions.length);
                e.currentTarget.style.height = "50px";
                e.currentTarget.style.minHeight = "50px";
                e.currentTarget.style.maxHeight = "50px";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.height = "50px";
                e.currentTarget.style.minHeight = "50px";
                e.currentTarget.style.maxHeight = "50px";
              }}
              style={{
                height: 50,
                minHeight: 50,
                maxHeight: 50,
                paddingLeft: 12,
                paddingRight: 12,
                cursor: "pointer",
                background: "#1D868F",
                borderTop: suggestions.length > 0 ? "2px solid rgba(255, 255, 255, 0.1)" : "none",
                color: "white",
                fontWeight: 600,
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 150ms",
              }}
            >
              <span style={{ fontSize: 20, color: '#FFFFFF', fontWeight: 'bold' }}>+</span>
              <span>לקוח חדש</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
