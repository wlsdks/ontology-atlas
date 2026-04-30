export type AccountRole = "owner" | "editor" | "viewer";

export interface Account {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountMembership {
  id: string;
  accountId: string;
  uid: string;
  email?: string;
  role: AccountRole;
  createdAt: Date;
  updatedAt: Date;
}
