import { TableColumnDefinition } from '../models/table-column-definition';

export const DEFAULT_TABLE_COLUMNS: TableColumnDefinition[] = [
  { field: 'code', header: 'Code', faHeader: 'کد' },
  { field: 'name', header: 'Name', faHeader: 'نام' },
  { field: 'category', header: 'Category', faHeader: 'دسته بندی' },
  { field: 'quantity', header: 'Quantity', faHeader: 'تعداد' },
  { field: 'price', header: 'Price', faHeader: 'قیمت' },
];

export const TABLE_COLUMNS_STORAGE_KEY = 'batch-table-selected-columns';
