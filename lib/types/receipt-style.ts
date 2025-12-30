/**
 * Receipt Style Settings Types
 * Global styling configuration for all receipt previews
 */

export type ReceiptStyleSettings = {
  typography: {
    fontFamily: string;            // e.g. "Arial, sans-serif"
    baseFontSize: number;          // e.g. 12
    titleFontSize: number;         // e.g. 28
    subtitleFontSize: number;      // e.g. 12
  };
  colors: {
    background: string;            // hex, e.g. "#ffffff"
    text: string;                  // hex
    accent: string;                // hex – for lines / borders
    headerBackground: string;      // hex – grey panel on the right
    headerText: string;            // hex
    tableHeaderBackground: string; // hex
    tableHeaderText: string;       // hex
    tableRowBorder: string;        // hex
    totalBoxBackground: string;    // hex
    totalBoxBorder: string;        // hex
  };
  layout: {
    pagePaddingTop: number;        // mm
    pagePaddingSide: number;       // mm
  };
  sections: {
    header: {
      paddingTop: number;          // px
      paddingBottom: number;       // px
      alignment: "top" | "center";
    };
    businessColumn: {
      paddingRight: number;        // px
      paddingLeft: number;         // px
      textAlign: "right" | "left";
    };
    clientColumn: {
      paddingRight: number;        // px
      textAlign: "right" | "left";
    };
    paymentsTable: {
      rowPaddingY: number;         // px
      rowPaddingX: number;         // px
    };
    totalBox: {
      padding: number;             // px
      alignAmount: "left" | "right";
    };
  };
  customCss: string;               // raw CSS string to inject
};

/**
 * Default settings - professional Hebrew receipt style
 */
export const DEFAULT_RECEIPT_STYLE: ReceiptStyleSettings = {
  typography: {
    fontFamily: "Arial, sans-serif",
    baseFontSize: 14,
    titleFontSize: 28,
    subtitleFontSize: 12,
  },
  colors: {
    background: "#ffffff",
    text: "#111827",
    accent: "#111827",
    headerBackground: "#f3f4f6",
    headerText: "#111827",
    tableHeaderBackground: "#f9fafb",
    tableHeaderText: "#111827",
    tableRowBorder: "#f3f4f6",
    totalBoxBackground: "#f9fafb",
    totalBoxBorder: "#111827",
  },
  layout: {
    pagePaddingTop: 20,
    pagePaddingSide: 20,
  },
  sections: {
    header: {
      paddingTop: 24,
      paddingBottom: 24,
      alignment: "top",
    },
    businessColumn: {
      paddingRight: 0,
      paddingLeft: 24,
      textAlign: "right",
    },
    clientColumn: {
      paddingRight: 0,
      textAlign: "right",
    },
    paymentsTable: {
      rowPaddingY: 12,
      rowPaddingX: 12,
    },
    totalBox: {
      padding: 16,
      alignAmount: "left",
    },
  },
  customCss: "",
};

/**
 * Validate HEX color format
 */
export function isValidHexColor(color: string): boolean {
  return /^#([0-9A-F]{3}){1,2}$/i.test(color);
}

/**
 * Validate all settings
 */
export function validateReceiptStyleSettings(
  settings: ReceiptStyleSettings
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate colors
  Object.entries(settings.colors).forEach(([key, value]) => {
    if (!isValidHexColor(value)) {
      errors.push(`צבע ${key} אינו תקין (יש להזין HEX בפורמט #RRGGBB)`);
    }
  });

  // Validate positive numbers
  if (settings.typography.baseFontSize <= 0 || settings.typography.baseFontSize > 200) {
    errors.push("גודל גופן בסיסי חייב להיות בין 1 ל-200");
  }
  if (settings.typography.titleFontSize <= 0 || settings.typography.titleFontSize > 200) {
    errors.push("גודל כותרת חייב להיות בין 1 ל-200");
  }

  // Validate layout numbers
  if (settings.layout.pagePaddingTop < 0 || settings.layout.pagePaddingTop > 100) {
    errors.push("ריפוד עמוד עליון חייב להיות בין 0 ל-100");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
