export interface ProductCore {
  code: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
}

export interface Product extends ProductCore {
  id?: number;
  _isNew?: boolean;
  _tempId?: string;
  _touched?: Partial<Record<keyof ProductCore, boolean>>;
  _original?: ProductCore & { id?: number };
}
