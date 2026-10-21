type ConnectionValues = {
  account_type: string;
  is_active: boolean;
  last_connected_at: string | null;
};

// Account changes are invalidated by the database trigger. Confirmation must
// therefore be a separate write after saving the broker-verified account.
export async function saveConfirmedIQConnection(
  persist: (values: ConnectionValues) => Promise<void>,
  accountType: string,
  confirmedAt: string,
) {
  await persist({ account_type: accountType, is_active: false, last_connected_at: null });
  await persist({ account_type: accountType, is_active: true, last_connected_at: confirmedAt });
}