export interface Product {
  id?: number;
  code: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  _isNew?: boolean;
  _tempId?: string;
  _touched?: Partial<Record<string, boolean>>;
  _original?: Omit<Product, '_isNew' | '_original' | '_tempId'>;
}
