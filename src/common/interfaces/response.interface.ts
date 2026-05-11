export interface IBaseResponse<T> {
  data?: T;
  message?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    [key: string]: any;
  };
}
