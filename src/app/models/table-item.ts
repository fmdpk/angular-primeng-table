export interface ItemCore {
  title: string | null;
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  createdUser: string | null;
}

export interface TableItem extends ItemCore {
  id?: number;
  _isNew?: boolean;
  _tempId?: string;
  _touched?: Partial<Record<keyof ItemCore, boolean>>;
  _original?: ItemCore & { id?: number };
}
