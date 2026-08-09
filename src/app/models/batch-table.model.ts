import { TemplateRef, Type } from '@angular/core';

export interface TableColumnDefinition<T = any> {
  field: string;
  header: string;
  faHeader: string;
  width?: string;
  type?: 'text' | 'number' | 'select';
  options?: { label: string; value: unknown }[];
  hideInput?: boolean;
  template?: TemplateRef<any>;
  hasServerValidation?: boolean;
  convertCellOutput?: (cellInput: any) => void;
  component?: Type<any> | (() => Promise<Type<any>>);
}

export type ValidatorFn<T = any> = (value: unknown, row: T) => string | null;

export interface BatchTableItem<T = any> {
  [key: string]: unknown;
  _isNew?: boolean;
  _tempId?: string;
  _original?: T;
  _rowKey?: string; // NEW: stable key for PrimeNG selection
  _insertAfterKey?: string | null; // NEW: insertion target
}

export interface BatchSaveEvent<T = any> {
  updates: T[];
  creates: T[];
  deletes: string[];
  rowOrder: string[];
  /** Call with true after the parent finishes persisting successfully, false on failure. */
  done: (success: boolean) => void;
}

export interface BatchCellEditEvent<T = any> {
  row: T;
  field: string;
  value: unknown;
}

export interface CellCoordinates {
  rowIndex: number;
  colIndex: number;
}
