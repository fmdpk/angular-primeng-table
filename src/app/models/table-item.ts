export interface ItemCore {
  code: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
}

export interface TableItem extends ItemCore {
  id?: number;
  _isNew?: boolean;
  _tempId?: string;
  _touched?: Partial<Record<keyof ItemCore, boolean>>;
  _original?: ItemCore & { id?: number };
}
