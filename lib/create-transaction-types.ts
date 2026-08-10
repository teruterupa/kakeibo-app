export type CreateTransactionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialCreateTransactionState: CreateTransactionState = {
  status: "idle",
  message: "",
};
