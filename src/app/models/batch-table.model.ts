import { TemplateRef, Type } from '@angular/core';

export interface TableColumnDefinition<T = any> {
  field: string;
  header: string;
  faHeader: string;
  width?: string;
  type?: 'text' | 'number' | 'select';
  options?: { label: string; value: unknown }[];
  template?: TemplateRef<any>;
  hasServerValidation?: boolean;
  component?: Type<any> | (() => Promise<Type<any>>);
}

export type ValidatorFn<T = any> = (value: unknown, row: T) => string | null;

export interface BatchTableItem<T = any> {
  [key: string]: unknown;
  _isNew?: boolean;
  _tempId?: string;
  _original?: T;
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
