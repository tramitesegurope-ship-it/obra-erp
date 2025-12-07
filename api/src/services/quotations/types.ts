export interface BaselineExcelRow {
  sheetName: string;
  rowNumber: number;
  sectionPath: string[];
  itemCode?: string;
  description: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  providerQuotes?: Record<string, number>;
}

export interface SupplierQuoteRow {
  sheetName: string;
  rowNumber: number;
  itemCode?: string;
  description: string;
  offeredDescription?: string;
  brand?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}
